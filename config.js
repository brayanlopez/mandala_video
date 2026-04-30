/**
 * config.js — Parámetros editables de la mandala
 *
 * Este es el único archivo que necesitás editar para personalizar la animación.
 * Para cambiar una imagen: reemplazá el archivo en la carpeta correspondiente.
 * Para cambiar el nombre del archivo: actualizá el array `images` del anillo.
 */

export const CONFIG = {
  // ─── Canvas y resolución ──────────────────────────────────────────────────
  canvas: {
    width: 1920, // ancho en px (Full HD)
    height: 1080, // alto en px (Full HD)
    bgColor: "#1a0a2e", // color de fondo (#hex o 'transparent')
    fps: 60, // frames por segundo para export (30 o 60)
  },

  // ─── Animación ────────────────────────────────────────────────────────────
  animation: {
    speed: 1.0, // velocidad global (0.5 = lento, 2.0 = rápido)
    staggerDelay: 160, // ms entre la entrada de cada imagen
    entryDuration: 700, // ms que dura el efecto de entrada de cada imagen
    entryEffect: "scaleIn", // 'fadeIn' | 'scaleIn' | 'spinIn' | 'flyIn'
    rotationSpeed: 0.04, // grados/frame de rotación continua (0 = sin rotación)
    loopAnimation: false, // repetir la animación al terminar
  },

  // ─── Estructura de la mandala ─────────────────────────────────────────────
  //
  // Cada objeto en `rings` define un anillo:
  //   count    → cantidad de posiciones en ese anillo
  //   radius   → distancia al centro en px (0 = centro exacto)
  //   imgSize  → tamaño de cada imagen en px (alto y ancho)
  //   images   → array de rutas de imágenes
  //              Si hay menos imágenes que `count`, se repiten en ciclo.
  //
  mandala: {
    rings: [
      {
        count: 1,
        radius: 0,
        imgSize: 150,
        images: ["images/center/flor_central.png"],
      },
      {
        count: 8,
        radius: 190,
        imgSize: 110,
        images: [
          "images/ring1/frutilla.png",
          "images/ring1/mango.png",
          "images/ring1/naranja.png",
          "images/ring1/uva.png",
        ],
      },
      {
        count: 12,
        radius: 330,
        imgSize: 85,
        images: [
          "images/ring2/rosa.png",
          "images/ring2/girasol.png",
          "images/ring2/margarita.png",
          "images/ring2/tulipan.png",
        ],
      },
      {
        count: 16,
        radius: 455,
        imgSize: 68,
        images: [
          "images/ring3/cereza.png",
          "images/ring3/limon.png",
          "images/ring3/flor_pequena.png",
          "images/ring3/hoja.png",
        ],
      },
    ],
  },

  // ─── Export de video ──────────────────────────────────────────────────────
  export: {
    // 'ccapture'    → CCapture.js, frame-by-frame, calidad alta (recomendado)
    // 'mediarecorder' → MediaRecorder API nativa, más simple pero calidad variable
    captureMode: "ccapture",

    // Duración del video exportado en segundos.
    // Si es null, exporta hasta que termine la animación de entrada.
    durationSeconds: null,

    // Bitrate para MediaRecorder (en bits/s). Solo aplica si captureMode='mediarecorder'.
    videoBitsPerSecond: 8_000_000, // 8 Mbps
  },
};
