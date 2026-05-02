import { describe, test, expect, vi, beforeEach } from "vitest";
import { ThreeRenderer } from "../js/renderer-three.js";

// ─── Mock de Three.js ────────────────────────────────────────────────────────
//
// renderer-three.js importa "../lib/three.module.js" que es una ruta virtual
// servida por server.js pero que no existe en el sistema de archivos.
// Desde tests/ el mismo path resuelve al mismo absoluto, por lo que vi.mock
// intercepta la importación sin necesidad del archivo físico.
//
// IMPORTANTE: las factories deben usar function() { return {...}; }
// (no arrow functions) porque THREE usa `new ClassName()` en el código
// fuente; las arrow functions no pueden ser constructores.

vi.mock("../lib/three.module.js", () => ({
  Scene: vi.fn(function () {
    return { add: vi.fn() };
  }),
  PerspectiveCamera: vi.fn(function () {
    return { position: { set: vi.fn() }, lookAt: vi.fn() };
  }),
  WebGLRenderer: vi.fn(function () {
    return {
      setSize: vi.fn(),
      setPixelRatio: vi.fn(),
      setClearColor: vi.fn(),
      render: vi.fn(),
      dispose: vi.fn(),
      domElement: { style: {}, parentNode: null },
    };
  }),
  Vector3: vi.fn(function () {
    return {};
  }),
  PlaneGeometry: vi.fn(function () {
    return { dispose: vi.fn() };
  }),
  MeshBasicMaterial: vi.fn(function () {
    return { dispose: vi.fn(), needsUpdate: false, map: null, opacity: 1 };
  }),
  Mesh: vi.fn(function () {
    return {
      visible: false,
      position: { set: vi.fn() },
      rotation: { z: 0 },
      scale: { set: vi.fn() },
      material: { dispose: vi.fn(), needsUpdate: false, map: null, opacity: 1 },
    };
  }),
  Points: vi.fn(function (geo, mat) {
    return { geometry: geo, material: mat };
  }),
  PointsMaterial: vi.fn(function () {
    return { dispose: vi.fn() };
  }),
  BufferGeometry: vi.fn(function () {
    const attrs = {};
    return {
      setAttribute: vi.fn(function (name, attr) {
        attrs[name] = attr;
      }),
      get attributes() {
        return attrs;
      },
      dispose: vi.fn(),
    };
  }),
  BufferAttribute: vi.fn(function (arr) {
    return { array: arr, needsUpdate: false };
  }),
  TextureLoader: vi.fn(function () {
    return { load: vi.fn() };
  }),
  CanvasTexture: vi.fn(function () {
    return { dispose: vi.fn() };
  }),
  Color: vi.fn(function () {
    return {};
  }),
  AdditiveBlending: 2,
  LinearFilter: 1006,
  DoubleSide: 2,
}));

// Importación estática del mock (interceptada por vi.mock anterior).
// Permite acceder a THREE.TextureLoader.mockImplementation() en los tests.
import * as THREE from "../lib/three.module.js";

// ─── Mock de document (para init / _makeGlowTexture) ─────────────────────────
// renderer-three.js usa document.getElementById y document.createElement en
// init() y _makeGlowTexture(). En environment:"node" el objeto document no
// existe; lo inyectamos globalmente solo para estos tests.

const mockCtx = {
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  fillRect: vi.fn(),
  fillStyle: null,
};

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => mockCtx),
};

const mockContainer = { appendChild: vi.fn() };

globalThis.document = {
  getElementById: vi.fn(() => mockContainer),
  createElement: vi.fn(() => mockCanvas),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Crea un ThreeRenderer con el estado interno mínimo ya inyectado para que los
 * tests de la cola de dibujo, flush y caché funcionen sin llamar a init().
 * Evita dependencias de DOM y WebGL real en tests unitarios.
 */
function makeReadyRenderer() {
  const r = new ThreeRenderer();
  r._scene = { add: vi.fn() };
  r._camera = {};
  r._webgl = {
    render: vi.fn(),
    setClearColor: vi.fn(),
    dispose: vi.fn(),
    domElement: { parentNode: null },
  };
  r._canvas = { id: "mock-canvas" };
  r._canvasW = 1920;
  r._canvasH = 1080;
  r._sharedGeo = { dispose: vi.fn() };
  r._glowTex = { dispose: vi.fn() };

  // Buffer de partículas pre-construido con tamaño fijo (512 slots)
  const posArr = new Float32Array(512 * 3).fill(-999999);
  const colArr = new Float32Array(512 * 3).fill(1);
  const szArr = new Float32Array(512).fill(0);
  r._particlePoints = {
    geometry: {
      attributes: {
        position: { array: posArr, needsUpdate: false },
        color: { array: colArr, needsUpdate: false },
        size: { array: szArr, needsUpdate: false },
      },
      dispose: vi.fn(),
    },
    material: { dispose: vi.fn() },
  };
  return r;
}

// ─── Constructor ──────────────────────────────────────────────────────────────

describe("ThreeRenderer — constructor", () => {
  test("inicializa propiedades a null / arrays vacíos", () => {
    const r = new ThreeRenderer();
    expect(r._scene).toBeNull();
    expect(r._webgl).toBeNull();
    expect(r._canvas).toBeNull();
    expect(r._sprites).toEqual([]);
    expect(r._glowMeshes).toEqual([]);
    expect(r._imageQueue).toEqual([]);
    expect(r._glowQueue).toEqual([]);
    expect(r._particleQueue).toEqual([]);
    expect(r._slotRing).toEqual([]);
  });

  test("_textureCache empieza vacío", () => {
    const r = new ThreeRenderer();
    expect(r._textureCache.size).toBe(0);
  });
});

// ─── setSlotMetadata ──────────────────────────────────────────────────────────

describe("ThreeRenderer.setSlotMetadata", () => {
  test("mapea el ring de cada slot al índice correspondiente", () => {
    const r = makeReadyRenderer();
    r.setSlotMetadata([{ ring: 0 }, { ring: 1 }, { ring: 2 }, { ring: 1 }]);
    expect(r._slotRing).toEqual([0, 1, 2, 1]);
  });

  test("slots sin propiedad ring se mapean a 0", () => {
    const r = makeReadyRenderer();
    r.setSlotMetadata([{}, { ring: 3 }]);
    expect(r._slotRing[0]).toBe(0);
    expect(r._slotRing[1]).toBe(3);
  });

  test("array vacío no lanza error", () => {
    const r = makeReadyRenderer();
    expect(() => r.setSlotMetadata([])).not.toThrow();
    expect(r._slotRing).toEqual([]);
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe("ThreeRenderer.clear", () => {
  test("vacía las tres colas del frame", () => {
    const r = makeReadyRenderer();
    r._imageQueue = [{ tex: {} }];
    r._glowQueue = [{ x: 0 }];
    r._particleQueue = [{ x: 0 }];
    r.clear("#ffffff");
    expect(r._imageQueue).toEqual([]);
    expect(r._glowQueue).toEqual([]);
    expect(r._particleQueue).toEqual([]);
  });

  test("llama a setClearColor cuando el color cambia", () => {
    const r = makeReadyRenderer();
    r.clear("#ff0000");
    expect(r._webgl.setClearColor).toHaveBeenCalledTimes(1);
  });

  test("no llama a setClearColor cuando el color no cambia", () => {
    const r = makeReadyRenderer();
    r.clear("#ff0000");
    r.clear("#ff0000");
    expect(r._webgl.setClearColor).toHaveBeenCalledTimes(1);
  });

  test('maneja el color "transparent" sin lanzar error', () => {
    const r = makeReadyRenderer();
    expect(() => r.clear("transparent")).not.toThrow();
  });

  test("no llama a setClearColor si bgColor es falsy", () => {
    const r = makeReadyRenderer();
    r.clear(null);
    r.clear(undefined);
    r.clear("");
    expect(r._webgl.setClearColor).not.toHaveBeenCalled();
  });
});

// ─── drawImage ────────────────────────────────────────────────────────────────

describe("ThreeRenderer.drawImage", () => {
  test("encola un comando cuando la textura es válida", () => {
    const r = makeReadyRenderer();
    const tex = { id: "fake-texture" };
    r.drawImage(tex, 960, 540, 80, 0.8, 45, 0);
    expect(r._imageQueue).toHaveLength(1);
    expect(r._imageQueue[0]).toMatchObject({
      tex,
      x: 960,
      y: 540,
      size: 80,
      alpha: 0.8,
      rotDeg: 45,
      slotIndex: 0,
    });
  });

  test("usa slotIndex = 0 por defecto si no se provee", () => {
    const r = makeReadyRenderer();
    r.drawImage({ id: "tex" }, 100, 100, 50, 1, 0);
    expect(r._imageQueue[0].slotIndex).toBe(0);
  });

  test("no encola si tex es null", () => {
    const r = makeReadyRenderer();
    r.drawImage(null, 100, 100, 50, 1, 0);
    expect(r._imageQueue).toHaveLength(0);
  });

  test("no encola si tex es undefined", () => {
    const r = makeReadyRenderer();
    r.drawImage(undefined, 100, 100, 50, 1, 0);
    expect(r._imageQueue).toHaveLength(0);
  });

  test("acumula múltiples comandos en la cola", () => {
    const r = makeReadyRenderer();
    r.drawImage({ id: "a" }, 100, 100, 50, 1, 0, 0);
    r.drawImage({ id: "b" }, 200, 200, 60, 0.5, 90, 1);
    expect(r._imageQueue).toHaveLength(2);
  });
});

// ─── drawGlow ────────────────────────────────────────────────────────────────

describe("ThreeRenderer.drawGlow", () => {
  test("encola cuando alpha > 0", () => {
    const r = makeReadyRenderer();
    r.drawGlow(400, 300, 120, 0.5, "#ffffff");
    expect(r._glowQueue).toHaveLength(1);
    expect(r._glowQueue[0]).toMatchObject({
      x: 400,
      y: 300,
      size: 120,
      alpha: 0.5,
      colorHex: "#ffffff",
    });
  });

  test("no encola cuando alpha = 0", () => {
    const r = makeReadyRenderer();
    r.drawGlow(400, 300, 120, 0, "#ffffff");
    expect(r._glowQueue).toHaveLength(0);
  });

  test("no encola cuando alpha < 0", () => {
    const r = makeReadyRenderer();
    r.drawGlow(400, 300, 120, -0.1, "#ffffff");
    expect(r._glowQueue).toHaveLength(0);
  });
});

// ─── drawParticle ─────────────────────────────────────────────────────────────

describe("ThreeRenderer.drawParticle", () => {
  test("encola cuando alpha > 0", () => {
    const r = makeReadyRenderer();
    r.drawParticle(200, 300, 6, 0.4, "#c084fc");
    expect(r._particleQueue).toHaveLength(1);
    expect(r._particleQueue[0]).toMatchObject({
      x: 200,
      y: 300,
      size: 6,
      alpha: 0.4,
      colorHex: "#c084fc",
    });
  });

  test("no encola cuando alpha = 0", () => {
    const r = makeReadyRenderer();
    r.drawParticle(200, 300, 6, 0, "#ffffff");
    expect(r._particleQueue).toHaveLength(0);
  });

  test("acumula múltiples partículas", () => {
    const r = makeReadyRenderer();
    r.drawParticle(10, 10, 4, 0.3, "#ff0000");
    r.drawParticle(20, 20, 5, 0.5, "#00ff00");
    expect(r._particleQueue).toHaveLength(2);
  });
});

// ─── No-ops de export ────────────────────────────────────────────────────────

describe("ThreeRenderer — pauseEffects / tickEffects / resumeEffects", () => {
  test("los tres métodos existen y son invocables sin error", () => {
    const r = makeReadyRenderer();
    expect(() => r.pauseEffects()).not.toThrow();
    expect(() => r.tickEffects(16.67)).not.toThrow();
    expect(() => r.resumeEffects()).not.toThrow();
  });

  test("no modifican el estado interno del renderer", () => {
    const r = makeReadyRenderer();
    r.pauseEffects();
    r.tickEffects(100);
    r.resumeEffects();
    // Las colas siguen vacías después de los no-ops
    expect(r._imageQueue).toEqual([]);
    expect(r._particleQueue).toEqual([]);
  });
});

// ─── getCanvas ────────────────────────────────────────────────────────────────

describe("ThreeRenderer.getCanvas", () => {
  test("retorna el canvas inyectado", () => {
    const r = makeReadyRenderer();
    expect(r.getCanvas()).toBe(r._canvas);
  });

  test("retorna null antes de que init() sea llamado", () => {
    const r = new ThreeRenderer();
    expect(r.getCanvas()).toBeNull();
  });
});

// ─── loadImage ────────────────────────────────────────────────────────────────

describe("ThreeRenderer.loadImage", () => {
  test("retorna Promise<null> para src vacío", async () => {
    const r = makeReadyRenderer();
    expect(await r.loadImage("")).toBeNull();
  });

  test("retorna Promise<null> para src null", async () => {
    const r = makeReadyRenderer();
    expect(await r.loadImage(null)).toBeNull();
  });

  test("almacena la promesa en la caché por ruta", () => {
    const r = makeReadyRenderer();
    r.loadImage("images/flower.png");
    expect(r._textureCache.has("images/flower.png")).toBe(true);
  });

  test("retorna la misma Promise para la misma src (caché)", () => {
    const r = makeReadyRenderer();
    const p1 = r.loadImage("images/a.png");
    const p2 = r.loadImage("images/a.png");
    expect(p1).toBe(p2);
  });

  test("distintas src crean entradas independientes", () => {
    const r = makeReadyRenderer();
    const p1 = r.loadImage("images/a.png");
    const p2 = r.loadImage("images/b.png");
    expect(p1).not.toBe(p2);
    expect(r._textureCache.size).toBe(2);
  });

  test("resuelve con la textura cuando load llama al callback de éxito", async () => {
    const fakeTex = { minFilter: null, magFilter: null };
    THREE.TextureLoader.mockImplementation(function () {
      return { load: vi.fn((_src, onSuccess) => onSuccess(fakeTex)) };
    });
    const r = makeReadyRenderer();
    const result = await r.loadImage("images/test.png");
    expect(result).toBe(fakeTex);
    expect(result.minFilter).toBe(1006); // LinearFilter
    expect(result.magFilter).toBe(1006);
  });

  test("resuelve con null cuando load llama al callback de error", async () => {
    THREE.TextureLoader.mockImplementation(function () {
      return {
        load: vi.fn((_src, _ok, _prog, onError) => onError(new Error("net"))),
      };
    });
    const r = makeReadyRenderer();
    const result = await r.loadImage("images/broken.png");
    expect(result).toBeNull();
  });
});

// ─── clearImageCache ──────────────────────────────────────────────────────────

describe("ThreeRenderer.clearImageCache", () => {
  test("vacía la caché de texturas", () => {
    const r = makeReadyRenderer();
    r._textureCache.set("a.png", Promise.resolve(null));
    r._textureCache.set("b.png", Promise.resolve(null));
    r.clearImageCache();
    expect(r._textureCache.size).toBe(0);
  });

  test("llama a dispose() en cada textura resuelta", async () => {
    const r = makeReadyRenderer();
    const tex = { dispose: vi.fn() };
    r._textureCache.set("test.png", Promise.resolve(tex));
    r.clearImageCache();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tex.dispose).toHaveBeenCalledTimes(1);
  });

  test("no lanza si la caché está vacía", () => {
    const r = makeReadyRenderer();
    expect(() => r.clearImageCache()).not.toThrow();
  });
});

// ─── flush ────────────────────────────────────────────────────────────────────

describe("ThreeRenderer.flush", () => {
  test("llama a webgl.render en cada flush", () => {
    const r = makeReadyRenderer();
    r.flush();
    expect(r._webgl.render).toHaveBeenCalledTimes(1);
  });

  test("vacía _imageQueue después de flush", () => {
    const r = makeReadyRenderer();
    r.drawImage({ id: "tex" }, 100, 100, 50, 1, 0, 0);
    r.flush();
    expect(r._imageQueue).toHaveLength(0);
  });

  test("vacía _glowQueue después de flush", () => {
    const r = makeReadyRenderer();
    r.drawGlow(100, 100, 80, 0.5, "#fff");
    r.flush();
    expect(r._glowQueue).toHaveLength(0);
  });

  test("vacía _particleQueue después de flush", () => {
    const r = makeReadyRenderer();
    r.drawParticle(100, 100, 4, 0.4, "#f00");
    r.flush();
    expect(r._particleQueue).toHaveLength(0);
  });

  test("crea sprites en el pool cuando hay imágenes en la cola", () => {
    const r = makeReadyRenderer();
    r.drawImage({ id: "tex" }, 960, 540, 80, 1, 0, 0);
    r.flush();
    expect(r._sprites).toHaveLength(1);
    expect(r._sprites[0].visible).toBe(true);
  });

  test("aplica Z-depth correcto según ring: ring 2 → z = -70", () => {
    const r = makeReadyRenderer();
    r.setSlotMetadata([{ ring: 2 }]);
    r.drawImage({ id: "tex" }, 960, 540, 80, 1, 0, 0);
    r.flush();
    expect(r._sprites[0].position.set).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      -70, // 2 * (-35)
    );
  });

  test("convierte coordenadas: centro del canvas (960, 540) → (0, 0) en Three.js", () => {
    const r = makeReadyRenderer();
    r.setSlotMetadata([{ ring: 0 }]);
    r.drawImage({ id: "tex" }, 960, 540, 80, 1, 0, 0);
    r.flush();
    // Usar toBeCloseTo para manejar -0 vs 0 (JavaScript distingue -(0) = -0)
    const [wx, wy, wz] = r._sprites[0].position.set.mock.calls[0];
    expect(wx).toBeCloseTo(0, 5);
    expect(wy).toBeCloseTo(0, 5);
    expect(wz).toBeCloseTo(0, 5);
  });

  test("oculta sprites del pool que no se usaron en este frame", () => {
    const r = makeReadyRenderer();
    const makeMesh = () => ({
      visible: true,
      position: { set: vi.fn() },
      rotation: { z: 0 },
      scale: { set: vi.fn() },
      material: { dispose: vi.fn(), needsUpdate: false, map: null, opacity: 1 },
    });
    r._sprites = [makeMesh(), makeMesh(), makeMesh()];
    r.drawImage({ id: "tex" }, 100, 100, 50, 1, 0, 0);
    r.flush();
    expect(r._sprites[0].visible).toBe(true); // usada
    expect(r._sprites[1].visible).toBe(false); // oculta
    expect(r._sprites[2].visible).toBe(false); // oculta
  });

  test("crea meshes de glow cuando hay comandos drawGlow", () => {
    const r = makeReadyRenderer();
    r.drawGlow(400, 300, 120, 0.5, "#ffffff");
    r.flush();
    expect(r._glowMeshes).toHaveLength(1);
    expect(r._glowMeshes[0].visible).toBe(true);
  });

  test("oculta glow meshes del pool que no se usaron en este frame", () => {
    const r = makeReadyRenderer();
    const makeMesh = () => ({
      visible: true,
      position: { set: vi.fn() },
      scale: { set: vi.fn() },
      material: { dispose: vi.fn(), opacity: 1 },
    });
    r._glowMeshes = [makeMesh(), makeMesh(), makeMesh()];
    r.drawGlow(100, 100, 80, 0.5, "#fff"); // solo 1 glow → 2 meshes quedan sin usar
    r.flush();
    expect(r._glowMeshes[0].visible).toBe(true); // usada
    expect(r._glowMeshes[1].visible).toBe(false); // oculta
    expect(r._glowMeshes[2].visible).toBe(false); // oculta
  });

  test("actualiza la posición del buffer de partículas (slot 0 → posición correcta)", () => {
    const r = makeReadyRenderer();
    // Partícula en (200, 100): wx = 200-960 = -760, wy = -(100-540) = 440, z = 5
    r.drawParticle(200, 100, 6, 0.4, "#ff0000");
    r.flush();
    const pos = r._particlePoints.geometry.attributes.position.array;
    expect(pos[0]).toBeCloseTo(-760, 3);
    expect(pos[1]).toBeCloseTo(440, 3);
    expect(pos[2]).toBe(5);
  });

  test("llama a webgl.render incluso con colas vacías", () => {
    const r = makeReadyRenderer();
    r.flush();
    expect(r._webgl.render).toHaveBeenCalledTimes(1);
  });
});

// ─── init ─────────────────────────────────────────────────────────────────────

describe("ThreeRenderer.init", () => {
  test("llama a onReady al completar la inicialización", () => {
    const r = new ThreeRenderer();
    const onReady = vi.fn();
    r.init("canvas-container", 1920, 1080, onReady);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test("establece _canvasW y _canvasH desde los argumentos", () => {
    const r = new ThreeRenderer();
    r.init("canvas-container", 800, 600, vi.fn());
    expect(r._canvasW).toBe(800);
    expect(r._canvasH).toBe(600);
  });

  test("asigna _canvas desde domElement del WebGLRenderer", () => {
    const r = new ThreeRenderer();
    r.init("canvas-container", 1920, 1080, vi.fn());
    expect(r._canvas).not.toBeNull();
    expect(r.getCanvas()).toBe(r._canvas);
  });

  test("crea la escena, cámara y renderer WebGL", () => {
    const r = new ThreeRenderer();
    r.init("canvas-container", 1920, 1080, vi.fn());
    expect(r._scene).not.toBeNull();
    expect(r._camera).not.toBeNull();
    expect(r._webgl).not.toBeNull();
  });

  test("crea _sharedGeo, _glowTex y _particlePoints", () => {
    const r = new ThreeRenderer();
    r.init("canvas-container", 1920, 1080, vi.fn());
    expect(r._sharedGeo).not.toBeNull();
    expect(r._glowTex).not.toBeNull();
    expect(r._particlePoints).not.toBeNull();
  });

  test("monta el domElement del WebGLRenderer en el contenedor del DOM", () => {
    const r = new ThreeRenderer();
    r.init("canvas-container", 1920, 1080, vi.fn());
    expect(mockContainer.appendChild).toHaveBeenCalledTimes(1);
  });

  test("usa document.getElementById con el containerId correcto", () => {
    const r = new ThreeRenderer();
    r.init("my-container", 1920, 1080, vi.fn());
    expect(globalThis.document.getElementById).toHaveBeenCalledWith(
      "my-container",
    );
  });
});

// ─── destroy ──────────────────────────────────────────────────────────────────

describe("ThreeRenderer.destroy", () => {
  test("llama a dispose() en materiales de sprites y glows", () => {
    const r = makeReadyRenderer();
    const matImg = { dispose: vi.fn() };
    const matGlow = { dispose: vi.fn() };
    r._sprites = [{ material: matImg }];
    r._glowMeshes = [{ material: matGlow }];
    r.destroy();
    expect(matImg.dispose).toHaveBeenCalledTimes(1);
    expect(matGlow.dispose).toHaveBeenCalledTimes(1);
  });

  test("vacía los pools de sprites y glows", () => {
    const r = makeReadyRenderer();
    r._sprites = [{ material: { dispose: vi.fn() } }];
    r._glowMeshes = [{ material: { dispose: vi.fn() } }];
    r.destroy();
    expect(r._sprites).toHaveLength(0);
    expect(r._glowMeshes).toHaveLength(0);
  });

  test("llama a dispose() en _glowTex y la pone a null", () => {
    const r = makeReadyRenderer();
    const disp = vi.fn();
    r._glowTex = { dispose: disp };
    r.destroy();
    expect(disp).toHaveBeenCalledTimes(1);
    expect(r._glowTex).toBeNull();
  });

  test("llama a dispose() en _sharedGeo y la pone a null", () => {
    const r = makeReadyRenderer();
    const disp = vi.fn();
    r._sharedGeo = { dispose: disp };
    r.destroy();
    expect(disp).toHaveBeenCalledTimes(1);
    expect(r._sharedGeo).toBeNull();
  });

  test("llama a dispose() en _particlePoints geometry y material", () => {
    const r = makeReadyRenderer();
    const geoD = vi.fn();
    const matD = vi.fn();
    r._particlePoints = {
      geometry: { dispose: geoD, attributes: {} },
      material: { dispose: matD },
    };
    r.destroy();
    expect(geoD).toHaveBeenCalledTimes(1);
    expect(matD).toHaveBeenCalledTimes(1);
    expect(r._particlePoints).toBeNull();
  });

  test("llama a dispose() en _webgl y lo pone a null", () => {
    const r = makeReadyRenderer();
    const disp = vi.fn();
    r._webgl = { dispose: disp, domElement: { parentNode: null } };
    r.destroy();
    expect(disp).toHaveBeenCalledTimes(1);
    expect(r._webgl).toBeNull();
  });

  test("llama a removeChild si domElement tiene parentNode", () => {
    const r = makeReadyRenderer();
    const removeChild = vi.fn();
    const domElement = { parentNode: { removeChild } };
    r._webgl = { dispose: vi.fn(), domElement };
    r.destroy();
    expect(removeChild).toHaveBeenCalledWith(domElement);
  });

  test("no lanza si domElement no tiene parentNode", () => {
    const r = makeReadyRenderer();
    r._webgl = { dispose: vi.fn(), domElement: { parentNode: null } };
    expect(() => r.destroy()).not.toThrow();
  });

  test("pone _canvas y _scene a null", () => {
    const r = makeReadyRenderer();
    r._webgl = { dispose: vi.fn(), domElement: { parentNode: null } };
    r.destroy();
    expect(r._canvas).toBeNull();
    expect(r._scene).toBeNull();
  });

  test("no lanza si llamado con estado mínimo (sin sprites ni glows)", () => {
    const r = makeReadyRenderer();
    r._webgl = { dispose: vi.fn(), domElement: { parentNode: null } };
    expect(() => r.destroy()).not.toThrow();
  });

  test("no lanza si llamado sobre renderer no inicializado (todos los campos son null)", () => {
    // Cubre las ramas FALSE de los if en destroy():
    // if(_glowTex), if(_sharedGeo), if(_particlePoints), if(_webgl) → todos null
    const r = new ThreeRenderer();
    expect(() => r.destroy()).not.toThrow();
    expect(r._canvas).toBeNull();
    expect(r._scene).toBeNull();
  });
});
