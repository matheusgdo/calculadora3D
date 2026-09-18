function computeBounds(f, a, b, samples = 500) {
  const xs = [];
  const ys = [];

  for (let i = 0; i <= samples; i += 1) {
    const x = a + ((b - a) * i) / samples;
    const y = f(x);

    if (Number.isFinite(y)) {
      xs.push(x);
      ys.push(y);
    }
  }

  if (!ys.length) {
    return { minX: a, maxX: b, minY: -1, maxY: 1 };
  }

  const minX = Math.min(a, b);
  const maxX = Math.max(a, b);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const yPad = (maxY - minY || 1) * 0.1;
  const xPad = (maxX - minX || 1) * 0.1;

  return {
    minX: minX - xPad,
    maxX: maxX + xPad,
    minY: minY - yPad,
    maxY: maxY + yPad,
  };
}

function createLinearScale(domainMin, domainMax, rangeMin, rangeMax) {
  const domain = domainMax - domainMin || 1;
  const range = rangeMax - rangeMin || 1;

  return (value) => ((value - domainMin) / domain) * range + rangeMin;
}

function drawAxes(ctx, width, height, minX, maxX, minY, maxY) {
  const x0 = ((0 - minX) / (maxX - minX || 1)) * width;
  const y0 = ((maxY - 0) / (maxY - minY || 1)) * height;

  ctx.save();
  ctx.strokeStyle = "#2a2d35";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, y0);
  ctx.lineTo(width, y0);
  ctx.moveTo(x0, 0);
  ctx.lineTo(x0, height);
  ctx.stroke();

  // ---- Labels dos eixos ----
  ctx.font = "bold 14px Inter, sans-serif";
  ctx.fillStyle = "#5ad6ff";

  // "x" no final do eixo horizontal
  const xLabelPos = Math.min(width - 14, Math.max(14, width - 14));
  ctx.fillText("x", xLabelPos, y0 - 6);

  // "y" no topo do eixo vertical
  const yLabelPos = Math.min(height - 10, Math.max(20, 20));
  ctx.fillText("y", x0 + 6, yLabelPos);

  // ---- Grid + números ----
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.fillStyle = "#dfe7f3";
  ctx.font = "11px sans-serif";

  for (let i = 0; i <= 10; i += 1) {
    const gx = (i / 10) * width;
    const xValue = minX + (i / 10) * (maxX - minX);
    const gy = (i / 10) * height;
    const yValue = maxY - (i / 10) * (maxY - minY);

    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();

    if (i > 0 && i < 10) {
      ctx.fillText(xValue.toFixed(2), gx + 4, y0 + 14);
      ctx.fillText(yValue.toFixed(2), x0 + 6, gy - 4);
    }
  }

  ctx.restore();
}

function drawCurve(ctx, f, a, b, width, height, minX, maxX, minY, maxY) {
  const toX = createLinearScale(minX, maxX, 0, width);
  const toY = createLinearScale(minY, maxY, height, 0);

  ctx.save();
  ctx.strokeStyle = "#1e90ff";
  ctx.lineWidth = 2;
  ctx.beginPath();

  const samples = 500;
  let started = false;

  for (let i = 0; i <= samples; i += 1) {
    const x = a + ((b - a) * i) / samples;
    const y = f(x);

    if (!Number.isFinite(y)) {
      started = false;
      continue;
    }

    const px = toX(x);
    const py = toY(y);

    if (!started) {
      ctx.moveTo(px, py);
      started = true;
    } else {
      ctx.lineTo(px, py);
    }
  }

  ctx.stroke();
  const lastX = toX(b);
const lastY = toY(f(b));
ctx.fillStyle = "#1e90ff";
ctx.font = "bold 12px Inter, sans-serif";
ctx.fillText("f(x)", lastX + 6, lastY - 6);
  ctx.restore();
}

function drawRiemannRects(ctx, f, a, b, n, tipo, width, height, minX, maxX, minY, maxY) {
  if (!Number.isFinite(n) || n <= 0) {
    return;
  }

  const toX = createLinearScale(minX, maxX, 0, width);
  const toY = createLinearScale(minY, maxY, height, 0);
  const dx = (b - a) / n;

  ctx.save();
  ctx.fillStyle = "rgba(0,200,255,0.3)";
  ctx.strokeStyle = "rgba(0,200,255,0.9)";
  ctx.lineWidth = 1;

  for (let i = 0; i < n; i += 1) {
    let x0 = a + i * dx;
    let x1 = a + (i + 1) * dx;

    if (tipo === "direita") {
      x0 = a + i * dx;
      x1 = a + (i + 1) * dx;
    }

    if (tipo === "esquerda") {
      x0 = a + i * dx;
      x1 = a + (i + 1) * dx;
    }

    if (tipo === "medio") {
      x0 = a + (i + 0.5) * dx - dx / 2;
      x1 = a + (i + 0.5) * dx + dx / 2;
    }

    let x = x0;
    if (tipo === "esquerda") x = x0;
    if (tipo === "direita") x = x1;
    if (tipo === "medio") x = (x0 + x1) / 2;

    const y = f(x);
    const rectX = Math.min(toX(x0), toX(x1));
    const rectY = Math.min(toY(0), toY(y));
    const rectW = Math.abs(toX(x1) - toX(x0));
    const rectH = Math.abs(toY(0) - toY(y));

    if (!Number.isFinite(y)) {
      continue;
    }

    ctx.beginPath();
    ctx.rect(rectX, rectY, rectW, rectH);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function drawPlot(canvas, f, a, b, n, tipo = "esquerda") {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("canvas deve ser um elemento HTMLCanvasElement.");
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Não foi possível obter o contexto 2D do canvas.");
  }

  const dpr = window.devicePixelRatio || 1;
  const displayWidth = canvas.clientWidth || canvas.width;
  const displayHeight = canvas.clientHeight || canvas.height;

  canvas.width = Math.max(1, Math.round(displayWidth * dpr));
  canvas.height = Math.max(1, Math.round(displayHeight * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = displayWidth;
  const height = displayHeight;

  const bounds = computeBounds(f, a, b, 500);
  const { minX, maxX, minY, maxY } = bounds;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#10141b";
  ctx.fillRect(0, 0, width, height);

  drawAxes(ctx, width, height, minX, maxX, minY, maxY);
  drawRiemannRects(ctx, f, a, b, n, tipo, width, height, minX, maxX, minY, maxY);
  drawCurve(ctx, f, a, b, width, height, minX, maxX, minY, maxY);
}

export default { drawPlot };
