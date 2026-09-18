import { riemannSum, simpson } from "./integrator.js";
import { parseFunction, validateExpression } from "./parser.js";
import { drawPlot } from "./plot2d.js";
import {
  init3D,
  renderSolid,
  animateRotation,
  stopRotation,
  pauseRotation,
  resumeRotation,
} from "./plot3d.js";

function parseExpression(expr) {
  const validation = validateExpression(expr);
  if (!validation.ok) {
    throw new Error(validation.erro);
  }
  return parseFunction(expr);
}

// ---------- ITEM 4: formatação de números ----------
function approximateFraction(value, maxDen = 1000) {
  if (!Number.isFinite(value)) return null;
  const sign = value < 0 ? -1 : 1;
  const absX = Math.abs(value);

  let bestNum = 1;
  let bestDen = 1;
  let bestErr = Math.abs(absX - 1);

  for (let den = 1; den <= maxDen; den += 1) {
    const num = Math.round(absX * den);
    const err = Math.abs(num / den - absX);
    if (err < bestErr) {
      bestNum = num;
      bestDen = den;
      bestErr = err;
      if (err < 1e-9) break;
    }
  }

  if (bestErr > 1e-6) return null;
  return { num: sign * bestNum, den: bestDen };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);

  const ratioPi = value / Math.PI;
  const piFrac = approximateFraction(ratioPi, 60);
  if (piFrac && Math.abs(piFrac.num / piFrac.den - ratioPi) < 1e-7) {
    const num = piFrac.num;
    const den = piFrac.den;
    if (num === 0) return "0";
    if (num === 1 && den === 1) return "π";
    if (num === -1 && den === 1) return "−π";
    if (den === 1) return `${num}π`;
    if (num === 1) return `π/${den}`;
    if (num === -1) return `−π/${den}`;
    return `${num}π/${den}`;
  }

  const frac = approximateFraction(value, 200);
  if (frac && frac.den > 1 && Math.abs(frac.num / frac.den - value) < 1e-7) {
    return `${frac.num}/${frac.den}`;
  }

  return Number(value.toFixed(6)).toString();
}

function formatNumberWithDecimal(value) {
  const pretty = formatNumber(value);
  const decimal = Number(value).toFixed(6);
  if (pretty === decimal || pretty === Number(value).toString()) return pretty;
  return `${pretty} <small>≈ ${decimal}</small>`;
}

export function initCalculator() {
  const canvas = document.querySelector("canvas");
  const funcaoInput = document.getElementById("funcaoInput");
  const aInput = document.getElementById("aInput");
  const bInput = document.getElementById("bInput");
  const eixoSelect = document.getElementById("eixoSelect");
  const nSlider = document.getElementById("nSlider");
  const nValue = document.getElementById("nValue");
  const animateBtn = document.getElementById("animateBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const stopBtn = document.getElementById("stopBtn");
  const exportBtn = document.getElementById("exportBtn");
  const shareBtn = document.getElementById("shareBtn");
  const calcularBtn = document.getElementById("calcularBtn");
  const speedSlider = document.getElementById("speedSlider");
  const speedValue = document.getElementById("speedValue");
  const riemannValue = document.getElementById("riemannValue");
  const simpsonValue = document.getElementById("simpsonValue");
  const erroValue = document.getElementById("erroValue");
  const warningBanner = document.getElementById("warningBanner");
  const exampleButtons = document.querySelectorAll(".example-btn");
  const threeRoot = document.querySelector(".plot-3d-frame");

  let threeApp = null;
  let isPausedState = false;

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  function analyzeFunctionBehavior(f, a, b) {
    const samples = 500;
    const issues = [];
    let firstDiscontinuityX = null;
    let firstNegativeX = null;
    let previousSign = null;
    let firstZeroCrossingX = null;

    for (let i = 0; i <= samples; i += 1) {
      const x = a + ((b - a) * i) / samples;
      const y = f(x);

      if (!Number.isFinite(y)) {
        if (firstDiscontinuityX === null) firstDiscontinuityX = x;
        continue;
      }

      if (y < 0 && firstNegativeX === null) firstNegativeX = x;

      const sign = Math.sign(y);
      if (previousSign !== null && sign !== 0 && sign !== previousSign) {
        if (firstZeroCrossingX === null) firstZeroCrossingX = x;
      }
      if (sign !== 0) previousSign = sign;
    }

    if (firstDiscontinuityX !== null) {
      issues.push(`f(x) é descontínua perto de x ≈ ${firstDiscontinuityX.toFixed(3)}`);
    }
    if (firstNegativeX !== null) {
      issues.push(`f(x) fica negativa a partir de x ≈ ${firstNegativeX.toFixed(3)}`);
    }
    if (firstZeroCrossingX !== null) {
      issues.push(`f(x) troca de sinal perto de x ≈ ${firstZeroCrossingX.toFixed(3)}`);
    }

    return { shouldWarn: issues.length > 0, issues };
  }

  function showWarning(issues) {
    if (!warningBanner) return;
    if (!issues || issues.length === 0) {
      warningBanner.hidden = true;
      warningBanner.textContent = "";
      return;
    }
    warningBanner.hidden = false;
    warningBanner.textContent = `⚠️ Atenção: ${issues.join(" · ")}. O volume de revolução pode não ser físico nesse domínio.`;
  }

  function updateLabels(value) {
    if (nValue) nValue.textContent = String(value);
    if (nSlider) nSlider.value = String(value);
  }

  function update3D(f, a, b, eixo) {
    if (!threeRoot) return;
    if (!threeApp) threeApp = init3D(threeRoot);
    renderSolid(f, a, b, eixo);
  }

  function updateResults(f, a, b, n) {
    const areaAprox = riemannSum(f, a, b, n, "esquerda");
    const areaReal = simpson(f, a, b, 2000);

    if (areaAprox.erro) throw new Error(areaAprox.erro);
    if (areaReal.erro) throw new Error(areaReal.erro);

    const rv = areaAprox.valor;
    const sv = areaReal.valor;

    if (!Number.isFinite(rv) || !Number.isFinite(sv)) {
      riemannValue.textContent = "não converge";
      simpsonValue.textContent = "não converge";
      erroValue.textContent = "—";
      return;
    }

    const erro = Math.abs(rv - sv);

    riemannValue.innerHTML = formatNumberWithDecimal(rv);
    simpsonValue.innerHTML = formatNumberWithDecimal(sv);
    erroValue.innerHTML = formatNumberWithDecimal(erro);
  }

  function readStateFromURL() {
    const params = new URLSearchParams(window.location.search);
    return {
      f: params.get("f"),
      a: params.get("a"),
      b: params.get("b"),
      eixo: params.get("eixo"),
      n: params.get("n"),
      speed: params.get("speed"),
    };
  }

  function applyStateFromURL() {
    const s = readStateFromURL();
    if (s.f && funcaoInput) funcaoInput.value = s.f;
    if (s.a && aInput) aInput.value = s.a;
    if (s.b && bInput) bInput.value = s.b;
    if (s.eixo && eixoSelect) eixoSelect.value = s.eixo;
    if (s.n && nSlider) {
      nSlider.value = s.n;
      updateLabels(Number(s.n));
    }
    if (s.speed && speedSlider) {
      speedSlider.value = s.speed;
      if (speedValue) speedValue.textContent = Number(s.speed).toFixed(1);
    }
  }

  function writeStateToURL() {
    const params = new URLSearchParams();
    params.set("f", funcaoInput.value);
    params.set("a", aInput.value);
    params.set("b", bInput.value);
    params.set("eixo", eixoSelect.value);
    params.set("n", nSlider.value);
    if (speedSlider) params.set("speed", speedSlider.value);

    const newURL = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, "", newURL);
  }

  function render() {
    const expr = funcaoInput.value;
    const a = Number(aInput.value);
    const b = Number(bInput.value);
    const n = Number(nSlider.value);
    const eixo = eixoSelect.value;

    try {
      const f = parseExpression(expr);
      const analysis = analyzeFunctionBehavior(f, a, b);
      showWarning(analysis.issues);

      if (canvas) drawPlot(canvas, f, a, b, n, "esquerda");

      updateResults(f, a, b, n);
      update3D(f, a, b, eixo);
      writeStateToURL();
    } catch (error) {
      riemannValue.textContent = "—";
      simpsonValue.textContent = "—";
      erroValue.textContent = "—";
      showWarning([]);
      console.error(error);
    }
  }

  const renderLeve = () => {
    const expr = funcaoInput.value;
    const a = Number(aInput.value);
    const b = Number(bInput.value);
    const n = Number(nSlider.value);
    try {
      const f = parseExpression(expr);
      if (canvas) drawPlot(canvas, f, a, b, n, "esquerda");
    } catch {
      /* silencioso durante digitação */
    }
  };

  const renderPesado = () => render();
  const renderLeveDebounced = debounce(renderLeve, 32);
  const renderPesadoDebounced = debounce(renderPesado, 250);
  const renderDebounced = debounce(render, 200);

  // ---------- Helpers dos botões ----------
  function resetPauseButton() {
    isPausedState = false;
    if (pauseBtn) {
      pauseBtn.textContent = "⏸ Pausar";
    }
  }

  function showActionButtons() {
    if (pauseBtn) pauseBtn.hidden = false;
    if (stopBtn) stopBtn.hidden = false;
  }

  function hideActionButtons() {
    if (pauseBtn) pauseBtn.hidden = true;
    if (stopBtn) stopBtn.hidden = true;
    resetPauseButton();
  }

  // ---------- Eventos ----------
  if (nSlider) {
    nSlider.addEventListener("input", (event) => {
      const value = Number(event.target.value);
      updateLabels(value);
      renderLeveDebounced();
      renderPesadoDebounced();
    });
  }

  if (funcaoInput) funcaoInput.addEventListener("input", renderDebounced);
  if (aInput) aInput.addEventListener("input", renderDebounced);
  if (bInput) bInput.addEventListener("input", renderDebounced);
  if (eixoSelect) eixoSelect.addEventListener("change", render);

  exampleButtons.forEach((button) => {
    button.addEventListener("click", () => {
      funcaoInput.value = button.dataset.example;
      render();
    });
  });

  // ---------- Animação ----------
  if (animateBtn) {
    animateBtn.addEventListener("click", () => {
      const expr = funcaoInput.value;
      const a = Number(aInput.value);
      const b = Number(bInput.value);
      const eixo = eixoSelect.value;
      const duration = Number(speedSlider?.value || 4.5) * 1000;

      try {
        const f = parseExpression(expr);
        animateRotation(f, a, b, eixo, duration);
        showActionButtons();
      } catch (error) {
        console.error(error);
      }
    });
  }

  // Pausar / Retomar
  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      if (!isPausedState) {
        const ok = pauseRotation();
        if (ok) {
          isPausedState = true;
          pauseBtn.textContent = "▶ Retomar";
        }
      } else {
        const ok = resumeRotation();
        if (ok) {
          isPausedState = false;
          pauseBtn.textContent = "⏸ Pausar";
        }
      }
    });
  }

  // Parar (finaliza)
  if (stopBtn) {
    stopBtn.addEventListener("click", () => {
      stopRotation();
      hideActionButtons();
    });
  }

  if (speedSlider) {
    speedSlider.addEventListener("input", (event) => {
      if (speedValue) speedValue.textContent = Number(event.target.value).toFixed(1);
      writeStateToURL();
    });
  }

  if (calcularBtn) calcularBtn.addEventListener("click", render);

  // ---------- Exportar PNG ----------
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      if (!threeApp || !threeApp.renderer) return;
      const link = document.createElement("a");
      link.download = "solido-revolucao.png";
      link.href = threeApp.renderer.domElement.toDataURL("image/png");
      link.click();
    });
  }

  // ---------- Copiar link ----------
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        const original = shareBtn.textContent;
        shareBtn.textContent = "✅ Copiado!";
        setTimeout(() => {
          shareBtn.textContent = original;
        }, 1500);
      } catch {
        window.prompt("Copie o link abaixo:", window.location.href);
      }
    });
  }

  if (nSlider) updateLabels(Number(nSlider.value));

  applyStateFromURL();

  if (!threeApp && threeRoot) {
    threeApp = init3D(threeRoot);
  }

  render();
  return { render, threeApp };
}