import * as math from "https://cdn.jsdelivr.net/npm/mathjs@13.0.0/+esm";

function normalizeExpression(exprString) {
  if (typeof exprString !== "string") {
    throw new Error("A expressão deve ser uma string.");
  }

  let expr = exprString.trim();
  if (!expr) {
    throw new Error("A expressão está vazia.");
  }

  expr = expr.replace(/π/g, "pi").replace(/ℯ/g, "e");
  expr = expr.replace(/×/g, "*").replace(/÷/g, "/");
  expr = expr.replace(/\bln\s*\(/gi, "log(");
  expr = expr.replace(/\blog\s*\(/gi, "log(");

  return expr;
}

export function parseFunction(exprString) {
  const expr = normalizeExpression(exprString);

  let compiled;
  try {
    compiled = math.compile(expr);
  } catch (error) {
    throw new Error(`Expressão inválida: ${error instanceof Error ? error.message : String(error)}`);
  }

  return function f(x) {
    try {
      const evaluated = compiled.evaluate({ x, pi: math.pi, e: math.e });
      const numericValue = Number(evaluated);

      // Retorna NaN em vez de lançar — permite que a análise detecte
      // descontinuidades (ex: 1/x em x=0) sem quebrar o fluxo
      if (!Number.isFinite(numericValue)) {
        return Number.NaN;
      }

      return numericValue;
    } catch {
      return Number.NaN;
    }
  };
}

export function validateExpression(str) {
  try {
    const fn = parseFunction(str);
    fn(1);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      erro: error instanceof Error ? error.message : "Expressão inválida.",
    };
  }
}