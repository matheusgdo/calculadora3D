import * as math from "https://cdn.jsdelivr.net/npm/mathjs@13.0.0/+esm";
import { simpson } from "./integrator.js";

function ensureCallable(f, nome = "f") {
  if (typeof f !== "function") {
    throw new Error(`${nome} deve ser uma função.`);
  }
}

function ensureFiniteNumber(value, nome) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${nome} deve ser um número finito.`);
  }
  return num;
}

function getNerdamer() {
  if (typeof globalThis.nerdamer === "undefined") {
    throw new Error("Nerdamer não foi carregado. Inclua o script CDN antes de usar volumeSimbolico().");
  }
  return globalThis.nerdamer;
}

function hasSignalChange(f, a, b, samples = 200) {
  const A = ensureFiniteNumber(a, "a");
  const B = ensureFiniteNumber(b, "b");
  let previous = undefined;
  let changed = false;

  for (let i = 0; i <= samples; i += 1) {
    const x = A + ((B - A) * i) / samples;
    const value = f(x);

    if (!Number.isFinite(value)) {
      return { changed: true, hasDiscontinuity: true };
    }

    if (previous !== undefined && ((previous < 0 && value >= 0) || (previous > 0 && value <= 0))) {
      changed = true;
      break;
    }

    previous = value;
  }

  return { changed, hasDiscontinuity: false };
}

function safeEvalExpression(expr, x) {
  const normalized = String(expr)
    .trim()
    .replace(/π/g, "pi")
    .replace(/ℯ/g, "e")
    .replace(/\bln\b/gi, "log")
    .replace(/\^/g, "^");

  try {
    const value = math.evaluate(normalized, { x, pi: math.pi, e: math.e });
    return Number(value);
  } catch {
    return Number.NaN;
  }
}

export function volumeEixoX(f, a, b, n = 2000) {
  try {
    ensureCallable(f, "f");
    const A = ensureFiniteNumber(a, "a");
    const B = ensureFiniteNumber(b, "b");

    const integral = simpson((x) => f(x) ** 2, A, B, n);
    if (integral.erro) {
      throw new Error(integral.erro);
    }

    return {
      exato: Math.PI * integral.valor,
      aproximado: Math.PI * integral.valor,
      formula: "π * ∫[a,b] f(x)^2 dx",
    };
  } catch (erro) {
    return {
      exato: Number.NaN,
      aproximado: Number.NaN,
      formula: "",
      erro: erro instanceof Error ? erro.message : "Erro desconhecido em volumeEixoX.",
    };
  }
}

export function volumeEixoY(f, a, b, n = 2000) {
  try {
    ensureCallable(f, "f");
    const A = ensureFiniteNumber(a, "a");
    const B = ensureFiniteNumber(b, "b");
    const signalInfo = hasSignalChange(f, A, B, 200);
    const fn = signalInfo.changed ? (x) => Math.abs(f(x)) : f;

    const integral = simpson((x) => x * fn(x), A, B, n);
    if (integral.erro) {
      throw new Error(integral.erro);
    }

    return {
      exato: 2 * Math.PI * integral.valor,
      aproximado: 2 * Math.PI * integral.valor,
      formula: "2π * ∫[a,b] x * |f(x)| dx",
      aviso: signalInfo.changed ? "A função troca de sinal no intervalo. Volume calculado em módulo." : undefined,
    };
  } catch (erro) {
    return {
      exato: Number.NaN,
      aproximado: Number.NaN,
      formula: "",
      erro: erro instanceof Error ? erro.message : "Erro desconhecido em volumeEixoY.",
    };
  }
}

export function volumeSimbolico(expr, a, b, eixo = "x") {
  try {
    if (typeof expr !== "string" || !expr.trim()) {
      throw new Error("expr deve ser uma string válida.");
    }

    const A = ensureFiniteNumber(a, "a");
    const B = ensureFiniteNumber(b, "b");
    const eixoNormalizado = String(eixo).trim().toLowerCase();

    if (!["x", "y"].includes(eixoNormalizado)) {
      throw new Error("eixo deve ser 'x' ou 'y'.");
    }

    const nerd = getNerdamer();
    const exprNormalized = expr.trim();

    let integralExpr;
    let formula;

    if (eixoNormalizado === "x") {
      integralExpr = nerd(exprNormalized).pow(2).integrate("x");
      formula = "π * ∫[a,b] f(x)^2 dx";
    } else {
      const signInfo = hasSignalChange((x) => safeEvalExpression(exprNormalized, x), A, B, 200);
      const safeExpr = signInfo.changed ? `abs(${exprNormalized})` : exprNormalized;

      integralExpr = nerd("x").multiply(safeExpr).integrate("x");
      formula = "2π * ∫[a,b] x * |f(x)| dx";
    }

    const antiderivative = integralExpr;
    const valorA = safeEvalExpression(antiderivative.toString(), A);
    const valorB = safeEvalExpression(antiderivative.toString(), B);

    const fator = eixoNormalizado === "x" ? Math.PI : 2 * Math.PI;
    const valorDecimal = fator * (valorB - valorA);

    return {
      exato: valorDecimal,
      aproximado: valorDecimal,
      formula,
      aviso: eixoNormalizado === "y" && hasSignalChange((x) => safeEvalExpression(exprNormalized, x), A, B, 200).changed
        ? "A função troca de sinal no intervalo. Volume calculado em módulo."
        : undefined,
    };
  } catch (erro) {
    return {
      exato: Number.NaN,
      aproximado: Number.NaN,
      formula: "",
      erro: erro instanceof Error ? erro.message : "Erro desconhecido em volumeSimbolico.",
    };
  }
}

export default {
  volumeEixoX,
  volumeEixoY,
  volumeSimbolico,
};
