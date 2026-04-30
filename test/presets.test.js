// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  PRESET_VERSION,
  STORAGE_KEY,
  capturePreset,
  savePreset,
  loadPreset,
  listPresets,
  deletePreset,
  presetToJSON,
  presetFromJSON,
} from "../js/presets.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeConfig() {
  return {
    canvas: { bgColor: "#1a0a2e", fps: 60, imgScale: 1.0 },
    animation: {
      speed: 1.0,
      staggerDelay: 160,
      entryDuration: 700,
      entryEffect: "scaleIn",
      rotationSpeed: 0.04,
      loopAnimation: false,
    },
    export: { captureMode: "ccapture" },
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

// ─── capturePreset ────────────────────────────────────────────────────────────

describe("capturePreset", () => {
  test("incluye version, pattern y las secciones canvas/animation/export", () => {
    const p = capturePreset(makeConfig(), "espiral");
    expect(p.version).toBe(PRESET_VERSION);
    expect(p.pattern).toBe("espiral");
    expect(p).toHaveProperty("canvas");
    expect(p).toHaveProperty("animation");
    expect(p).toHaveProperty("export");
  });

  test("captura todos los campos de canvas", () => {
    const p = capturePreset(makeConfig(), "circular");
    expect(p.canvas.bgColor).toBe("#1a0a2e");
    expect(p.canvas.fps).toBe(60);
    expect(p.canvas.imgScale).toBe(1.0);
  });

  test("captura todos los campos de animation", () => {
    const p = capturePreset(makeConfig(), "circular");
    expect(p.animation.speed).toBe(1.0);
    expect(p.animation.staggerDelay).toBe(160);
    expect(p.animation.entryDuration).toBe(700);
    expect(p.animation.entryEffect).toBe("scaleIn");
    expect(p.animation.rotationSpeed).toBe(0.04);
    expect(p.animation.loopAnimation).toBe(false);
  });

  test("captura el modo de captura", () => {
    expect(capturePreset(makeConfig(), "circular").export.captureMode).toBe(
      "ccapture",
    );
  });

  test("defaultea imgScale a 1 cuando no está definido en config", () => {
    const config = makeConfig();
    delete config.canvas.imgScale;
    expect(capturePreset(config, "circular").canvas.imgScale).toBe(1);
  });

  test("no incluye mandala.rings (rutas de imagen dependientes del servidor)", () => {
    const config = { ...makeConfig(), mandala: { rings: [{ count: 8 }] } };
    expect(capturePreset(config, "circular")).not.toHaveProperty("mandala");
  });
});

// ─── savePreset / loadPreset / listPresets / deletePreset ─────────────────────

describe("savePreset + loadPreset", () => {
  test("guarda y recupera un preset por nombre", () => {
    const data = capturePreset(makeConfig(), "circular");
    savePreset("test", data);
    const loaded = loadPreset("test");
    expect(loaded.version).toBe(PRESET_VERSION);
    expect(loaded.pattern).toBe("circular");
  });

  test("guarda en la clave STORAGE_KEY de localStorage", () => {
    savePreset("x", capturePreset(makeConfig(), "flor"));
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  test("agrega un campo savedAt con fecha ISO", () => {
    savePreset("ts", capturePreset(makeConfig(), "circular"));
    const loaded = loadPreset("ts");
    expect(typeof loaded.savedAt).toBe("string");
    expect(() => new Date(loaded.savedAt)).not.toThrow();
  });

  test("sobreescribe un preset existente con el mismo nombre", () => {
    const c1 = { ...makeConfig() };
    const c2 = {
      ...makeConfig(),
      animation: { ...makeConfig().animation, speed: 2.5 },
    };
    savePreset("dup", capturePreset(c1, "circular"));
    savePreset("dup", capturePreset(c2, "circular"));
    expect(loadPreset("dup").animation.speed).toBe(2.5);
  });

  test("lanza error si el nombre es vacío", () => {
    expect(() =>
      savePreset("", capturePreset(makeConfig(), "circular")),
    ).toThrow();
  });

  test("lanza error si el nombre no es string", () => {
    expect(() =>
      savePreset(null, capturePreset(makeConfig(), "circular")),
    ).toThrow();
  });

  test("loadPreset devuelve null si el nombre no existe", () => {
    expect(loadPreset("nonexistent")).toBeNull();
  });
});

describe("listPresets", () => {
  test("devuelve objeto vacío cuando localStorage está vacío", () => {
    expect(listPresets()).toEqual({});
  });

  test("devuelve todos los presets guardados", () => {
    savePreset("a", capturePreset(makeConfig(), "circular"));
    savePreset("b", capturePreset(makeConfig(), "espiral"));
    const list = listPresets();
    expect(Object.keys(list)).toContain("a");
    expect(Object.keys(list)).toContain("b");
  });

  test("maneja JSON inválido en localStorage devolviendo objeto vacío", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(listPresets()).toEqual({});
  });
});

describe("deletePreset", () => {
  test("elimina el preset con ese nombre", () => {
    savePreset("del", capturePreset(makeConfig(), "circular"));
    deletePreset("del");
    expect(loadPreset("del")).toBeNull();
  });

  test("no lanza error si el preset no existe", () => {
    expect(() => deletePreset("ghost")).not.toThrow();
  });

  test("no elimina otros presets", () => {
    savePreset("keep", capturePreset(makeConfig(), "circular"));
    savePreset("remove", capturePreset(makeConfig(), "flor"));
    deletePreset("remove");
    expect(loadPreset("keep")).not.toBeNull();
  });
});

// ─── presetToJSON ─────────────────────────────────────────────────────────────

describe("presetToJSON", () => {
  test("devuelve un string JSON con indentación", () => {
    const data = capturePreset(makeConfig(), "circular");
    const json = presetToJSON(data);
    expect(typeof json).toBe("string");
    expect(json).toContain("\n"); // tiene indentación
  });

  test("el resultado es parseable y contiene los datos originales", () => {
    const data = capturePreset(makeConfig(), "espiral");
    const parsed = JSON.parse(presetToJSON(data));
    expect(parsed.pattern).toBe("espiral");
    expect(parsed.version).toBe(PRESET_VERSION);
  });
});

// ─── presetFromJSON ───────────────────────────────────────────────────────────

describe("presetFromJSON", () => {
  test("parsea un preset JSON válido y lo devuelve", () => {
    const data = capturePreset(makeConfig(), "flor");
    const result = presetFromJSON(presetToJSON(data));
    expect(result.pattern).toBe("flor");
    expect(result.version).toBe(PRESET_VERSION);
  });

  test('lanza "JSON inválido" si el string no es JSON', () => {
    expect(() => presetFromJSON("not-json")).toThrow("JSON inválido");
  });

  test("lanza error si el dato no es un objeto", () => {
    expect(() => presetFromJSON("42")).toThrow();
    expect(() => presetFromJSON("null")).toThrow();
  });

  test("lanza error de versión si version no coincide", () => {
    const bad = { version: 99, animation: {}, canvas: {} };
    expect(() => presetFromJSON(JSON.stringify(bad))).toThrow("incompatible");
  });

  test('lanza error si falta el campo "animation"', () => {
    const bad = { version: PRESET_VERSION, canvas: {} };
    expect(() => presetFromJSON(JSON.stringify(bad))).toThrow("animation");
  });

  test('lanza error si falta el campo "canvas"', () => {
    const bad = { version: PRESET_VERSION, animation: {} };
    expect(() => presetFromJSON(JSON.stringify(bad))).toThrow("canvas");
  });
});
