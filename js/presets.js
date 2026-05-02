/**
 * presets.js — Guardado y carga de presets de configuración (F-06)
 *
 * Módulo puro: no importa nada de la app, no manipula el DOM.
 * Toda la lógica de aplicar presets al animator/renderer vive en main.js.
 *
 * Funciones exportadas:
 *   capturePreset(config, pattern)  → objeto preset listo para guardar
 *   savePreset(name, data)          → guarda en localStorage
 *   loadPreset(name)                → carga desde localStorage (null si no existe)
 *   listPresets()                   → { [name]: data } de todos los guardados
 *   deletePreset(name)              → elimina de localStorage
 *   presetToJSON(data)              → serializa a string JSON (para descarga)
 *   presetFromJSON(json)            → parsea y valida; lanza Error si inválido
 */

export const PRESET_VERSION = 1;
export const STORAGE_KEY = "mandala:presets";

// ─── Captura ──────────────────────────────────────────────────────────────────

/**
 * Captura el estado actual de CONFIG y del patrón activo como objeto preset.
 * Solo incluye los campos controlables desde la UI.
 * No guarda mandala.rings (las rutas de imágenes son locales al servidor).
 *
 * @param {object} config   — referencia al CONFIG global
 * @param {string} pattern  — valor de currentPattern
 * @returns {object}
 */
export function capturePreset(config, pattern) {
  return {
    version: PRESET_VERSION,
    pattern,
    canvas: {
      bgColor: config.canvas.bgColor,
      fps: config.canvas.fps,
      imgScale: config.canvas.imgScale ?? 1,
    },
    animation: {
      speed: config.animation.speed,
      staggerDelay: config.animation.staggerDelay,
      entryDuration: config.animation.entryDuration,
      entryEffect: config.animation.entryEffect,
      rotationSpeed: config.animation.rotationSpeed,
      loopAnimation: config.animation.loopAnimation,
    },
    export: {
      captureMode: config.export.captureMode,
    },
  };
}

// ─── LocalStorage ─────────────────────────────────────────────────────────────

/**
 * Devuelve el mapa completo de presets guardados.
 * @returns {Record<string, object>}
 */
export function listPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Guarda (o sobreescribe) un preset con el nombre dado.
 * @param {string} name — máx. 60 caracteres, no vacío
 * @param {object} data — resultado de capturePreset()
 */
export function savePreset(name, data) {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("Nombre de preset inválido");
  }
  const presets = listPresets();
  presets[name.trim()] = { ...data, savedAt: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      throw new Error(
        "Almacenamiento lleno — eliminá presets antiguos para liberar espacio",
      );
    }
    throw e;
  }
}

/**
 * Devuelve el preset guardado con ese nombre, o null.
 * @param {string} name
 * @returns {object|null}
 */
export function loadPreset(name) {
  return listPresets()[name] ?? null;
}

/**
 * Elimina el preset con ese nombre.
 * @param {string} name
 */
export function deletePreset(name) {
  const presets = listPresets();
  delete presets[name];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch (e) {
    if (e.name === "QuotaExceededError") {
      throw new Error("Almacenamiento lleno — no se pudo guardar el cambio");
    }
    throw e;
  }
}

// ─── Serialización JSON ───────────────────────────────────────────────────────

/**
 * Serializa un preset a un string JSON con indentación (listo para descargar).
 * @param {object} data
 * @returns {string}
 */
export function presetToJSON(data) {
  return JSON.stringify(data, null, 2);
}

/**
 * Parsea y valida un string JSON externo como preset.
 * Lanza Error descriptivo si el formato es inválido o la versión es incompatible.
 *
 * Solo acepta datos de estructura conocida — nunca ejecuta el contenido (CWE-95).
 *
 * @param {string} json
 * @returns {object}
 */
export function presetFromJSON(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("JSON inválido");
  }
  if (typeof data !== "object" || data === null) {
    throw new Error("Formato de preset inválido");
  }
  if (data.version !== PRESET_VERSION) {
    throw new Error(
      `Versión de preset incompatible (esperada: ${PRESET_VERSION})`,
    );
  }
  if (typeof data.animation !== "object" || data.animation === null) {
    throw new Error('Campo requerido "animation" ausente o inválido');
  }
  if (typeof data.canvas !== "object" || data.canvas === null) {
    throw new Error('Campo requerido "canvas" ausente o inválido');
  }
  return data;
}
