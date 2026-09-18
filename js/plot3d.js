import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { simpson } from "./integrator.js";

const sceneState = {
  container: null,
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  currentMesh: null,
  currentFrontFace: null,
  rotationButton: null,
  volumeBadge: null,
  lastRotation: null,
  animationFrameId: null,
  animationDuration: 4500,
  animationStart: 0,
  isPaused: false,
  pausedProgress: 0,
  animationParams: null,
  rotationAxis: null,
  axesHelper: null,
};

function resolveContainer(containerId) {
  if (containerId instanceof HTMLElement) return containerId;
  const container = document.getElementById(containerId);
  if (!container) throw new Error(`Container 3D com id "${containerId}" não encontrado.`);
  return container;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function makeAxisLabel(text, color = "#dffaff") {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = color;
  ctx.font = "bold 96px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.9, 0.9, 1);
  return sprite;
}

function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
    if (child.map) child.map.dispose();
  });
}

function ensureVolumeBadge() {
  if (!sceneState.container) return null;
  let badge = sceneState.container.querySelector(".volume-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.className = "volume-badge";
    badge.style.position = "absolute";
    badge.style.right = "16px";
    badge.style.bottom = "16px";
    badge.style.padding = "10px 14px";
    badge.style.borderRadius = "999px";
    badge.style.background = "rgba(4, 12, 18, 0.7)";
    badge.style.border = "1px solid rgba(90,214,255,0.5)";
    badge.style.color = "#dffaff";
    badge.style.fontWeight = "700";
    badge.style.fontSize = "0.85rem";
    badge.style.opacity = "0";
    badge.style.transition = "opacity 0.7s ease";
    badge.style.backdropFilter = "blur(8px)";
    badge.style.pointerEvents = "none";
    sceneState.container.appendChild(badge);
  }
  sceneState.volumeBadge = badge;
  return badge;
}

function ensureRotationButton() {
  if (!sceneState.container) return null;
  let button = sceneState.container.querySelector(".rotate-button");
  if (!button) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "rotate-button";
    button.textContent = "🔄 Girar";
    button.style.position = "absolute";
    button.style.top = "14px";
    button.style.right = "14px";
    button.style.zIndex = "10";
    button.style.background = "linear-gradient(135deg, #5ad6ff, #6ee7d8)";
    button.style.color = "#04131d";
    button.style.border = "none";
    button.style.borderRadius = "999px";
    button.style.padding = "10px 14px";
    button.style.fontWeight = "800";
    button.style.cursor = "pointer";
    button.style.boxShadow = "0 12px 18px rgba(46, 208, 255, 0.25)";
    sceneState.container.appendChild(button);
  }
  sceneState.rotationButton = button;
  return button;
}

function clearCurrentSolid() {
  ["currentMesh", "currentFrontFace"].forEach((key) => {
    const obj = sceneState[key];
    if (!obj) return;
    sceneState.scene.remove(obj);
    disposeObject3D(obj);
    sceneState[key] = null;
  });
}

function drawFrontFace(f, a, b, eixo) {
  const points = [];
  const samples = 120;
  for (let i = 0; i <= samples; i += 1) {
    const x = a + ((b - a) * i) / samples;
    if (eixo === "x") {
      points.push(new THREE.Vector3(x, Math.abs(f(x)), 0));
    } else {
      points.push(new THREE.Vector3(Math.abs(x), f(x), 0));
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0xbef3ff, transparent: true, opacity: 1 });
  return new THREE.Line(geometry, material);
}

function applyThetaShader(material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTheta = { value: Math.PI * 2 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nattribute float aAngle;\nvarying float vAngle;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\nvAngle = aAngle;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nuniform float uTheta;\nvarying float vAngle;`)
      .replace("void main() {", `void main() {\n if (vAngle > uTheta) discard;`);
    material.userData.shader = shader;
  };
  material.customProgramCacheKey = () => "theta-cut";
}

function createSolidGeometry(f, a, b, eixo, N = 80, M = 60) {
  const positions = [];
  const angles = [];
  const uvs = [];
  const indices = [];

  const xValues = [];
  for (let i = 0; i <= N; i += 1) xValues.push(a + ((b - a) * i) / N);

  for (let i = 0; i <= N; i += 1) {
    for (let j = 0; j <= M; j += 1) {
      const theta = (j / M) * Math.PI * 2;
      const x = xValues[i];

      let px = 0, py = 0, pz = 0;

      if (eixo === "x") {
        const radius = Math.abs(f(x));
        px = x;
        py = radius * Math.cos(theta);
        pz = radius * Math.sin(theta);
      } else {
        const r = Math.abs(x);
        const h = f(x);
        px = r * Math.cos(theta);
        py = h;
        pz = r * Math.sin(theta);
      }

      positions.push(px, py, pz);
      angles.push(theta);
      uvs.push(i / N, j / M);
    }
  }

  for (let i = 0; i < N; i += 1) {
    for (let j = 0; j < M; j += 1) {
      const aIdx = i * (M + 1) + j;
      const bIdx = aIdx + (M + 1);
      const cIdx = aIdx + 1;
      const dIdx = bIdx + 1;
      indices.push(aIdx, bIdx, cIdx);
      indices.push(bIdx, dIdx, cIdx);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aAngle", new THREE.Float32BufferAttribute(angles, 1));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createSliceGeometry(f, a, b, eixo, N = 80) {
  const positions = [];
  const indices = [];
  for (let i = 0; i <= N; i += 1) {
    const x = a + ((b - a) * i) / N;
    positions.push(x, 0, 0);
    positions.push(x, f(x), 0);
  }
  for (let i = 0; i < N; i += 1) {
    const b0 = i * 2;
    const t0 = i * 2 + 1;
    const b1 = (i + 1) * 2;
    const t1 = (i + 1) * 2 + 1;
    indices.push(b0, b1, t0);
    indices.push(b1, t1, t0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function showVolumeBadge(value, eixo) {
  const badge = ensureVolumeBadge();
  if (!badge) return;
  const label = eixo === "x" ? "Volume (eixo X)" : "Volume (eixo Y)";
  badge.textContent = `${label}: ${Number(value).toFixed(6)}`;
  badge.style.opacity = "1";
}

function fitCameraToGeometry(geometry) {
  if (!geometry.boundingSphere || !sceneState.camera || !sceneState.controls) return;
  const r = geometry.boundingSphere.radius;
  const center = geometry.boundingSphere.center;
  sceneState.controls.target.copy(center);
  sceneState.controls.update();
  const dist = r * 3.2;
  const dir = new THREE.Vector3(-0.35, 0.5, 1).normalize();
  sceneState.camera.position.copy(center).addScaledVector(dir, dist);
  sceneState.camera.lookAt(center);
  sceneState.camera.updateProjectionMatrix();
  if (sceneState.axesHelper) {
    const escala = Math.max(1, r * 1.6);
    sceneState.axesHelper.scale.setScalar(escala / 8);
  }
}

// ---------- Aplica um theta específico ao sólido e à fatia ----------
function applyTheta(theta) {
  const { mesh, material, sliceMesh, eixo } = sceneState.animationParams || {};
  if (material && material.userData.shader) {
    material.userData.shader.uniforms.uTheta.value = theta;
  }
  if (sliceMesh) {
    if (eixo === "x") sliceMesh.rotation.set(theta, 0, 0);
    else sliceMesh.rotation.set(0, -theta, 0);
  }
}

// ---------- Loop da animação (extraído para permitir resume) ----------
function runAnimationFrame() {
  const now = performance.now();
  const elapsed = now - sceneState.animationStart;
  const progress = Math.min(elapsed / sceneState.animationDuration, 1);
  const eased = easeInOutCubic(progress);
  const theta = eased * Math.PI * 2;

  applyTheta(theta);

  if (progress < 1) {
    sceneState.animationFrameId = requestAnimationFrame(runAnimationFrame);
    return;
  }

  // Final
  const { f, a, b, eixo, sliceMesh, material } = sceneState.animationParams || {};
  sceneState.animationFrameId = null;

  if (sliceMesh) {
    if (sliceMesh.parent) sceneState.scene.remove(sliceMesh);
    disposeObject3D(sliceMesh);
    sceneState.currentFrontFace = null;
  }

  if (material && material.userData.shader) {
    material.userData.shader.uniforms.uTheta.value = Math.PI * 2;
  }

  if (sceneState.controls) sceneState.controls.enableRotate = true;

  if (f) {
    const volume =
      eixo === "x"
        ? Math.PI * simpson((x) => f(x) ** 2, a, b, 2000).valor
        : 2 * Math.PI * simpson((x) => x * Math.abs(f(x)), a, b, 2000).valor;
    showVolumeBadge(volume, eixo);
  }

  sceneState.animationParams = null;
  sceneState.isPaused = false;
}

export function init3D(containerId) {
  const container = resolveContainer(containerId);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x07111d, 1);
  renderer.setSize(container.clientWidth || 400, container.clientHeight || 300);

  container.innerHTML = "";
  container.style.position = "relative";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1723);
  scene.fog = new THREE.Fog(0x0b1723, 15, 80);

  const camera = new THREE.PerspectiveCamera(
    45,
    (container.clientWidth || 400) / (container.clientHeight || 300),
    0.1,
    2000
  );
  camera.position.set(-3, 4, 10);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dirLight = new THREE.DirectionalLight(0x9fe8ff, 1.2);
  dirLight.position.set(6, 8, 10);
  scene.add(dirLight);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.target.set(0, 0, 0);

  const grid = new THREE.GridHelper(20, 20, 0x4fc3f7, 0x2a3d52);
  scene.add(grid);

  const axes = new THREE.AxesHelper(8);
  axes.name = "axesHelper";
  scene.add(axes);
  sceneState.axesHelper = axes;

  const labelX = makeAxisLabel("x", "#ff7070");
  labelX.position.set(8.6, 0, 0);
  scene.add(labelX);

  const labelY = makeAxisLabel("y", "#6ee7a4");
  labelY.position.set(0, 8.6, 0);
  scene.add(labelY);

  const labelZ = makeAxisLabel("z", "#70aaff");
  labelZ.position.set(0, 0, 8.6);
  scene.add(labelZ);

  const axisLineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-12, 0, 0),
    new THREE.Vector3(12, 0, 0),
  ]);
  const axisLineMat = new THREE.LineDashedMaterial({
    color: 0xffb347,
    dashSize: 0.4,
    gapSize: 0.25,
    transparent: true,
    opacity: 0.9,
  });
  const rotationAxis = new THREE.Line(axisLineGeo, axisLineMat);
  rotationAxis.computeLineDistances();
  scene.add(rotationAxis);
  sceneState.rotationAxis = rotationAxis;

  const onResize = () => {
    if (!container) return;
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 300;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  window.addEventListener("resize", onResize);

  sceneState.container = container;
  sceneState.renderer = renderer;
  sceneState.scene = scene;
  sceneState.camera = camera;
  sceneState.controls = controls;

  const button = ensureRotationButton();
  if (button) {
    button.onclick = () => {
      if (sceneState.lastRotation) {
        const { f, a, b, eixo } = sceneState.lastRotation;
        animateRotation(f, a, b, eixo, sceneState.animationDuration);
      }
    };
  }

  function animateLoop() {
    requestAnimationFrame(animateLoop);
    controls.update();
    renderer.render(scene, camera);
  }
  animateLoop();

  return { scene, camera, renderer, controls, container };
}

export function renderSolid(f, a, b, eixo = "x") {
  if (typeof f !== "function") throw new Error("f deve ser uma função.");
  if (!sceneState.scene || !sceneState.renderer || !sceneState.camera) {
    throw new Error("Chame init3D(containerId) antes de renderSolid().");
  }

  if (sceneState.animationFrameId) {
    cancelAnimationFrame(sceneState.animationFrameId);
    sceneState.animationFrameId = null;
  }
  sceneState.isPaused = false;
  sceneState.animationParams = null;

  if (sceneState.controls) sceneState.controls.enableRotate = true;

  clearCurrentSolid();

  const geometry = createSolidGeometry(f, a, b, eixo, 80, 60);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4ad6ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    metalness: 0.2,
    roughness: 0.35,
    emissive: 0x0d4256,
    emissiveIntensity: 0.2,
  });

  const mesh = new THREE.Mesh(geometry, material);

  const wireframe = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x8fe5ff, transparent: true, opacity: 0.35 })
  );
  mesh.add(wireframe);

  const frontFace = drawFrontFace(f, a, b, eixo);
  frontFace.material.color.setHex(0xcaf9ff);
  frontFace.material.opacity = 1;

  sceneState.scene.add(mesh);
  sceneState.scene.add(frontFace);
  sceneState.currentMesh = mesh;
  sceneState.currentFrontFace = frontFace;

  if (sceneState.rotationAxis) {
    sceneState.rotationAxis.rotation.set(0, 0, 0);
    sceneState.rotationAxis.position.set(0, 0, 0);
    if (eixo === "y") sceneState.rotationAxis.rotation.z = Math.PI / 2;
  }

  fitCameraToGeometry(geometry);
  return mesh;
}

export function animateRotation(f, a, b, eixo = "x", duration = 4500) {
  if (typeof f !== "function") throw new Error("f deve ser uma função.");
  if (!sceneState.scene || !sceneState.camera || !sceneState.renderer) {
    throw new Error("Chame init3D(containerId) antes de animateRotation().");
  }

  if (sceneState.controls) sceneState.controls.enableRotate = false;
  sceneState.lastRotation = { f, a, b, eixo };
  sceneState.animationDuration = duration;

  if (sceneState.animationFrameId) {
    cancelAnimationFrame(sceneState.animationFrameId);
    sceneState.animationFrameId = null;
  }

  sceneState.isPaused = false;
  sceneState.pausedProgress = 0;

  clearCurrentSolid();

  // Sólido com shader
  const geometry = createSolidGeometry(f, a, b, eixo, 80, 60);
  const material = new THREE.MeshStandardMaterial({
    color: 0x4ad6ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
    metalness: 0.2,
    roughness: 0.35,
    emissive: 0x0d4256,
    emissiveIntensity: 0.2,
  });
  applyThetaShader(material);

  const mesh = new THREE.Mesh(geometry, material);

  const wireframe = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x8fe5ff, transparent: true, opacity: 0.25 })
  );
  mesh.add(wireframe);

  sceneState.scene.add(mesh);
  sceneState.currentMesh = mesh;

  // Fatia 2D
  const sliceGeometry = createSliceGeometry(f, a, b, eixo, 80);
  const sliceMaterial = new THREE.MeshStandardMaterial({
    color: 0x7fe9ff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.95,
    metalness: 0.1,
    roughness: 0.4,
    emissive: 0x1a5b73,
    emissiveIntensity: 0.5,
  });
  const sliceMesh = new THREE.Mesh(sliceGeometry, sliceMaterial);

  const outlinePoints = [];
  for (let i = 0; i <= 80; i += 1) {
    const x = a + ((b - a) * i) / 80;
    outlinePoints.push(new THREE.Vector3(x, f(x), 0));
  }
  outlinePoints.push(new THREE.Vector3(b, 0, 0));
  outlinePoints.push(new THREE.Vector3(a, 0, 0));
  outlinePoints.push(new THREE.Vector3(a, f(a), 0));

  const sliceOutlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePoints);
  const sliceOutline = new THREE.Line(
    sliceOutlineGeo,
    new THREE.LineBasicMaterial({ color: 0xdffaff })
  );
  sliceMesh.add(sliceOutline);

  sceneState.scene.add(sliceMesh);
  sceneState.currentFrontFace = sliceMesh;

  if (sceneState.rotationAxis) {
    sceneState.rotationAxis.rotation.set(0, 0, 0);
    sceneState.rotationAxis.position.set(0, 0, 0);
    if (eixo === "y") sceneState.rotationAxis.rotation.z = Math.PI / 2;
  }

  fitCameraToGeometry(geometry);

  // Guarda contexto para pause/resume
  sceneState.animationParams = { f, a, b, eixo, mesh, material, sliceMesh };
  sceneState.animationStart = performance.now();

  const badge = ensureVolumeBadge();
  if (badge) badge.style.opacity = "0";

  sceneState.animationFrameId = requestAnimationFrame(runAnimationFrame);
}

// ---------- NOVA: pausa a animação exatamente onde está ----------
export function pauseRotation() {
  if (sceneState.isPaused) return false;
  if (!sceneState.animationFrameId) return false;

  cancelAnimationFrame(sceneState.animationFrameId);
  sceneState.animationFrameId = null;

  const elapsed = performance.now() - sceneState.animationStart;
  sceneState.pausedProgress = Math.min(elapsed / sceneState.animationDuration, 1);
  sceneState.isPaused = true;

  return true;
}

// ---------- NOVA: retoma do ponto onde parou ----------
export function resumeRotation() {
  if (!sceneState.isPaused) return false;
  if (!sceneState.animationParams) return false;

  // Reposiciona o "start" para que o progresso continue de onde parou
  sceneState.animationStart =
    performance.now() - sceneState.pausedProgress * sceneState.animationDuration;
  sceneState.isPaused = false;

  sceneState.animationFrameId = requestAnimationFrame(runAnimationFrame);
  return true;
}

export function isPaused() {
  return sceneState.isPaused;
}

export function stopRotation() {
  if (sceneState.animationFrameId) {
    cancelAnimationFrame(sceneState.animationFrameId);
    sceneState.animationFrameId = null;
  }

  if (sceneState.currentMesh && sceneState.currentMesh.material.userData.shader) {
    sceneState.currentMesh.material.userData.shader.uniforms.uTheta.value = Math.PI * 2;
  }

  if (sceneState.currentFrontFace) {
    const sliceMesh = sceneState.currentFrontFace;
    if (sliceMesh.parent) sceneState.scene.remove(sliceMesh);
    disposeObject3D(sliceMesh);
    sceneState.currentFrontFace = null;
  }

  if (sceneState.controls) sceneState.controls.enableRotate = true;

  if (sceneState.lastRotation) {
    const { f, a, b, eixo } = sceneState.lastRotation;
    const volume =
      eixo === "x"
        ? Math.PI * simpson((x) => f(x) ** 2, a, b, 2000).valor
        : 2 * Math.PI * simpson((x) => x * Math.abs(f(x)), a, b, 2000).valor;
    showVolumeBadge(volume, eixo);
  }

  sceneState.isPaused = false;
  sceneState.animationParams = null;

  return true;
}

export default {
  init3D,
  renderSolid,
  animateRotation,
  pauseRotation,
  resumeRotation,
  stopRotation,
  isPaused,
};