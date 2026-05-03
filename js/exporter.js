/**
 * exporter.js — Captura de video
 *
 * Dos modos según config.export.captureMode:
 *
 *   'ccapture'      → CCapture.js, frame-by-frame determinístico.
 *                     El animator avanza un frame simulado por tick.
 *                     Garantiza que el video tenga exactamente el FPS configurado
 *                     sin importar la velocidad del CPU.
 *                     Exporta a WebM.
 *
 *   'mediarecorder' → MediaRecorder API nativa.
 *                     Graba el canvas en tiempo real.
 *                     Más simple, calidad variable según CPU.
 *                     Exporta a WebM.
 *
 * Para convertir el WebM a MP4 H.264 con ffmpeg (instalado localmente):
 *   ffmpeg -i mandala.webm -c:v libx264 -crf 17 -pix_fmt yuv420p mandala_1080p.mp4
 */

export class Exporter {
  /**
   * @param {HTMLCanvasElement}                  canvas
   * @param {import('../config.js').CONFIG}      config
   * @param {import('./animator.js').Animator}   animator
   * @param {object|null}                        renderer  - Instancia del renderer activo.
   *   Opcional — si se provee, se llaman pauseEffects()/resumeEffects() al iniciar/detener
   *   el export CCapture para mantener efectos GPU-side deterministas.
   */
  constructor(canvas, config, animator, renderer = null) {
    this._canvas = canvas;
    this._config = config;
    this._animator = animator;
    this._renderer = renderer;

    this._capturer = null;
    this._recorder = null;
    this._chunks = [];
    this._isCapturing = false;
    this._frameCount = 0;
    this._aborted = false;
    this._mimeType = null;

    this._onProgress = null;
    this._onDone = null;
    this._onAbort = null;
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  /**
   * Inicia la captura de video.
   *
   * @param {Function} onProgress - Callback con progreso (0–1)
   * @param {Function} onDone     - Callback con el Blob del video final
   */
  start(onProgress, onDone) {
    this._onProgress = onProgress;
    this._onDone = onDone;
    this._isCapturing = true;
    this._frameCount = 0;
    this._aborted = false;

    if (this._config.export.captureMode === "ccapture") {
      this._startCCapture();
    } else {
      this._startMediaRecorder();
    }
  }

  /**
   * Captura el frame actual del canvas.
   * Solo relevante para modo 'ccapture' (se llama manualmente desde main.js).
   */
  captureFrame() {
    if (this._aborted || !this._isCapturing) return;
    if (this._config.export.captureMode === "ccapture" && this._capturer) {
      this._capturer.capture(this._canvas);
      this._frameCount++;

      const totalFrames = this._getTotalFrames();
      if (totalFrames > 0 && this._onProgress) {
        this._onProgress(Math.min(1, this._frameCount / totalFrames));
      }
    }
  }

  /**
   * Detiene la captura y dispara la descarga del archivo.
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this._isCapturing || this._aborted) return;
    this._isCapturing = false;

    if (this._config.export.captureMode === "ccapture") {
      await this._stopCCapture();
    } else {
      await this._stopMediaRecorder();
    }
  }

  get isCapturing() {
    return this._isCapturing;
  }

  /**
   * Aborta la captura sin descargar el archivo.
   * @param {Function} onAbort - Callback cuando se cancela
   */
  abort(onAbort) {
    if (!this._isCapturing) return;
    this._aborted = true;
    this._onAbort = onAbort;
    this._isCapturing = false;

    if (this._config.export.captureMode === "ccapture") {
      this._abortCCapture();
    } else {
      this._abortMediaRecorder();
    }
  }

  // ─── CCapture ─────────────────────────────────────────────────────────────

  _startCCapture() {
    if (this._renderer) this._renderer.pauseEffects();

    if (typeof CCapture === "undefined") {
      console.error("[Exporter] CCapture no está disponible.");
      this._isCapturing = false;
      if (this._onDone) this._onDone(null);
      return;
    }

    try {
      this._capturer = new CCapture({
        format: "webm",
        framerate: this._config.canvas.fps,
        quality: 95,
        verbose: false,
        display: false,
      });
      this._capturer.start();
    } catch {
      this._capturer = null;
      this._isCapturing = false;
      if (this._onDone) this._onDone(null);
    }
  }

  _stopCCapture() {
    return new Promise((resolve) => {
      if (!this._capturer) {
        resolve();
        return;
      }

      this._capturer.stop();
      this._capturer.save((blob) => {
        const filename = this._config.export?.transparentBg
          ? "mandala_transparent.webm"
          : "mandala.webm";
        this._downloadBlob(blob, filename);
        if (this._onDone) this._onDone(blob);
        if (this._onProgress) this._onProgress(1);
        if (this._renderer) this._renderer.resumeEffects();
        resolve();
      });
    });
  }

  _abortCCapture() {
    if (this._capturer) {
      try {
        this._capturer.stop();
      } catch {
        /* ignorar */
      }
      this._capturer = null;
    }
    if (this._renderer) this._renderer.resumeEffects();
    if (this._onAbort) this._onAbort();
  }

  // ─── MediaRecorder ────────────────────────────────────────────────────────

  _startMediaRecorder() {
    let stream;
    try {
      stream = this._canvas.captureStream(this._config.canvas.fps);
    } catch {
      this._isCapturing = false;
      if (this._onDone) this._onDone(null);
      return;
    }

    this._mimeType = this._getSupportedMimeType();
    const options = {
      mimeType: this._mimeType,
      videoBitsPerSecond: this._config.export.videoBitsPerSecond,
    };

    this._chunks = [];
    this._recorder = new MediaRecorder(stream, options);

    this._recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this._chunks.push(e.data);
    };

    this._recorder.onstop = () => {
      if (this._aborted) {
        if (this._onAbort) this._onAbort();
        return;
      }
      const blob = new Blob(this._chunks, { type: this._mimeType });
      const filename = this._config.export?.transparentBg
        ? "mandala_transparent.webm"
        : "mandala.webm";
      this._downloadBlob(blob, filename);
      if (this._onDone) this._onDone(blob);
      if (this._onProgress) this._onProgress(1);
    };

    this._recorder.start(100);
  }

  _stopMediaRecorder() {
    return new Promise((resolve) => {
      if (!this._recorder) {
        resolve();
        return;
      }

      const originalOnStop = this._recorder.onstop;
      this._recorder.onstop = () => {
        if (originalOnStop) originalOnStop();
        resolve();
      };

      this._recorder.stop();
    });
  }

  _abortMediaRecorder() {
    if (this._recorder && this._recorder.state !== "inactive") {
      try {
        this._recorder.stop();
      } catch {
        /* ignorar */
      }
    }
  }

  _getSupportedMimeType() {
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm";
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _getTotalFrames() {
    const durationSec =
      this._config.export.durationSeconds ?? this._animator.totalDurationMs / 1000;
    return Math.ceil(durationSec * this._config.canvas.fps);
  }

  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");

    a.href = url;
    a.download = safeName;
    a.textContent = "";

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
