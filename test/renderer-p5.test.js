import { describe, test, expect, vi, beforeEach } from "vitest";
import { P5Renderer } from "../js/renderer-p5.js";

// ─── Mock global de p5 ───────────────────────────────────────────────────────
// init() llama a `new p5(sketchFn)`. Reemplazamos p5 con una función que:
//   1. Ejecuta sketchFn(mockSketch) para que se registren setup y draw.
//   2. Llama a mockSketch.setup() para simular el arranque del canvas.
// De esta forma podemos testear init() sin la librería real de p5.

function makeMockSketch() {
  return {
    setup: null,
    draw: null,
    createCanvas: vi.fn(() => ({
      parent: vi.fn(),
      elt: { id: "mock-canvas" },
    })),
    imageMode: vi.fn(),
    angleMode: vi.fn(),
    noLoop: vi.fn(),
    redraw: vi.fn(),
    remove: vi.fn(),
    loadImage: vi.fn(),
    background: vi.fn(),
    clear: vi.fn(),
    push: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    tint: vi.fn(),
    image: vi.fn(),
    noTint: vi.fn(),
    pop: vi.fn(),
    CENTER: "CENTER",
    DEGREES: "DEGREES",
  };
}

// Instala el mock de p5 como global antes de que se ejecute cualquier test.
// Debe ser una función regular (no arrow) para poder ser llamada con `new`.
let lastSketch = null;
globalThis.p5 = vi.fn(function P5Mock(sketchFn) {
  lastSketch = makeMockSketch();
  sketchFn(lastSketch); // registra setup y draw en el sketch
  lastSketch.setup(); // dispara la creación del canvas
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Crea un mock de la instancia de p5 con los métodos mínimos que
 * _executeQueue() y flush() necesitan. No requiere la librería p5.js real.
 * Incluye drawingContext para los comandos "glow" y "particle".
 */
function makeP5Mock() {
  return {
    background: vi.fn(),
    clear: vi.fn(),
    push: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    tint: vi.fn(),
    image: vi.fn(),
    noTint: vi.fn(),
    pop: vi.fn(),
    redraw: vi.fn(),
    remove: vi.fn(),
    loadImage: vi.fn(),
    drawingContext: {
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      globalCompositeOperation: null,
      fillStyle: null,
    },
  };
}

/** Crea un P5Renderer con la instancia p5 ya inyectada (bypasa init()). */
function makeReadyRenderer() {
  const renderer = new P5Renderer();
  renderer._p = makeP5Mock();
  renderer._canvas = { id: "mock-canvas" };
  renderer._ready = true;
  return renderer;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe("P5Renderer — constructor", () => {
  test("inicializa con estado vacío y no listo", () => {
    const r = new P5Renderer();
    expect(r._p).toBeNull();
    expect(r._canvas).toBeNull();
    expect(r._drawQueue).toEqual([]);
    expect(r._ready).toBe(false);
  });
});

// ─── clear ────────────────────────────────────────────────────────────────────

describe("P5Renderer.clear", () => {
  test('encola un comando de tipo "clear" con el color indicado', () => {
    const r = makeReadyRenderer();
    r.clear("#1a0a2e");
    expect(r._drawQueue).toHaveLength(1);
    expect(r._drawQueue[0]).toEqual({ type: "clear", bgColor: "#1a0a2e" });
  });

  test("múltiples llamadas acumulan comandos en la cola", () => {
    const r = makeReadyRenderer();
    r.clear("#000");
    r.clear("#fff");
    expect(r._drawQueue).toHaveLength(2);
  });
});

// ─── drawImage ────────────────────────────────────────────────────────────────

describe("P5Renderer.drawImage", () => {
  test('encola un comando de tipo "image" con todos los parámetros', () => {
    const r = makeReadyRenderer();
    const img = { width: 100, height: 100 }; // mock de p5.Image
    r.drawImage(img, 960, 540, 80, 0.9, 45);
    expect(r._drawQueue).toHaveLength(1);
    expect(r._drawQueue[0]).toMatchObject({
      type: "image",
      img,
      x: 960,
      y: 540,
      size: 80,
      alpha: 0.9,
      rotDeg: 45,
    });
  });

  test("no encola nada si img es null", () => {
    const r = makeReadyRenderer();
    r.drawImage(null, 100, 100, 80, 1, 0);
    expect(r._drawQueue).toHaveLength(0);
  });

  test("no encola nada si img es undefined", () => {
    const r = makeReadyRenderer();
    r.drawImage(undefined, 100, 100, 80, 1, 0);
    expect(r._drawQueue).toHaveLength(0);
  });
});

// ─── getCanvas ────────────────────────────────────────────────────────────────

describe("P5Renderer.getCanvas", () => {
  test("devuelve el HTMLCanvasElement almacenado", () => {
    const r = makeReadyRenderer();
    expect(r.getCanvas()).toBe(r._canvas);
  });

  test("devuelve null antes de que init() sea llamado", () => {
    const r = new P5Renderer();
    expect(r.getCanvas()).toBeNull();
  });
});

// ─── flush ────────────────────────────────────────────────────────────────────

describe("P5Renderer.flush", () => {
  test("llama a p5.redraw() cuando el renderer está listo", () => {
    const r = makeReadyRenderer();
    r.flush();
    expect(r._p.redraw).toHaveBeenCalledTimes(1);
  });

  test("no llama a p5.redraw() si _ready es false", () => {
    const r = makeReadyRenderer();
    r._ready = false;
    r.flush();
    expect(r._p.redraw).not.toHaveBeenCalled();
  });
});

// ─── loadImage ────────────────────────────────────────────────────────────────

describe("P5Renderer.loadImage", () => {
  test("devuelve Promise<null> inmediatamente si src es cadena vacía", async () => {
    const r = makeReadyRenderer();
    const result = await r.loadImage("");
    expect(result).toBeNull();
  });

  test("devuelve Promise<null> si src es null", async () => {
    const r = makeReadyRenderer();
    const result = await r.loadImage(null);
    expect(result).toBeNull();
  });

  test("llama a p5.loadImage con la ruta indicada cuando src no está vacío", () => {
    const r = makeReadyRenderer();
    r.loadImage("images/ring1/frutilla.png");
    expect(r._p.loadImage).toHaveBeenCalledWith(
      "images/ring1/frutilla.png",
      expect.any(Function),
      expect.any(Function),
    );
  });

  test("resuelve con la imagen cuando p5.loadImage llama al callback de éxito", async () => {
    const r = makeReadyRenderer();
    const fakeImg = { width: 64, height: 64 };
    r._p.loadImage.mockImplementation((_src, onSuccess) => onSuccess(fakeImg));
    const result = await r.loadImage("images/ring1/frutilla.png");
    expect(result).toBe(fakeImg);
  });

  test("resuelve con null cuando p5.loadImage llama al callback de error", async () => {
    const r = makeReadyRenderer();
    r._p.loadImage.mockImplementation((_src, _onSuccess, onError) => onError());
    const result = await r.loadImage("images/ring1/roto.png");
    expect(result).toBeNull();
  });

  test("retorna el mismo Promise para la misma src (caché de imagen)", () => {
    const r = makeReadyRenderer();
    const p1 = r.loadImage("images/flower.png");
    const p2 = r.loadImage("images/flower.png");
    expect(p1).toBe(p2); // misma referencia — no se llama p5.loadImage dos veces
    expect(r._p.loadImage).toHaveBeenCalledTimes(1);
  });

  test("distintas src crean entradas independientes en la caché", () => {
    const r = makeReadyRenderer();
    const p1 = r.loadImage("images/a.png");
    const p2 = r.loadImage("images/b.png");
    expect(p1).not.toBe(p2);
    expect(r._p.loadImage).toHaveBeenCalledTimes(2);
  });
});

// ─── destroy ─────────────────────────────────────────────────────────────────

describe("P5Renderer.destroy", () => {
  test("llama a p5.remove() y limpia todas las referencias", () => {
    const r = makeReadyRenderer();
    r._drawQueue = [{ type: "clear", bgColor: "#000" }];
    r.destroy();
    expect(r._p).toBeNull();
    expect(r._canvas).toBeNull();
    expect(r._drawQueue).toEqual([]);
    expect(r._ready).toBe(false);
  });

  test("limpia la caché de imágenes al destruir", () => {
    const r = makeReadyRenderer();
    r._imageCache.set("test.png", Promise.resolve(null));
    expect(r._imageCache.size).toBe(1);
    r.destroy();
    expect(r._imageCache.size).toBe(0);
  });

  test("no lanza error si _p ya es null (doble destroy)", () => {
    const r = new P5Renderer(); // _p = null
    expect(() => r.destroy()).not.toThrow();
  });
});

// ─── _executeQueue ────────────────────────────────────────────────────────────

describe("P5Renderer._executeQueue", () => {
  test('ejecuta p5.background para comandos de tipo "clear"', () => {
    const r = makeReadyRenderer();
    r._drawQueue = [{ type: "clear", bgColor: "#123456" }];
    r._executeQueue();
    expect(r._p.background).toHaveBeenCalledWith("#123456");
  });

  test('ejecuta p5.clear() (sin background) cuando bgColor es "transparent"', () => {
    const r = makeReadyRenderer();
    r._drawQueue = [{ type: "clear", bgColor: "transparent" }];
    r._executeQueue();
    expect(r._p.clear).toHaveBeenCalledTimes(1);
    expect(r._p.background).not.toHaveBeenCalled();
  });

  test('ejecuta push/translate/rotate/tint/image/noTint/pop para comandos "image"', () => {
    const r = makeReadyRenderer();
    const img = { width: 80, height: 80 };
    r._drawQueue = [
      { type: "image", img, x: 200, y: 300, size: 80, alpha: 0.8, rotDeg: 30 },
    ];
    r._executeQueue();
    const p = r._p;
    expect(p.push).toHaveBeenCalled();
    expect(p.translate).toHaveBeenCalledWith(200, 300);
    expect(p.rotate).toHaveBeenCalledWith(30);
    expect(p.tint).toHaveBeenCalledWith(255, 0.8 * 255);
    expect(p.image).toHaveBeenCalledWith(img, 0, 0, 80, 80);
    expect(p.noTint).toHaveBeenCalled();
    expect(p.pop).toHaveBeenCalled();
  });

  test("vacía la cola después de ejecutar", () => {
    const r = makeReadyRenderer();
    r._drawQueue = [{ type: "clear", bgColor: "#000" }];
    r._executeQueue();
    expect(r._drawQueue).toHaveLength(0);
  });

  test("procesa múltiples comandos en orden", () => {
    const r = makeReadyRenderer();
    const img = { width: 64, height: 64 };
    r._drawQueue = [
      { type: "clear", bgColor: "#000" },
      { type: "image", img, x: 100, y: 100, size: 64, alpha: 1, rotDeg: 0 },
      { type: "clear", bgColor: "#fff" },
    ];
    r._executeQueue();
    expect(r._p.background).toHaveBeenCalledTimes(2);
    expect(r._p.image).toHaveBeenCalledTimes(1);
  });

  test("no hace nada con una cola vacía", () => {
    const r = makeReadyRenderer();
    expect(() => r._executeQueue()).not.toThrow();
    expect(r._p.background).not.toHaveBeenCalled();
    expect(r._p.image).not.toHaveBeenCalled();
  });

  test("ignora comandos de tipo desconocido sin lanzar error (rama else implícita)", () => {
    const r = makeReadyRenderer();
    r._drawQueue = [{ type: "unknown" }];
    expect(() => r._executeQueue()).not.toThrow();
    expect(r._p.background).not.toHaveBeenCalled();
    expect(r._p.image).not.toHaveBeenCalled();
  });
});

// ─── init ─────────────────────────────────────────────────────────────────────

describe("P5Renderer.init", () => {
  test("llama al constructor global p5 una vez", () => {
    const r = new P5Renderer();
    const onReady = vi.fn();
    r.init("canvas-container", 1920, 1080, onReady);
    expect(globalThis.p5).toHaveBeenCalledTimes(1);
  });

  test("llama al callback onReady tras completar setup", () => {
    const r = new P5Renderer();
    const onReady = vi.fn();
    r.init("canvas-container", 1920, 1080, onReady);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  test("marca _ready = true tras setup", () => {
    const r = new P5Renderer();
    r.init("canvas-container", 1920, 1080, vi.fn());
    expect(r._ready).toBe(true);
  });

  test("crea el canvas con las dimensiones correctas", () => {
    const r = new P5Renderer();
    r.init("canvas-container", 1920, 1080, vi.fn());
    expect(lastSketch.createCanvas).toHaveBeenCalledWith(1920, 1080);
  });

  test("registra sketch.draw que ejecuta la cola al ser llamado", () => {
    const r = new P5Renderer();
    r.init("canvas-container", 1920, 1080, vi.fn());
    // Poblar la cola y disparar draw manualmente
    r._drawQueue = [{ type: "clear", bgColor: "#000" }];
    lastSketch.draw();
    expect(lastSketch.background).toHaveBeenCalledWith("#000");
    expect(r._drawQueue).toHaveLength(0);
  });
});

// ─── T-02: pauseEffects / tickEffects / resumeEffects ─────────────────────────

describe("P5Renderer — efectos de export (pauseEffects / tickEffects / resumeEffects)", () => {
  test("pauseEffects existe y es callable sin lanzar error", () => {
    const r = makeReadyRenderer();
    expect(() => r.pauseEffects()).not.toThrow();
  });

  test("tickEffects existe y es callable con un argumento numérico sin lanzar error", () => {
    const r = makeReadyRenderer();
    expect(() => r.tickEffects(16.67)).not.toThrow();
  });

  test("resumeEffects existe y es callable sin lanzar error", () => {
    const r = makeReadyRenderer();
    expect(() => r.resumeEffects()).not.toThrow();
  });

  test("los tres métodos no afectan el estado interno del renderer (no-ops)", () => {
    const r = makeReadyRenderer();
    const queueBefore = r._drawQueue.length;
    r.pauseEffects();
    r.tickEffects(100);
    r.resumeEffects();
    expect(r._drawQueue).toHaveLength(queueBefore);
    expect(r._ready).toBe(true);
  });
});

// ─── T-05: drawGlow ───────────────────────────────────────────────────────────

describe("P5Renderer.drawGlow", () => {
  test('encola un comando de tipo "glow" con los parámetros correctos', () => {
    const r = makeReadyRenderer();
    r.drawGlow(500, 300, 120, 0.6, "#ff00ff");
    expect(r._drawQueue).toHaveLength(1);
    expect(r._drawQueue[0]).toMatchObject({
      type: "glow",
      x: 500,
      y: 300,
      size: 120,
      alpha: 0.6,
      colorHex: "#ff00ff",
    });
  });

  test("no encola si alpha <= 0", () => {
    const r = makeReadyRenderer();
    r.drawGlow(100, 100, 80, 0, "#ffffff");
    expect(r._drawQueue).toHaveLength(0);
  });

  test("no encola si el renderer no está listo", () => {
    const r = makeReadyRenderer();
    r._ready = false;
    r.drawGlow(100, 100, 80, 0.5, "#ffffff");
    expect(r._drawQueue).toHaveLength(0);
  });

  test("_executeQueue llama a createRadialGradient con centro y radio correctos", () => {
    const r = makeReadyRenderer();
    r._drawQueue = [
      {
        type: "glow",
        x: 200,
        y: 150,
        size: 100,
        alpha: 0.5,
        colorHex: "#ffffff",
      },
    ];
    r._executeQueue();
    const ctx = r._p.drawingContext;
    // radio = size / 2 = 50
    expect(ctx.createRadialGradient).toHaveBeenCalledWith(
      200,
      150,
      0,
      200,
      150,
      50,
    );
  });

  test("_executeQueue llama a ctx.save y ctx.restore para aislar el blending", () => {
    const r = makeReadyRenderer();
    r._drawQueue = [
      {
        type: "glow",
        x: 100,
        y: 100,
        size: 80,
        alpha: 0.4,
        colorHex: "#aabbcc",
      },
    ];
    r._executeQueue();
    const ctx = r._p.drawingContext;
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  test("_executeQueue llama a addColorStop dos veces (centro opaco y borde transparente)", () => {
    const r = makeReadyRenderer();
    const mockGrad = { addColorStop: vi.fn() };
    r._p.drawingContext.createRadialGradient.mockReturnValue(mockGrad);
    r._drawQueue = [
      {
        type: "glow",
        x: 100,
        y: 100,
        size: 80,
        alpha: 0.5,
        colorHex: "#ffffff",
      },
    ];
    r._executeQueue();
    expect(mockGrad.addColorStop).toHaveBeenCalledTimes(2);
    // Stop 0: color con alpha; Stop 1: color con alpha=0
    expect(mockGrad.addColorStop.mock.calls[0][0]).toBe(0);
    expect(mockGrad.addColorStop.mock.calls[1][0]).toBe(1);
    expect(mockGrad.addColorStop.mock.calls[1][1]).toContain("rgba");
    expect(mockGrad.addColorStop.mock.calls[1][1]).toContain(",0)");
  });

  test("vacía la cola tras procesar el comando glow", () => {
    const r = makeReadyRenderer();
    r._drawQueue = [
      {
        type: "glow",
        x: 100,
        y: 100,
        size: 80,
        alpha: 0.5,
        colorHex: "#ff0000",
      },
    ];
    r._executeQueue();
    expect(r._drawQueue).toHaveLength(0);
  });
});

// ─── T-06: drawParticle ───────────────────────────────────────────────────────

describe("P5Renderer.drawParticle", () => {
  test('encola un comando de tipo "particle" con los parámetros correctos', () => {
    const r = makeReadyRenderer();
    r.drawParticle(300, 400, 6, 0.7, "#f9a8d4");
    expect(r._drawQueue).toHaveLength(1);
    expect(r._drawQueue[0]).toMatchObject({
      type: "particle",
      x: 300,
      y: 400,
      size: 6,
      alpha: 0.7,
      colorHex: "#f9a8d4",
    });
  });

  test("no encola si alpha <= 0", () => {
    const r = makeReadyRenderer();
    r.drawParticle(100, 100, 4, 0, "#ffffff");
    expect(r._drawQueue).toHaveLength(0);
  });

  test("no encola si el renderer no está listo", () => {
    const r = makeReadyRenderer();
    r._ready = false;
    r.drawParticle(100, 100, 4, 0.5, "#ffffff");
    expect(r._drawQueue).toHaveLength(0);
  });

  test("_executeQueue llama a ctx.arc con las coordenadas y radio correctos", () => {
    const r = makeReadyRenderer();
    r._drawQueue = [
      {
        type: "particle",
        x: 150,
        y: 250,
        size: 8,
        alpha: 0.4,
        colorHex: "#c084fc",
      },
    ];
    r._executeQueue();
    const ctx = r._p.drawingContext;
    // radio = size / 2 = 4
    expect(ctx.arc).toHaveBeenCalledWith(150, 250, 4, 0, Math.PI * 2);
  });

  test("_executeQueue llama a ctx.save y ctx.restore", () => {
    const r = makeReadyRenderer();
    r._drawQueue = [
      {
        type: "particle",
        x: 100,
        y: 100,
        size: 4,
        alpha: 0.5,
        colorHex: "#ffffff",
      },
    ];
    r._executeQueue();
    const ctx = r._p.drawingContext;
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  test("_executeQueue llama a ctx.fill para dibujar el círculo", () => {
    const r = makeReadyRenderer();
    r._drawQueue = [
      {
        type: "particle",
        x: 100,
        y: 100,
        size: 4,
        alpha: 0.5,
        colorHex: "#fcd34d",
      },
    ];
    r._executeQueue();
    expect(r._p.drawingContext.fill).toHaveBeenCalled();
  });

  test("procesa glow y particle en la misma cola sin error", () => {
    const r = makeReadyRenderer();
    const mockGrad = { addColorStop: vi.fn() };
    r._p.drawingContext.createRadialGradient.mockReturnValue(mockGrad);
    r._drawQueue = [
      {
        type: "glow",
        x: 100,
        y: 100,
        size: 80,
        alpha: 0.5,
        colorHex: "#ffffff",
      },
      {
        type: "particle",
        x: 200,
        y: 200,
        size: 6,
        alpha: 0.4,
        colorHex: "#ff0000",
      },
    ];
    expect(() => r._executeQueue()).not.toThrow();
    expect(r._p.drawingContext.arc).toHaveBeenCalledTimes(2); // uno por glow, uno por particle
  });
});
