/**
 * renderer-p5.js — Adaptador de renderizado usando p5.js
 *
 * ÚNICO ARCHIVO QUE CAMBIA AL MIGRAR DE MOTOR.
 * main.js y animator.js no se modifican al cambiar renderer.
 *
 * Interfaz pública (10 métodos):
 *   init(containerId, w, h, onReady)          → configura el canvas
 *   loadImage(src)                            → Promise<p5.Image>
 *   clear(bgColor)                            → limpia el frame
 *   drawImage(img, x, y, size, alpha, rotDeg) → dibuja una imagen
 *   flush()                                   → presenta el frame al canvas
 *   getCanvas()                               → HTMLCanvasElement nativo
 *   destroy()                                 → limpia recursos
 *   drawGlow(x, y, size, alpha, colorHex)     → halo radial aditivo
 *   drawParticle(x, y, size, alpha, colorHex) → círculo aditivo
 *   pauseEffects() / tickEffects(dt) / resumeEffects() → no-ops en p5;
 *     en renderers GPU pausarían/avanzarían efectos del lado del motor.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte #RRGGBB a {r, g, b}. Retorna blanco si el formato es inválido. */
function _hexToRgb(hex) {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export class P5Renderer {
  constructor() {
    /** @type {import('p5')} */
    this._p = null;
    /** @type {HTMLCanvasElement} */
    this._canvas = null;
    /** @type {Array<object>} Cola de comandos de dibujo del frame actual */
    this._drawQueue = [];
    this._ready = false;
    /** @type {Map<string, Promise<p5.Image|null>>} Caché de imágenes ya cargadas por ruta */
    this._imageCache = new Map();
  }

  /**
   * Inicializa el sketch de p5.js en modo instancia.
   * p5 se usa con noLoop(): el render es 100% controlado por animator.flush().
   *
   * @param {string}   containerId  - ID del elemento HTML donde montar el canvas
   * @param {number}   w            - Ancho en px
   * @param {number}   h            - Alto en px
   * @param {Function} onReady      - Callback cuando el canvas está listo
   */
  init(containerId, w, h, onReady) {
    // eslint-disable-next-line no-undef
    new p5((sketch) => {
      this._p = sketch;

      sketch.setup = () => {
        const cv = sketch.createCanvas(w, h);
        cv.parent(containerId);
        this._canvas = cv.elt; // HTMLCanvasElement nativo

        sketch.imageMode(sketch.CENTER);
        sketch.angleMode(sketch.DEGREES);
        sketch.noLoop(); // el loop lo controla el animator, no p5

        this._ready = true;
        onReady();
      };

      // draw() es llamado por redraw() desde flush().
      // No contiene lógica de animación — solo ejecuta la cola de dibujo.
      sketch.draw = () => {
        this._executeQueue();
      };
    });
  }

  /**
   * Carga una imagen desde una URL relativa.
   * Cachea el resultado para no recargar la misma imagen dos veces.
   *
   * @param {string} src - Ruta relativa a la imagen (ya sanitizada por geometry.js)
   * @returns {Promise<p5.Image>}
   */
  loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (this._imageCache.has(src)) return this._imageCache.get(src);

    const promise = new Promise((resolve) => {
      this._p.loadImage(
        src,
        (img) => resolve(img),
        () => {
          console.warn(`[Renderer] No se pudo cargar imagen: ${src}`);
          resolve(null); // No rechazar — continuar sin esa imagen
        },
      );
    });

    this._imageCache.set(src, promise);
    return promise;
  }

  // ─── Interfaz de dibujo (comandos encolados) ───────────────────────────────

  /**
   * Encola una limpieza del canvas con el color de fondo.
   * @param {string} bgColor - Color CSS (#hex, rgb(), etc.)
   */
  clear(bgColor) {
    this._drawQueue.push({ type: "clear", bgColor });
  }

  /**
   * Encola el dibujo de una imagen.
   *
   * @param {p5.Image} img      - Imagen cargada
   * @param {number}   x        - Centro X en px
   * @param {number}   y        - Centro Y en px
   * @param {number}   size     - Tamaño (alto y ancho) en px
   * @param {number}   alpha    - Opacidad 0–1
   * @param {number}   rotDeg   - Rotación en grados
   */
  drawImage(img, x, y, size, alpha, rotDeg) {
    if (!img) return;
    this._drawQueue.push({ type: "image", img, x, y, size, alpha, rotDeg });
  }

  /**
   * Ejecuta toda la cola de dibujo llamando a p5.redraw().
   * Esto dispara sketch.draw() que llama a _executeQueue().
   */
  flush() {
    if (this._ready) this._p.redraw();
  }

  /**
   * Devuelve el HTMLCanvasElement nativo.
   * CCapture y MediaRecorder lo necesitan para capturar frames.
   * @returns {HTMLCanvasElement}
   */
  getCanvas() {
    return this._canvas;
  }

  /**
   * Vacía la caché de imágenes sin destruir el renderer.
   * Llamar antes de cargar las imágenes de un nuevo patrón para liberar
   * las referencias a imágenes del patrón anterior que ya no se usarán.
   */
  clearImageCache() {
    this._imageCache.clear();
  }

  // ─── Efectos continuos ────────────────────────────────────────────────────

  /** No-op: en p5 todo el estado de efectos vive en animator.js. */
  pauseEffects() {}

  /** @param {number} _dt - Duración del frame en ms (1000 / fps) */
  tickEffects(_dt) {}

  resumeEffects() {}

  // ─── Primitivas de efectos visuales ───────────────────────────────────────

  /**
   * Encola un halo radial aditivo centrado en (x, y).
   * @param {number} x @param {number} y @param {number} size
   * @param {number} alpha @param {string} colorHex - #RRGGBB
   */
  drawGlow(x, y, size, alpha, colorHex) {
    if (!this._ready || alpha <= 0) return;
    this._drawQueue.push({ type: "glow", x, y, size, alpha, colorHex });
  }

  /**
   * Encola una partícula circular con blending aditivo.
   * @param {number} x @param {number} y @param {number} size
   * @param {number} alpha @param {string} colorHex - #RRGGBB
   */
  drawParticle(x, y, size, alpha, colorHex) {
    if (!this._ready || alpha <= 0) return;
    this._drawQueue.push({ type: "particle", x, y, size, alpha, colorHex });
  }

  /**
   * Destruye la instancia de p5 y libera el canvas.
   */
  destroy() {
    if (this._p) {
      this._p.remove();
      this._p = null;
    }
    this._canvas = null;
    this._drawQueue = [];
    this._imageCache.clear();
    this._ready = false;
  }

  // ─── Privado ───────────────────────────────────────────────────────────────

  /** Ejecuta y vacía la cola de comandos de dibujo. Llamado desde sketch.draw(). */
  _executeQueue() {
    const p = this._p;

    for (const cmd of this._drawQueue) {
      if (cmd.type === "clear") {
        if (cmd.bgColor === "transparent") {
          p.clear(); // borra el canvas a transparente total (RGBA 0,0,0,0)
        } else {
          p.background(cmd.bgColor);
        }
      } else if (cmd.type === "image") {
        p.push();
        p.translate(cmd.x, cmd.y);
        p.rotate(cmd.rotDeg);
        p.tint(255, cmd.alpha * 255); // alpha: 0–255
        p.image(cmd.img, 0, 0, cmd.size, cmd.size);
        p.noTint();
        p.pop();
      } else if (cmd.type === "glow") {
        const ctx = this._p.drawingContext;
        const r = cmd.size / 2;
        const rgb = _hexToRgb(cmd.colorHex);
        const grad = ctx.createRadialGradient(cmd.x, cmd.y, 0, cmd.x, cmd.y, r);
        grad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${cmd.alpha})`);
        grad.addColorStop(1, `rgba(${rgb.r},${rgb.g},${rgb.b},0)`);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cmd.x, cmd.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (cmd.type === "particle") {
        const ctx = this._p.drawingContext;
        const rgb = _hexToRgb(cmd.colorHex);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${cmd.alpha})`;
        ctx.beginPath();
        ctx.arc(cmd.x, cmd.y, cmd.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    this._drawQueue = []; // vaciar cola después de ejecutar
  }
}
