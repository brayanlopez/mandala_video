/**
 * geometry.js — Matemática polar de la mandala
 *
 * RESPONSABILIDAD ÚNICA: calcular posiciones y metadatos de cada slot.
 * No sabe nada de renderizado, animación ni p5.js.
 * Al migrar a PixiJS o Three.js, este archivo NO cambia.
 *
 * Interfaz exportada:
 *   computeMandalaLayout(config) → MandalaSlot[]
 *   resolveImage(ring, index)    → string (ruta de imagen)
 */

import { PATTERN_REGISTRY } from "./geometry-patterns.js";

/**
 * Punto de entrada principal para calcular el layout de la mandala.
 * Enruta al algoritmo correcto según el nombre del patrón.
 *
 * @param {'circular'|'espiral'|'estrella'|'flor'|'cuadricula'} patternName
 * @param {object} config - CONFIG completo
 * @returns {MandalaSlot[]}
 */
export function computeLayout(patternName, config) {
  const entry = PATTERN_REGISTRY[patternName];
  if (!entry || !entry.fn) {
    return computeMandalaLayout(config); // circular o patrón desconocido → anillos por defecto
  }
  return entry.fn(config);
}

/**
 * @typedef {Object} MandalaSlot
 * @property {number} x             - Posición X en el canvas (px)
 * @property {number} y             - Posición Y en el canvas (px)
 * @property {number} angleDeg      - Ángulo base en grados (para orientación de imagen)
 * @property {number} ring          - Índice del anillo (0 = centro)
 * @property {number} slotIndex     - Posición dentro del anillo
 * @property {number} imgSize       - Tamaño de imagen en px
 * @property {string} imageSrc      - Ruta resuelta de la imagen
 * @property {number} entranceOrder - Orden global de entrada (para stagger)
 */

/**
 * Calcula el layout completo de la mandala a partir de la config.
 * El resultado es un array plano de slots, ordenados por orden de entrada.
 *
 * @param {import('../config.js').CONFIG} config
 * @returns {MandalaSlot[]}
 */
export function computeMandalaLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const slots = [];

  config.mandala.rings.forEach((ring, ringIndex) => {
    const count = ring.count;

    for (let i = 0; i < count; i++) {
      // Ángulo: empezamos desde arriba (−90°) y distribuimos uniformemente
      const angleDeg = count === 1 ? 0 : (360 / count) * i - 90;

      const angleRad = angleDeg * (Math.PI / 180);

      slots.push({
        x: cx + ring.radius * Math.cos(angleRad),
        y: cy + ring.radius * Math.sin(angleRad),
        angleDeg,
        ring: ringIndex,
        slotIndex: i,
        imgSize: ring.imgSize,
        imageSrc: resolveImage(ring, i),
        entranceOrder: slots.length, // orden global de entrada
      });
    }
  });

  return slots;
}

/**
 * Resuelve qué imagen corresponde a un slot dado.
 * Si hay menos imágenes que slots, las repite en ciclo.
 * Sanitiza el path para prevenir path traversal (CWE-22).
 *
 * @param {object} ring   - Objeto de anillo del config
 * @param {number} index  - Índice del slot en el anillo
 * @returns {string}
 */
export function resolveImage(ring, index) {
  const images = ring.images;
  if (!images || images.length === 0) return "";

  const raw = images[index % images.length];

  // Sanitización: solo permitir paths relativos seguros.
  // Se eliminan segmentos '..' y caracteres fuera del conjunto permitido.
  return sanitizePath(raw);
}

/**
 * Sanitiza una ruta de archivo para prevenir path traversal (CWE-22).
 * Solo permite: letras, números, /, _, -, . y espacios.
 * Elimina cualquier segmento '..' o '.'.
 *
 * @param {string} path
 * @returns {string}
 */
export function sanitizePath(path) {
  if (typeof path !== "string") return "";

  const segments = path
    .replace(/\\/g, "/") // normalizar separadores
    .split("/")
    .filter(
      (seg) =>
        seg !== "" &&
        seg !== "." &&
        seg !== ".." && // bloquear traversal
        /^[\w\s.\-]+$/.test(seg), // solo caracteres seguros por segmento
    );

  return segments.join("/");
}
