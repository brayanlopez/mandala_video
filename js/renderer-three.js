/**
 * renderer-three.js — Adaptador de renderizado usando Three.js
 *
 * Implementa la misma interfaz de 10 métodos que renderer-p5.js, más:
 *   setSlotMetadata(slots)  → proporciona ring index por slot para Z-depth 3D
 *   clearImageCache()       → libera texturas de GPU al cambiar de patrón
 *
 * Efectos GPU activos:
 *   • Z-depth por anillo    — cada anillo se renderiza en un plano Z distinto
 *   • Halo aditivo          — mesh pool con CanvasTexture + AdditiveBlending
 *   • Partículas GPU        — BufferGeometry actualizado desde drawParticle()
 *
 * Los efectos idle float y respiración de cámara son calculados por animator.js
 * (coordenadas pre-computadas). El renderer recibe las posiciones ya modificadas.
 *
 * Requisitos:
 *   • Three.js r128 servido desde /lib/three.module.js
 *   • preserveDrawingBuffer: true para compatibilidad con CCapture
 */

import * as THREE from "../lib/three.module.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte #RRGGBB a {r, g, b} (0–255). Fallback a blanco si inválido. */
function _hexToRgb(hex) {
  const h = hex.replace(/^#/, "");
  if (h.length !== 6) return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CAM_FOV = 40; // grados — mismo que en mandala3D
const RING_Z_STEP = -35; // unidades de profundidad por anillo
const MAX_PARTICLES = 512; // pre-allocated particle buffer size

// ─── Clase principal ──────────────────────────────────────────────────────────

export class ThreeRenderer {
  constructor() {
    this._scene = null;
    this._camera = null;
    this._webgl = null;
    this._canvas = null;
    this._canvasW = 0;
    this._canvasH = 0;

    // Geometría compartida para todos los sprites — PlaneGeometry(1,1) escalada por mesh
    this._sharedGeo = null;

    // Pool de sprites para las imágenes (crece según demanda, nunca se encoge)
    this._sprites = []; // THREE.Mesh[]

    // Pool de meshes para los halos (glow)
    this._glowMeshes = [];
    this._glowTex = null;

    // Sistema de partículas GPU
    this._particlePoints = null;

    // Metadatos de slots → ring index (para Z-depth)
    this._slotRing = []; // slotIndex → ring number

    // Caché de texturas
    this._textureCache = new Map(); // src → Promise<THREE.Texture|null>

    // Colas por frame (llenadas por los métodos de dibujo, consumidas en flush)
    this._imageQueue = []; // { tex, x, y, size, alpha, rotDeg, slotIndex }
    this._glowQueue = []; // { x, y, size, alpha, colorHex }
    this._particleQueue = []; // { x, y, size, alpha, colorHex }

    this._lastBgColor = null;
  }

  // ─── Interfaz pública — 10 métodos ───────────────────────────────────────────

  /**
   * Inicializa la escena Three.js y monta el canvas en el DOM.
   * preserveDrawingBuffer: true es requerido para CCapture.
   */
  init(containerId, width, height, onReady) {
    this._canvasW = width;
    this._canvasH = height;

    // Escena
    this._scene = new THREE.Scene();

    // Cámara perspectiva calibrada para pixel-perfect en z=0:
    // A la distancia camDist el frustum tiene exactamente `height` px de alto,
    // por lo que 1 unidad de mundo = 1 píxel en el plano z=0.
    const aspect = width / height;
    const camDist = height / 2 / Math.tan((CAM_FOV / 2) * (Math.PI / 180));
    this._camera = new THREE.PerspectiveCamera(CAM_FOV, aspect, 1, camDist * 4);
    this._camera.position.set(0, 0, camDist);
    this._camera.lookAt(new THREE.Vector3(0, 0, 0));

    // WebGL renderer
    this._webgl = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true, // necesario para CCapture
    });
    this._webgl.setSize(width, height);
    this._webgl.setPixelRatio(1); // determinístico para export

    const container = document.getElementById(containerId);
    container.appendChild(this._webgl.domElement);
    this._canvas = this._webgl.domElement;

    // Recursos compartidos
    this._sharedGeo = new THREE.PlaneGeometry(1, 1);
    this._glowTex = this._makeGlowTexture();

    // Sistema de partículas GPU
    this._initParticleBuffer();

    onReady();
  }

  /**
   * Carga una imagen como THREE.Texture.
   * La ruta ya viene sanitizada desde geometry.js.
   *
   * @param {string} src
   * @returns {Promise<THREE.Texture|null>}
   */
  loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (this._textureCache.has(src)) return this._textureCache.get(src);

    const promise = new Promise((resolve) => {
      new THREE.TextureLoader().load(
        src,
        (tex) => {
          tex.minFilter = THREE.LinearFilter;
          tex.magFilter = THREE.LinearFilter;
          resolve(tex);
        },
        undefined,
        () => {
          console.warn(`[ThreeRenderer] No se pudo cargar: ${src}`);
          resolve(null);
        },
      );
    });

    this._textureCache.set(src, promise);
    return promise;
  }

  /**
   * Resetea las colas del frame y actualiza el color de fondo si cambió.
   * @param {string} bgColor - Color CSS (#hex o 'transparent')
   */
  clear(bgColor) {
    if (bgColor && bgColor !== this._lastBgColor) {
      if (bgColor === "transparent") {
        this._webgl.setClearColor(0x000000, 0);
      } else {
        this._webgl.setClearColor(new THREE.Color(bgColor), 1);
      }
      this._lastBgColor = bgColor;
    }
    this._imageQueue = [];
    this._glowQueue = [];
    this._particleQueue = [];
  }

  /**
   * Encola el render de un sprite.
   * El 7º parámetro slotIndex es usado para calcular la profundidad Z por anillo.
   * No forma parte de la interfaz base (p5 lo ignora), pero es parte del contrato
   * del sistema multi-renderer cuando se usa Three.js.
   *
   * @param {THREE.Texture|null} tex
   * @param {number} x        - Centro X en coordenadas canvas (px)
   * @param {number} y        - Centro Y en coordenadas canvas (px)
   * @param {number} size     - Tamaño en px
   * @param {number} alpha    - Opacidad 0–1
   * @param {number} rotDeg   - Rotación en grados
   * @param {number} [slotIndex=0] - Índice global del slot (para Z-depth)
   */
  drawImage(tex, x, y, size, alpha, rotDeg, slotIndex = 0) {
    if (!tex) return;
    this._imageQueue.push({ tex, x, y, size, alpha, rotDeg, slotIndex });
  }

  /**
   * Encola un halo radial aditivo (CanvasTexture + AdditiveBlending).
   */
  drawGlow(x, y, size, alpha, colorHex) {
    if (alpha <= 0) return;
    this._glowQueue.push({ x, y, size, alpha, colorHex });
  }

  /**
   * Encola una partícula. Las posiciones se envían al GPU BufferGeometry en flush().
   */
  drawParticle(x, y, size, alpha, colorHex) {
    if (alpha <= 0) return;
    this._particleQueue.push({ x, y, size, alpha, colorHex });
  }

  /**
   * Aplica las colas al pool de meshes y llama a WebGLRenderer.render().
   */
  flush() {
    this._flushSprites();
    this._flushGlows();
    this._flushParticles();
    this._webgl.render(this._scene, this._camera);
  }

  /** @returns {HTMLCanvasElement} */
  getCanvas() {
    return this._canvas;
  }

  /**
   * Libera todas las texturas cargadas y limpia la caché.
   * Llamado por main.js al cambiar de patrón.
   */
  clearImageCache() {
    this._textureCache.forEach((promise) => {
      promise.then((tex) => {
        if (tex) tex.dispose();
      });
    });
    this._textureCache.clear();
  }

  /** No-op — en Three.js no hay un loop de efectos propio que pausar. */
  pauseEffects() {}
  /** No-op — todos los efectos continuos son manejados por animator.js. */
  tickEffects(_dt) {}
  /** No-op */
  resumeEffects() {}

  /**
   * Destruye el renderer y libera todos los recursos GPU.
   */
  destroy() {
    this.clearImageCache();

    this._sprites.forEach((m) => {
      m.material.dispose();
    });
    this._sprites = [];

    this._glowMeshes.forEach((m) => {
      m.material.dispose();
    });
    this._glowMeshes = [];

    if (this._glowTex) {
      this._glowTex.dispose();
      this._glowTex = null;
    }
    if (this._sharedGeo) {
      this._sharedGeo.dispose();
      this._sharedGeo = null;
    }

    if (this._particlePoints) {
      this._particlePoints.geometry.dispose();
      this._particlePoints.material.dispose();
      this._particlePoints = null;
    }

    if (this._webgl) {
      this._webgl.dispose();
      if (this._webgl.domElement.parentNode) {
        this._webgl.domElement.parentNode.removeChild(this._webgl.domElement);
      }
      this._webgl = null;
    }

    this._canvas = null;
    this._scene = null;
  }

  // ─── Métodos de extensión ────────────────────────────────────────────────────

  /**
   * Guarda el ring index por slot para aplicar Z-depth en flush().
   * Llamado por main.js después de calcular o cambiar el layout de la mandala.
   *
   * @param {import('./geometry.js').MandalaSlot[]} slots
   */
  setSlotMetadata(slots) {
    this._slotRing = slots.map((s) => s.ring ?? 0);
  }

  // ─── Privado: flush helpers ───────────────────────────────────────────────────

  _flushSprites() {
    const W = this._canvasW;
    const H = this._canvasH;
    const needed = this._imageQueue.length;

    while (this._sprites.length < needed) {
      this._addSpriteMesh();
    }

    this._imageQueue.forEach((cmd, i) => {
      const ring = this._slotRing[cmd.slotIndex] ?? 0;
      const z = ring * RING_Z_STEP;

      // Canvas (top-left, Y down) → Three.js (center, Y up)
      const wx = cmd.x - W / 2;
      const wy = -(cmd.y - H / 2);

      const mesh = this._sprites[i];
      mesh.material.map = cmd.tex;
      mesh.material.opacity = cmd.alpha;
      mesh.material.needsUpdate = true;

      mesh.position.set(wx, wy, z);
      mesh.rotation.z = (cmd.rotDeg * Math.PI) / 180;
      mesh.scale.set(cmd.size, cmd.size, 1);
      mesh.visible = true;
    });

    for (let i = needed; i < this._sprites.length; i++) {
      this._sprites[i].visible = false;
    }

    this._imageQueue = [];
  }

  _flushGlows() {
    const W = this._canvasW;
    const H = this._canvasH;
    const needed = this._glowQueue.length;

    while (this._glowMeshes.length < needed) {
      this._addGlowMesh();
    }

    this._glowQueue.forEach((cmd, i) => {
      const wx = cmd.x - W / 2;
      const wy = -(cmd.y - H / 2);

      const mesh = this._glowMeshes[i];
      mesh.position.set(wx, wy, -1); // ligeramente detrás de los sprites
      mesh.scale.set(cmd.size, cmd.size, 1);
      mesh.material.opacity = cmd.alpha;
      mesh.visible = true;
    });

    for (let i = needed; i < this._glowMeshes.length; i++) {
      this._glowMeshes[i].visible = false;
    }

    this._glowQueue = [];
  }

  _flushParticles() {
    if (!this._particlePoints) return;

    const geo = this._particlePoints.geometry;
    const posArr = geo.attributes.position.array;
    const colArr = geo.attributes.color.array;
    const szArr = geo.attributes.size.array;

    const W = this._canvasW;
    const H = this._canvasH;

    this._particleQueue.forEach((p, i) => {
      if (i >= MAX_PARTICLES) return;
      const wx = p.x - W / 2;
      const wy = -(p.y - H / 2);
      posArr[i * 3] = wx;
      posArr[i * 3 + 1] = wy;
      posArr[i * 3 + 2] = 5; // ligera profundidad al frente de la escena

      const rgb = _hexToRgb(p.colorHex);
      colArr[i * 3] = rgb.r / 255;
      colArr[i * 3 + 1] = rgb.g / 255;
      colArr[i * 3 + 2] = rgb.b / 255;

      szArr[i] = p.size;
    });

    // Ocultar posiciones no usadas (enviar fuera del frustum)
    for (let i = this._particleQueue.length; i < MAX_PARTICLES; i++) {
      posArr[i * 3 + 2] = -999999;
      szArr[i] = 0;
    }

    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;

    this._particleQueue = [];
  }

  // ─── Privado: creación de objetos Three.js ────────────────────────────────────

  _addSpriteMesh() {
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 1,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this._sharedGeo, mat);
    mesh.visible = false;
    this._scene.add(mesh);
    this._sprites.push(mesh);
  }

  _addGlowMesh() {
    const mat = new THREE.MeshBasicMaterial({
      map: this._glowTex,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this._sharedGeo, mat);
    mesh.visible = false;
    this._scene.add(mesh);
    this._glowMeshes.push(mesh);
  }

  /**
   * Genera una textura de degradado radial en un canvas 2D.
   * Centro: blanco rosado. Borde: transparente. Con AdditiveBlending produce un glow luminoso.
   * (Patrón extraído de mandala3D/js/renderer-three.js)
   *
   * @returns {THREE.CanvasTexture}
   */
  _makeGlowTexture() {
    const SIZE = 128;
    const cv = document.createElement("canvas");
    cv.width = SIZE;
    cv.height = SIZE;
    const ctx = cv.getContext("2d");
    const cx = SIZE / 2;

    const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    grad.addColorStop(0, "rgba(255, 210, 255, 1.0)");
    grad.addColorStop(0.3, "rgba(200, 150, 255, 0.65)");
    grad.addColorStop(0.65, "rgba(140,  80, 220, 0.25)");
    grad.addColorStop(1, "rgba( 80,  20, 160, 0.0)");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, SIZE, SIZE);

    return new THREE.CanvasTexture(cv);
  }

  _initParticleBuffer() {
    const pos = new Float32Array(MAX_PARTICLES * 3).fill(0);
    const col = new Float32Array(MAX_PARTICLES * 3).fill(1);
    const sz = new Float32Array(MAX_PARTICLES).fill(0);

    // Enviar todas las partículas fuera del frustum hasta que se reciban drawParticle() calls
    for (let i = 0; i < MAX_PARTICLES; i++) {
      pos[i * 3 + 2] = -999999;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(sz, 1));

    const mat = new THREE.PointsMaterial({
      size: 6,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this._particlePoints = new THREE.Points(geo, mat);
    this._scene.add(this._particlePoints);
  }
}
