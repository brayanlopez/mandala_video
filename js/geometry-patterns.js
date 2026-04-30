/**
 * geometry-patterns.js — Algoritmos de layout para cada tipo de mandala
 *
 * Cada función recibe (config) y devuelve MandalaSlot[].
 * Ninguna función sabe de renderizado — solo producen coordenadas (x, y).
 *
 * Para agregar un nuevo patrón:
 *   1. Escribir la función computeXxxLayout(config) → MandalaSlot[]
 *   2. Agregarla al objeto PATTERN_REGISTRY al final del archivo
 *   3. Agregar la <option> correspondiente en index.html
 *
 * Patrones disponibles:
 *   circular    → Anillos concéntricos (delegado a geometry.js)
 *   espiral     → Espiral áurea (ángulo dorado de Fibonacci)
 *   estrella    → Hexágonos entrelazados / Estrella de David anidada
 *   flor        → Flor de la vida (cuadrícula hexagonal)
 *   cuadricula  → Cuadrícula sagrada (cuadrados rotados anidados)
 */

import { sanitizePath } from "./geometry.js";

const DEG = Math.PI / 180;

// ─── Helpers comunes ──────────────────────────────────────────────────────────

/**
 * Reúne todas las imágenes configuradas en un pool plano.
 * Cuando hay más slots que imágenes, se repiten en ciclo.
 */
function buildImagePool(config) {
  return config.mandala.rings.flatMap((ring) => ring.images);
}

/**
 * Asigna imágenes del pool a los slots ciclicamente.
 * Siempre sanitiza el path (CWE-22).
 */
function assignImages(slots, pool) {
  if (pool.length === 0) return slots;
  return slots.map((s, i) => ({
    ...s,
    imageSrc: sanitizePath(pool[i % pool.length]),
  }));
}

/**
 * Crea un slot base (sin imageSrc).
 */
function makeSlot(x, y, angleDeg, ring, slotIndex, imgSize, order) {
  return {
    x,
    y,
    angleDeg,
    ring,
    slotIndex,
    imgSize,
    imageSrc: "",
    entranceOrder: order,
  };
}

/**
 * Genera `count` posiciones en un anillo, con offset de rotación opcional.
 */
function ring(
  cx,
  cy,
  count,
  radius,
  startDeg,
  imgSize,
  ringIdx,
  orderOffset = 0,
) {
  const slots = [];
  for (let i = 0; i < count; i++) {
    const angleDeg = count === 1 ? 0 : (360 / count) * i + startDeg;
    const rad = (angleDeg - 90) * DEG; // -90 para empezar desde arriba
    slots.push(
      makeSlot(
        cx + radius * Math.cos(rad),
        cy + radius * Math.sin(rad),
        angleDeg,
        ringIdx,
        i,
        imgSize,
        orderOffset + i,
      ),
    );
  }
  return slots;
}

// ─── 1. ESPIRAL ÁUREA ────────────────────────────────────────────────────────
//
// Coloca imágenes siguiendo el ángulo dorado (137.508°), el mismo patrón
// que usan los girasoles y piñas para empacar semillas eficientemente.
// Resultado: espiral orgánica tipo flor de girasol.

export function computeEspiralLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  const N = 55; // Número de Fibonacci
  const GOLDEN_ANGLE = 137.508 * DEG; // ángulo dorado
  const MAX_RADIUS = minDim * 0.44; // radio máximo
  const SIZE_MAX = 120; // tamaño en el centro
  const SIZE_MIN = 48; // tamaño en el borde

  const slots = [];

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const angle = i * GOLDEN_ANGLE;
    const radius = MAX_RADIUS * Math.sqrt(t); // sqrt → distribución uniforme de área
    const size = SIZE_MAX - (SIZE_MAX - SIZE_MIN) * t;

    slots.push(
      makeSlot(
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
        (angle / DEG) % 360,
        0,
        i,
        size,
        i,
      ),
    );
  }

  return assignImages(slots, pool);
}

// ─── 2. ESTRELLA ENTRELAZADA ──────────────────────────────────────────────────
//
// Hexágonos rotados y anidados que crean el efecto de estrellas de David
// entrelazadas. Cada par de anillos forma una estrella de 6 puntas.
// La clave es que los anillos del mismo radio tienen rotaciones de +30°.

export function computeEstrellaLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  // [count, radius_factor, startDeg, imgSize]
  const groups = [
    [1, 0, 0, 130], // centro
    [6, 0.155, 0, 102], // hexágono interior
    [6, 0.155, 30, 102], // hexágono rotado → Estrella de David interna
    [12, 0.285, 15, 82], // dodecágono medio
    [12, 0.285, 30, 82], // dodecágono rotado (entrelazado con el anterior)
    [6, 0.415, 0, 70], // hexágono exterior (puntas de estrella)
    [6, 0.415, 30, 70], // hexágono exterior rotado
    [12, 0.47, 15, 60], // corona exterior
  ];

  const slots = [];
  groups.forEach(([count, rFactor, startDeg, imgSize], ringIdx) => {
    const r = minDim * rFactor;
    const offset = slots.length;
    ring(cx, cy, count, r, startDeg, imgSize, ringIdx, offset).forEach((s) =>
      slots.push(s),
    );
  });

  return assignImages(slots, pool);
}

// ─── 3. FLOR DE LA VIDA ───────────────────────────────────────────────────────
//
// Geometría sagrada: cuadrícula hexagonal que genera el patrón de la
// "Flor de la Vida". Cada celda hexagonal es un slot.
// Se usan coordenadas axiales (q, r) para generar la cuadrícula.
//
// Capas: 0 (centro) → 1 (6) → 2 (12) → 3 (18) = 37 slots totales

export function computeFlorLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);
  const spacing = minDim * 0.152; // distancia entre centros de hexágonos

  const MAX_LAYER = 3;
  const SIZE_BY_LAYER = [128, 100, 80, 65];

  // Generar todas las celdas en coordenadas axiales hasta MAX_LAYER
  const cells = [];
  for (let q = -MAX_LAYER; q <= MAX_LAYER; q++) {
    for (let r = -MAX_LAYER; r <= MAX_LAYER; r++) {
      const s = -q - r;
      const layer = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
      if (layer <= MAX_LAYER) {
        cells.push({ q, r, layer });
      }
    }
  }

  // Ordenar: primero por capa (entrada del centro hacia afuera),
  // luego por ángulo dentro de la capa para entrada en espiral
  cells.sort((a, b) =>
    a.layer !== b.layer
      ? a.layer - b.layer
      : Math.atan2(a.r, a.q) - Math.atan2(b.r, b.q),
  );

  const slots = cells.map((cell, i) => {
    // Conversión axial → pixel (hex puntiagudo hacia arriba)
    const px =
      cx + spacing * (Math.sqrt(3) * cell.q + (Math.sqrt(3) / 2) * cell.r);
    const py = cy + spacing * ((3 / 2) * cell.r);
    const angleDeg = Math.atan2(cell.r, cell.q) / DEG;
    const imgSize =
      SIZE_BY_LAYER[Math.min(cell.layer, SIZE_BY_LAYER.length - 1)];

    return makeSlot(px, py, angleDeg, cell.layer, i, imgSize, i);
  });

  return assignImages(slots, pool);
}

// ─── 4. CUADRÍCULA SAGRADA ───────────────────────────────────────────────────
//
// Cuadrados anidados, cada uno rotado 22.5° respecto al anterior.
// La superposición de cuadrados rotados crea el patrón de estrella de 8 puntas
// característico de la geometría sagrada islámica y budista.

export function computeCuadriculaLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  // [count, radius_factor, startDeg, imgSize]
  // Los cuadrados de mismo radio pero rotados 45° crean una estrella de 8 puntas.
  const groups = [
    [1, 0, 0, 130], // centro
    [4, 0.145, 45, 104], // cuadrado 1 (rotado 45° → diamante)
    [4, 0.205, 0, 100], // cuadrado 1 rotado (crea 8 puntos con el de arriba)
    [8, 0.285, 22.5, 84], // octágono interior
    [4, 0.365, 45, 76], // cuadrado 2
    [4, 0.365, 0, 74], // cuadrado 2 rotado
    [8, 0.43, 22.5, 66], // octágono exterior
    [8, 0.48, 67.5, 60], // corona exterior rotada
    [4, 0.485, 0, 58], // cuatro esquinas exteriores
  ];

  const slots = [];
  groups.forEach(([count, rFactor, startDeg, imgSize], ringIdx) => {
    const r = minDim * rFactor;
    const offset = slots.length;
    ring(cx, cy, count, r, startDeg, imgSize, ringIdx, offset).forEach((s) =>
      slots.push(s),
    );
  });

  return assignImages(slots, pool);
}

// ─── Registry de patrones ─────────────────────────────────────────────────────

export const PATTERN_REGISTRY = {
  espiral: computeEspiralLayout,
  estrella: computeEstrellaLayout,
  flor: computeFlorLayout,
  cuadricula: computeCuadriculaLayout,
};
