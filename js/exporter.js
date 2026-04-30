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
   */
  constructor(canvas, config, animator) {
    this._canvas = canvas;
    this._config = config;
    this._animator = animator;

    this._capturer = null; // instancia de CCapture
    this._recorder = null; // instancia de MediaRecorder
    this._chunks = []; // chunks de MediaRecorder
    this._isCapturing = false;
    this._frameCount = 0;

    this._onProgress = null; // (ratio 0–1) => void
    this._onDone = null; // (blob) => void
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
    if (!this._isCapturing) return;
    if (this._config.export.captureMode === "ccapture" && this._capturer) {
      this._capturer.capture(this._canvas);
      this._frameCount++;

      // Calcular progreso
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
    if (!this._isCapturing) return;
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

  // ─── CCapture ─────────────────────────────────────────────────────────────

  _startCCapture() {
    // CCapture se carga como script global desde el HTML
    // eslint-disable-next-line no-undef
    if (typeof CCapture === "undefined") {
      console.error(
        "[Exporter] CCapture no está disponible. Verificá que el script esté incluido en index.html.",
      );
      return;
    }

    // eslint-disable-next-line no-undef
    this._capturer = new CCapture({
      format: "webm",
      framerate: this._config.canvas.fps,
      quality: 95,
      verbose: false,
      display: false,
    });

    this._capturer.start();
  }

  _stopCCapture() {
    return new Promise((resolve) => {
      if (!this._capturer) {
        resolve();
        return;
      }

      this._capturer.stop();
      this._capturer.save((blob) => {
        this._downloadBlob(blob, "mandala.webm");
        if (this._onDone) this._onDone(blob);
        if (this._onProgress) this._onProgress(1);
        resolve();
      });
    });
  }

  // ─── MediaRecorder ────────────────────────────────────────────────────────

  _startMediaRecorder() {
    const stream = this._canvas.captureStream(this._config.canvas.fps);

    // Seleccionar codec disponible
    const mimeType = this._getSupportedMimeType();
    const options = {
      mimeType,
      videoBitsPerSecond: this._config.export.videoBitsPerSecond,
    };

    this._chunks = [];
    this._recorder = new MediaRecorder(stream, options);

    this._recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this._chunks.push(e.data);
    };

    this._recorder.onstop = () => {
      const blob = new Blob(this._chunks, { type: mimeType });
      this._downloadBlob(blob, "mandala.webm");
      if (this._onDone) this._onDone(blob);
      if (this._onProgress) this._onProgress(1);
    };

    this._recorder.start(100); // chunk cada 100ms
  }

  _stopMediaRecorder() {
    return new Promise((resolve) => {
      if (!this._recorder) {
        resolve();
        return;
      }

      const originalOnStop = this._recorder.onstop;
      this._recorder.onstop = (e) => {
        if (originalOnStop) originalOnStop(e);
        resolve();
      };

      this._recorder.stop();
    });
  }

  _getSupportedMimeType() {
    const candidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    return (
      candidates.find((t) => MediaRecorder.isTypeSupported(t)) || "video/webm"
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Calcula el total de frames esperado para la barra de progreso.
   * @returns {number}
   */
  _getTotalFrames() {
    const durationSec =
      this._config.export.durationSeconds ??
      this._animator.totalDurationMs / 1000;
    return Math.ceil(durationSec * this._config.canvas.fps);
  }

  /**
   * Dispara la descarga de un Blob como archivo.
   * Usa createElement+click en vez de innerHTML para evitar XSS (CWE-79).
   *
   * @param {Blob}   blob
   * @param {string} filename
   */
  _downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    // Sanitizar nombre de archivo: solo alfanuméricos, -, _, .
    const safeName = filename.replace(/[^a-zA-Z0-9._\-]/g, "_");

    a.href = url;
    a.download = safeName;
    a.textContent = ""; // sin contenido visible

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Revocar el object URL para liberar memoria
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
