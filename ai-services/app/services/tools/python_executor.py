"""Safe Python code executor with restricted builtins."""

import io
import logging
import contextlib
import signal

logger = logging.getLogger(__name__)

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


def _timeout_handler(signum, frame):
    raise TimeoutError("Code execution timed out (5 second limit)")


async def python_executor(code: str) -> str:
    """Execute Python code safely and return the output."""
    try:
        code = code.strip()
        if not code:
            return "Error: No code provided"

        code_lower = code.lower()
        for pattern in BLOCKED_PATTERNS:
            if pattern.lower() in code_lower:
                return f"Error: '{pattern}' is not allowed for security reasons"

        import_lines = [l.strip() for l in code.split("\n") if l.strip().startswith("import ") or l.strip().startswith("from ")]
        safe_globals = {"__builtins__": ALLOWED_BUILTINS}

        for imp in import_lines:
            parts = imp.split()
            mod_name = parts[1].split(".")[0] if len(parts) > 1 else ""
            if mod_name not in ALLOWED_IMPORTS:
                return f"Error: Module '{mod_name}' is not in the allowed list. Allowed: {', '.join(sorted(ALLOWED_IMPORTS))}"

        for mod in ALLOWED_IMPORTS:
            try:
                safe_globals[mod] = __import__(mod)
            except ImportError:
                pass

        stdout_capture = io.StringIO()
        old_alarm = None

        try:
            try:
                old_alarm = signal.signal(signal.SIGALRM, _timeout_handler)
                signal.alarm(5)
            except (ValueError, AttributeError):
                pass

            with contextlib.redirect_stdout(stdout_capture):
                exec(code, safe_globals)

        finally:
            try:
                signal.alarm(0)
                if old_alarm is not None:
                    signal.signal(signal.SIGALRM, old_alarm)
            except (ValueError, AttributeError):
                pass

        output = stdout_capture.getvalue()
        if not output.strip():
            last_line = [l.strip() for l in code.strip().split("\n") if l.strip() and not l.strip().startswith("#")]
            if last_line:
                try:
                    result = eval(last_line[-1], safe_globals)
                    if result is not None:
                        output = str(result)
                except Exception:
                    pass

        if not output.strip():
            return "Code executed successfully (no output)"

        if len(output) > 3000:
            output = output[:3000] + "\n... (output truncated)"

        return f"Output:\n{output}"

    except TimeoutError:
        return "Error: Code execution timed out (5 second limit)"
    except Exception as e:
        logger.error("Python executor error: %s", e)
        return f"Error: {type(e).__name__}: {str(e)}"
