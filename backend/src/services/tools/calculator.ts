import vm from "vm";

export async function calculator(expression: string): Promise<string> {
  try {
    const expr = expression
      .trim()
      .replace(/\^/g, "**")
      .replace(/\bsqrt\b/g, "Math.sqrt")
      .replace(/\bsin\b/g, "Math.sin")
      .replace(/\bcos\b/g, "Math.cos")
      .replace(/\btan\b/g, "Math.tan")
      .replace(/\blog10\b/g, "Math.log10")
      .replace(/\blog2\b/g, "Math.log2")
      .replace(/\blog\b/g, "Math.log")
      .replace(/\babs\b/g, "Math.abs")
      .replace(/\bceil\b/g, "Math.ceil")
      .replace(/\bfloor\b/g, "Math.floor")
      .replace(/\bround\b/g, "Math.round")
      .replace(/\bfactorial\b/g, "_factorial")
      .replace(/\bpi\b/g, "Math.PI")
      .replace(/\be\b(?!\d)/g, "Math.E");

    // Block anything dangerous
    if (/require|import|process|__dirname|fs\.|child_process/.test(expr)) {
      return "Error: expression contains forbidden keywords";
    }

    const sandbox = {
      Math,
      _factorial: (n: number): number => {
        if (n < 0 || n > 170) throw new Error("Factorial out of range");
        if (n <= 1) return 1;
        return n * sandbox._factorial(n - 1);
      },
      result: undefined as unknown,
    };

    vm.runInNewContext(`result = ${expr}`, sandbox, { timeout: 2000 });

    const result = sandbox.result;
    if (typeof result !== "number" || !isFinite(result)) return `Error: expression produced non-numeric result`;

    const display = Number.isInteger(result) && Math.abs(result) < 1e15
      ? result.toString()
      : result.toPrecision(10).replace(/\.?0+$/, "");

    return `${expression} = ${display}`;
  } catch (err) {
    return `Error evaluating '${expression}': ${err instanceof Error ? err.message : "unknown"}`;
  }
}
