import { describe, test, expect, vi, beforeEach } from "vitest";
import { Exporter } from "../js/exporter.js";

// ─── Mock de globals del navegador ───────────────────────────────────────

function MockCCapture() {
  this.start = vi.fn();
  this.capture = vi.fn();
  this.stop = vi.fn();
  this.save = vi.fn((cb) => cb(new Blob(["test"])));
  return this;
}

globalThis.CCapture = MockCCapture;

globalThis.MediaRecorder = function () {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    ondataavailable: null,
    onstop: null,
    state: "inactive",
  };
};
globalThis.MediaRecorder.isTypeSupported = vi.fn(() => true);

globalThis.URL = {
  createObjectURL: vi.fn(() => "blob:test"),
  revokeObjectURL: vi.fn(),
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeCanvas() {
  return {
    captureStream: vi.fn(() => ({})),
    getContext: vi.fn(),
  };
}

function makeConfig(overrides = {}) {
  return {
    canvas: { fps: 60 },
    export: {
      captureMode: "ccapture",
      durationSeconds: null,
      videoBitsPerSecond: 8_000_000,
      transparentBg: false,
      ...overrides,
    },
  };
}

function makeAnimator(totalDurationMs = 5000) {
  return {
    totalDurationMs,
    tickExport: vi.fn(),
  };
}

function makeRenderer() {
  return {
    pauseEffects: vi.fn(),
    resumeEffects: vi.fn(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("Exporter - durationSeconds", () => {
  let canvas;
  let config;
  let animator;
  let renderer;
  let exporter;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = makeCanvas();
    config = makeConfig();
    animator = makeAnimator(5000);
    renderer = makeRenderer();
    exporter = new Exporter(canvas, config, animator, renderer);
  });

  test("default durationSeconds should be null", () => {
    expect(config.export.durationSeconds).toBeNull();
  });

  test("_getTotalFrames should use animator duration when durationSeconds is null", () => {
    config.export.durationSeconds = null;
    animator.totalDurationMs = 5000;

    exporter = new Exporter(canvas, config, animator, renderer);
    const totalFrames = exporter._getTotalFrames();

    expect(totalFrames).toBe(Math.ceil((5000 / 1000) * 60));
  });

  test("_getTotalFrames should use durationSeconds when set", () => {
    config.export.durationSeconds = 15;

    exporter = new Exporter(canvas, config, animator, renderer);
    const totalFrames = exporter._getTotalFrames();

    expect(totalFrames).toBe(15 * 60);
  });

  test("_getTotalFrames should return 0 for 0 duration", () => {
    config.export.durationSeconds = 0;

    exporter = new Exporter(canvas, config, animator, renderer);
    const totalFrames = exporter._getTotalFrames();

    expect(totalFrames).toBe(0);
  });

  test("setting durationSeconds to null reverts to animator duration", () => {
    config.export.durationSeconds = 10;
    animator.totalDurationMs = 3000;

    exporter = new Exporter(canvas, config, animator, renderer);
    expect(exporter._getTotalFrames()).toBe(10 * 60);

    config.export.durationSeconds = null;
    exporter = new Exporter(canvas, config, animator, renderer);
    expect(exporter._getTotalFrames()).toBe(Math.ceil((3000 / 1000) * 60));
  });

  test("durationSeconds accepts various positive values", () => {
    [1, 15, 30, 60].forEach((seconds) => {
      config.export.durationSeconds = seconds;
      exporter = new Exporter(canvas, config, animator, renderer);
      expect(exporter._getTotalFrames()).toBe(seconds * 60);
    });
  });

  test("captureFrame updates progress based on totalFrames with custom duration", () => {
    config.export.durationSeconds = 10;
    config.export.captureMode = "ccapture";
    const progressCallback = vi.fn();

    exporter = new Exporter(canvas, config, animator, renderer);
    exporter.start(progressCallback, vi.fn());
    exporter.captureFrame();

    expect(progressCallback).toHaveBeenCalledWith(expect.any(Number));
  });
});

describe("Exporter - abort", () => {
  let canvas;
  let config;
  let animator;
  let renderer;
  let exporter;

  beforeEach(() => {
    vi.clearAllMocks();
    canvas = makeCanvas();
    config = makeConfig();
    animator = makeAnimator(5000);
    renderer = makeRenderer();
    exporter = new Exporter(canvas, config, animator, renderer);
  });

  test("abort should set isCapturing to false", () => {
    exporter.start(vi.fn(), vi.fn());
    exporter.abort(vi.fn());

    expect(exporter.isCapturing).toBe(false);
  });

  test("abort should call onAbort callback", () => {
    const onAbort = vi.fn();
    exporter.start(vi.fn(), vi.fn());
    exporter.abort(onAbort);

    expect(onAbort).toHaveBeenCalled();
  });

  test("abort should call renderer.resumeEffects in ccapture mode", () => {
    config.export.captureMode = "ccapture";
    exporter = new Exporter(canvas, config, animator, renderer);
    exporter.start(vi.fn(), vi.fn());
    exporter.abort(vi.fn());

    expect(renderer.resumeEffects).toHaveBeenCalled();
  });

  test("abort should not call onDone callback", () => {
    const onDone = vi.fn();
    exporter.start(vi.fn(), onDone);
    exporter.abort(vi.fn());

    expect(onDone).not.toHaveBeenCalled();
  });

  test("abort should not download file in ccapture mode", () => {
    config.export.captureMode = "ccapture";
    exporter = new Exporter(canvas, config, animator, renderer);
    exporter.start(vi.fn(), vi.fn());
    exporter.abort(vi.fn());

    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
  });

  test("abort in mediarecorder mode should stop recorder", () => {
    config.export.captureMode = "mediarecorder";
    const recorder = { start: vi.fn(), stop: vi.fn(), state: "recording", ondataavailable: null, onstop: null };
    // Override the constructor temporarily
    const OriginalMediaRecorder = globalThis.MediaRecorder;
    globalThis.MediaRecorder = function () { return recorder; };
    globalThis.MediaRecorder.isTypeSupported = vi.fn(() => true);

    exporter = new Exporter(canvas, config, animator, renderer);
    exporter.start(vi.fn(), vi.fn());
    exporter.abort(vi.fn());

    expect(recorder.stop).toHaveBeenCalled();

    // Restore
    globalThis.MediaRecorder = OriginalMediaRecorder;
  });

  test("abort in mediarecorder mode should not download file", () => {
    config.export.captureMode = "mediarecorder";
    const recorder = { start: vi.fn(), stop: vi.fn(), state: "recording", ondataavailable: null, onstop: null };
    // Override the constructor temporarily
    const OriginalMediaRecorder = globalThis.MediaRecorder;
    globalThis.MediaRecorder = function () { return recorder; };
    globalThis.MediaRecorder.isTypeSupported = vi.fn(() => true);

    exporter = new Exporter(canvas, config, animator, renderer);
    exporter.start(vi.fn(), vi.fn());
    exporter.abort(vi.fn());

    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();

    // Restore
    globalThis.MediaRecorder = OriginalMediaRecorder;
  });

  test("captureFrame should not capture after abort in ccapture mode", () => {
    config.export.captureMode = "ccapture";
    exporter = new Exporter(canvas, config, animator, renderer);
    exporter.start(vi.fn(), vi.fn());
    exporter.abort(vi.fn());
    exporter.captureFrame();

    expect(animator.tickExport).not.toHaveBeenCalled();
  });

  test("abort should set _aborted flag to true", () => {
    exporter.start(vi.fn(), vi.fn());
    exporter.abort(vi.fn());

    expect(exporter._aborted).toBe(true);
  });

  test("multiple abort calls should not throw", () => {
    exporter.start(vi.fn(), vi.fn());
    exporter.abort(vi.fn());

    expect(() => exporter.abort(vi.fn())).not.toThrow();
  });
});
