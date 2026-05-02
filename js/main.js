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
  transparentCheckbox: $("transparent-checkbox"),
  canvasArea: $("canvas-area"),
  ffmpegAlphaRow: $("ffmpeg-alpha-row"),
  // ── Efectos visuales ────────────────────────────────────────────────────
  btnToggleEffects: $("btn-toggle-effects"),
  idleFloatCheckbox: $("idle-float-checkbox"),
  idleFloatAmpSlider: $("idle-float-amp-slider"),
  idleFloatAmpLabel: $("idle-float-amp-label"),
  camBreathingCheckbox: $("cam-breathing-checkbox"),
  camBreathingSwaySlider: $("cam-breathing-sway-slider"),
  camBreathingSwayLabel: $("cam-breathing-sway-label"),
  particlesCheckbox: $("particles-checkbox"),
  particlesCountSlider: $("particles-count-slider"),
  particlesCountLabel: $("particles-count-label"),
  glowCheckbox: $("glow-checkbox"),
  glowIntensitySlider: $("glow-intensity-slider"),
  glowIntensityLabel: $("glow-intensity-label"),
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

const AppState = {
  renderer: null,
  animator: null,
  exporter: null,
  slots: [],
  images: [],
  isPlaying: false,
  isExporting: false,
  currentPattern: "circular",
};

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
    if (key === AppState.currentPattern) option.selected = true;
    categoryGroups[category].appendChild(option);
  });

  setStatus("Calculando layout…");

  // 1. Calcular posiciones con el patrón inicial
  AppState.slots = computeLayout(AppState.currentPattern, CONFIG);

  // 2. Instanciar renderer (solo una vez — reutilizado al cambiar patrón)
  AppState.renderer = new P5Renderer();
  AppState.renderer.init(
    "canvas-container",
    CONFIG.canvas.width,
    CONFIG.canvas.height,
    onRendererReady,
  );
}

async function onRendererReady() {
  setStatus("Cargando imágenes…");

  // 3. Cargar todas las imágenes en paralelo
  AppState.images = await loadAllImages();

  const loaded = AppState.images.filter(Boolean).length;
  const missing = AppState.slots.length - loaded;
  setStatus(
    missing > 0
      ? `${loaded}/${AppState.slots.length} imágenes. ⚠ ${missing} no encontradas.`
      : `${loaded}/${AppState.slots.length} imágenes. Listo.`,
  );

  // 4. Instanciar animator y exporter
  AppState.animator = new Animator(
    AppState.renderer,
    AppState.slots,
    AppState.images,
    CONFIG,
  );
  AppState.exporter = new Exporter(
    AppState.renderer.getCanvas(),
    CONFIG,
    AppState.animator,
    AppState.renderer,
  );

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
  if (AppState.isExporting) return;
  if (patternName === AppState.currentPattern) return;

  AppState.currentPattern = patternName;

  // Detener animación actual
  if (AppState.animator) {
    AppState.animator.pause();
    AppState.animator.reset();
  }
  AppState.isPlaying = false;
  UI.btnPlay.textContent = "▶ Reproducir";
  UI.progressBar.style.width = "0%";

  setStatus("Cambiando patrón…");

  // Recalcular layout para el nuevo patrón
  AppState.slots = computeLayout(patternName, CONFIG);

  // Limpiar caché de imágenes del patrón anterior antes de cargar las nuevas
  AppState.renderer.clearImageCache();

  // Recargar imágenes (el nuevo patrón puede tener diferente distribución)
  AppState.images = await loadAllImages();

  const loaded = AppState.images.filter(Boolean).length;
  const missing = AppState.slots.length - loaded;
  const patternLabel = PATTERN_REGISTRY[patternName]?.label ?? patternName;
  setStatus(
    missing > 0
      ? `${patternLabel} — ${loaded}/${AppState.slots.length} imágenes. ⚠ ${missing} no encontradas.`
      : `${patternLabel} — ${loaded}/${AppState.slots.length} imágenes.`,
  );

  // Reinstanciar animator y exporter con los nuevos slots
  AppState.animator = new Animator(
    AppState.renderer,
    AppState.slots,
    AppState.images,
    CONFIG,
  );
  AppState.exporter = new Exporter(
    AppState.renderer.getCanvas(),
    CONFIG,
    AppState.animator,
    AppState.renderer,
  );

  startPreview();
}

// ─── Carga de imágenes ────────────────────────────────────────────────────

async function loadAllImages() {
  return Promise.all(
    AppState.slots.map((s) => AppState.renderer.loadImage(s.imageSrc)),
  );
}

// ─── Preview ──────────────────────────────────────────────────────────────

function startPreview() {
  AppState.isPlaying = true;
  UI.btnPlay.textContent = "⏸ Pausar";

  AppState.animator.play(
    (elapsed, total) => {
      const ratio = Math.min(1, elapsed / total);
      UI.progressBar.style.width = `${ratio * 100}%`;
    },
    () => {
      setStatus("Animación completa. Podés exportar el video.");
      UI.btnPlay.textContent = "▶ Reproducir";
      AppState.isPlaying = false;
    },
  );
}

// ─── Export frame-by-frame (CCapture) ────────────────────────────────────

/**
 * Habilita o deshabilita los controles que no deben usarse durante el export.
 * bgColorInput tiene lógica especial: permanece deshabilitado si transparentBg está activo.
 * @param {boolean} disabled
 */
function setExportControls(disabled) {
  [
    UI.btnExport,
    UI.btnPlay,
    UI.btnSettings,
    UI.staggerSlider,
    UI.durationSlider,
    UI.transparentCheckbox,
  ].forEach((el) => {
    el.disabled = disabled;
  });
  UI.bgColorInput.disabled = disabled || CONFIG.export.transparentBg;
}

async function runExport() {
  if (AppState.isExporting) return;
  AppState.isExporting = true;

  setExportControls(true);
  UI.progressWrap.classList.add("is-exporting");
  document.dispatchEvent(new CustomEvent("mandala:export-start"));

  if (AppState.isPlaying) AppState.animator.pause();
  AppState.animator.reset();

  AppState.exporter.start(
    (ratio) => {
      UI.progressBar.style.width = `${ratio * 100}%`;
      setStatus(`Exportando… ${Math.round(ratio * 100)}%`);
    },
    () => {
      AppState.isExporting = false;
      setExportControls(false);
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
    : AppState.animator.totalDurationMs + 500;

  let simulatedTime = 0;
  setStatus("Exportando (CCapture frame-by-frame)…");

  await new Promise((resolve) => {
    function exportFrame() {
      if (simulatedTime >= totalDuration) {
        AppState.exporter.stop().then(resolve);
        return;
      }
      AppState.animator.tickExport(frameDeltaMs);
      AppState.exporter.captureFrame();
      simulatedTime += frameDeltaMs;
      requestAnimationFrame(exportFrame);
    }
    exportFrame();
  });
}

// ─── Controles UI ─────────────────────────────────────────────────────────

// ── Validación de entradas ────────────────────────────────────────────────
//
// Valores aceptados para campos de selección. Se valida antes de mutar CONFIG
// para evitar valores inesperados provenientes de manipulación del DOM.

const VALID_EFFECTS = new Set(["fadeIn", "scaleIn", "spinIn", "flyIn"]);
const VALID_FPS = new Set([30, 60]);
const VALID_CAPTURE_MODES = new Set(["ccapture", "mediarecorder"]);
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

/** Restringe `val` al rango [min, max]. */
function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

/**
 * Registra un listener "input" en un slider: lee, clampea, invoca el setter
 * y actualiza el label. Para sliders con efecto inmediato (sin reinicio de animación).
 *
 * @param {HTMLInputElement}      el       — slider
 * @param {HTMLElement}           label    — elemento que muestra el valor
 * @param {number}                min
 * @param {number}                max
 * @param {number}                decimals — cifras para toFixed()
 * @param {string}                suffix   — sufijo del label ("×", "ms", "")
 * @param {(val: number) => void} setter   — callback con el valor validado
 */
function bindSlider(el, label, min, max, decimals, suffix, setter) {
  el.addEventListener("input", () => {
    const val = clamp(parseFloat(el.value), min, max);
    setter(val);
    label.textContent = val.toFixed(decimals) + suffix; // textContent — nunca innerHTML (CWE-79)
  });
}

/**
 * Igual que bindSlider pero con evento "change" y reinicio de animación.
 * Para parámetros que modifican la secuencia de entrada (stagger, duración).
 *
 * @param {HTMLInputElement}      el      — slider
 * @param {HTMLElement}           label
 * @param {number}                min
 * @param {number}                max
 * @param {string}                suffix
 * @param {(val: number) => void} setter
 */
function bindRestartingSlider(el, label, min, max, suffix, setter) {
  el.addEventListener("change", () => {
    if (AppState.isExporting) return;
    const val = clamp(parseInt(el.value, 10), min, max);
    setter(val);
    label.textContent = `${val}${suffix}`;
    AppState.animator.reset();
    startPreview();
  });
}

// ── Controles de reproducción ─────────────────────────────────────────────

function bindPlayControls() {
  UI.btnPlay.addEventListener("click", () => {
    if (AppState.isExporting) return;
    if (AppState.animator.isCompleted) {
      AppState.animator.reset();
      startPreview();
    } else if (AppState.isPlaying) {
      AppState.animator.pause();
      AppState.isPlaying = false;
      UI.btnPlay.textContent = "▶ Reproducir";
    } else {
      AppState.animator.resume();
      AppState.isPlaying = true;
      UI.btnPlay.textContent = "⏸ Pausar";
    }
  });
}

function bindResetControl() {
  UI.btnReset.addEventListener("click", () => {
    if (AppState.isExporting) return;
    AppState.animator.reset();
    AppState.isPlaying = false;
    UI.btnPlay.textContent = "▶ Reproducir";
    UI.progressBar.style.width = "0%";
    setStatus("Animación reseteada.");
  });
}

function bindExportControl() {
  UI.btnExport.addEventListener("click", () => {
    if (!AppState.isExporting) runExport();
  });
}

// ── Panel de ajustes ──────────────────────────────────────────────────────

function bindSettingsToggle() {
  UI.btnSettings.addEventListener("click", () => {
    const isOpen = UI.settingsPanel.classList.toggle("open");
    UI.btnSettings.classList.toggle("active", isOpen);
    UI.settingsPanel.setAttribute("aria-hidden", String(!isOpen));
  });
}

// ── Sliders de animación ──────────────────────────────────────────────────

function bindSpeedSlider() {
  // Efecto inmediato — no requiere reinicio de animación
  bindSlider(UI.speedSlider, UI.speedLabel, 0.1, 4.0, 1, "×", (v) =>
    AppState.animator.setSpeed(v),
  );
}

function bindImgScaleSlider() {
  // Efecto inmediato — leída por Animator en cada frame
  bindSlider(UI.imgScaleSlider, UI.imgScaleLabel, 0.3, 2.0, 2, "×", (v) => {
    CONFIG.canvas.imgScale = v;
  });
}

function bindRotationSlider() {
  // Efecto inmediato
  bindSlider(UI.rotationSlider, UI.rotationLabel, 0, 2.0, 3, "", (v) => {
    CONFIG.animation.rotationSpeed = v;
  });
}

function bindStaggerSlider() {
  // Requiere reinicio para consistencia visual
  bindRestartingSlider(
    UI.staggerSlider,
    UI.staggerLabel,
    0,
    2000,
    "ms",
    (v) => {
      CONFIG.animation.staggerDelay = v;
    },
  );
}

function bindDurationSlider() {
  // Requiere reinicio para consistencia visual
  bindRestartingSlider(
    UI.durationSlider,
    UI.durationLabel,
    100,
    3000,
    "ms",
    (v) => {
      CONFIG.animation.entryDuration = v;
    },
  );
}

// ── Selects y checkboxes ──────────────────────────────────────────────────

function bindEffectSelect() {
  UI.effectSelect.addEventListener("change", () => {
    if (AppState.isExporting) return;
    const val = UI.effectSelect.value;
    if (!VALID_EFFECTS.has(val)) return;
    CONFIG.animation.entryEffect = val;
    AppState.animator.reset();
    startPreview();
  });
}

function bindPatternSelect() {
  // Allowlist derivada del PATTERN_REGISTRY — fuente única de verdad
  UI.patternSelect.addEventListener("change", () => {
    if (AppState.isExporting) return;
    const selected = UI.patternSelect.value;
    if (!Object.hasOwn(PATTERN_REGISTRY, selected)) return;
    switchPattern(selected);
  });
}

function bindBgColorInput() {
  // Efecto inmediato — el renderer lo lee en cada frame
  UI.bgColorInput.addEventListener("input", () => {
    const val = UI.bgColorInput.value;
    if (!HEX_COLOR_RE.test(val)) return;
    CONFIG.canvas.bgColor = val;
  });
}

function bindLoopCheckbox() {
  // Efecto inmediato — lo lee _tick en cada frame
  UI.loopCheckbox.addEventListener("change", () => {
    CONFIG.animation.loopAnimation = UI.loopCheckbox.checked;
  });
}

function bindFpsSelect() {
  // Solo aplica al exportar
  UI.fpsSelect.addEventListener("change", () => {
    const val = parseInt(UI.fpsSelect.value, 10);
    if (!VALID_FPS.has(val)) return;
    CONFIG.canvas.fps = val;
  });
}

function bindCaptureSelect() {
  // Solo aplica al exportar
  UI.captureSelect.addEventListener("change", () => {
    const val = UI.captureSelect.value;
    if (!VALID_CAPTURE_MODES.has(val)) return;
    CONFIG.export.captureMode = val;
  });
}

function bindTransparentCheckbox() {
  UI.transparentCheckbox.addEventListener("change", () => {
    CONFIG.export.transparentBg = UI.transparentCheckbox.checked;
    UI.bgColorInput.disabled = UI.transparentCheckbox.checked;
    UI.canvasArea.classList.toggle(
      "transparent-mode",
      UI.transparentCheckbox.checked,
    );
    UI.ffmpegAlphaRow.style.display = UI.transparentCheckbox.checked
      ? ""
      : "none";
  });
}

// ── Presets (F-06) ────────────────────────────────────────────────────────

function bindPresetControls() {
  // Guardar en localStorage
  UI.btnSavePreset.addEventListener("click", () => {
    const name = UI.presetNameInput.value.trim();
    if (!name) {
      showPresetStatus("⚠ Escribí un nombre", "err");
      return;
    }
    try {
      savePreset(name, capturePreset(CONFIG, AppState.currentPattern));
      populatePresetSelect();
      UI.presetSelect.value = name;
      showPresetStatus(`✅ "${name}" guardado`, "ok");
    } catch (e) {
      showPresetStatus(`❌ ${e.message}`, "err");
    }
  });

  // Exportar como archivo JSON
  UI.btnExportPreset.addEventListener("click", () => {
    const data = capturePreset(CONFIG, AppState.currentPattern);
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
    if (AppState.isExporting) return;
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

// ── Efectos visuales ──────────────────────────────────────────────────────

/** Sincroniza el label del botón maestro con el estado actual de los efectos. */
function _syncToggleEffectsBtn() {
  const allOn =
    CONFIG.effects.idleFloat.enabled &&
    CONFIG.effects.cameraBreathing.enabled &&
    CONFIG.effects.particles.enabled &&
    CONFIG.effects.glow.enabled;
  UI.btnToggleEffects.textContent = allOn
    ? "Desactivar todos"
    : "Activar todos";
}

function bindEffectsControls() {
  // Botón maestro — activa o desactiva los cuatro efectos a la vez
  UI.btnToggleEffects.addEventListener("click", () => {
    const allOn =
      CONFIG.effects.idleFloat.enabled &&
      CONFIG.effects.cameraBreathing.enabled &&
      CONFIG.effects.particles.enabled &&
      CONFIG.effects.glow.enabled;
    const next = !allOn;

    CONFIG.effects.idleFloat.enabled = next;
    CONFIG.effects.cameraBreathing.enabled = next;
    CONFIG.effects.particles.enabled = next;
    CONFIG.effects.glow.enabled = next;

    UI.idleFloatCheckbox.checked = next;
    UI.camBreathingCheckbox.checked = next;
    UI.particlesCheckbox.checked = next;
    UI.glowCheckbox.checked = next;

    AppState.animator.reinitParticles();
    _syncToggleEffectsBtn();
  });

  // Flotación idle — toggle
  UI.idleFloatCheckbox.addEventListener("change", () => {
    CONFIG.effects.idleFloat.enabled = UI.idleFloatCheckbox.checked;
    _syncToggleEffectsBtn();
  });

  // Flotación idle — amplitud (efecto inmediato)
  bindSlider(
    UI.idleFloatAmpSlider,
    UI.idleFloatAmpLabel,
    0,
    30,
    0,
    "px",
    (v) => {
      CONFIG.effects.idleFloat.amplitude = v;
    },
  );

  // Respiración de cámara — toggle
  UI.camBreathingCheckbox.addEventListener("change", () => {
    CONFIG.effects.cameraBreathing.enabled = UI.camBreathingCheckbox.checked;
    _syncToggleEffectsBtn();
  });

  // Respiración de cámara — amplitud de balanceo (efecto inmediato)
  bindSlider(
    UI.camBreathingSwaySlider,
    UI.camBreathingSwayLabel,
    0,
    50,
    0,
    "px",
    (v) => {
      CONFIG.effects.cameraBreathing.swayAmp = v;
    },
  );

  // Partículas — toggle (requiere reiniciar el array)
  UI.particlesCheckbox.addEventListener("change", () => {
    CONFIG.effects.particles.enabled = UI.particlesCheckbox.checked;
    AppState.animator.reinitParticles();
    _syncToggleEffectsBtn();
  });

  // Partículas — cantidad (requiere reiniciar el array para redimensionarlo)
  UI.particlesCountSlider.addEventListener("input", () => {
    const v = Math.round(
      clamp(parseFloat(UI.particlesCountSlider.value), 0, 500),
    );
    CONFIG.effects.particles.count = v;
    UI.particlesCountLabel.textContent = String(v);
    AppState.animator.reinitParticles();
  });

  // Halo (glow) — toggle
  UI.glowCheckbox.addEventListener("change", () => {
    CONFIG.effects.glow.enabled = UI.glowCheckbox.checked;
    _syncToggleEffectsBtn();
  });

  // Halo (glow) — intensidad (efecto inmediato)
  bindSlider(
    UI.glowIntensitySlider,
    UI.glowIntensityLabel,
    0,
    1,
    2,
    "",
    (v) => {
      CONFIG.effects.glow.intensity = v;
    },
  );
}

// ── Orquestador ───────────────────────────────────────────────────────────

function bindControls() {
  bindPlayControls();
  bindResetControl();
  bindExportControl();
  bindSettingsToggle();
  bindSpeedSlider();
  bindImgScaleSlider();
  bindRotationSlider();
  bindStaggerSlider();
  bindDurationSlider();
  bindEffectSelect();
  bindPatternSelect();
  bindBgColorInput();
  bindLoopCheckbox();
  bindFpsSelect();
  bindCaptureSelect();
  bindTransparentCheckbox();
  bindEffectsControls();
  bindPresetControls();
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
  UI.patternSelect.value = AppState.currentPattern;
  UI.transparentCheckbox.checked = CONFIG.export.transparentBg ?? false;
  UI.bgColorInput.disabled = CONFIG.export.transparentBg ?? false;
  UI.canvasArea.classList.toggle(
    "transparent-mode",
    CONFIG.export.transparentBg ?? false,
  );
  UI.ffmpegAlphaRow.style.display =
    (CONFIG.export.transparentBg ?? false) ? "" : "none";
  // Efectos
  UI.idleFloatCheckbox.checked = CONFIG.effects.idleFloat.enabled;
  UI.idleFloatAmpSlider.value = String(CONFIG.effects.idleFloat.amplitude);
  UI.idleFloatAmpLabel.textContent = `${CONFIG.effects.idleFloat.amplitude}px`;
  UI.camBreathingCheckbox.checked = CONFIG.effects.cameraBreathing.enabled;
  UI.camBreathingSwaySlider.value = String(
    CONFIG.effects.cameraBreathing.swayAmp,
  );
  UI.camBreathingSwayLabel.textContent = `${CONFIG.effects.cameraBreathing.swayAmp}px`;
  UI.particlesCheckbox.checked = CONFIG.effects.particles.enabled;
  UI.particlesCountSlider.value = String(CONFIG.effects.particles.count);
  UI.particlesCountLabel.textContent = String(CONFIG.effects.particles.count);
  UI.glowCheckbox.checked = CONFIG.effects.glow.enabled;
  UI.glowIntensitySlider.value = String(CONFIG.effects.glow.intensity);
  UI.glowIntensityLabel.textContent = CONFIG.effects.glow.intensity.toFixed(2);
  _syncToggleEffectsBtn();
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
    newPattern !== AppState.currentPattern
  ) {
    await switchPattern(newPattern);
  } else {
    AppState.animator.reset();
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
