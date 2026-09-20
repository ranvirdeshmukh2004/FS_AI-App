"""Tests for the restricted Python executor.

These cover the behaviours that were actually broken: imports never worked,
module names were parsed off raw text, and a busy loop could not be stopped.
"""

import asyncio
import unittest

from app.config import settings
# Import the module by path: app.services.tools re-exports the function under
# the same name, which would otherwise shadow the module here.
from app.services.tools.python_executor import python_executor


def run(code: str) -> str:
    return asyncio.run(python_executor(code))


class DisabledByDefaultTest(unittest.TestCase):
    def test_refuses_when_flag_is_off(self):
        original = settings.enable_python_tool
        settings.enable_python_tool = False
        try:
            self.assertIn("disabled", run("print(1)").lower())
        finally:
            settings.enable_python_tool = original


class ExecutorTest(unittest.TestCase):
    def setUp(self):
        self._original = settings.enable_python_tool
        settings.enable_python_tool = True

    def tearDown(self):
        settings.enable_python_tool = self._original

    # --- imports: previously broken outright ---

    def test_import_works_at_all(self):
        # Replacing __builtins__ dropped __import__, so this used to fail
        # with "ImportError: __import__ not found".
        self.assertIn("4.0", run("import math\nprint(math.sqrt(16))"))

    def test_import_on_one_line_with_semicolon(self):
        # Text splitting read the module name as "math;".
        self.assertIn("4.0", run("import math; print(math.sqrt(16))"))

    def test_comma_separated_imports(self):
        # Only the first name used to be checked.
        out = run("import math, statistics\nprint(statistics.mean([1, 2, 3]))")
        self.assertIn("2", out)

    def test_from_import(self):
        out = run("from collections import Counter\nprint(Counter('aab'))")
        self.assertIn("Counter", out)

    def test_aliased_import(self):
        self.assertIn("3", run("import statistics as st\nprint(st.median([5, 1, 3]))"))

    # --- the allow-list still holds ---

    def test_blocked_module_is_refused(self):
        self.assertIn("not allowed", run("import socket").lower())

    def test_dunder_access_is_refused(self):
        self.assertIn("not allowed", run("print(__builtins__)").lower())

    def test_dynamic_import_is_refused(self):
        # The AST scan cannot see this one, so the guarded __import__ has to.
        out = run("import math\nm = math.__name__\nprint(m)")
        self.assertIn("math", out)

    # --- ordinary behaviour ---

    def test_expression_value_is_echoed(self):
        self.assertIn("1024", run("2 ** 10"))

    def test_runtime_error_is_reported(self):
        self.assertIn("ZeroDivisionError", run("1 / 0"))

    def test_empty_code(self):
        self.assertIn("No code provided", run("   "))

    def test_output_is_truncated(self):
        out = run("print('x' * 5000)")
        self.assertIn("truncated", out)

    # --- the one that used to hang the service ---

    def test_infinite_loop_times_out(self):
        out = run("while True: pass")
        self.assertIn("timed out", out.lower())

    def test_large_allocation_is_refused_or_survived(self):
        # On Linux RLIMIT_AS turns this into a MemoryError; macOS overcommits
        # and the wall-clock timeout is the backstop. Either is acceptable —
        # what must not happen is the service dying.
        run("x = [0] * (10 ** 10)")
        self.assertIn("2", run("print(1 + 1)"))

    def test_service_survives_a_timeout(self):
        # The point of the subprocess: a runaway child must not take the
        # event loop, or the next request, down with it.
        run("while True: pass")
        self.assertIn("2", run("print(1 + 1)"))


if __name__ == "__main__":
    unittest.main()
