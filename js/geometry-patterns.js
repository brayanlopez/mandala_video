/**
 * geometry-patterns.js — Algoritmos de layout para cada tipo de mandala
 *
 * Cada función recibe (config) y devuelve MandalaSlot[].
 * Ninguna función sabe de renderizado — solo producen coordenadas (x, y).
 *
 * Para agregar un nuevo patrón (solo este archivo):
 *   1. Escribir computeXxxLayout(config) → MandalaSlot[]
 *   2. Agregar la entrada en PATTERN_REGISTRY al final del archivo
 *      (label, category, fn)
 *
 * Patrones disponibles — Clásicos:
 *   circular    → Anillos concéntricos (delegado a geometry.js)
 *   espiral     → Espiral áurea (ángulo dorado de Fibonacci)
 *   estrella    → Hexágonos entrelazados / Estrella de David anidada
 *   flor        → Flor de la vida (cuadrícula hexagonal)
 *   cuadricula  → Cuadrícula sagrada (cuadrados rotados anidados)
 *
 * Patrones disponibles — Geométricos:
 *   pentagono   → Geometría sagrada 5-fold (pentágonos + estrella)
 *   triskelion  → Tres brazos de espiral archimediana (3-fold)
 *   diamante    → Cuadrícula ortogonal acotada por distancia Manhattan
 *
 * Patrones disponibles — Curvas:
 *   lissajous   → Curva paramétrica x=sin(3t+δ), y=sin(2t) — sin simetría radial
 *   rosa        → Curva polar r=cos(5θ): 5 pétalos, entrada pétalo a pétalo
 *
 * Patrones disponibles — Fractales:
 *   koch        → Copo de nieve de Koch iter-2 (48 vértices), traza el perímetro
 */

import { sanitizePath } from "./geometry.js";

const DEG = Math.PI / 180;

// ─── Factores de escala por patrón ────────────────────────────────────────────
//
// Todos se multiplican por minDim (Math.min(width, height)) para mantener
// las proporciones al cambiar la resolución del canvas.

/** Distancia entre centros de hexágonos en computeFlorLayout */
const HEX_SPACING_FACTOR = 0.152;
/** Distancia entre celdas en computeDiamanteLayout */
const DIAMOND_SPACING_FACTOR = 0.115;
/** Circunradio del triángulo exterior (Koch, Triangular, Sierpinski) */
const TRIANGLE_CIRCUM_FACTOR = 0.42;
/** Radio externo para patrones espiral/cuadrícula/arquímedes (44 % de minDim) */
const OUTER_RADIUS_FACTOR = 0.44;
/** Radio o amplitud para curvas paramétricas — Lissajous y Rosa polar (38 % de minDim) */
const CURVE_RADIUS_FACTOR = 0.38;

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
function ring(cx, cy, count, radius, startDeg, imgSize, ringIdx, orderOffset = 0) {
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
  const MAX_RADIUS = minDim * OUTER_RADIUS_FACTOR; // radio máximo
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
    ring(cx, cy, count, r, startDeg, imgSize, ringIdx, offset).forEach((s) => slots.push(s));
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
  const spacing = minDim * HEX_SPACING_FACTOR;

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

  // Pre-computar ángulos antes del sort para evitar Math.atan2 O(n log n) en el comparador
  cells.forEach((c) => {
    c.angle = Math.atan2(c.r, c.q);
  });

  // Ordenar: primero por capa (entrada del centro hacia afuera),
  // luego por ángulo pre-computado dentro de la capa para entrada en espiral
  cells.sort((a, b) => (a.layer !== b.layer ? a.layer - b.layer : a.angle - b.angle));

  const slots = cells.map((cell, i) => {
    // Conversión axial → pixel (hex puntiagudo hacia arriba)
    const px = cx + spacing * (Math.sqrt(3) * cell.q + (Math.sqrt(3) / 2) * cell.r);
    const py = cy + spacing * ((3 / 2) * cell.r);
    const angleDeg = Math.atan2(cell.r, cell.q) / DEG;
    const imgSize = SIZE_BY_LAYER[Math.min(cell.layer, SIZE_BY_LAYER.length - 1)];

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
    ring(cx, cy, count, r, startDeg, imgSize, ringIdx, offset).forEach((s) => slots.push(s));
  });

  return assignImages(slots, pool);
}

// ─── 5. PENTAGONAL ───────────────────────────────────────────────────────────
//
// Geometría sagrada de 5 lados: pentágonos y estrella de 5 puntas anidados.
// Cada par de grupos al mismo radio (desplazados 36°) forma un decágono
// que produce el efecto de estrella pentagonal entrelazada.
// Simetría 5-fold, completamente distinta a los patrones hexagonales (6-fold)
// y octagonales (8-fold) existentes.

export function computePentagonoLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  // [count, radius_factor, startDeg, imgSize]
  // Offset de 36° entre grupos pares/impares crea la estrella de 5 puntas.
  const groups = [
    [1, 0, 0, 130], // centro
    [5, 0.145, 0, 108], // pentágono interior
    [5, 0.145, 36, 108], // estrella interior (rotada 36°)
    [10, 0.255, 18, 88], // decágono combinado (10 puntos alternados)
    [5, 0.355, 0, 76], // pentágono medio
    [5, 0.355, 36, 74], // estrella media
    [10, 0.425, 18, 64], // decágono exterior
    [5, 0.485, 0, 58], // corona exterior
  ];

  const slots = [];
  groups.forEach(([count, rFactor, startDeg, imgSize], ringIdx) => {
    const r = minDim * rFactor;
    const offset = slots.length;
    ring(cx, cy, count, r, startDeg, imgSize, ringIdx, offset).forEach((s) => slots.push(s));
  });

  return assignImages(slots, pool);
}

// ─── 6. TRISKELION ───────────────────────────────────────────────────────────
//
// Tres brazos de espiral archimediana, desfasados 120° entre sí.
// El orden de entrada es intercalado: los 3 brazos crecen simultáneamente
// durante la animación, creando el efecto visual del símbolo triskelion.
// Simetría 3-fold — la única con esa simetría en el conjunto.

export function computeTriskelionLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  const ARMS = 3;
  const PER_ARM = 18;
  const MIN_R = minDim * 0.06; // radio mínimo (evita apilar en el centro)
  const MAX_R = minDim * OUTER_RADIUS_FACTOR;
  const TURNS = 0.75; // fracción de vuelta por brazo (270°)

  const slots = [];

  // Bucle externo por posición para que el entranceOrder sea intercalado:
  // los 3 brazos aparecen en paralelo durante la animación.
  for (let i = 0; i < PER_ARM; i++) {
    const t = i / (PER_ARM - 1); // 0..1
    for (let arm = 0; arm < ARMS; arm++) {
      const offsetRad = (arm * 2 * Math.PI) / ARMS; // 0°, 120°, 240°
      const angle = offsetRad + t * TURNS * 2 * Math.PI;
      const radius = MIN_R + (MAX_R - MIN_R) * t;
      const size = Math.round(110 - 55 * t);
      slots.push(
        makeSlot(
          cx + Math.cos(angle) * radius,
          cy + Math.sin(angle) * radius,
          (((angle / DEG) % 360) + 360) % 360,
          arm,
          i,
          size,
          i * ARMS + arm, // entranceOrder intercalado
        ),
      );
    }
  }

  return assignImages(slots, pool);
}

// ─── 7. DIAMANTE ─────────────────────────────────────────────────────────────
//
// Cuadrícula ortogonal acotada por distancia Manhattan: |q| + |r| ≤ MAX_LAYER.
// El área resultante tiene forma de diamante/rombo con simetría 4-fold.
// A diferencia de cuadricula (cuadrados rotados anidados) o flor (hex),
// este patrón es una grilla rectangular pura con forma exterior de diamante.
//
// Capas: 0(1) → 1(4) → 2(8) → 3(12) → 4(16) = 41 slots totales

export function computeDiamanteLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);
  const spacing = minDim * DIAMOND_SPACING_FACTOR;

  const MAX_LAYER = 4;
  const SIZE_BY_LAYER = [120, 96, 78, 64, 52];

  const cells = [];
  for (let q = -MAX_LAYER; q <= MAX_LAYER; q++) {
    for (let r = -MAX_LAYER; r <= MAX_LAYER; r++) {
      const layer = Math.abs(q) + Math.abs(r); // distancia Manhattan
      if (layer <= MAX_LAYER) {
        cells.push({ q, r, layer, angle: Math.atan2(r, q) });
      }
    }
  }

  cells.sort((a, b) => (a.layer !== b.layer ? a.layer - b.layer : a.angle - b.angle));

  const slots = cells.map((cell, i) => {
    const px = cx + spacing * cell.q;
    const py = cy + spacing * cell.r;
    const angleDeg = (cell.angle / DEG + 360) % 360;
    const imgSize = SIZE_BY_LAYER[Math.min(cell.layer, SIZE_BY_LAYER.length - 1)];
    return makeSlot(px, py, angleDeg, cell.layer, i, imgSize, i);
  });

  return assignImages(slots, pool);
}

// ─── 8. LISSAJOUS ────────────────────────────────────────────────────────────
//
// Curva paramétrica de Lissajous: x(t) = A·sin(a·t + δ), y(t) = B·sin(b·t)
// Con a=3, b=2 se obtiene una figura cerrada de tipo "mariposa".
// Es el único patrón sin simetría radial: las imágenes siguen la curva,
// no parten del centro. La animación traza la curva de punta a punta.

export function computeLissajousLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  const A = minDim * CURVE_RADIUS_FACTOR; // amplitud en X
  const B = minDim * CURVE_RADIUS_FACTOR; // amplitud en Y
  const a = 3; // frecuencia X
  const b = 2; // frecuencia Y  →  relación 3:2 = figura mariposa
  const DELTA = Math.PI / 4; // desfase de fase (evita auto-intersección en t=0)
  const N = 48;

  const slots = [];
  for (let i = 0; i < N; i++) {
    const t = (i / N) * 2 * Math.PI;
    const x = cx + A * Math.sin(a * t + DELTA);
    const y = cy + B * Math.sin(b * t);
    const angle = ((a * t + DELTA) / DEG + 360) % 360;
    slots.push(makeSlot(x, y, angle, 0, i, 65, i));
  }

  return assignImages(slots, pool);
}

// ─── 9. ROSA ─────────────────────────────────────────────────────────────────
//
// Curva polar r = cos(k·θ), k=5 → 5 pétalos equidistantes a 72°.
// Imágenes muestreadas directamente a lo largo de cada pétalo, con tamaño
// máximo en la punta (r = MAX_R) y mínimo en la base (r → 0).
// Entrada animada pétalo a pétalo: el primer pétalo florece completo,
// luego el segundo, etc.

export function computeRosaLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  const K = 5; // pétalos (k impar → k pétalos)
  const PER_PETAL = 9; // imágenes por pétalo
  const MAX_R = minDim * 0.43;
  const HALF_W = Math.PI / (2 * K); // semi-ancho angular del pétalo

  const slots = [];
  for (let p = 0; p < K; p++) {
    const thetaTip = (2 * Math.PI * p) / K; // ángulo de la punta del pétalo
    for (let j = 0; j < PER_PETAL; j++) {
      const frac = (j + 0.5) / PER_PETAL; // 0..1 a lo largo del pétalo
      const offset = (frac - 0.5) * 2 * HALF_W; // -HALF_W .. +HALF_W
      const theta = thetaTip + offset;
      // r = MAX_R·cos(K·offset): máximo en la punta (offset=0), 0 en la base (|offset|=HALF_W)
      const r = MAX_R * Math.cos(K * offset);
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);
      // Tamaño mayor en la punta (cos→1) y menor en la base (cos→0)
      const size = Math.round(65 + 35 * Math.cos(K * offset));
      slots.push(makeSlot(x, y, (theta / DEG + 360) % 360, p, j, size, p * PER_PETAL + j));
    }
  }

  return assignImages(slots, pool);
}

// ─── 10. KOCH ─────────────────────────────────────────────────────────────────
//
// Copo de nieve de Koch, 2 iteraciones → 3·4² = 48 vértices.
// Algoritmo: se parte de un triángulo equilátero CCW; cada segmento se
// sustituye por 4 subsegmentos con un triángulo apuntando hacia afuera
// (rotando el tercio medio -60° respecto al sentido de recorrido).
//
// Es el ÚNICO patrón cuyas imágenes recorren el BORDE EXTERIOR desde el
// primer slot: la animación dibuja progresivamente el perímetro fractal.
// Sin imagen central — todas las imágenes están en la corona exterior.

export function computeKochLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  const R = minDim * CURVE_RADIUS_FACTOR; // radio exterior de la curva
  const ITERATIONS = 2; // 3 × 4² = 48 vértices
  const COS60 = 0.5;
  const SIN60 = Math.sqrt(3) / 2;

  // Triángulo equilátero inicial en sentido antihorario (CCW), vértice superior en -90°
  let pts = [0, 1, 2].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 3;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const next = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const dx = (q.x - p.x) / 3;
      const dy = (q.y - p.y) / 3;
      const A = { x: p.x + dx, y: p.y + dy };
      const B = { x: p.x + 2 * dx, y: p.y + 2 * dy };
      // Rotar (dx, dy) -60° (sentido horario) → vértice del triángulo exterior
      const C = {
        x: A.x + dx * COS60 + dy * SIN60,
        y: A.y - dx * SIN60 + dy * COS60,
      };
      next.push(p, A, C, B);
    }
    pts = next;
  }

  // Cada vértice del perímetro = un slot; orden secuencial recorre el copo
  const slots = pts.map((pt, i) => {
    const dist = Math.hypot(pt.x - cx, pt.y - cy);
    const angleDeg = (Math.atan2(pt.y - cy, pt.x - cx) / DEG + 360) % 360;
    // Vértices exteriores (puntas) → imagen más grande; interiores → más pequeña
    const size = Math.max(38, Math.min(68, Math.round(38 + 32 * (dist / R))));
    return makeSlot(pt.x, pt.y, angleDeg, 0, i, size, i);
  });

  return assignImages(slots, pool);
}

// ─── 11. TRIANGULAR ───────────────────────────────────────────────────────────
//
// Cuadrícula baricéntrica dentro de un triángulo equilátero.
// Cada slot es una combinación convexa de los tres vértices del triángulo:
//   p(i,j) = (k·V₀ + i·V₁ + j·V₂) / N   donde k = N − i − j
//
// La malla cubre toda la región triangular de forma uniforme.
// Simetría 3-fold y borde triangular, genuinamente distinto de:
//   • Flor (celdas hexagonales, borde hexagonal, 6-fold)
//   • Diamante (distancia Manhattan, borde rombo, 4-fold)
//   • Triskelion (brazos espirales, 3-fold pero sin malla)
//
// Slots: (N+1)(N+2)/2 = (7+1)(7+2)/2 = 36 para N=7

export function computeTriangularLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  const N = 7; // subdivisiones → 36 puntos de malla
  const R = minDim * TRIANGLE_CIRCUM_FACTOR; // circunradio del triángulo exterior

  // Vértices del triángulo equilátero (CCW, vértice superior en -90°)
  const V = [0, 1, 2].map((k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });

  // Generar todos los puntos de la malla baricéntrica
  const pts = [];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N - i; j++) {
      const k = N - i - j;
      const px = (k * V[0].x + i * V[1].x + j * V[2].x) / N;
      const py = (k * V[0].y + i * V[1].y + j * V[2].y) / N;
      const dist = Math.hypot(px - cx, py - cy);
      pts.push({
        px,
        py,
        dist,
        angleDeg: (Math.atan2(py - cy, px - cx) / DEG + 360) % 360,
      });
    }
  }

  // Ordenar: del centro hacia el borde (imágenes más grandes al centro)
  pts.sort((a, b) => a.dist - b.dist || a.angleDeg - b.angleDeg);

  const slots = pts.map((p, i) => {
    const size = Math.max(40, Math.round(105 - 60 * (p.dist / R)));
    return makeSlot(p.px, p.py, p.angleDeg, 0, i, size, i);
  });

  return assignImages(slots, pool);
}

// ─── 12. ARQUÍMEDES ───────────────────────────────────────────────────────────
//
// Espiral de Arquímedes pura: r = MAX_R · (θ / θ_max)
// El espaciado entre brazos es CONSTANTE (a diferencia de la espiral áurea
// de Fibonacci, cuyo espaciado crece, o del Triskelion, que usa 3 brazos cortos).
// Con TURNS=4 vueltas y 55 slots se obtiene una espiral densa que cubre
// el canvas de forma uniforme en una sola trayectoria continua.

export function computeArquimedesLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  const N = 55; // slots totales
  const TURNS = 4; // vueltas completas
  const MAX_R = minDim * OUTER_RADIUS_FACTOR;
  const MIN_R = minDim * 0.03; // desplazamiento mínimo para evitar apilar en (0,0)

  const slots = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1); // 0..1
    const angle = t * TURNS * 2 * Math.PI;
    const r = MIN_R + (MAX_R - MIN_R) * t; // r proporcional al ángulo
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    const size = Math.round(110 - 62 * t); // decrece del centro al borde
    slots.push(makeSlot(x, y, (((angle / DEG) % 360) + 360) % 360, 0, i, size, i));
  }

  return assignImages(slots, pool);
}

// ─── 13. SIERPINSKI ───────────────────────────────────────────────────────────
//
// Triángulo de Sierpinski, profundidad 3 → 3³ = 27 sub-triángulos.
// Algoritmo recursivo: dividir el triángulo en 4 sub-triángulos y descartar
// el central (el "agujero"). Las imágenes se colocan en los centroides de los
// 27 sub-triángulos supervivientes a profundidad 3.
//
// El orden de entrada sigue la subdivisión recursiva:
//   primero esquina V₀ (arriba), luego V₁ (inferior-derecha), luego V₂ (inferior-izquierda).
// Esto produce una animación que "llena" el fractal esquina a esquina.

export function computeSierpinskiLayout(config) {
  const cx = config.canvas.width / 2;
  const cy = config.canvas.height / 2;
  const pool = buildImagePool(config);
  const minDim = Math.min(config.canvas.width, config.canvas.height);

  const R = minDim * TRIANGLE_CIRCUM_FACTOR; // circunradio del triángulo inicial
  const DEPTH = 3; // 3^3 = 27 sub-triángulos

  // Triángulo inicial CCW, vértice superior en -90°
  const root = [0, 1, 2].map((k) => {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });

  const leaves = [];

  function subdivide(A, B, C, depth) {
    if (depth === 0) {
      // Centroide del sub-triángulo superviviente
      leaves.push({
        x: (A.x + B.x + C.x) / 3,
        y: (A.y + B.y + C.y) / 3,
        // Tamaño proporcional al lado del sub-triángulo en este nivel
        side: Math.hypot(B.x - A.x, B.y - A.y),
      });
      return;
    }
    const AB = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const BC = { x: (B.x + C.x) / 2, y: (B.y + C.y) / 2 };
    const CA = { x: (C.x + A.x) / 2, y: (C.y + A.y) / 2 };
    // Los 3 sub-triángulos que SOBREVIVEN (el central se descarta)
    subdivide(A, AB, CA, depth - 1); // esquina A
    subdivide(AB, B, BC, depth - 1); // esquina B
    subdivide(CA, BC, C, depth - 1); // esquina C
  }

  subdivide(root[0], root[1], root[2], DEPTH);

  const slots = leaves.map((pt, i) => {
    const angleDeg = (Math.atan2(pt.y - cy, pt.x - cx) / DEG + 360) % 360;
    // Lado del sub-triángulo en depth=3 = R·√3 / 2^3; imágenes caben dentro
    const size = Math.max(36, Math.min(70, Math.round(pt.side * 0.7)));
    return makeSlot(pt.x, pt.y, angleDeg, 0, i, size, i);
  });

  return assignImages(slots, pool);
}

// ─── Registry de patrones ─────────────────────────────────────────────────────
//
// ÚNICA FUENTE DE VERDAD para los patrones disponibles.
// Cada entrada tiene:
//   label    → texto legible para la UI
//   category → agrupa las opciones del <select> con <optgroup>
//   fn       → función de layout, o null para circular (fallback a computeMandalaLayout)
//
// Para agregar un nuevo patrón (solo este archivo):
//   1. Escribir computeXxxLayout(config) → MandalaSlot[]
//   2. Agregar la entrada aquí con label, category y fn

export const PATTERN_REGISTRY = {
  // ── Clásicos ────────────────────────────────────────────────────────────
  circular: { label: "Circular", category: "Clásicos", fn: null },
  espiral: {
    label: "Espiral áurea",
    category: "Clásicos",
    fn: computeEspiralLayout,
  },
  estrella: {
    label: "Estrella entrelazada",
    category: "Clásicos",
    fn: computeEstrellaLayout,
  },
  flor: {
    label: "Flor de la vida",
    category: "Clásicos",
    fn: computeFlorLayout,
  },
  cuadricula: {
    label: "Cuadrícula sagrada",
    category: "Clásicos",
    fn: computeCuadriculaLayout,
  },
  // ── Geométricos ──────────────────────────────────────────────────────────
  pentagono: {
    label: "Pentagonal",
    category: "Geométricos",
    fn: computePentagonoLayout,
  },
  triskelion: {
    label: "Triskelion",
    category: "Geométricos",
    fn: computeTriskelionLayout,
  },
  diamante: {
    label: "Diamante",
    category: "Geométricos",
    fn: computeDiamanteLayout,
  },
  triangular: {
    label: "Triangular",
    category: "Geométricos",
    fn: computeTriangularLayout,
  },
  // ── Curvas ───────────────────────────────────────────────────────────────
  lissajous: {
    label: "Lissajous 3:2",
    category: "Curvas",
    fn: computeLissajousLayout,
  },
  rosa: {
    label: "Rosa (5 pétalos)",
    category: "Curvas",
    fn: computeRosaLayout,
  },
  arquimedes: {
    label: "Arquímedes",
    category: "Curvas",
    fn: computeArquimedesLayout,
  },
  // ── Fractales ────────────────────────────────────────────────────────────
  koch: {
    label: "Koch (fractal)",
    category: "Fractales",
    fn: computeKochLayout,
  },
  sierpinski: {
    label: "Sierpinski (fractal)",
    category: "Fractales",
    fn: computeSierpinskiLayout,
  },
};
