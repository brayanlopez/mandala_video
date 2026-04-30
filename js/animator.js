/**
 * animator.js — Máquina de estados de la animación
 *
 * RESPONSABILIDADES:
 *   - Gestionar el tiempo de animación (real o simulado para export)
 *   - Calcular el estado de cada slot (alpha, scale, rotation) en cada frame
 *   - Llamar al renderer con los comandos de dibujo correctos
 *   - Exponer controles: play, pause, reset, setSpeed
 *
 * NO sabe qué motor de renderizado se usa (p5, Pixi, Three).
 * Solo usa la interfaz del renderer: clear(), drawImage(), flush().
 */

// ─── Funciones de easing ───────────────────────────────────────────────────

const Easing = {
  /** Aceleración suave al final */
  easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),

  /** Rebote al llegar al destino */
  easeOutBack: (t) => {
    const c1 = 1.70158,
      c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },

  /** Elástico al final */
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return (
      Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
    );
  },

  /** Lineal */
  /* v8 ignore next */
  linear: (t) => t,
};

// ─── Clase principal ───────────────────────────────────────────────────────

export class Animator {
  /**
   * @param {import('./renderer-p5.js').P5Renderer} renderer
   * @param {import('../js/geometry.js').MandalaSlot[]}   slots
   * @param {Array<p5.Image|null>}  images   - Imagen precargada por slot (null si falló)
   * @param {object}                config   - CONFIG completo
   */
  constructor(renderer, slots, images, config) {
    this._renderer = renderer;
    this._slots = slots;
    this._images = images;
    this._config = config;

    /** Estado visual de cada slot */
    this._state = slots.map(() => ({
      alpha: 0,
      scale: 0,
      extraRotDeg: 0,
      visible: false,
    }));

    /** Tiempo de animación acumulado (ms), independiente del reloj real */
    this._elapsed = 0;
    this._lastTs = null;
    this._rafId = null;
    this._running = false;

    /** Rotación global continua de toda la mandala (grados) */
    this._globalRot = 0;

    /** Centro del canvas — precalculado para evitar divisiones en el hot path de _renderFrame */
    this._cx = config.canvas.width / 2;
    this._cy = config.canvas.height / 2;

    /** Callbacks externos */
    this._onFrame = null; // (elapsed, totalDuration) => void
    this._onComplete = null; // () => void
    this._completed = false;

    /** Modo export: avanza tiempo artificialmente frame a frame */
    this._exportMode = false;
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  /**
   * Inicia la animación en modo preview (tiempo real).
   * @param {Function} [onFrame]    - Llamado en cada frame con (elapsed, total)
   * @param {Function} [onComplete] - Llamado cuando termina la animación de entrada
   */
  play(onFrame, onComplete) {
    this._onFrame = onFrame || null;
    this._onComplete = onComplete || null;
    this._running = true;
    this._lastTs = null;
    this._tick = this._tick.bind(this);
    this._rafId = requestAnimationFrame(this._tick);
  }

  pause() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  resume() {
    if (!this._running) {
      this._running = true;
      this._lastTs = null;
      this._rafId = requestAnimationFrame(this._tick);
    }
  }

  reset() {
    this.pause();
    this._elapsed = 0;
    this._globalRot = 0;
    this._completed = false;
    this._lastTs = null;
    this._state.forEach((s) => {
      s.alpha = 0;
      s.scale = 0;
      s.extraRotDeg = 0;
      s.visible = false;
    });
  }

  /** Ajusta la velocidad sin detener la animación */
  setSpeed(multiplier) {
    this._config.animation.speed = Math.max(0.1, multiplier);
  }

  /**
   * Avanza la animación un frame (para export frame-by-frame).
   * No usa requestAnimationFrame.
   * @param {number} frameDeltaMs - Duración de un frame en ms (1000 / fps)
   */
  tickExport(frameDeltaMs) {
    this._advanceTime(frameDeltaMs * this._config.animation.speed);
    this._renderFrame();
  }

  /** Duración total de la animación de entrada en ms (sin speed) */
  get totalDurationMs() {
    const { staggerDelay, entryDuration } = this._config.animation;
    const lastOrder = this._slots.length - 1;
    return lastOrder * staggerDelay + entryDuration;
  }

  get elapsed() {
    return this._elapsed;
  }
  get isCompleted() {
    return this._completed;
  }

  // ─── Loop interno ─────────────────────────────────────────────────────────

  _tick(timestamp) {
    if (!this._running) return;

    if (this._lastTs === null) this._lastTs = timestamp;
    const realDelta = timestamp - this._lastTs;
    this._lastTs = timestamp;

    this._advanceTime(realDelta * this._config.animation.speed);
    this._renderFrame();

    if (this._onFrame) {
      this._onFrame(this._elapsed, this.totalDurationMs);
    }

    // Detectar fin de animación de entrada
    if (!this._completed && this._elapsed >= this.totalDurationMs) {
      this._completed = true;
      if (this._onComplete) this._onComplete();

      // Si loopAnimation está activo, reiniciar
      if (this._config.animation.loopAnimation) {
        this._elapsed = 0;
        this._completed = false;
      }
    }

    this._rafId = requestAnimationFrame(this._tick);
  }

  _advanceTime(deltaMs) {
    this._elapsed += deltaMs;
    this._globalRot += this._config.animation.rotationSpeed;
  }

  // ─── Lógica de estado ─────────────────────────────────────────────────────

  _renderFrame() {
    const { bgColor } = this._config.canvas;
    const { staggerDelay, entryDuration, entryEffect } = this._config.animation;

    this._renderer.clear(bgColor);

    this._slots.forEach((slot, i) => {
      const startMs = slot.entranceOrder * staggerDelay;
      const rawT = (this._elapsed - startMs) / entryDuration;
      const t = Math.max(0, Math.min(1, rawT));

      if (t <= 0) return; // aún no apareció

      const s = this._state[i];
      s.visible = true;

      // ─── Aplicar efecto de entrada ───────────────────────────────────────
      switch (entryEffect) {
        case "scaleIn":
          s.alpha = Easing.easeOutCubic(t);
          s.scale = Easing.easeOutBack(t);
          s.extraRotDeg = 0;
          break;

        case "spinIn":
          s.alpha = Easing.easeOutCubic(t);
          s.scale = Easing.easeOutCubic(t);
          s.extraRotDeg = (1 - t) * 270; // gira desde 270° hasta 0
          break;

        case "flyIn": {
          // Vuela desde el centro hacia su posición
          s.alpha = Easing.easeOutCubic(t);
          s.scale = Easing.easeOutElastic(t);
          s.extraRotDeg = 0;
          break;
        }

        case "fadeIn":
        default:
          s.alpha = Easing.easeOutCubic(t);
          s.scale = 1;
          s.extraRotDeg = 0;
          break;
      }

      // ─── Calcular tamaño y rotación final ─────────────────────────────────
      const finalSize = slot.imgSize * s.scale;
      const finalRotDeg = slot.angleDeg + this._globalRot + s.extraRotDeg;

      // ─── Calcular posición (flyIn vuela desde el centro) ──────────────────
      let finalX = slot.x;
      let finalY = slot.y;

      if (entryEffect === "flyIn" && t < 1) {
        const tE = Easing.easeOutCubic(t);
        finalX = this._cx + (slot.x - this._cx) * tE;
        finalY = this._cy + (slot.y - this._cy) * tE;
      }

      this._renderer.drawImage(
        this._images[i],
        finalX,
        finalY,
        finalSize,
        s.alpha,
        finalRotDeg,
      );
    });

    this._renderer.flush();
  }
}
