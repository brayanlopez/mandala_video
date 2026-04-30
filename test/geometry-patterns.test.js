import { describe, test, expect } from "vitest";
import {
  computeEspiralLayout,
  computeEstrellaLayout,
  computeFlorLayout,
  computeCuadriculaLayout,
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
