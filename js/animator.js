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
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },

  /** Rebote tipo pelota: 3 sub-rebotes decrecientes antes de detenerse */
  easeOutBounce: (t) => {
    const n1 = 7.5625,
      d1 = 2.75;
    if (t < 1 / d1) {
      return n1 * t * t;
    } else if (t < 2 / d1) {
      t -= 1.5 / d1;
      return n1 * t * t + 0.75;
    } else if (t < 2.5 / d1) {
      t -= 2.25 / d1;
      return n1 * t * t + 0.9375;
    } else {
      t -= 2.625 / d1;
      return n1 * t * t + 0.984375;
    }
  },

  /** Lineal */
  /* v8 ignore next */
  linear: (t) => t,
};

// ─── Constantes de efectos de entrada ─────────────────────────────────────
//
// Nombrar estos valores evita números mágicos dispersos en _drawFrame.

const GOLDEN_ANGLE_RAD = 137.508 * (Math.PI / 180); // ~2.3999 rad — distribución de fase dorada
const SPIN_IN_ROTATION_DEG = 270; // spinIn: parte desde 270° y llega a 0°
const DROP_HEIGHT_FACTOR = 0.4; // drop: cae desde el 40% del alto del canvas
const SLIDE_OUT_FACTOR = 2.5; // slideOut: inicia a 2.5× el radio desde el centro
const SHRINK_INITIAL_SCALE = 3.0; // shrink: aparece a 3× su tamaño y se contrae a 1×
const SPIRAL_ROTATIONS_DEG = 720; // spiral: dos vueltas completas (2 × 360°)

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

    /** Partículas ambientales — array de objetos {x, y, vy, size, alpha, color} */
    this._particles = this._initParticles();
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
    this._particles = this._initParticles();
  }

  /**
   * Reinicializa el array de partículas desde la configuración actual.
   * Llamar cuando se cambia effects.particles.enabled o effects.particles.count
   * desde la UI, ya que esos cambios afectan el tamaño del array.
   */
  reinitParticles() {
    this._particles = this._initParticles();
  }

  /** Ajusta la velocidad sin detener la animación */
  setSpeed(multiplier) {
    this._config.animation.speed = Math.max(0.1, multiplier);
  }

  /**
   * Avanza la animación un frame (para export frame-by-frame).
   * No usa requestAnimationFrame.
   * Llama a renderer.tickEffects() antes de avanzar el tiempo para que efectos
   * GPU-side (si los hay en Three.js/PixiJS) sean deterministas.
   * @param {number} frameDeltaMs - Duración de un frame en ms (1000 / fps)
   */
  tickExport(frameDeltaMs) {
    this._renderer.tickEffects(frameDeltaMs);
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
    const bgColor = this._config.export?.transparentBg
      ? "transparent"
      : this._config.canvas.bgColor;
    const { staggerDelay, entryDuration, entryEffect } = this._config.animation;

    this._renderer.clear(bgColor);

    // ─── Partículas ambientales (se dibujan bajo los slots) ─────────────────
    if (this._config.effects?.particles?.enabled && this._particles.length > 0) {
      const wrapY = this._config.canvas.height;
      for (const p of this._particles) {
        p.y -= p.vy;
        if (p.y < 0) p.y += wrapY; // envolver verticalmente
        this._renderer.drawParticle(p.x, p.y, p.size, p.alpha, p.color);
      }
    }

    // ─── Cámara: escala global + balanceo lateral ────────────────────────────
    // Las dos funciones usan frecuencias distintas (×0.71) para evitar
    // periodicidad simple y dar un movimiento orgánico tipo "cámara en mano".
    let camScale = 1;
    let camSwayX = 0;
    if (this._config.effects?.cameraBreathing?.enabled) {
      const { scaleAmp, swayAmp, speed } = this._config.effects.cameraBreathing;
      camScale = 1 + Math.sin(this._elapsed * speed) * scaleAmp;
      camSwayX = Math.sin(this._elapsed * speed * 0.71) * swayAmp;
    }

    this._slots.forEach((slot, i) => {
      const startMs = slot.entranceOrder * staggerDelay;
      const rawT = (this._elapsed - startMs) / entryDuration;
      const t = Math.max(0, Math.min(1, rawT));

      if (t <= 0) return; // aún no apareció

      const s = this._state[i];
      s.visible = true;

      // ─── Aplicar efecto de entrada ─────────────────────────────────────────
      switch (entryEffect) {
        case "scaleIn":
          s.alpha = Easing.easeOutCubic(t);
          s.scale = Easing.easeOutBack(t);
          s.extraRotDeg = 0;
          break;

        case "spinIn":
          s.alpha = Easing.easeOutCubic(t);
          s.scale = Easing.easeOutCubic(t);
          s.extraRotDeg = (1 - t) * SPIN_IN_ROTATION_DEG;
          break;

        case "flyIn": {
          // Vuela desde el centro hacia su posición
          s.alpha = Easing.easeOutCubic(t);
          s.scale = Easing.easeOutElastic(t);
          s.extraRotDeg = 0;
          break;
        }

        case "drop":
          // Cae desde arriba con rebote al llegar (posición se ajusta abajo)
          s.alpha = Easing.easeOutCubic(t);
          s.scale = 1;
          s.extraRotDeg = 0;
          break;

        case "slideOut":
          // Desliza hacia adentro desde fuera del canvas en dirección radial
          s.alpha = Easing.easeOutCubic(t);
          s.scale = 1;
          s.extraRotDeg = 0;
          break;

        case "shrink":
          // Aparece a SHRINK_INITIAL_SCALE× y se contrae a su tamaño final
          s.alpha = Easing.easeOutCubic(t);
          s.scale = 1 + (SHRINK_INITIAL_SCALE - 1) * (1 - Easing.easeOutCubic(t));
          s.extraRotDeg = 0;
          break;

        case "spiral":
          // SPIRAL_ROTATIONS_DEG mientras se escala hacia el tamaño final
          s.alpha = Easing.easeOutCubic(t);
          s.scale = Easing.easeOutCubic(t);
          s.extraRotDeg = SPIRAL_ROTATIONS_DEG * (1 - t);
          break;

        case "fadeIn":
        default:
          s.alpha = Easing.easeOutCubic(t);
          s.scale = 1;
          s.extraRotDeg = 0;
          break;
      }

      // ─── Tamaño y rotación base ────────────────────────────────────────────
      const imgScale = this._config.canvas.imgScale ?? 1;
      let finalSize = slot.imgSize * s.scale * imgScale;
      const finalRotDeg = slot.angleDeg + this._globalRot + s.extraRotDeg;

      // ─── Posición base ─────────────────────────────────────────────────────
      let finalX = slot.x;
      let finalY = slot.y;

      if (t < 1) {
        if (entryEffect === "flyIn") {
          const tE = Easing.easeOutCubic(t);
          finalX = this._cx + (slot.x - this._cx) * tE;
          finalY = this._cy + (slot.y - this._cy) * tE;
        } else if (entryEffect === "drop") {
          // Cae desde una altura proporcional al canvas con rebote
          finalY =
            slot.y -
            this._config.canvas.height * DROP_HEIGHT_FACTOR * (1 - Easing.easeOutBounce(t));
        } else if (entryEffect === "slideOut") {
          // Entra desde fuera del canvas en la dirección radial del slot
          const factor = SLIDE_OUT_FACTOR * (1 - Easing.easeOutCubic(t));
          finalX = slot.x + (slot.x - this._cx) * factor;
          finalY = slot.y + (slot.y - this._cy) * factor;
        }
      }

      // ─── Flotación idle (post-entrada, distribución de fase dorada) ─────────
      // Cada slot oscila con una fase desplazada por GOLDEN_ANGLE_RAD × i,
      // lo que garantiza que ningún par de slots bote en sincronía.
      if (t >= 1 && this._config.effects?.idleFloat?.enabled) {
        const { amplitude, speed } = this._config.effects.idleFloat;
        finalY += Math.sin(this._elapsed * speed + i * GOLDEN_ANGLE_RAD) * amplitude;
      }

      // ─── Cámara: aplicar escala global y balanceo ──────────────────────────
      finalX = this._cx + (finalX - this._cx) * camScale + camSwayX;
      finalY = this._cy + (finalY - this._cy) * camScale;
      finalSize *= camScale;

      // ─── Halo suave detrás de la imagen ──────────────────────────────────
      if (this._config.effects?.glow?.enabled) {
        const { radiusMultiplier, intensity } = this._config.effects.glow;
        const glowSize = slot.imgSize * radiusMultiplier * camScale;
        this._renderer.drawGlow(finalX, finalY, glowSize, s.alpha * intensity, "#ffffff");
      }

      this._renderer.drawImage(
        this._images[i],
        finalX,
        finalY,
        finalSize,
        s.alpha,
        finalRotDeg,
        i, // slotIndex — used by Three.js renderer for Z-depth; ignored by p5
      );
    });

    this._renderer.flush();
  }

  // ─── Efectos ──────────────────────────────────────────────────────────────

  /**
   * Inicializa el array de partículas ambientales desde config.effects.particles.
   * Retorna [] si las partículas están deshabilitadas o no hay config de efectos.
   * @returns {Array<{x:number, y:number, vy:number, size:number, alpha:number, color:string}>}
   */
  _initParticles() {
    const cfg = this._config.effects?.particles;
    if (!cfg?.enabled) return [];
    const { count, palette, speed } = cfg;
    const W = this._config.canvas.width;
    const H = this._config.canvas.height;
    // vy en px/frame normalizado a 60fps: speed (px/ms) × (1000ms/60frames)
    return Array.from({ length: count }, (_, i) => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vy: (0.3 + Math.random() * 0.7) * speed * (1000 / 60),
      size: 2 + Math.random() * 4,
      alpha: 0.3 + Math.random() * 0.5,
      color: palette[i % palette.length],
    }));
  }
}
