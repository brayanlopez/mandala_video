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
import {
  capturePreset,
  savePreset,
  loadPreset,
  listPresets,
  deletePreset,
  presetToJSON,
  presetFromJSON,
} from "./presets.js";

// ─── Referencias al DOM ───────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const UI = {
  // ── Controles principales ────────────────────────────────────────────────
  container: $("canvas-container"),
  btnPlay: $("btn-play"),
  btnReset: $("btn-reset"),
  btnExport: $("btn-export"),
  btnSettings: $("btn-settings"),
  settingsPanel: $("settings-panel"),
  speedSlider: $("speed-slider"),
  speedLabel: $("speed-label"),
  progressBar: $("progress-bar"),
  progressWrap: $("progress-wrap"),
  statusText: $("status-text"),
  effectSelect: $("effect-select"),
  patternSelect: $("pattern-select"),
  // ── Panel de ajustes (F-03) ──────────────────────────────────────────────
  bgColorInput: $("bg-color-input"),
  imgScaleSlider: $("img-scale-slider"),
  imgScaleLabel: $("img-scale-label"),
  rotationSlider: $("rotation-slider"),
  rotationLabel: $("rotation-label"),
  staggerSlider: $("stagger-slider"),
  staggerLabel: $("stagger-label"),
  durationSlider: $("duration-slider"),
  durationLabel: $("duration-label"),
  loopCheckbox: $("loop-checkbox"),
  fpsSelect: $("fps-select"),
  captureSelect: $("capture-select"),
  // ── Presets (F-06) ──────────────────────────────────────────────────────
  presetNameInput: $("preset-name-input"),
  presetSelect: $("preset-select"),
  btnSavePreset: $("btn-save-preset"),
  btnExportPreset: $("btn-export-preset"),
  btnLoadPreset: $("btn-load-preset"),
  btnDeletePreset: $("btn-delete-preset"),
  importPresetFile: $("import-preset-file"),
  presetStatus: $("preset-status"),
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

  // 5b. Poblar select de presets con los guardados en localStorage
  populatePresetSelect();

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
  UI.btnSettings.disabled = true;
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
      UI.btnSettings.disabled = false;
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

  // ── Toggle del panel de ajustes ──────────────────────────────────────────
  UI.btnSettings.addEventListener("click", () => {
    const isOpen = UI.settingsPanel.classList.toggle("open");
    UI.btnSettings.classList.toggle("active", isOpen);
    UI.settingsPanel.setAttribute("aria-hidden", String(!isOpen));
  });

  // ── Escala global de imágenes (efecto inmediato — leída por Animator en cada frame) ──
  UI.imgScaleSlider.addEventListener("input", () => {
    const val = parseFloat(UI.imgScaleSlider.value);
    CONFIG.canvas.imgScale = val;
    UI.imgScaleLabel.textContent = `${val.toFixed(2)}×`;
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

  // ── Presets (F-06) ───────────────────────────────────────────────────────

  // Guardar en localStorage
  UI.btnSavePreset.addEventListener("click", () => {
    const name = UI.presetNameInput.value.trim();
    if (!name) {
      showPresetStatus("⚠ Escribí un nombre", "err");
      return;
    }
    try {
      savePreset(name, capturePreset(CONFIG, currentPattern));
      populatePresetSelect();
      UI.presetSelect.value = name;
      showPresetStatus(`✅ "${name}" guardado`, "ok");
    } catch (e) {
      showPresetStatus(`❌ ${e.message}`, "err");
    }
  });

  // Exportar como archivo JSON
  UI.btnExportPreset.addEventListener("click", () => {
    const data = capturePreset(CONFIG, currentPattern);
    const json = presetToJSON(data);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const raw = UI.presetNameInput.value.trim() || "mandala-preset";
    // Sanitizar nombre para nombre de archivo (CWE-22 / nombres seguros)
    const safeName =
      raw.replace(/[^a-zA-Z0-9\-_ .]/g, "_").slice(0, 50) || "preset";
    a.href = url;
    a.download = `${safeName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Cargar desde localStorage
  UI.btnLoadPreset.addEventListener("click", async () => {
    if (isExporting) return;
    const name = UI.presetSelect.value;
    if (!name) {
      showPresetStatus("⚠ Seleccioná un preset", "err");
      return;
    }
    const data = loadPreset(name);
    if (!data) {
      showPresetStatus("⚠ Preset no encontrado", "err");
      return;
    }
    await applyPresetData(data);
    showPresetStatus(`✅ "${name}" aplicado`, "ok");
  });

  // Borrar de localStorage
  UI.btnDeletePreset.addEventListener("click", () => {
    const name = UI.presetSelect.value;
    if (!name) {
      showPresetStatus("⚠ Seleccioná un preset", "err");
      return;
    }
    deletePreset(name);
    populatePresetSelect();
    showPresetStatus(`🗑 "${name}" borrado`, "ok");
  });

  // Importar desde archivo JSON
  UI.importPresetFile.addEventListener("change", async () => {
    const file = UI.importPresetFile.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = presetFromJSON(text);
      await applyPresetData(data);
      showPresetStatus("✅ Preset importado", "ok");
    } catch (e) {
      showPresetStatus(`❌ ${e.message}`, "err");
    } finally {
      UI.importPresetFile.value = ""; // permite reimportar el mismo archivo
    }
  });
}

// ─── Helpers de presets (F-06) ────────────────────────────────────────────

/** Muestra un mensaje efímero en el área de estado de presets. */
function showPresetStatus(msg, type = "") {
  UI.presetStatus.textContent = msg;
  UI.presetStatus.className = `preset-status ${type}`;
  setTimeout(() => {
    UI.presetStatus.textContent = "";
    UI.presetStatus.className = "preset-status";
  }, 3000);
}

/** Sincroniza todos los controles del panel con los valores actuales de CONFIG. */
function syncUIFromConfig() {
  UI.bgColorInput.value = CONFIG.canvas.bgColor;
  UI.imgScaleSlider.value = String(CONFIG.canvas.imgScale ?? 1);
  UI.imgScaleLabel.textContent = `${(CONFIG.canvas.imgScale ?? 1).toFixed(2)}×`;
  UI.fpsSelect.value = String(CONFIG.canvas.fps);
  UI.speedSlider.value = String(CONFIG.animation.speed);
  UI.speedLabel.textContent = `${CONFIG.animation.speed.toFixed(1)}×`;
  UI.rotationSlider.value = String(CONFIG.animation.rotationSpeed);
  UI.rotationLabel.textContent = CONFIG.animation.rotationSpeed.toFixed(3);
  UI.staggerSlider.value = String(CONFIG.animation.staggerDelay);
  UI.staggerLabel.textContent = `${CONFIG.animation.staggerDelay}ms`;
  UI.durationSlider.value = String(CONFIG.animation.entryDuration);
  UI.durationLabel.textContent = `${CONFIG.animation.entryDuration}ms`;
  UI.loopCheckbox.checked = CONFIG.animation.loopAnimation;
  UI.effectSelect.value = CONFIG.animation.entryEffect;
  UI.captureSelect.value = CONFIG.export.captureMode;
  UI.patternSelect.value = currentPattern;
}

/** Reconstruye el <select> de presets desde localStorage. */
function populatePresetSelect() {
  const names = Object.keys(listPresets()).sort();
  UI.presetSelect.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "— seleccionar —";
  UI.presetSelect.appendChild(placeholder);
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name; // textContent — nunca innerHTML (CWE-79)
    UI.presetSelect.appendChild(opt);
  });
}

/**
 * Aplica un objeto preset al CONFIG y a todos los controles de la UI.
 * Si el patrón cambió, llama a switchPattern (async).
 * @param {object} data — resultado de capturePreset() o presetFromJSON()
 */
async function applyPresetData(data) {
  // Aplicar canvas
  const c = data.canvas ?? {};
  if (typeof c.bgColor === "string") CONFIG.canvas.bgColor = c.bgColor;
  if (typeof c.fps === "number") CONFIG.canvas.fps = c.fps;
  if (typeof c.imgScale === "number") CONFIG.canvas.imgScale = c.imgScale;

  // Aplicar animación
  const a = data.animation ?? {};
  if (typeof a.speed === "number") CONFIG.animation.speed = a.speed;
  if (typeof a.staggerDelay === "number")
    CONFIG.animation.staggerDelay = a.staggerDelay;
  if (typeof a.entryDuration === "number")
    CONFIG.animation.entryDuration = a.entryDuration;
  if (typeof a.entryEffect === "string")
    CONFIG.animation.entryEffect = a.entryEffect;
  if (typeof a.rotationSpeed === "number")
    CONFIG.animation.rotationSpeed = a.rotationSpeed;
  if (typeof a.loopAnimation === "boolean")
    CONFIG.animation.loopAnimation = a.loopAnimation;

  // Aplicar export
  const ex = data.export ?? {};
  if (typeof ex.captureMode === "string")
    CONFIG.export.captureMode = ex.captureMode;

  // Reflejar en los controles UI
  syncUIFromConfig();

  // Cambiar patrón o reiniciar animación
  const newPattern = typeof data.pattern === "string" ? data.pattern : null;
  if (
    newPattern &&
    Object.hasOwn(PATTERN_REGISTRY, newPattern) &&
    newPattern !== currentPattern
  ) {
    await switchPattern(newPattern);
  } else {
    animator.reset();
    startPreview();
  }
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
