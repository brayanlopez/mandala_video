import { describe, test, expect, vi } from "vitest";
import { RENDERER_REGISTRY, createRenderer } from "../js/renderer-interface.js";

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Prevent dynamic imports from loading real renderer code (which would pull in
// p5 / three globals that are not set up in this test context).

vi.mock("../js/renderer-p5.js", () => ({
  P5Renderer: class MockP5Renderer {
    constructor() {
      this._engine = "p5";
    }
  },
}));

vi.mock("../js/renderer-three.js", () => ({
  ThreeRenderer: class MockThreeRenderer {
    constructor() {
      this._engine = "three";
    }
  },
}));

// ─── RENDERER_REGISTRY ───────────────────────────────────────────────────────

describe("RENDERER_REGISTRY", () => {
  test('contiene exactamente las claves "p5" y "three"', () => {
    expect(Object.keys(RENDERER_REGISTRY)).toEqual(["p5", "three"]);
  });

  test("entrada p5 tiene label, module y ctor correctos", () => {
    const entry = RENDERER_REGISTRY.p5;
    expect(entry.label).toBe("p5.js (Canvas 2D)");
    expect(typeof entry.module).toBe("function");
    expect(entry.ctor).toBe("P5Renderer");
  });

  test("entrada three tiene label, module y ctor correctos", () => {
    const entry = RENDERER_REGISTRY.three;
    expect(entry.label).toBe("Three.js (WebGL 3D)");
    expect(typeof entry.module).toBe("function");
    expect(entry.ctor).toBe("ThreeRenderer");
  });

  test("module de cada entrada retorna una Promise", () => {
    expect(RENDERER_REGISTRY.p5.module()).toBeInstanceOf(Promise);
    expect(RENDERER_REGISTRY.three.module()).toBeInstanceOf(Promise);
  });
});

// ─── createRenderer ──────────────────────────────────────────────────────────

describe("createRenderer", () => {
  test("lanza Error para un nombre de motor desconocido", async () => {
    await expect(createRenderer("pixi")).rejects.toThrow(
      'Motor de renderer desconocido: "pixi"',
    );
  });

  test("el mensaje de error incluye el nombre del motor inválido", async () => {
    await expect(createRenderer("webgpu")).rejects.toThrow('"webgpu"');
  });

  test('retorna una instancia de P5Renderer para "p5"', async () => {
    const renderer = await createRenderer("p5");
    expect(renderer._engine).toBe("p5");
  });

  test('retorna una instancia de ThreeRenderer para "three"', async () => {
    const renderer = await createRenderer("three");
    expect(renderer._engine).toBe("three");
  });

  test("retorna una instancia distinta en cada llamada", async () => {
    const r1 = await createRenderer("p5");
    const r2 = await createRenderer("p5");
    expect(r1).not.toBe(r2);
  });

  test("rechaza de forma asíncrona (no lanza síncronamente)", async () => {
    // createRenderer es siempre async: nunca lanza de forma síncrona,
    // pero la Promise rechaza si el nombre no existe.
    await expect(createRenderer("unknown")).rejects.toThrow();
  });
});
