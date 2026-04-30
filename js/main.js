/**
 * main.js — Orquestador de la aplicación
 *
 * Responsabilidades:
 *   1. Instanciar y conectar todas las capas (geometry → renderer → animator → exporter)
 *   2. Cargar imágenes antes de arrancar la animación
 *   3. Conectar los controles del UI con el animator y el exporter
 *   4. Gestionar el flujo de export (frame-by-frame con CCapture)
 *   5. Manejar el cambio de patrón de mandala (switchPattern)
 *
 * Este archivo NO contiene lógica de animación ni de renderizado.
 */

import { CONFIG } from "../config.js";
import { computeLayout } from "./geometry.js";
import { PATTERN_REGISTRY } from "./geometry-patterns.js";
import { P5Renderer } from "./renderer-p5.js";
import { Animator } from "./animator.js";
import { Exporter } from "./exporter.js";

// ─── Referencias al DOM ───────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const UI = {
  container: $("canvas-container"),
  btnPlay: $("btn-play"),
  btnReset: $("btn-reset"),
  btnExport: $("btn-export"),
  speedSlider: $("speed-slider"),
  speedLabel: $("speed-label"),
  progressBar: $("progress-bar"),
  progressWrap: $("progress-wrap"),
  statusText: $("status-text"),
  effectSelect: $("effect-select"),
  patternSelect: $("pattern-select"),
  // New settings controls
  bgColorInput: $("bg-color-input"),
  rotationSlider: $("rotation-slider"),
  rotationLabel: $("rotation-label"),
  staggerSlider: $("stagger-slider"),
  staggerLabel: $("stagger-label"),
  durationSlider: $("duration-slider"),
  durationLabel: $("duration-label"),
  loopCheckbox: $("loop-checkbox"),
  fpsSelect: $("fps-select"),
  captureSelect: $("capture-select"),
};

// ─── Estado de la app ─────────────────────────────────────────────────────

let renderer = null;
let animator = null;
let exporter = null;
let slots = [];
let images = [];
let isPlaying = false;
let isExporting = false;
let currentPattern = "circular";

// ─── Inicialización ───────────────────────────────────────────────────────

async function init() {
  // Poblar el selector con <optgroup> por categoría — única fuente de verdad: PATTERN_REGISTRY
  const categoryGroups = {};
  Object.entries(PATTERN_REGISTRY).forEach(([key, { label, category }]) => {
    if (!Object.hasOwn(categoryGroups, category)) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = category; // textContent no aplica a optgroup; label es el atributo correcto
      categoryGroups[category] = optgroup;
      UI.patternSelect.appendChild(optgroup);
    }
    const option = document.createElement("option");
    option.value = key;
    option.textContent = label; // textContent — nunca innerHTML (CWE-79)
    if (key === currentPattern) option.selected = true;
    categoryGroups[category].appendChild(option);
  });

  setStatus("Calculando layout…");

  // 1. Calcular posiciones con el patrón inicial
  slots = computeLayout(currentPattern, CONFIG);

  // 2. Instanciar renderer (solo una vez — reutilizado al cambiar patrón)
  renderer = new P5Renderer();
  renderer.init(
    "canvas-container",
    CONFIG.canvas.width,
    CONFIG.canvas.height,
    onRendererReady,
  );
}

async function onRendererReady() {
  setStatus("Cargando imágenes…");

  // 3. Cargar todas las imágenes en paralelo
  images = await loadAllImages();

  const loaded = images.filter(Boolean).length;
  setStatus(`${loaded}/${slots.length} imágenes. Listo.`);

  // 4. Instanciar animator y exporter
  animator = new Animator(renderer, slots, images, CONFIG);
  exporter = new Exporter(renderer.getCanvas(), CONFIG, animator);

  // 5. Conectar controles UI
  bindControls();

  // 6. Notificar al HTML que la app está lista para habilitar botones
  document.dispatchEvent(new CustomEvent("mandala:ready"));

  // 7. Iniciar preview automáticamente
  startPreview();
}

// ─── Cambio de patrón ─────────────────────────────────────────────────────

/**
 * Cambia el tipo de mandala sin reiniciar el renderer (p5).
 * Recalcula los slots, recarga imágenes y reinicia la animación.
 *
 * @param {string} patternName
 */
async function switchPattern(patternName) {
  if (isExporting) return;
  if (patternName === currentPattern) return;

  currentPattern = patternName;

  // Detener animación actual
  if (animator) {
    animator.pause();
    animator.reset();
  }
  isPlaying = false;
  UI.btnPlay.textContent = "▶ Reproducir";
  UI.progressBar.style.width = "0%";

  setStatus("Cambiando patrón…");

  // Recalcular layout para el nuevo patrón
  slots = computeLayout(patternName, CONFIG);

  // Recargar imágenes (el nuevo patrón puede tener diferente distribución)
  images = await loadAllImages();

  const loaded = images.filter(Boolean).length;
  setStatus(
    `${PATTERN_REGISTRY[patternName]?.label ?? patternName} — ${loaded}/${slots.length} imágenes.`,
  );

  // Reinstanciar animator y exporter con los nuevos slots
  animator = new Animator(renderer, slots, images, CONFIG);
  exporter = new Exporter(renderer.getCanvas(), CONFIG, animator);

  startPreview();
}

// ─── Carga de imágenes ────────────────────────────────────────────────────

async function loadAllImages() {
  return Promise.all(slots.map((s) => renderer.loadImage(s.imageSrc)));
}

// ─── Preview ──────────────────────────────────────────────────────────────

function startPreview() {
  isPlaying = true;
  UI.btnPlay.textContent = "⏸ Pausar";

  animator.play(
    (elapsed, total) => {
      const ratio = Math.min(1, elapsed / total);
      UI.progressBar.style.width = `${ratio * 100}%`;
    },
    () => {
      setStatus("Animación completa. Podés exportar el video.");
      UI.btnPlay.textContent = "▶ Reproducir";
      isPlaying = false;
    },
  );
}

// ─── Export frame-by-frame (CCapture) ────────────────────────────────────

async function runExport() {
  if (isExporting) return;
  isExporting = true;

  UI.btnExport.disabled = true;
  UI.btnPlay.disabled = true;
  UI.staggerSlider.disabled = true;
  UI.durationSlider.disabled = true;
  UI.bgColorInput.disabled = true;
  UI.progressWrap.classList.add("is-exporting");
  document.dispatchEvent(new CustomEvent("mandala:export-start"));

  if (isPlaying) animator.pause();
  animator.reset();

  exporter.start(
    (ratio) => {
      UI.progressBar.style.width = `${ratio * 100}%`;
      setStatus(`Exportando… ${Math.round(ratio * 100)}%`);
    },
    () => {
      isExporting = false;
      UI.btnExport.disabled = false;
      UI.btnPlay.disabled = false;
      UI.staggerSlider.disabled = false;
      UI.durationSlider.disabled = false;
      UI.bgColorInput.disabled = false;
      UI.progressWrap.classList.remove("is-exporting");
      setStatus("✅ Video descargado. Revisá tu carpeta de descargas.");
      document.dispatchEvent(new CustomEvent("mandala:export-end"));
    },
  );

  if (CONFIG.export.captureMode === "ccapture") {
    await runCCaptureLoop();
  }
}

async function runCCaptureLoop() {
  const fps = CONFIG.canvas.fps;
  const frameDeltaMs = 1000 / fps;
  const totalDuration = CONFIG.export.durationSeconds
    ? CONFIG.export.durationSeconds * 1000
    : animator.totalDurationMs + 500;

  let simulatedTime = 0;
  setStatus("Exportando (CCapture frame-by-frame)…");

  await new Promise((resolve) => {
    function exportFrame() {
      if (simulatedTime >= totalDuration) {
        exporter.stop().then(resolve);
        return;
      }
      animator.tickExport(frameDeltaMs);
      exporter.captureFrame();
      simulatedTime += frameDeltaMs;
      requestAnimationFrame(exportFrame);
    }
    exportFrame();
  });
}

// ─── Controles UI ─────────────────────────────────────────────────────────

function bindControls() {
  // Play / Pause
  UI.btnPlay.addEventListener("click", () => {
    if (isExporting) return;
    if (animator.isCompleted) {
      animator.reset();
      startPreview();
    } else if (isPlaying) {
      animator.pause();
      isPlaying = false;
      UI.btnPlay.textContent = "▶ Reproducir";
    } else {
      animator.resume();
      isPlaying = true;
      UI.btnPlay.textContent = "⏸ Pausar";
    }
  });

  // Reset
  UI.btnReset.addEventListener("click", () => {
    if (isExporting) return;
    animator.reset();
    isPlaying = false;
    UI.btnPlay.textContent = "▶ Reproducir";
    UI.progressBar.style.width = "0%";
    setStatus("Animación reseteada.");
  });

  // Export
  UI.btnExport.addEventListener("click", () => {
    if (!isExporting) runExport();
  });

  // Speed slider
  UI.speedSlider.addEventListener("input", () => {
    const val = parseFloat(UI.speedSlider.value);
    animator.setSpeed(val);
    UI.speedLabel.textContent = `${val.toFixed(1)}×`; // textContent — nunca innerHTML (CWE-79)
  });

  // Efecto de entrada
  UI.effectSelect.addEventListener("change", () => {
    if (isExporting) return;
    CONFIG.animation.entryEffect = UI.effectSelect.value;
    animator.reset();
    startPreview();
  });

  // ── Selector de patrón de mandala ────────────────────────────────────────
  UI.patternSelect.addEventListener("change", () => {
    if (isExporting) return;
    // Allowlist derivada del PATTERN_REGISTRY — fuente única de verdad
    const selected = UI.patternSelect.value;
    if (!Object.hasOwn(PATTERN_REGISTRY, selected)) return; // ignorar valores no esperados
    switchPattern(selected);
  });

  // ── Color de fondo (efecto inmediato — el renderer lo lee en cada frame) ──
  UI.bgColorInput.addEventListener("input", () => {
    CONFIG.canvas.bgColor = UI.bgColorInput.value; // textContent no aplica, input.value es seguro aquí
  });

  // ── Velocidad de rotación (efecto inmediato) ──────────────────────────────
  UI.rotationSlider.addEventListener("input", () => {
    const val = parseFloat(UI.rotationSlider.value);
    CONFIG.animation.rotationSpeed = val;
    UI.rotationLabel.textContent = val.toFixed(3);
  });

  // ── Stagger delay (requiere reinicio para consistencia visual) ────────────
  UI.staggerSlider.addEventListener("change", () => {
    if (isExporting) return;
    const val = parseInt(UI.staggerSlider.value, 10);
    CONFIG.animation.staggerDelay = val;
    UI.staggerLabel.textContent = `${val}ms`;
    animator.reset();
    startPreview();
  });

  // ── Duración de entrada (requiere reinicio para consistencia visual) ──────
  UI.durationSlider.addEventListener("change", () => {
    if (isExporting) return;
    const val = parseInt(UI.durationSlider.value, 10);
    CONFIG.animation.entryDuration = val;
    UI.durationLabel.textContent = `${val}ms`;
    animator.reset();
    startPreview();
  });

  // ── Loop (efecto inmediato — lo lee _tick en cada frame) ──────────────────
  UI.loopCheckbox.addEventListener("change", () => {
    CONFIG.animation.loopAnimation = UI.loopCheckbox.checked;
  });

  // ── FPS de exportación (solo aplica al exportar) ──────────────────────────
  UI.fpsSelect.addEventListener("change", () => {
    CONFIG.canvas.fps = parseInt(UI.fpsSelect.value, 10);
  });

  // ── Modo de captura (solo aplica al exportar) ─────────────────────────────
  UI.captureSelect.addEventListener("change", () => {
    const allowed = ["ccapture", "mediarecorder"];
    const selected = UI.captureSelect.value;
    if (!allowed.includes(selected)) return;
    CONFIG.export.captureMode = selected;
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function setStatus(msg) {
  UI.statusText.textContent = msg; // textContent — nunca innerHTML (CWE-79)
}

// ─── Arrancar ─────────────────────────────────────────────────────────────

document.addEventListener("mandala:ready", () => {
  UI.btnPlay.disabled = false;
  UI.btnReset.disabled = false;
  UI.btnExport.disabled = false;
});

document.addEventListener("mandala:export-start", () => {
  document.getElementById("export-overlay").classList.add("visible");
});
document.addEventListener("mandala:export-end", () => {
  document.getElementById("export-overlay").classList.remove("visible");
});

document.addEventListener("DOMContentLoaded", init);
