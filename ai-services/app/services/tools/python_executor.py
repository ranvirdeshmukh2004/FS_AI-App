"""Python code executor with restricted builtins.

A word on what this is and is not. The guard below is a blocklist over
source text plus a stripped __builtins__ mapping. That stops casual misuse,
but blocklists are not a security boundary — a determined caller can get
around one. Treat this as a convenience for trusted, local use.

It is therefore disabled unless ENABLE_PYTHON_TOOL is explicitly set, and
should stay disabled on any deployment strangers can reach.

Execution happens in a separate process, which is what makes the timeout
real: a thread running `while True: pass` cannot be interrupted, so the
earlier thread-based version leaked a pegged CPU for the life of the
service. A child process can simply be killed. The child also gets memory
and CPU rlimits so a runaway allocation dies on its own rather than taking
the container's whole heap with it.
"""

import io
import ast
import asyncio
import logging
import contextlib
import multiprocessing

from app.config import settings

logger = logging.getLogger(__name__)

# Wall-clock ceiling for one execution.
TIMEOUT_SECONDS = 5
# Address-space ceiling for the child process.
#
# This is virtual address space, not resident memory, and it has to cover the
# child's own interpreter and imports before any user code runs. A 256MB cap
# looked fine on macOS (which largely ignores RLIMIT_AS) and failed every
# single execution on Linux with MemoryError, because the spawned child
# reserves well over that just starting up. 2GB of address space still costs
# nothing resident and still stops a genuine runaway allocation.
MEMORY_LIMIT_BYTES = 2 * 1024 * 1024 * 1024
# Cap the payload we ship back across the pipe.
MAX_OUTPUT_CHARS = 3000

# "fork" copies the parent's state, including open sockets. "spawn" starts
# clean, which is both safer and the only option on some platforms.
_MP_CONTEXT = multiprocessing.get_context("spawn")

ALLOWED_BUILTINS = {
    "abs": abs, "all": all, "any": any, "bin": bin, "bool": bool,
    "chr": chr, "dict": dict, "divmod": divmod, "enumerate": enumerate,
    "filter": filter, "float": float, "format": format, "frozenset": frozenset,
    "hex": hex, "int": int, "isinstance": isinstance, "issubclass": issubclass,
    "iter": iter, "len": len, "list": list, "map": map, "max": max,
    "min": min, "next": next, "oct": oct, "ord": ord, "pow": pow,
    "print": print, "range": range, "repr": repr, "reversed": reversed,
    "round": round, "set": set, "slice": slice, "sorted": sorted,
    "str": str, "sum": sum, "tuple": tuple, "type": type, "zip": zip,
    "True": True, "False": False, "None": None,
}

ALLOWED_IMPORTS = {
    "math", "statistics", "random", "collections", "itertools",
    "functools", "string", "re", "json", "datetime", "decimal",
    "fractions", "textwrap", "unicodedata", "hashlib", "base64",
}

BLOCKED_PATTERNS = [
    "import os", "import sys", "import subprocess", "import shutil",
    "import socket", "import http", "import urllib", "import requests",
    "import pathlib", "__import__", "eval(", "exec(", "compile(",
    "open(", "globals(", "locals(", "getattr(", "setattr(", "delattr(",
    "__builtins__", "__class__", "__subclasses__",
]


def _guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
    """__import__ restricted to ALLOWED_IMPORTS.

    Enforced at import time as well as by the AST pre-scan, so a dynamic
    import that the static pass cannot see is still refused.
    """
    root = name.split(".")[0]
    if level != 0 or root not in ALLOWED_IMPORTS:
        raise ImportError(f"Module '{name}' is not allowed")
    return __import__(name, globals, locals, fromlist, level)


def _imported_modules(code: str) -> set[str]:
    """Top-level module names the code imports.

    Parsing the AST rather than the raw text, because splitting on whitespace
    mis-reads perfectly ordinary lines: `import math; print(x)` yielded the
    module name "math;" (semicolon attached), and `import numpy as np, math`
    only ever saw the first name. A syntax error falls through to exec(),
    which reports it properly.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return set()

    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module and node.level == 0:
                modules.add(node.module.split(".")[0])
            elif node.level:
                # Relative import — no module to whitelist, and nothing
                # useful to reach from here anyway.
                modules.add(".")
    return modules


def _apply_rlimits() -> None:
    """Best-effort resource caps. Not available on every platform."""
    try:
        import resource

        # RLIMIT_AS is enforced on Linux (where this deploys). macOS
        # overcommits and largely ignores it, so the wall-clock timeout is
        # the backstop there. Never lower an existing limit that is already
        # tighter than ours.
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        target = MEMORY_LIMIT_BYTES
        if hard != resource.RLIM_INFINITY:
            target = min(target, hard)
        if soft == resource.RLIM_INFINITY or target < soft:
            resource.setrlimit(resource.RLIMIT_AS, (target, hard))
        # Deliberately looser than the wall-clock timeout. If they were
        # equal, a busy loop on Linux would trip SIGXCPU first and the user
        # would get "resource limit exceeded" instead of the clearer "timed
        # out". This stays as the backstop for when the parent's poll cannot
        # reap the child.
        cpu_limit = TIMEOUT_SECONDS + 2
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_limit, cpu_limit + 1))
        # No core dumps. RLIMIT_NPROC is deliberately left alone: it counts
        # the whole user's processes, not this one's children, so setting it
        # to 0 can wedge an unrelated part of the system.
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    except Exception:  # pragma: no cover - platform dependent
        pass


def _child(code: str, pipe) -> None:
    """Runs in the child process. Sends one string back, then exits."""
    _apply_rlimits()
    try:
        pipe.send(_execute(code))
    except Exception as exc:
        pipe.send(f"Error: {type(exc).__name__}: {exc}")
    finally:
        pipe.close()


def _execute(code: str) -> str:
    """The actual restricted execution."""
    code_lower = code.lower()
    for pattern in BLOCKED_PATTERNS:
        if pattern.lower() in code_lower:
            return f"Error: '{pattern}' is not allowed for security reasons"

    # Replacing __builtins__ wholesale also removes __import__, which is what
    # the `import` statement compiles down to. Without a replacement every
    # `import math` failed with "__import__ not found" — so the allow-list of
    # modules could never actually be used. This restores importing, limited
    # to the same allow-list.
    builtins_map = dict(ALLOWED_BUILTINS)
    builtins_map["__import__"] = _guarded_import
    safe_globals: dict = {"__builtins__": builtins_map}

    for mod_name in _imported_modules(code):
        if mod_name not in ALLOWED_IMPORTS:
            allowed = ", ".join(sorted(ALLOWED_IMPORTS))
            return f"Error: Module '{mod_name}' is not in the allowed list. Allowed: {allowed}"

    for mod in ALLOWED_IMPORTS:
        try:
            safe_globals[mod] = __import__(mod)
        except ImportError:
            pass

    stdout_capture = io.StringIO()
    try:
        with contextlib.redirect_stdout(stdout_capture):
            exec(code, safe_globals)  # noqa: S102
    except MemoryError:
        return "Error: Ran out of memory"
    except Exception as exc:
        return f"Error: {type(exc).__name__}: {exc}"

    output = stdout_capture.getvalue()

    # Nothing printed: echo the last expression's value, the way a REPL does.
    if not output.strip():
        lines = [
            l.strip()
            for l in code.strip().split("\n")
            if l.strip() and not l.strip().startswith("#")
        ]
        if lines:
            try:
                result = eval(lines[-1], safe_globals)  # noqa: S307
                if result is not None:
                    output = str(result)
            except Exception:
                pass

    if not output.strip():
        return "Code executed successfully (no output)"

    if len(output) > MAX_OUTPUT_CHARS:
        output = output[:MAX_OUTPUT_CHARS] + "\n... (output truncated)"

    return f"Output:\n{output}"


def _run_in_subprocess(code: str) -> str:
    parent_conn, child_conn = _MP_CONTEXT.Pipe(duplex=False)
    proc = _MP_CONTEXT.Process(target=_child, args=(code, child_conn), daemon=True)
    proc.start()
    child_conn.close()

    try:
        if parent_conn.poll(TIMEOUT_SECONDS):
            result = parent_conn.recv()
        else:
            result = f"Error: Code execution timed out ({TIMEOUT_SECONDS} second limit)"
    except EOFError:
        # Child died without sending — an rlimit kill, most likely.
        result = "Error: Execution was terminated (resource limit exceeded)"
    finally:
        parent_conn.close()
        if proc.is_alive():
            proc.terminate()
            proc.join(timeout=1)
            if proc.is_alive():
                proc.kill()
                proc.join(timeout=1)
        else:
            proc.join(timeout=1)

    return result


async def python_executor(code: str) -> str:
    """Execute Python code and return its output.

    Disabled unless ENABLE_PYTHON_TOOL is set. See the module docstring for
    why the sandbox is not a security boundary.
    """
    if not settings.enable_python_tool:
        return (
            "Error: The Python tool is disabled on this deployment. "
            "Set ENABLE_PYTHON_TOOL=true to enable it when running locally."
        )

    code = code.strip()
    if not code:
        return "Error: No code provided"

    try:
        # The subprocess enforces the real timeout; this outer bound only
        # covers process startup wedging.
        return await asyncio.wait_for(
            asyncio.to_thread(_run_in_subprocess, code),
            timeout=TIMEOUT_SECONDS + 15,
        )
    except asyncio.TimeoutError:
        return f"Error: Code execution timed out ({TIMEOUT_SECONDS} second limit)"
    except Exception as exc:
        logger.error("Python executor error: %s", exc)
        return f"Error: {type(exc).__name__}: {exc}"
