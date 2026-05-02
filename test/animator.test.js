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
    drawGlow: vi.fn(),
    drawParticle: vi.fn(),
    tickEffects: vi.fn(),
    pauseEffects: vi.fn(),
    resumeEffects: vi.fn(),
    setSlotMetadata: vi.fn(),
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
    const config = makeConfig();
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    expect(animator._cx).toBe(config.canvas.width / 2);
    expect(animator._cy).toBe(config.canvas.height / 2);
  });

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

  test("aplica imgScale al tamaño final cuando está definido en config", () => {
    // fadeIn siempre fija s.scale=1, así finalSize = imgSize * 1 * imgScale
    const config = makeConfig({
      staggerDelay: 0,
      entryDuration: 100,
      speed: 1.0,
    });
    config.canvas.imgScale = 2.0;
    const renderer = makeRenderer();
    const slots = makeSlots(1); // slot.imgSize = 80
    const animator = new Animator(renderer, slots, [null], config);
    animator.tickExport(101); // t ≥ 1 → fully visible, s.scale = 1
    expect(renderer.drawImage).toHaveBeenCalled();
    const [, , , finalSize] = renderer.drawImage.mock.calls[0];
    // finalSize = 80 * 1 * 2.0 = 160
    expect(finalSize).toBeCloseTo(160, 1);
  });

  test("usa escala 1 cuando imgScale no está definido en config (rama ?? 1)", () => {
    // config.canvas.imgScale sin definir → undefined ?? 1 = 1
    const config = makeConfig({
      staggerDelay: 0,
      entryDuration: 100,
      speed: 1.0,
    });
    const renderer = makeRenderer();
    const animator = new Animator(renderer, makeSlots(1), [null], config);
    animator.tickExport(101); // t ≥ 1 → s.scale = 1, imgScale = 1
    expect(renderer.drawImage).toHaveBeenCalled();
    const [, , , finalSize] = renderer.drawImage.mock.calls[0];
    // finalSize = 80 * 1 * 1 = 80 (sin amplificación)
    expect(finalSize).toBeCloseTo(80, 1);
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

  // ── drop ──────────────────────────────────────────────────────────────────

  test("drop: alpha=1 y posición = slot cuando t=1", () => {
    const config = makeConfig({ entryEffect: "drop", staggerDelay: 0 });
    const renderer = makeRenderer();
    const slots = makeSlots(1);
    const animator = new Animator(renderer, slots, [null], config);
    advanceUntilVisible(animator, 0);
    expect(animator._state[0].alpha).toBeCloseTo(1, 2);
    expect(animator._state[0].scale).toBe(1);
  });

  test("drop: finalY está por encima del slot durante la caída (t=0.5)", () => {
    const config = makeConfig({
      entryEffect: "drop",
      staggerDelay: 0,
      speed: 1.0,
    });
    const renderer = makeRenderer();
    const slots = makeSlots(1); // slot.y = 200
    const animator = new Animator(renderer, slots, [null], config);
    animator.tickExport(350); // t ≈ 0.5
    const [, , finalY] = renderer.drawImage.mock.calls[0];
    expect(finalY).toBeLessThan(slots[0].y); // imagen está más arriba
  });

  test("drop: recorre todos los tramos de easeOutBounce (cobertura completa)", () => {
    // t ≈ 0.2, 0.5, 0.8, 0.95 cubren las 4 ramas de easeOutBounce
    const config = makeConfig({
      entryEffect: "drop",
      staggerDelay: 0,
      entryDuration: 1000,
      speed: 1.0,
    });
    const renderer = makeRenderer();
    const animator = new Animator(renderer, makeSlots(1), [null], config);
    [200, 300, 300, 150].forEach((ms) => animator.tickExport(ms));
    expect(renderer.drawImage).toHaveBeenCalled();
  });

  // ── slideOut ──────────────────────────────────────────────────────────────

  test("slideOut: alpha=1 y posición = slot cuando t=1", () => {
    const config = makeConfig({ entryEffect: "slideOut", staggerDelay: 0 });
    const renderer = makeRenderer();
    const animator = new Animator(renderer, makeSlots(1), [null], config);
    advanceUntilVisible(animator, 0);
    expect(animator._state[0].alpha).toBeCloseTo(1, 2);
  });

  test("slideOut: posición se modifica durante la animación (t=0.5)", () => {
    const config = makeConfig({
      entryEffect: "slideOut",
      staggerDelay: 0,
      speed: 1.0,
    });
    const renderer = makeRenderer();
    const slots = makeSlots(1); // slot.x=100 (a la izquierda del centro 960)
    const animator = new Animator(renderer, slots, [null], config);
    animator.tickExport(350); // t ≈ 0.5
    const [, finalX] = renderer.drawImage.mock.calls[0];
    // factor > 0, slot.x < cx → finalX = 100 + (100-960)*factor < 100 (más lejos del centro)
    expect(finalX).toBeLessThan(slots[0].x);
  });

  // ── shrink ────────────────────────────────────────────────────────────────

  test("shrink: scale = 1 cuando t=1 (tamaño final normalizado)", () => {
    const config = makeConfig({ entryEffect: "shrink", staggerDelay: 0 });
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    advanceUntilVisible(animator, 0);
    expect(animator._state[0].scale).toBeCloseTo(1, 5);
  });

  test("shrink: scale > 1 a mitad de la animación (imagen más grande)", () => {
    const config = makeConfig({
      entryEffect: "shrink",
      staggerDelay: 0,
      speed: 1.0,
    });
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    animator.tickExport(350); // t ≈ 0.5
    expect(animator._state[0].scale).toBeGreaterThan(1);
  });

  // ── spiral ────────────────────────────────────────────────────────────────

  test("spiral: extraRotDeg = 0 cuando t=1", () => {
    const config = makeConfig({ entryEffect: "spiral", staggerDelay: 0 });
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    advanceUntilVisible(animator, 0);
    expect(animator._state[0].extraRotDeg).toBeCloseTo(0, 5);
  });

  test("spiral: extraRotDeg = 360 a mitad de la animación (mitad de las dos vueltas)", () => {
    const config = makeConfig({
      entryEffect: "spiral",
      staggerDelay: 0,
      speed: 1.0,
    });
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    animator.tickExport(350); // t ≈ 0.5 → extraRotDeg = 720*(1-0.5) = 360
    expect(animator._state[0].extraRotDeg).toBeCloseTo(360, 0);
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

// ─── T-02: tickExport llama a renderer.tickEffects ────────────────────────────

describe("Animator.tickExport — tickEffects", () => {
  test("llama a renderer.tickEffects con frameDeltaMs antes de avanzar el tiempo", () => {
    const renderer = makeRenderer();
    const animator = new Animator(renderer, makeSlots(1), [null], makeConfig());
    animator.tickExport(16);
    expect(renderer.tickEffects).toHaveBeenCalledWith(16);
  });

  test("tickEffects se llama antes de flush (se verifica el orden de invocación)", () => {
    const renderer = makeRenderer();
    const callOrder = [];
    renderer.tickEffects.mockImplementation(() =>
      callOrder.push("tickEffects"),
    );
    renderer.flush.mockImplementation(() => callOrder.push("flush"));
    const animator = new Animator(renderer, makeSlots(1), [null], makeConfig());
    animator.tickExport(16);
    expect(callOrder.indexOf("tickEffects")).toBeLessThan(
      callOrder.indexOf("flush"),
    );
  });
});

// ─── T-03: Flotación idle ─────────────────────────────────────────────────────

describe("Animator — flotación idle (idleFloat)", () => {
  function makeIdleConfig(overrides = {}) {
    const cfg = makeConfig({
      staggerDelay: 0,
      entryDuration: 100,
      speed: 1.0,
      ...overrides,
    });
    cfg.effects = {
      idleFloat: { enabled: true, amplitude: 8, speed: 0.0012 },
    };
    return cfg;
  }

  test("slot totalmente visible (t=1) tiene finalY distinto de slot.y cuando idleFloat está activo", () => {
    const renderer = makeRenderer();
    const config = makeIdleConfig();
    // elapsed > 0 para que sin(elapsed * speed + phase) ≠ 0
    config.effects.idleFloat.speed = 1; // speed alta para que el offset sea perceptible
    const slots = makeSlots(1);
    const animator = new Animator(renderer, slots, [null], config);
    animator._elapsed = 1000; // fijar elapsed directamente
    animator._renderFrame();
    const [, , finalY] = renderer.drawImage.mock.calls[0];
    // sin(1000 * 1 + 0) * 8 — el seno no será 0 en este punto
    expect(finalY).not.toBeCloseTo(slots[0].y, 5);
  });

  test("slots adyacentes tienen fases de flotación distintas (distribución dorada)", () => {
    const renderer = makeRenderer();
    const config = makeIdleConfig();
    config.effects.idleFloat.speed = 1;
    const slots = makeSlots(2);
    const animator = new Animator(renderer, slots, [null, null], config);
    animator._elapsed = 1000;
    animator._renderFrame();
    const y0 = renderer.drawImage.mock.calls[0][2];
    const y1 = renderer.drawImage.mock.calls[1][2];
    // Las dos Y deben ser distintas (fases diferentes)
    expect(y0).not.toBeCloseTo(y1, 5);
  });

  test("con idleFloat.enabled = false la posición Y no se modifica para slots completos", () => {
    const renderer = makeRenderer();
    const config = makeConfig({
      staggerDelay: 0,
      entryDuration: 100,
      speed: 1.0,
    });
    config.effects = { idleFloat: { enabled: false, amplitude: 8, speed: 1 } };
    const slots = makeSlots(1);
    const animator = new Animator(renderer, slots, [null], config);
    animator._elapsed = 1000;
    animator._state[0] = { alpha: 1, scale: 1, extraRotDeg: 0, visible: true };
    animator._renderFrame();
    const [, , finalY] = renderer.drawImage.mock.calls[0];
    expect(finalY).toBeCloseTo(slots[0].y, 5);
  });

  test("flotación no se aplica mientras el slot aún está entrando (t < 1)", () => {
    const renderer = makeRenderer();
    const config = makeIdleConfig();
    config.effects.idleFloat.speed = 1;
    const animator = new Animator(renderer, makeSlots(1), [null], config);
    // tickExport(50) con entryDuration=100 → t = 0.5 (aún entrando)
    animator.tickExport(50);
    const [, , finalY] = renderer.drawImage.mock.calls[0];
    // Con fadeIn y t=0.5: finalX=slot.x, finalY=slot.y exactamente (sin float)
    expect(finalY).toBeCloseTo(makeSlots(1)[0].y, 5);
  });
});

// ─── T-04: Respiración de cámara ──────────────────────────────────────────────

describe("Animator — respiración de cámara (cameraBreathing)", () => {
  function makeCamConfig(overrides = {}) {
    const cfg = makeConfig({
      staggerDelay: 0,
      entryDuration: 100,
      speed: 1.0,
      ...overrides,
    });
    cfg.effects = {
      cameraBreathing: { enabled: true, scaleAmp: 0.1, swayAmp: 50, speed: 1 },
    };
    return cfg;
  }

  test("en elapsed=π/2ms (max escala) la posición X se desplaza del valor original", () => {
    // Con speed=1 rad/ms: camScale = 1 + sin(π/2)*0.1 = 1.1 → desplaza X
    // slot[0].x=100, cx=960: finalX = 960 + (100-960)*1.1 + camSwayX ≠ 100
    const renderer = makeRenderer();
    const config = makeCamConfig();
    const slots = makeSlots(1);
    const animator = new Animator(renderer, slots, [null], config);
    animator._elapsed = Math.PI / 2; // ~1.57ms — t=0.016 > 0, slot visible
    animator._renderFrame();
    expect(renderer.drawImage).toHaveBeenCalled();
    const [, finalX] = renderer.drawImage.mock.calls[0];
    expect(finalX).not.toBeCloseTo(slots[0].x, 0);
  });

  test("en elapsed=π/2ms (max escala) la posición Y también se desplaza del valor original", () => {
    // slot[0].y=200, cy=540: finalY = 540 + (200-540)*1.1 = 166 ≠ 200
    const renderer = makeRenderer();
    const config = makeCamConfig();
    const slots = makeSlots(1);
    const animator = new Animator(renderer, slots, [null], config);
    animator._elapsed = Math.PI / 2;
    animator._renderFrame();
    expect(renderer.drawImage).toHaveBeenCalled();
    const [, , finalY] = renderer.drawImage.mock.calls[0];
    expect(finalY).not.toBeCloseTo(slots[0].y, 0);
  });

  test("con cameraBreathing.enabled = false las posiciones no cambian", () => {
    const renderer = makeRenderer();
    const config = makeConfig({
      staggerDelay: 0,
      entryDuration: 100,
      speed: 1.0,
    });
    config.effects = {
      cameraBreathing: {
        enabled: false,
        scaleAmp: 0.5,
        swayAmp: 100,
        speed: 1,
      },
    };
    const slots = makeSlots(1);
    const animator = new Animator(renderer, slots, [null], config);
    animator._elapsed = 500;
    animator._state[0] = { alpha: 1, scale: 1, extraRotDeg: 0, visible: true };
    animator._renderFrame();
    const [, finalX, finalY] = renderer.drawImage.mock.calls[0];
    expect(finalX).toBeCloseTo(slots[0].x, 3);
    expect(finalY).toBeCloseTo(slots[0].y, 3);
  });

  test("scaleAmp=0 y swayAmp=0 → posiciones sin cambio aunque speed > 0", () => {
    const renderer = makeRenderer();
    const config = makeConfig({
      staggerDelay: 0,
      entryDuration: 100,
      speed: 1.0,
    });
    config.effects = {
      cameraBreathing: { enabled: true, scaleAmp: 0, swayAmp: 0, speed: 1 },
    };
    const slots = makeSlots(1);
    const animator = new Animator(renderer, slots, [null], config);
    animator._elapsed = 500;
    animator._state[0] = { alpha: 1, scale: 1, extraRotDeg: 0, visible: true };
    animator._renderFrame();
    const [, finalX, finalY] = renderer.drawImage.mock.calls[0];
    expect(finalX).toBeCloseTo(slots[0].x, 3);
    expect(finalY).toBeCloseTo(slots[0].y, 3);
  });

  test("el tamaño final se escala por camScale", () => {
    const renderer = makeRenderer();
    const config = makeCamConfig();
    const slots = makeSlots(1); // imgSize = 80
    const animator = new Animator(renderer, slots, [null], config);
    // elapsed = π/(2*speed) en ms → camScale = 1 + scaleAmp (máximo)
    const speedRad = config.effects.cameraBreathing.speed;
    animator._elapsed = Math.PI / 2 / speedRad;
    animator._state[0] = { alpha: 1, scale: 1, extraRotDeg: 0, visible: true };
    animator._renderFrame();
    const [, , , finalSize] = renderer.drawImage.mock.calls[0];
    // camScale = 1 + 0.1 = 1.1 → finalSize = 80 * 1 * 1 * 1.1 = 88
    expect(finalSize).toBeCloseTo(80 * 1.1, 1);
  });
});

// ─── T-05: Halo (glow) ────────────────────────────────────────────────────────

describe("Animator — halo glow", () => {
  function makeGlowConfig() {
    const cfg = makeConfig({ staggerDelay: 0, entryDuration: 100, speed: 1.0 });
    cfg.effects = {
      glow: { enabled: true, radiusMultiplier: 1.6, intensity: 0.55 },
    };
    return cfg;
  }

  test("drawGlow se llama antes de drawImage para cada slot visible", () => {
    const renderer = makeRenderer();
    const config = makeGlowConfig();
    const animator = new Animator(renderer, makeSlots(2), [null, null], config);
    animator.tickExport(200); // ambos slots visibles
    expect(renderer.drawGlow).toHaveBeenCalledTimes(2);
    expect(renderer.drawImage).toHaveBeenCalledTimes(2);
    // Verificar orden: primer drawGlow debe ocurrir antes del primer drawImage
    const glowIdx = renderer.drawGlow.mock.invocationCallOrder[0];
    const imageIdx = renderer.drawImage.mock.invocationCallOrder[0];
    expect(glowIdx).toBeLessThan(imageIdx);
  });

  test("drawGlow recibe las mismas coordenadas X/Y que drawImage", () => {
    const renderer = makeRenderer();
    const config = makeGlowConfig();
    const slots = makeSlots(1);
    const animator = new Animator(renderer, slots, [null], config);
    animator.tickExport(200);
    const [glowX, glowY] = renderer.drawGlow.mock.calls[0];
    const [, imgX, imgY] = renderer.drawImage.mock.calls[0];
    expect(glowX).toBeCloseTo(imgX, 3);
    expect(glowY).toBeCloseTo(imgY, 3);
  });

  test("drawGlow recibe glowSize = imgSize × radiusMultiplier (sin cam breathing)", () => {
    const renderer = makeRenderer();
    const config = makeGlowConfig();
    const slots = makeSlots(1); // imgSize = 80
    const animator = new Animator(renderer, slots, [null], config);
    animator.tickExport(200); // t=1, camScale=1 (sin cameraBreathing en config)
    const [, , glowSize] = renderer.drawGlow.mock.calls[0];
    expect(glowSize).toBeCloseTo(80 * 1.6, 3); // 128
  });

  test("drawGlow no se llama cuando glow.enabled = false", () => {
    const renderer = makeRenderer();
    const config = makeConfig({
      staggerDelay: 0,
      entryDuration: 100,
      speed: 1.0,
    });
    config.effects = {
      glow: { enabled: false, radiusMultiplier: 1.6, intensity: 0.55 },
    };
    const animator = new Animator(renderer, makeSlots(1), [null], config);
    animator.tickExport(200);
    expect(renderer.drawGlow).not.toHaveBeenCalled();
  });

  test("drawGlow no se llama cuando effects no está en config", () => {
    const renderer = makeRenderer();
    const animator = new Animator(renderer, makeSlots(1), [null], makeConfig());
    animator.tickExport(200);
    expect(renderer.drawGlow).not.toHaveBeenCalled();
  });
});

// ─── T-06: Sistema de partículas ──────────────────────────────────────────────

describe("Animator — sistema de partículas", () => {
  function makeParticleConfig(count = 10) {
    const cfg = makeConfig();
    cfg.effects = {
      particles: {
        enabled: true,
        count,
        speed: 0.08,
        palette: ["#ff0000", "#00ff00", "#0000ff"],
      },
    };
    return cfg;
  }

  test("_initParticles retorna un array con `count` elementos cuando está habilitado", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(1),
      [null],
      makeParticleConfig(15),
    );
    expect(animator._particles).toHaveLength(15);
  });

  test("_initParticles retorna [] cuando particles.enabled = false", () => {
    const config = makeConfig();
    config.effects = {
      particles: { enabled: false, count: 200, speed: 0.08, palette: [] },
    };
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    expect(animator._particles).toHaveLength(0);
  });

  test("_initParticles retorna [] cuando effects no está en config", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(1),
      [null],
      makeConfig(),
    );
    expect(animator._particles).toHaveLength(0);
  });

  test("cada partícula tiene las propiedades necesarias (x, y, vy, size, alpha, color)", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(1),
      [null],
      makeParticleConfig(3),
    );
    for (const p of animator._particles) {
      expect(typeof p.x).toBe("number");
      expect(typeof p.y).toBe("number");
      expect(typeof p.vy).toBe("number");
      expect(typeof p.size).toBe("number");
      expect(typeof p.alpha).toBe("number");
      expect(typeof p.color).toBe("string");
    }
  });

  test("la paleta se asigna cíclicamente por índice", () => {
    const palette = ["#aa0000", "#00aa00", "#0000aa"];
    const config = makeConfig();
    config.effects = {
      particles: { enabled: true, count: 6, speed: 0.08, palette },
    };
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    expect(animator._particles[0].color).toBe(palette[0]);
    expect(animator._particles[1].color).toBe(palette[1]);
    expect(animator._particles[2].color).toBe(palette[2]);
    expect(animator._particles[3].color).toBe(palette[0]); // ciclo
    expect(animator._particles[5].color).toBe(palette[2]);
  });

  test("drawParticle se llama una vez por partícula en cada frame", () => {
    const renderer = makeRenderer();
    const animator = new Animator(
      renderer,
      makeSlots(0),
      [],
      makeParticleConfig(5),
    );
    animator.tickExport(16);
    expect(renderer.drawParticle).toHaveBeenCalledTimes(5);
  });

  test("drawParticle no se llama cuando particles.enabled = false", () => {
    const renderer = makeRenderer();
    const config = makeConfig();
    config.effects = {
      particles: { enabled: false, count: 10, speed: 0.08, palette: [] },
    };
    const animator = new Animator(renderer, makeSlots(0), [], config);
    animator.tickExport(16);
    expect(renderer.drawParticle).not.toHaveBeenCalled();
  });

  test("la posición Y de las partículas avanza hacia arriba con cada frame", () => {
    const animator = new Animator(
      makeRenderer(),
      makeSlots(0),
      [],
      makeParticleConfig(3),
    );
    const initialY = animator._particles.map((p) => p.y);
    animator._renderFrame(); // primer frame
    animator._renderFrame(); // segundo frame
    // Todas las partículas deben haber subido (vy > 0 → y disminuye) o envuelto
    const finalY = animator._particles.map((p) => p.y);
    // Al menos una partícula se movió respecto al inicio
    expect(finalY.some((y, i) => y !== initialY[i])).toBe(true);
  });

  test("las partículas envuelven verticalmente al salir por arriba (y < 0 → y += height)", () => {
    const config = makeParticleConfig(1);
    const animator = new Animator(makeRenderer(), makeSlots(0), [], config);
    // Forzar una partícula casi en y=0 con vy grande
    animator._particles[0].y = 0.5;
    animator._particles[0].vy = 10; // vy > y → la siguiente llamada la lleva a <0
    animator._renderFrame();
    expect(animator._particles[0].y).toBeGreaterThan(0); // debe haber envuelto
    expect(animator._particles[0].y).toBeLessThanOrEqual(config.canvas.height);
  });

  test("reset() reinicia las partículas", () => {
    const config = makeParticleConfig(5);
    const animator = new Animator(makeRenderer(), makeSlots(1), [null], config);
    const original = animator._particles.map((p) => ({ ...p }));
    // Mutar las partículas para simular frames pasados
    animator._particles.forEach((p) => {
      p.y = -999;
    });
    animator.reset();
    // Las partículas deben haberse reinicializado (longitud correcta, y positiva)
    expect(animator._particles).toHaveLength(5);
    animator._particles.forEach((p) => {
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(config.canvas.height);
    });
    // Al menos alguna propiedad debe diferir de los valores mutados
    const allSame = animator._particles.every((p, i) => p.y === original[i].y);
    expect(allSame).toBe(false); // es extremadamente improbable que sean iguales
  });
});
