import { describe, test, expect, vi, beforeEach } from "vitest";
import { Animator } from "../js/animator.js";

// ─── Mock de globals del navegador ───────────────────────────────────────────
// Animator usa requestAnimationFrame / cancelAnimationFrame en play() y pause().
// Los reemplazamos con funciones controladas de Vitest.

globalThis.requestAnimationFrame = vi.fn(() => 1);
globalThis.cancelAnimationFrame = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRenderer() {
  return {
    clear: vi.fn(),
    drawImage: vi.fn(),
    flush: vi.fn(),
  };
}

function makeConfig(overrides = {}) {
  return {
    canvas: { width: 1920, height: 1080, bgColor: "#1a0a2e" },
    animation: {
      speed: 1.0,
      staggerDelay: 160,
      entryDuration: 700,
      entryEffect: "fadeIn",
      rotationSpeed: 0.04,
      loopAnimation: false,
      ...overrides,
    },
  };
}

function makeSlots(count = 3) {
  return Array.from({ length: count }, (_, i) => ({
    x: 100 + i * 50,
    y: 200 + i * 50,
    angleDeg: i * 30,
    ring: 0,
    slotIndex: i,
    imgSize: 80,
    imageSrc: `img${i}.png`,
    entranceOrder: i,
  }));
}

// ─── Estado inicial ───────────────────────────────────────────────────────────

describe("Animator — estado inicial", () => {
  test("_cx y _cy quedan precalculados desde config.canvas en el constructor", () => {
    const config = makeConfig()
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config)
    expect(animator._cx).toBe(config.canvas.width / 2)
    expect(animator._cy).toBe(config.canvas.height / 2)
  })

  test("elapsed comienza en 0", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(3),
      [null, null, null],
      makeConfig(),
    );
    expect(animator.elapsed).toBe(0);
  });

  test("isCompleted comienza en false", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(3),
      [null, null, null],
      makeConfig(),
    );
    expect(animator.isCompleted).toBe(false);
  });

  test("el estado interno de cada slot comienza invisible (alpha=0, scale=0, visible=false)", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(3),
      [null, null, null],
      makeConfig(),
    );
    animator._state.forEach((s) => {
      expect(s.alpha).toBe(0);
      expect(s.scale).toBe(0);
      expect(s.visible).toBe(false);
    });
  });
});

// ─── totalDurationMs ─────────────────────────────────────────────────────────

describe("Animator.totalDurationMs", () => {
  test("(slots-1) * staggerDelay + entryDuration con 3 slots", () => {
    // (3-1) * 160 + 700 = 1020
    const animator = new Animator(
      makeRenderer(),
      makeSlots(3),
      [null, null, null],
      makeConfig(),
    );
    expect(animator.totalDurationMs).toBe(1020);
  });

  test("con 1 slot equals entryDuration (sin stagger)", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(1),
      [null],
      makeConfig(),
    );
    expect(animator.totalDurationMs).toBe(700);
  });

  test("con 5 slots calcula correctamente", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(5),
      new Array(5).fill(null),
      makeConfig(),
    );
    expect(animator.totalDurationMs).toBe(4 * 160 + 700); // 1340
  });

  test("refleja cambios en entryDuration", () => {
    const config = makeConfig({ entryDuration: 1000 });
    const animator = new Animator(
      makeRenderer(),
      makeSlots(3),
      [null, null, null],
      config,
    );
    expect(animator.totalDurationMs).toBe(2 * 160 + 1000); // 1320
  });
});

// ─── setSpeed ─────────────────────────────────────────────────────────────────

describe("Animator.setSpeed", () => {
  test("actualiza config.animation.speed al valor indicado", () => {
    const config = makeConfig();
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      config,
    );
    animator.setSpeed(2.5);
    expect(config.animation.speed).toBe(2.5);
  });

  test("clampea a 0.1 cuando el valor es 0", () => {
    const config = makeConfig();
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      config,
    );
    animator.setSpeed(0);
    expect(config.animation.speed).toBe(0.1);
  });

  test("clampea a 0.1 cuando el valor es negativo", () => {
    const config = makeConfig();
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      config,
    );
    animator.setSpeed(-10);
    expect(config.animation.speed).toBe(0.1);
  });

  test("acepta valores válidos como 0.5 y 3.0", () => {
    const config = makeConfig();
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      config,
    );
    animator.setSpeed(0.5);
    expect(config.animation.speed).toBe(0.5);
    animator.setSpeed(3.0);
    expect(config.animation.speed).toBe(3.0);
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe("Animator.reset", () => {
  test("resetea elapsed a 0 tras avanzar frames", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(2),
      [null, null],
      makeConfig(),
    );
    animator.tickExport(400);
    expect(animator.elapsed).toBeGreaterThan(0);
    animator.reset();
    expect(animator.elapsed).toBe(0);
  });

  test("resetea _completed a false", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(1),
      [null],
      makeConfig(),
    );
    animator._completed = true;
    animator.reset();
    expect(animator.isCompleted).toBe(false);
  });

  test("resetea el estado visual de todos los slots", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(3),
      [null, null, null],
      makeConfig(),
    );
    animator.tickExport(800); // avanza para que algunos slots sean visibles
    animator.reset();
    animator._state.forEach((s) => {
      expect(s.alpha).toBe(0);
      expect(s.scale).toBe(0);
      expect(s.extraRotDeg).toBe(0);
      expect(s.visible).toBe(false);
    });
  });

  test("cancela el RAF activo al resetear", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      makeConfig(),
    );
    animator._rafId = 42;
    animator._running = true;
    animator.reset();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
    expect(animator._running).toBe(false);
  });
});

// ─── tickExport ───────────────────────────────────────────────────────────────

describe("Animator.tickExport", () => {
  test("avanza elapsed por frameDeltaMs * speed (speed=1)", () => {
    const config = makeConfig({ speed: 1.0 });
    const animator = new Animator(
      makeRenderer(),
      makeSlots(2),
      [null, null],
      config,
    );
    animator.tickExport(100);
    expect(animator.elapsed).toBeCloseTo(100);
  });

  test("respeta el multiplicador de velocidad (speed=2)", () => {
    const config = makeConfig({ speed: 2.0 });
    const animator = new Animator(
      makeRenderer(),
      makeSlots(2),
      [null, null],
      config,
    );
    animator.tickExport(100);
    expect(animator.elapsed).toBeCloseTo(200); // 100 * 2.0
  });

  test("acumula elapsed en múltiples ticks", () => {
    const config = makeConfig({ speed: 1.0 });
    const animator = new Animator(
      makeRenderer(),
      makeSlots(2),
      [null, null],
      config,
    );
    animator.tickExport(100);
    animator.tickExport(100);
    animator.tickExport(100);
    expect(animator.elapsed).toBeCloseTo(300);
  });

  test("llama a renderer.clear con el color de fondo en cada frame", () => {
    const renderer = makeRenderer();
    const animator = new Animator(
      renderer,
      makeSlots(2),
      [null, null],
      makeConfig(),
    );
    animator.tickExport(16);
    expect(renderer.clear).toHaveBeenCalledWith("#1a0a2e");
  });

  test("llama a renderer.flush en cada frame", () => {
    const renderer = makeRenderer();
    const animator = new Animator(
      renderer,
      makeSlots(2),
      [null, null],
      makeConfig(),
    );
    animator.tickExport(16);
    expect(renderer.flush).toHaveBeenCalled();
  });

  test("dibuja el slot 0 cuando elapsed > 0 (su stagger comienza en 0 ms)", () => {
    // slot0.startMs = 0*160 = 0; con elapsed>0, t>0 → drawImage llamado
    const renderer = makeRenderer();
    const config = makeConfig({ speed: 1.0 });
    const animator = new Animator(renderer, makeSlots(2), [null, null], config);
    animator.tickExport(50);
    expect(renderer.drawImage).toHaveBeenCalled();
  });

  test("no dibuja slots cuyo stagger aún no llegó", () => {
    // staggerDelay=1000: slot1.startMs=1000, elapsed=50 → slot1 no visible
    const renderer = makeRenderer();
    const config = makeConfig({ staggerDelay: 1000, speed: 1.0 });
    const animator = new Animator(renderer, makeSlots(2), [null, null], config);
    animator.tickExport(50); // slot0 visible, slot1 no
    expect(renderer.drawImage).toHaveBeenCalledTimes(1);
  });

  test("incrementa _globalRot en cada tick (animación rotacional)", () => {
    const config = makeConfig({ rotationSpeed: 0.04 });
    const animator = new Animator(
      makeRenderer(),
      makeSlots(2),
      [null, null],
      config,
    );
    animator.tickExport(16);
    // _globalRot += rotationSpeed por cada _advanceTime
    expect(animator._globalRot).toBeCloseTo(0.04);
  });
});

// ─── pause y resume ───────────────────────────────────────────────────────────

describe("Animator.pause", () => {
  test("marca _running como false y cancela el RAF", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      makeConfig(),
    );
    animator._rafId = 7;
    animator._running = true;
    animator.pause();
    expect(animator._running).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
  });
});

describe("Animator.resume", () => {
  test("no lanza RAF adicional si ya está corriendo", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      makeConfig(),
    );
    animator._running = true;
    const callsBefore = requestAnimationFrame.mock.calls.length;
    animator.resume();
    expect(requestAnimationFrame.mock.calls.length).toBe(callsBefore);
  });

  test("lanza RAF y marca _running=true si estaba pausado", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      makeConfig(),
    );
    animator._running = false;
    const callsBefore = requestAnimationFrame.mock.calls.length;
    animator.resume();
    expect(requestAnimationFrame.mock.calls.length).toBeGreaterThan(
      callsBefore,
    );
    expect(animator._running).toBe(true);
  });
});

// ─── Efectos de entrada ───────────────────────────────────────────────────────

describe("Animator — efectos de entrada", () => {
  function advanceUntilVisible(animator, targetSlot = 0) {
    // Avanza el tiempo hasta que el slot objetivo está completamente visible (t=1)
    const { staggerDelay, entryDuration } = animator._config.animation;
    const needed = targetSlot * staggerDelay + entryDuration + 1;
    animator.tickExport(needed);
  }

  test("fadeIn: alpha llega a 1 cuando t=1, scale permanece en 1", () => {
    const config = makeConfig({ entryEffect: "fadeIn", staggerDelay: 0 });
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    advanceUntilVisible(animator, 0);
    expect(animator._state[0].alpha).toBeCloseTo(1, 2);
    expect(animator._state[0].scale).toBe(1);
  });

  test("scaleIn: alpha y scale llegan a ≈1 cuando t=1", () => {
    const config = makeConfig({ entryEffect: "scaleIn", staggerDelay: 0 });
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    advanceUntilVisible(animator, 0);
    expect(animator._state[0].alpha).toBeCloseTo(1, 1);
    // easeOutBack puede superar 1 brevemente, pero en t=1 debe ser exactamente 1
    expect(animator._state[0].scale).toBeCloseTo(1, 1);
  });

  test("spinIn: extraRotDeg llega a 0 cuando t=1 (partía de 270°)", () => {
    const config = makeConfig({ entryEffect: "spinIn", staggerDelay: 0 });
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    advanceUntilVisible(animator, 0);
    expect(animator._state[0].extraRotDeg).toBeCloseTo(0, 5);
  });

  test("flyIn: alpha llega a 1 y extraRotDeg es 0 cuando t=1", () => {
    const config = makeConfig({ entryEffect: "flyIn", staggerDelay: 0 });
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    advanceUntilVisible(animator, 0);
    expect(animator._state[0].alpha).toBeCloseTo(1, 1);
    expect(animator._state[0].extraRotDeg).toBe(0);
  });

  test("flyIn interpola la posición cuando t está entre 0 y 1 (rama t < 1)", () => {
    // Con staggerDelay=0, entryDuration=700: tickExport(350) → t = 0.5
    const config = makeConfig({
      entryEffect: "flyIn",
      staggerDelay: 0,
      speed: 1.0,
    });
    const renderer = makeRenderer();
    const slots = makeSlots(1); // slot.x = 100, slot.y = 200
    const animator = new Animator(renderer, slots, [null], config);
    animator.tickExport(350);

    expect(renderer.drawImage).toHaveBeenCalled();
    const [, finalX, finalY] = renderer.drawImage.mock.calls[0];
    // easeOutCubic(0.5) = 1-(0.5)^3 = 0.875
    // finalX = 960 + (100 - 960) * 0.875 ≈ 207.5  →  entre 100 y 960
    // finalY = 540 + (200 - 540) * 0.875 ≈ 242.5  →  entre 200 y 540
    expect(finalX).toBeGreaterThan(100);
    expect(finalX).toBeLessThan(960);
    expect(finalY).toBeGreaterThan(200);
    expect(finalY).toBeLessThan(540);
  });
});

// ─── play ─────────────────────────────────────────────────────────────────────

describe("Animator.play", () => {
  test("registra callbacks, marca _running=true y lanza el RAF loop", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      makeConfig(),
    );
    const onFrame = vi.fn();
    const onComplete = vi.fn();
    animator.play(onFrame, onComplete);
    expect(animator._running).toBe(true);
    expect(animator._onFrame).toBe(onFrame);
    expect(animator._onComplete).toBe(onComplete);
    expect(requestAnimationFrame).toHaveBeenCalled();
  });

  test("sin callbacks: establece onFrame y onComplete como null", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(),
      [null, null, null],
      makeConfig(),
    );
    animator.play();
    expect(animator._onFrame).toBeNull();
    expect(animator._onComplete).toBeNull();
    expect(animator._running).toBe(true);
  });
});

// ─── _tick (RAF loop interno) ─────────────────────────────────────────────────

describe("Animator._tick", () => {
  // Helper: crea un animator listo para que _tick funcione correctamente
  function tickingAnimator(configOverrides = {}, slotCount = 2) {
    const slots = makeSlots(slotCount);
    const animator = new Animator(
      makeRenderer(),
      slots,
      new Array(slotCount).fill(null),
      makeConfig(configOverrides),
    );
    animator._running = true;
    animator._lastTs = null;
    return animator;
  }

  test("retorna sin hacer nada si _running es false", () => {
    const animator = tickingAnimator();
    const renderer = animator._renderer;
    animator._running = false;
    animator._tick(0);
    expect(renderer.clear).not.toHaveBeenCalled();
  });

  test("establece _lastTs en la primera llamada (delta = 0, no avanza elapsed)", () => {
    const animator = tickingAnimator();
    animator._tick(500);
    expect(animator._lastTs).toBe(500);
    expect(animator.elapsed).toBe(0); // delta = 500 - 500 = 0
  });

  test("avanza elapsed con el delta entre llamadas sucesivas", () => {
    const animator = tickingAnimator();
    animator._tick(0); // establece _lastTs = 0
    animator._tick(100); // delta = 100ms, speed = 1.0 → elapsed += 100
    expect(animator.elapsed).toBeCloseTo(100);
  });

  test("llama onFrame con elapsed y totalDurationMs en cada tick", () => {
    const animator = tickingAnimator();
    const onFrame = vi.fn();
    animator._onFrame = onFrame;
    animator._tick(0);
    animator._tick(50);
    expect(onFrame).toHaveBeenCalledWith(
      expect.any(Number),
      animator.totalDurationMs,
    );
  });

  test("no llama onFrame si no hay callback registrado", () => {
    const animator = tickingAnimator();
    animator._onFrame = null;
    // No debe lanzar ningún error
    expect(() => {
      animator._tick(0);
      animator._tick(50);
    }).not.toThrow();
  });

  test("marca isCompleted=true cuando elapsed supera totalDurationMs", () => {
    // entryDuration=100, staggerDelay=0, 1 slot → totalDurationMs = 100
    const animator = tickingAnimator(
      { entryDuration: 100, staggerDelay: 0 },
      1,
    );
    animator._tick(0);
    animator._tick(200); // +200ms > 100ms total
    expect(animator.isCompleted).toBe(true);
  });

  test("llama onComplete cuando la animación llega a su fin", () => {
    const animator = tickingAnimator(
      { entryDuration: 100, staggerDelay: 0 },
      1,
    );
    const onComplete = vi.fn();
    animator._onComplete = onComplete;
    animator._tick(0);
    animator._tick(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  test("no llama onComplete si no hay callback registrado", () => {
    const animator = tickingAnimator(
      { entryDuration: 100, staggerDelay: 0 },
      1,
    );
    animator._onComplete = null;
    expect(() => {
      animator._tick(0);
      animator._tick(200);
    }).not.toThrow();
  });

  test("cuando loopAnimation=true: resetea elapsed y no marca como completado", () => {
    const animator = tickingAnimator(
      { entryDuration: 100, staggerDelay: 0, loopAnimation: true },
      1,
    );
    animator._tick(0);
    animator._tick(200); // completa y resetea
    expect(animator.elapsed).toBe(0);
    expect(animator.isCompleted).toBe(false);
  });

  test("cuando loopAnimation=false: queda marcado como completado", () => {
    const animator = tickingAnimator(
      { entryDuration: 100, staggerDelay: 0, loopAnimation: false },
      1,
    );
    animator._tick(0);
    animator._tick(200);
    expect(animator.isCompleted).toBe(true);
  });

  test("registra un nuevo RAF al final de cada tick", () => {
    const animator = tickingAnimator();
    animator._tick(0);
    expect(requestAnimationFrame).toHaveBeenCalled();
  });
});
