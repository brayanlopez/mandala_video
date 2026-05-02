/**
 * renderer-interface.js — Registro de motores de renderizado y factory
 *
 * Uso:
 *   import { createRenderer, RENDERER_REGISTRY } from "./renderer-interface.js";
 *   const renderer = await createRenderer("three");
 *
 * Para agregar un nuevo motor:
 *   1. Crear js/renderer-xxx.js implementando los 10 métodos del contrato.
 *   2. Agregar una entrada al RENDERER_REGISTRY.
 *   3. Agregar la opción al <select id="renderer-select"> en index.html.
 *   4. Sin cambios en animator.js, exporter.js, geometry*.js ni presets.js.
 */

/** Registro de motores disponibles. Fuente única de verdad para UI y lógica. */
export const RENDERER_REGISTRY = {
  p5: {
    label: "p5.js (Canvas 2D)",
    module: () => import("./renderer-p5.js"),
    ctor: "P5Renderer",
  },
  three: {
    label: "Three.js (WebGL 3D)",
    module: () => import("./renderer-three.js"),
    ctor: "ThreeRenderer",
  },
};

/**
 * Carga e instancia un renderer por nombre de motor.
 * Usa dynamic import para no cargar el bundle del motor no seleccionado.
 *
 * @param {"p5"|"three"} name
 * @returns {Promise<object>} Instancia del renderer
 */
export async function createRenderer(name) {
  const entry = RENDERER_REGISTRY[name];
  if (!entry) throw new Error(`Motor de renderer desconocido: "${name}"`);
  const mod = await entry.module();
  return new mod[entry.ctor]();
}
