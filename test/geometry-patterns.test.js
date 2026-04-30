import { describe, test, expect } from "vitest";
import {
  computeEspiralLayout,
  computeEstrellaLayout,
  computeFlorLayout,
  computeCuadriculaLayout,
  computePentagonoLayout,
  computeTriskelionLayout,
  computeDiamanteLayout,
  computeLissajousLayout,
  computeRosaLayout,
  computeKochLayout,
  PATTERN_REGISTRY,
} from "../js/geometry-patterns.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig() {
  return {
    canvas: { width: 1920, height: 1080 },
    mandala: {
      rings: [
        { count: 1, radius: 0, imgSize: 130, images: ["center.png"] },
        {
          count: 4,
          radius: 200,
          imgSize: 100,
          images: ["a.png", "b.png", "c.png", "d.png"],
        },
        {
          count: 4,
          radius: 350,
          imgSize: 80,
          images: ["e.png", "f.png", "g.png", "h.png"],
        },
        { count: 8, radius: 450, imgSize: 60, images: ["i.png"] },
      ],
    },
  };
}

function expectValidCoordinates(slots) {
  slots.forEach((slot) => {
    expect(typeof slot.x).toBe("number");
    expect(typeof slot.y).toBe("number");
    expect(isFinite(slot.x)).toBe(true);
    expect(isFinite(slot.y)).toBe(true);
  });
}

function expectSequentialOrder(slots) {
  slots.forEach((slot, i) => expect(slot.entranceOrder).toBe(i));
}

function minDim(config) {
  return Math.min(config.canvas.width, config.canvas.height);
}

function expectMandalaSlotShape(slot) {
  const fields = [
    "x",
    "y",
    "angleDeg",
    "ring",
    "slotIndex",
    "imgSize",
    "imageSrc",
    "entranceOrder",
  ];
  fields.forEach((f) => expect(slot).toHaveProperty(f));
}

// ─── computeEspiralLayout ────────────────────────────────────────────────────

describe("computeEspiralLayout", () => {
  test("retorna exactamente 55 slots (número de Fibonacci)", () => {
    expect(computeEspiralLayout(makeConfig())).toHaveLength(55);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computeEspiralLayout(makeConfig()));
  });

  test("entranceOrder es secuencial de 0 a 54", () => {
    expectSequentialOrder(computeEspiralLayout(makeConfig()));
  });

  test("el primer slot (i=0) está exactamente en el centro del canvas", () => {
    // t = 0/(55-1) = 0 → radius = MAX_RADIUS * sqrt(0) = 0 → (cx, cy)
    const config = makeConfig();
    const [first] = computeEspiralLayout(config);
    expect(first.x).toBeCloseTo(config.canvas.width / 2, 0);
    expect(first.y).toBeCloseTo(config.canvas.height / 2, 0);
  });

  test("el último slot está más alejado del centro que el primero", () => {
    const config = makeConfig();
    const cx = config.canvas.width / 2;
    const cy = config.canvas.height / 2;
    const slots = computeEspiralLayout(config);
    const d0 = Math.hypot(slots[0].x - cx, slots[0].y - cy);
    const dN = Math.hypot(slots[54].x - cx, slots[54].y - cy);
    expect(dN).toBeGreaterThan(d0);
  });

  test("todos los slots tienen imageSrc asignado desde el pool", () => {
    computeEspiralLayout(makeConfig()).forEach((slot) => {
      expect(typeof slot.imageSrc).toBe("string");
    });
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computeEspiralLayout(makeConfig())[0]);
  });

  test("cuando el pool de imágenes está vacío, imageSrc queda en cadena vacía", () => {
    const emptyConfig = {
      canvas: { width: 1920, height: 1080 },
      mandala: { rings: [{ count: 3, radius: 100, imgSize: 80, images: [] }] },
    };
    computeEspiralLayout(emptyConfig).forEach((slot) => {
      expect(slot.imageSrc).toBe("");
    });
  });

  test("los imgSize decrecen del centro hacia el borde", () => {
    const slots = computeEspiralLayout(makeConfig());
    // SIZE_MAX=120 en centro, SIZE_MIN=48 en borde → primer slot > último slot
    expect(slots[0].imgSize).toBeGreaterThan(slots[54].imgSize);
  });
});

// ─── computeEstrellaLayout ───────────────────────────────────────────────────

describe("computeEstrellaLayout", () => {
  // grupos: [1, 6, 6, 12, 12, 6, 6, 12] → total 61
  const EXPECTED = 1 + 6 + 6 + 12 + 12 + 6 + 6 + 12;

  test(`retorna exactamente ${EXPECTED} slots`, () => {
    expect(computeEstrellaLayout(makeConfig())).toHaveLength(EXPECTED);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computeEstrellaLayout(makeConfig()));
  });

  test("entranceOrder es secuencial", () => {
    expectSequentialOrder(computeEstrellaLayout(makeConfig()));
  });

  test("el slot central (radio_factor=0) está en el centro del canvas", () => {
    const config = makeConfig();
    const [center] = computeEstrellaLayout(config);
    expect(center.x).toBeCloseTo(config.canvas.width / 2, 1);
    expect(center.y).toBeCloseTo(config.canvas.height / 2, 1);
  });

  test("todos los slots tienen imageSrc asignado", () => {
    computeEstrellaLayout(makeConfig()).forEach((slot) => {
      expect(typeof slot.imageSrc).toBe("string");
    });
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computeEstrellaLayout(makeConfig())[0]);
  });
});

// ─── computeFlorLayout ───────────────────────────────────────────────────────

describe("computeFlorLayout", () => {
  // Celdas hex con MAX_LAYER=3: capa0=1, capa1=6, capa2=12, capa3=18 → 37
  const EXPECTED = 37;

  test(`retorna exactamente ${EXPECTED} slots`, () => {
    expect(computeFlorLayout(makeConfig())).toHaveLength(EXPECTED);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computeFlorLayout(makeConfig()));
  });

  test("entranceOrder es secuencial", () => {
    expectSequentialOrder(computeFlorLayout(makeConfig()));
  });

  test("el slot central (q=0, r=0) está en el centro del canvas", () => {
    const config = makeConfig();
    const [center] = computeFlorLayout(config);
    expect(center.x).toBeCloseTo(config.canvas.width / 2, 1);
    expect(center.y).toBeCloseTo(config.canvas.height / 2, 1);
  });

  test("el slot central tiene imgSize 128 (capa 0)", () => {
    // SIZE_BY_LAYER = [128, 100, 80, 65]
    expect(computeFlorLayout(makeConfig())[0].imgSize).toBe(128);
  });

  test("los slots de capas exteriores tienen imgSize menor que los centrales", () => {
    const slots = computeFlorLayout(makeConfig());
    const centerSize = slots[0].imgSize;
    slots
      .filter((s) => s.ring === 3)
      .forEach((s) => {
        expect(s.imgSize).toBeLessThan(centerSize);
      });
  });

  test("todos los slots tienen imageSrc asignado", () => {
    computeFlorLayout(makeConfig()).forEach((slot) => {
      expect(typeof slot.imageSrc).toBe("string");
    });
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computeFlorLayout(makeConfig())[0]);
  });
});

// ─── computeCuadriculaLayout ─────────────────────────────────────────────────

describe("computeCuadriculaLayout", () => {
  // grupos: [1, 4, 4, 8, 4, 4, 8, 8, 4] → total 45
  const EXPECTED = 1 + 4 + 4 + 8 + 4 + 4 + 8 + 8 + 4;

  test(`retorna exactamente ${EXPECTED} slots`, () => {
    expect(computeCuadriculaLayout(makeConfig())).toHaveLength(EXPECTED);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computeCuadriculaLayout(makeConfig()));
  });

  test("entranceOrder es secuencial", () => {
    expectSequentialOrder(computeCuadriculaLayout(makeConfig()));
  });

  test("el slot central (radio_factor=0) está en el centro del canvas", () => {
    const config = makeConfig();
    const [center] = computeCuadriculaLayout(config);
    expect(center.x).toBeCloseTo(config.canvas.width / 2, 1);
    expect(center.y).toBeCloseTo(config.canvas.height / 2, 1);
  });

  test("todos los slots tienen imageSrc asignado", () => {
    computeCuadriculaLayout(makeConfig()).forEach((slot) => {
      expect(typeof slot.imageSrc).toBe("string");
    });
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computeCuadriculaLayout(makeConfig())[0]);
  });
});

// ─── computePentagonoLayout ───────────────────────────────────────────────────

describe("computePentagonoLayout", () => {
  // grupos: [1, 5, 5, 10, 5, 5, 10, 5] → total 46
  const EXPECTED = 1 + 5 + 5 + 10 + 5 + 5 + 10 + 5;

  test(`retorna exactamente ${EXPECTED} slots`, () => {
    expect(computePentagonoLayout(makeConfig())).toHaveLength(EXPECTED);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computePentagonoLayout(makeConfig()));
  });

  test("entranceOrder es secuencial", () => {
    expectSequentialOrder(computePentagonoLayout(makeConfig()));
  });

  test("el slot central está en el centro del canvas", () => {
    const config = makeConfig();
    const [center] = computePentagonoLayout(config);
    expect(center.x).toBeCloseTo(config.canvas.width / 2, 1);
    expect(center.y).toBeCloseTo(config.canvas.height / 2, 1);
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computePentagonoLayout(makeConfig())[0]);
  });
});

// ─── computeTriskelionLayout ──────────────────────────────────────────────────

describe("computeTriskelionLayout", () => {
  // 3 brazos × 18 slots/brazo = 54 slots totales
  const EXPECTED = 3 * 18;

  test(`retorna exactamente ${EXPECTED} slots`, () => {
    expect(computeTriskelionLayout(makeConfig())).toHaveLength(EXPECTED);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computeTriskelionLayout(makeConfig()));
  });

  test("entranceOrder es secuencial (orden intercalado por brazo)", () => {
    expectSequentialOrder(computeTriskelionLayout(makeConfig()));
  });

  test("los 3 brazos tienen índice de anillo 0, 1 y 2", () => {
    const slots = computeTriskelionLayout(makeConfig());
    const ringIndices = [...new Set(slots.map((s) => s.ring))].sort();
    expect(ringIndices).toEqual([0, 1, 2]);
  });

  test("los primeros slots de cada brazo están cerca del centro", () => {
    const config = makeConfig();
    const cx = config.canvas.width / 2;
    const cy = config.canvas.height / 2;
    const slots = computeTriskelionLayout(config);
    // Con orden intercalado, los primeros 3 slots (i=0 de cada brazo) son los más cercanos al centro
    const innerThree = [slots[0], slots[1], slots[2]];
    innerThree.forEach((s) => {
      const dist = Math.hypot(s.x - cx, s.y - cy);
      expect(dist).toBeLessThan(config.canvas.height * 0.15); // bien cerca del centro
    });
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computeTriskelionLayout(makeConfig())[0]);
  });
});

// ─── computeDiamanteLayout ───────────────────────────────────────────────────

describe("computeDiamanteLayout", () => {
  // capas: 0(1) + 1(4) + 2(8) + 3(12) + 4(16) = 41 slots totales
  const EXPECTED = 1 + 4 + 8 + 12 + 16;

  test(`retorna exactamente ${EXPECTED} slots`, () => {
    expect(computeDiamanteLayout(makeConfig())).toHaveLength(EXPECTED);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computeDiamanteLayout(makeConfig()));
  });

  test("entranceOrder es secuencial", () => {
    expectSequentialOrder(computeDiamanteLayout(makeConfig()));
  });

  test("el slot central está en el centro del canvas", () => {
    const config = makeConfig();
    const [center] = computeDiamanteLayout(config);
    expect(center.x).toBeCloseTo(config.canvas.width / 2, 1);
    expect(center.y).toBeCloseTo(config.canvas.height / 2, 1);
  });

  test("hay exactamente 5 capas (0 a 4)", () => {
    const slots = computeDiamanteLayout(makeConfig());
    const layers = [...new Set(slots.map((s) => s.ring))].sort((a, b) => a - b);
    expect(layers).toEqual([0, 1, 2, 3, 4]);
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computeDiamanteLayout(makeConfig())[0]);
  });
});

// ─── computeLissajousLayout ───────────────────────────────────────────────────

describe("computeLissajousLayout", () => {
  test("retorna exactamente 48 slots", () => {
    expect(computeLissajousLayout(makeConfig())).toHaveLength(48);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computeLissajousLayout(makeConfig()));
  });

  test("entranceOrder es secuencial", () => {
    expectSequentialOrder(computeLissajousLayout(makeConfig()));
  });

  test("los slots NO están todos en el centro (curva sin simetría radial)", () => {
    const config = makeConfig();
    const cx = config.canvas.width / 2;
    const cy = config.canvas.height / 2;
    const slots = computeLissajousLayout(config);
    // En Lissajous ningún slot está exactamente en el centro
    const atCenter = slots.filter(
      (s) => Math.hypot(s.x - cx, s.y - cy) < 10,
    );
    expect(atCenter).toHaveLength(0);
  });

  test("los slots tienen imageSrc asignado", () => {
    computeLissajousLayout(makeConfig()).forEach((s) =>
      expect(typeof s.imageSrc).toBe("string"),
    );
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computeLissajousLayout(makeConfig())[0]);
  });
});

// ─── computeRosaLayout ───────────────────────────────────────────────────────

describe("computeRosaLayout", () => {
  // 5 pétalos × 9 imágenes/pétalo = 45 slots
  const EXPECTED = 5 * 9;

  test(`retorna exactamente ${EXPECTED} slots`, () => {
    expect(computeRosaLayout(makeConfig())).toHaveLength(EXPECTED);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computeRosaLayout(makeConfig()));
  });

  test("entranceOrder es secuencial (pétalo a pétalo)", () => {
    expectSequentialOrder(computeRosaLayout(makeConfig()));
  });

  test("hay exactamente 5 pétalos (ring 0 a 4)", () => {
    const rings = [
      ...new Set(computeRosaLayout(makeConfig()).map((s) => s.ring)),
    ].sort();
    expect(rings).toEqual([0, 1, 2, 3, 4]);
  });

  test("el slot central de cada pétalo (j=4) tiene imgSize mayor que los extremos", () => {
    const slots = computeRosaLayout(makeConfig());
    // j=4 es el índice central (punta), j=0 y j=8 son los extremos (base)
    for (let p = 0; p < 5; p++) {
      const tipSlot  = slots[p * 9 + 4]; // punta del pétalo
      const baseSlot = slots[p * 9 + 0]; // base del pétalo
      expect(tipSlot.imgSize).toBeGreaterThan(baseSlot.imgSize);
    }
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computeRosaLayout(makeConfig())[0]);
  });
});

// ─── computeKochLayout ───────────────────────────────────────────────────────

describe("computeKochLayout", () => {
  // 3 × 4² = 48 vértices del copo de nieve de Koch (iter-2)
  const EXPECTED = 48;

  test(`retorna exactamente ${EXPECTED} slots`, () => {
    expect(computeKochLayout(makeConfig())).toHaveLength(EXPECTED);
  });

  test("todos los slots tienen coordenadas numéricas finitas", () => {
    expectValidCoordinates(computeKochLayout(makeConfig()));
  });

  test("entranceOrder es secuencial (traza el perímetro)", () => {
    expectSequentialOrder(computeKochLayout(makeConfig()));
  });

  test("ningún slot está en el centro del canvas (patrón perimetral)", () => {
    const config = makeConfig();
    const cx = config.canvas.width / 2;
    const cy = config.canvas.height / 2;
    const slots = computeKochLayout(config);
    // Koch no tiene imagen central — todos los slots están en la corona exterior
    slots.forEach((s) => {
      expect(Math.hypot(s.x - cx, s.y - cy)).toBeGreaterThan(minDim(config) * 0.2);
    });
  });

  test("los slots tienen imgSize dentro del rango [38, 68]", () => {
    computeKochLayout(makeConfig()).forEach((s) => {
      expect(s.imgSize).toBeGreaterThanOrEqual(38);
      expect(s.imgSize).toBeLessThanOrEqual(68);
    });
  });

  test("cada slot contiene todos los campos requeridos de MandalaSlot", () => {
    expectMandalaSlotShape(computeKochLayout(makeConfig())[0]);
  });
});

// ─── PATTERN_REGISTRY ────────────────────────────────────────────────────────

describe("PATTERN_REGISTRY", () => {
  test("contiene exactamente 11 patrones", () => {
    expect(Object.keys(PATTERN_REGISTRY)).toHaveLength(11);
  });

  test("cada entrada tiene las propiedades label, category y fn", () => {
    Object.entries(PATTERN_REGISTRY).forEach(([, entry]) => {
      expect(typeof entry.label).toBe("string");
      expect(entry.label.length).toBeGreaterThan(0);
      expect(typeof entry.category).toBe("string");
      expect(entry.category.length).toBeGreaterThan(0);
      expect(entry).toHaveProperty("fn");
    });
  });

  test("circular tiene fn = null (delega a computeMandalaLayout)", () => {
    expect(PATTERN_REGISTRY.circular.fn).toBeNull();
  });

  test("todos los demás patrones tienen fn como función", () => {
    Object.entries(PATTERN_REGISTRY)
      .filter(([key]) => key !== "circular")
      .forEach(([, entry]) => {
        expect(typeof entry.fn).toBe("function");
      });
  });

  test("las categorías esperadas están presentes", () => {
    const categories = [
      ...new Set(Object.values(PATTERN_REGISTRY).map((e) => e.category)),
    ];
    expect(categories).toContain("Clásicos");
    expect(categories).toContain("Geométricos");
    expect(categories).toContain("Curvas");
    expect(categories).toContain("Fractales");
  });

  test("los nuevos patrones (lissajous, rosa, koch) están registrados", () => {
    expect(PATTERN_REGISTRY).toHaveProperty("lissajous");
    expect(PATTERN_REGISTRY).toHaveProperty("rosa");
    expect(PATTERN_REGISTRY).toHaveProperty("koch");
  });
});
