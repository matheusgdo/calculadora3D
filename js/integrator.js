import * as math from "https://cdn.jsdelivr.net/npm/mathjs@13.0.0/+esm";

function makeResult(value, error) {
  if (error) {
    return { valor: Number.NaN, erro: error };
  }

  return { valor: Number(value) };
}

function ensureFiniteNumber(value, nome) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`${nome} deve ser um número finito.`);
  }
  return num;
}

function ensureCallable(f, nome = "f") {
  if (typeof f !== "function") {
    throw new Error(`${nome} deve ser uma função.`);
  }
}

function normalizeTipo(tipo) {
  const t = String(tipo || "").trim().toLowerCase();
  if (!["esquerda", "direita", "medio"].includes(t)) {
    throw new Error("tipo deve ser 'esquerda', 'direita' ou 'medio'.");
  }
  return t;
}

function getNerdamer() {
  if (typeof globalThis.nerdamer === "undefined") {
    throw new Error("Nerdamer não foi carregado. Inclua o script CDN antes de usar integralSimbolica().");
  }
  return globalThis.nerdamer;
}

function parseSafeNumber(value) {
  const text = String(value).trim();
  if (!text) return NaN;

  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const rational = text.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (rational) return Number(rational[1]) / Number(rational[2]);

  const safeText = text
    .replace(/π/g, "pi")
    .replace(/ℯ/g, "e")
    .replace(/\^/g, "^")
    .replace(/\bpi\b/gi, "pi")
    .replace(/\be\b/gi, "e");

  try {
    const result = math.evaluate(safeText);
    return Number(result);
  } catch {
    return Number.NaN;
  }
}

function hasNonElementaryPattern(str) {
  return /(erf\(|Ei\(|li\(|Si\(|Ci\(|gamma\(|erfc\()/i.test(String(str));
}

export function riemannSum(f, a, b, n, tipo = "esquerda") {
  try {
    ensureCallable(f, "f");
    const A = ensureFiniteNumber(a, "a");
    const B = ensureFiniteNumber(b, "b");
    const N = Math.max(1, Math.floor(Number(n)));

    if (!Number.isFinite(N) || N <= 0) {
      throw new Error("n deve ser um inteiro positivo.");
    }

    const tipoNormalizado = normalizeTipo(tipo);
    const dx = (B - A) / N;
    let soma = 0;

    for (let i = 0; i < N; i += 1) {
      let x;
      if (tipoNormalizado === "esquerda") x = A + i * dx;
      else if (tipoNormalizado === "direita") x = A + (i + 1) * dx;
      else x = A + (i + 0.5) * dx;

      soma += f(x);
    }

    const valor = dx * soma;
    return { valor };
  } catch (erro) {
    return makeResult(NaN, erro instanceof Error ? erro.message : "Erro desconhecido em riemannSum.");
  }
}

export function trapezio(f, a, b, n) {
  try {
    ensureCallable(f, "f");
    const A = ensureFiniteNumber(a, "a");
    const B = ensureFiniteNumber(b, "b");
    let N = Math.max(1, Math.floor(Number(n)));
    if (!Number.isFinite(N) || N <= 0) N = 1;

    const h = (B - A) / N;
    let soma = f(A) + f(B);

    for (let i = 1; i < N; i += 1) {
      soma += 2 * f(A + i * h);
    }

    return { valor: (h / 2) * soma };
  } catch (erro) {
    return makeResult(NaN, erro instanceof Error ? erro.message : "Erro desconhecido em trapezio.");
  }
}

export function simpson(f, a, b, n) {
  try {
    ensureCallable(f, "f");
    const A = ensureFiniteNumber(a, "a");
    const B = ensureFiniteNumber(b, "b");
    let N = Math.max(2, Math.floor(Number(n)));

    if (!Number.isFinite(N) || N < 2) {
      N = 2;
    }

    if (N % 2 !== 0) {
      const original = N;
      N += 1;
      console.warn(`n ajustado de ${original} para ${N} para atender Simpson.`);
    }

    const h = (B - A) / N;
    let soma = f(A) + f(B);

    for (let i = 1; i < N; i += 1) {
      const x = A + i * h;
      soma += (i % 2 === 0 ? 2 : 4) * f(x);
    }

    return { valor: (h / 3) * soma };
  } catch (erro) {
    return makeResult(NaN, erro instanceof Error ? erro.message : "Erro desconhecido em simpson.");
  }
}

export function integralSimbolica(expr, a = 0, b = 1) {
  try {
    if (typeof expr !== "string" || !expr.trim()) {
      throw new Error("expr deve ser uma string válida.");
    }

    const nerd = getNerdamer();
    const expression = expr.trim();
    const A = ensureFiniteNumber(a, "a");
    const B = ensureFiniteNumber(b, "b");

    const antiderivative = nerd(expression).integrate("x");
    const primitiva = String(antiderivative.toString());

    if (hasNonElementaryPattern(primitiva)) {
      return {
        primitiva,
        valor: Number.NaN,
        erro: "Integral sem forma elementar — use o valor numérico.",
      };
    }

    const fa = parseSafeNumber(antiderivative.evaluate({ x: A }).toString());
    const fb = parseSafeNumber(antiderivative.evaluate({ x: B }).toString());

    if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
      return {
        primitiva,
        valor: Number.NaN,
        erro: "Integral sem forma elementar — use o valor numérico.",
      };
    }

    return {
      primitiva,
      valor: fb - fa,
    };
  } catch (erro) {
    return {
      primitiva: "",
      valor: Number.NaN,
      erro: erro instanceof Error ? erro.message : "Erro desconhecido em integralSimbolica.",
    };
  }
}

export default {
  riemannSum,
  trapezio,
  simpson,
  integralSimbolica,
};
