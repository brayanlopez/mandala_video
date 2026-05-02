import { describe, test, expect } from "vitest";
import {
  computeLayout,
  sanitizePath,
  resolveImage,
  computeMandalaLayout,
} from "../js/geometry.js";

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeConfig(rings) {
  return {
    canvas: { width: 1920, height: 1080 },
    mandala: { rings },
  };
}

// ─── sanitizePath ─────────────────────────────────────────────────────────────

describe("sanitizePath", () => {
  test("devuelve cadena vacía para entrada no-string", () => {
    expect(sanitizePath(null)).toBe("");
    expect(sanitizePath(undefined)).toBe("");
    expect(sanitizePath(42)).toBe("");
    expect(sanitizePath({})).toBe("");
  });

  test("devuelve cadena vacía para string vacío", () => {
    expect(sanitizePath("")).toBe("");
  });

  test("no modifica rutas relativas seguras", () => {
    expect(sanitizePath("images/ring1/frutilla.png")).toBe(
      "images/ring1/frutilla.png",
    );
    expect(sanitizePath("center/flor_central.png")).toBe(
      "center/flor_central.png",
    );
  });

  test("normaliza backslashes a forward slashes", () => {
    expect(sanitizePath("images\\ring1\\frutilla.png")).toBe(
      "images/ring1/frutilla.png",
    );
    expect(sanitizePath("a\\b\\c.png")).toBe("a/b/c.png");
  });

  test("elimina segmentos .. para prevenir path traversal (CWE-22)", () => {
    expect(sanitizePath("../secret/file.txt")).toBe("secret/file.txt");
    expect(sanitizePath("images/../../etc/passwd")).toBe("images/etc/passwd");
    expect(sanitizePath("../../etc/passwd")).toBe("etc/passwd");
  });

  test("elimina segmentos . actuales", () => {
    expect(sanitizePath("./images/./ring1/file.png")).toBe(
      "images/ring1/file.png",
    );
    expect(sanitizePath("a/./b/./c.png")).toBe("a/b/c.png");
  });

  test("elimina segmentos con caracteres especiales peligrosos", () => {
    expect(sanitizePath("images/<script>/file.png")).toBe("images/file.png");
    expect(sanitizePath("images/$(cmd)/file.png")).toBe("images/file.png");
  });

  test("permite guiones bajos, guiones y puntos en nombres de archivo", () => {
    expect(sanitizePath("images/ring-1/flor_pequena.png")).toBe(
      "images/ring-1/flor_pequena.png",
    );
    expect(sanitizePath("my-file.v2.png")).toBe("my-file.v2.png");
  });

  test("elimina segmentos vacíos producidos por doble slash", () => {
    expect(sanitizePath("images//ring1//file.png")).toBe(
      "images/ring1/file.png",
    );
  });
});

// ─── resolveImage ─────────────────────────────────────────────────────────────

describe("resolveImage", () => {
  test("devuelve cadena vacía cuando no hay imágenes", () => {
    expect(resolveImage({ images: [] }, 0)).toBe("");
    expect(resolveImage({ images: null }, 0)).toBe("");
    expect(resolveImage({ images: undefined }, 0)).toBe("");
  });

  test("imagen única se devuelve para cualquier índice", () => {
    const ring = { images: ["images/center.png"] };
    expect(resolveImage(ring, 0)).toBe("images/center.png");
    expect(resolveImage(ring, 5)).toBe("images/center.png");
    expect(resolveImage(ring, 99)).toBe("images/center.png");
  });

  test("cicla las imágenes cuando el índice supera la cantidad", () => {
    const ring = { images: ["a.png", "b.png", "c.png"] };
    expect(resolveImage(ring, 0)).toBe("a.png");
    expect(resolveImage(ring, 1)).toBe("b.png");
    expect(resolveImage(ring, 2)).toBe("c.png");
    expect(resolveImage(ring, 3)).toBe("a.png"); // 3 % 3 = 0
    expect(resolveImage(ring, 7)).toBe("b.png"); // 7 % 3 = 1
  });

  test("sanitiza la ruta devuelta (previene path traversal)", () => {
    const ring = { images: ["../../../etc/passwd"] };
    expect(resolveImage(ring, 0)).toBe("etc/passwd");
  });
});

// ─── computeMandalaLayout ────────────────────────────────────────────────────

describe("computeMandalaLayout", () => {
  test("la cantidad total de slots es la suma de los count de cada anillo", () => {
    const config = makeConfig([
      { count: 1, radius: 0, imgSize: 130, images: ["c.png"] },
      { count: 4, radius: 200, imgSize: 100, images: ["a.png"] },
      { count: 8, radius: 400, imgSize: 80, images: ["e.png"] },
    ]);
    expect(computeMandalaLayout(config)).toHaveLength(13); // 1 + 4 + 8
  });

  test("devuelve array vacío cuando no hay anillos", () => {
    expect(computeMandalaLayout(makeConfig([]))).toHaveLength(0);
  });

  test("el slot central (radio 0) está en el centro del canvas", () => {
    const config = makeConfig([
      { count: 1, radius: 0, imgSize: 130, images: ["c.png"] },
    ]);
    const [slot] = computeMandalaLayout(config);
    expect(slot.x).toBeCloseTo(960); // 1920 / 2
    expect(slot.y).toBeCloseTo(540); // 1080 / 2
  });

  test("un anillo con count=1 tiene angleDeg = 0", () => {
    const config = makeConfig([
      { count: 1, radius: 100, imgSize: 100, images: ["a.png"] },
    ]);
    expect(computeMandalaLayout(config)[0].angleDeg).toBe(0);
  });

  test("entranceOrder es un índice global secuencial (0, 1, 2, ...)", () => {
    const config = makeConfig([
      { count: 2, radius: 100, imgSize: 100, images: ["a.png", "b.png"] },
      {
        count: 3,
        radius: 200,
        imgSize: 80,
        images: ["c.png", "d.png", "e.png"],
      },
    ]);
    computeMandalaLayout(config).forEach((slot, i) => {
      expect(slot.entranceOrder).toBe(i);
    });
  });

  test("los slots están exactamente al radio configurado desde el centro del canvas", () => {
    const radius = 300;
    const config = makeConfig([
      { count: 6, radius, imgSize: 100, images: ["a.png"] },
    ]);
    const cx = 960,
      cy = 540;
    computeMandalaLayout(config).forEach((slot) => {
      const dist = Math.sqrt((slot.x - cx) ** 2 + (slot.y - cy) ** 2);
      expect(dist).toBeCloseTo(radius, 5);
    });
  });

  test("cada slot tiene el índice de anillo e imgSize correctos", () => {
    const config = makeConfig([
      { count: 1, radius: 0, imgSize: 130, images: ["a.png"] },
      { count: 4, radius: 200, imgSize: 80, images: ["b.png"] },
    ]);
    const slots = computeMandalaLayout(config);
    expect(slots[0].ring).toBe(0);
    expect(slots[0].imgSize).toBe(130);
    expect(slots[1].ring).toBe(1);
    expect(slots[1].imgSize).toBe(80);
  });

  test("un anillo de 4 slots distribuye ángulos cada 90° empezando en -90°", () => {
    const config = makeConfig([
      { count: 4, radius: 100, imgSize: 80, images: ["a.png"] },
    ]);
    const angles = computeMandalaLayout(config).map((s) => s.angleDeg);
    expect(angles[0]).toBeCloseTo(-90);
    expect(angles[1]).toBeCloseTo(0);
    expect(angles[2]).toBeCloseTo(90);
    expect(angles[3]).toBeCloseTo(180);
  });

  test("slotIndex va de 0 a count-1 dentro de cada anillo", () => {
    const config = makeConfig([
      { count: 3, radius: 100, imgSize: 80, images: ["a.png"] },
    ]);
    const slots = computeMandalaLayout(config);
    expect(slots[0].slotIndex).toBe(0);
    expect(slots[1].slotIndex).toBe(1);
    expect(slots[2].slotIndex).toBe(2);
  });

  test("cada slot contiene todos los campos del tipo MandalaSlot", () => {
    const config = makeConfig([
      { count: 2, radius: 100, imgSize: 80, images: ["a.png", "b.png"] },
    ]);
    const requiredFields = [
      "x",
      "y",
      "angleDeg",
      "ring",
      "slotIndex",
      "imgSize",
      "imageSrc",
      "entranceOrder",
    ];
    computeMandalaLayout(config).forEach((slot) => {
      requiredFields.forEach((field) => expect(slot).toHaveProperty(field));
    });
  });

  test("las imágenes se ciclan si hay menos imágenes que slots en el anillo", () => {
    const config = makeConfig([
      { count: 4, radius: 100, imgSize: 80, images: ["a.png", "b.png"] },
    ]);
    const slots = computeMandalaLayout(config);
    expect(slots[0].imageSrc).toBe("a.png");
    expect(slots[1].imageSrc).toBe("b.png");
    expect(slots[2].imageSrc).toBe("a.png"); // cicla
    expect(slots[3].imageSrc).toBe("b.png"); // cicla
  });
});

// ─── computeLayout ───────────────────────────────────────────────────────────

describe("computeLayout", () => {
  const config = makeConfig([
    { count: 1, radius: 0, imgSize: 130, images: ["c.png"] },
    { count: 4, radius: 200, imgSize: 100, images: ["a.png"] },
  ]);

  test("circular enruta a computeMandalaLayout (mismo resultado)", () => {
    const via = computeLayout("circular", config);
    const direct = computeMandalaLayout(config);
    expect(via).toEqual(direct);
  });

  test("patrón desconocido cae en computeMandalaLayout", () => {
    const via = computeLayout("nonexistent", config);
    const direct = computeMandalaLayout(config);
    expect(via).toEqual(direct);
  });

  test("patrón vacío cae en computeMandalaLayout", () => {
    const via = computeLayout("", config);
    const direct = computeMandalaLayout(config);
    expect(via).toEqual(direct);
  });

  test("patrón válido (espiral) enruta al algoritmo correspondiente del registro", () => {
    const slots = computeLayout("espiral", config);
    // La espiral siempre produce exactamente 55 slots
    expect(slots).toHaveLength(55);
  });

  test("patrón válido (flor) enruta al algoritmo correspondiente del registro", () => {
    const slots = computeLayout("flor", config);
    expect(slots).toHaveLength(37);
  });
});
