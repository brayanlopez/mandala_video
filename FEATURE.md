# Analisis de Funcionalidades — Mandala Animada

> Analisis detallado de funcionalidades implementadas (con atribucion por archivo) y propuestas futuras.
> Para guia de inicio rapido, referencia de configuracion y estructura del proyecto, ver [README.md](README.md).

---

## Funcionalidades Actuales

### 1. Motor de Geometria

| Funcionalidad         | Descripcion                                                               | Archivo                |
| --------------------- | ------------------------------------------------------------------------- | ---------------------- |
| Anillos configurables | Cantidad de anillos, radios, tamanos e imagenes definidos en `config.js`  | `geometry.js`          |
| Patron circular       | Distribucion concentrica clasica de imagenes en anillos                   | `geometry-patterns.js` |
| Estrella interlazada  | Configuracion hexagonal tipo Estrella de David                            | `geometry-patterns.js` |
| Espiral dorada        | Disposicion organica basada en el angulo aureo de Fibonacci (137.508 deg) | `geometry-patterns.js` |
| Flor de la vida       | Cuadricula hexagonal de geometria sagrada                                 | `geometry-patterns.js` |
| Cuadricula sagrada    | Cuadrados anidados con rotacion y patron de estrella de ocho puntas       | `geometry-patterns.js` |
| Registro de patrones  | Sistema de registro extensible para agregar nuevos algoritmos de layout   | `geometry-patterns.js` |

### 2. Animacion

| Funcionalidad       | Descripcion                                                                 | Archivo       |
| ------------------- | --------------------------------------------------------------------------- | ------------- |
| Efecto: Scale In    | Entrada con rebote elastico (easeOutBack)                                   | `animator.js` |
| Efecto: Fade In     | Entrada por opacidad                                                        | `animator.js` |
| Efecto: Spin In     | Rotacion desde 270 deg hasta 0 en la entrada                                | `animator.js` |
| Efecto: Fly In      | Entrada elastica desde el centro del canvas                                 | `animator.js` |
| Rotacion global     | Rotacion continua de todo el mandala a velocidad configurable               | `animator.js` |
| Stagger delay       | Desfase temporal entre la entrada de cada imagen (configurable en ms)       | `animator.js` |
| Maquina de estados  | Control de estados play / pause / reset / resume con consistencia de frames | `animator.js` |
| Funciones de easing | Biblioteca interna: easeOutCubic, easeOutBack, easeOutElastic, lineal       | `animator.js` |
| Soporte de loop     | Opcion para reiniciar la animacion al finalizar                             | `config.js`   |

### 3. Exportacion de Video

| Funcionalidad          | Descripcion                                                                     | Archivo       |
| ---------------------- | ------------------------------------------------------------------------------- | ------------- |
| Modo CCapture          | Captura determinista cuadro a cuadro en formato WebM (recomendado)              | `exporter.js` |
| Modo MediaRecorder     | Captura en tiempo real mediante la API nativa del navegador                     | `exporter.js` |
| Resolucion Full HD     | Salida a 1920x1080 pixeles                                                      | `config.js`   |
| FPS configurable       | Soporte para 30 o 60 cuadros por segundo                                        | `config.js`   |
| Bitrate configurable   | Tasa de bits de video ajustable (por defecto 8 Mbps)                            | `config.js`   |
| Duracion personalizada | Duracion del video por configuracion o por deteccion automatica de la animacion | `exporter.js` |
| Barra de progreso      | Retroalimentacion visual durante la exportacion                                 | `index.html`  |
| Descarga automatica    | El archivo se guarda con nombre saneado automaticamente                         | `exporter.js` |

### 4. Interfaz de Usuario

| Funcionalidad             | Descripcion                                                         | Archivo      |
| ------------------------- | ------------------------------------------------------------------- | ------------ |
| Controles de reproduccion | Botones de play, pausa y reset para la previsualizacion             | `index.html` |
| Control de velocidad      | Slider de velocidad en tiempo real (0.2x a 3.0x)                    | `index.html` |
| Selector de efectos       | Cambia el efecto de entrada de imagenes durante la previsualizacion | `index.html` |
| Selector de patron        | Selector con los 5 estilos geometricos disponibles                  | `index.html` |
| Texto de estado           | Indicador del estado actual de la animacion                         | `index.html` |
| Overlay de exportacion    | Spinner y bloqueo de controles durante la captura de video          | `index.html` |

### 5. Gestion de Imagenes

| Funcionalidad           | Descripcion                                                                    | Archivo          |
| ----------------------- | ------------------------------------------------------------------------------ | ---------------- |
| Rutas relativas         | Soporte de rutas relativas con ciclado si hay menos imagenes que slots         | `geometry.js`    |
| Manejo de placeholder   | Degradacion elegante si una imagen falla al cargar                             | `renderer-p5.js` |
| Carpetas por anillo     | Organizacion de imagenes separada por anillo (center/, ring1/, ring2/, ring3/) | `images/`        |
| 13 imagenes por defecto | Frutas y flores en espanol incluidas en el repositorio                         | `images/`        |

### 6. Seguridad

| Funcionalidad             | Descripcion                                                                         | Archivo                    |
| ------------------------- | ----------------------------------------------------------------------------------- | -------------------------- |
| Content Security Policy   | Sin dependencias de CDN externas, sin eval(), sin scripts en linea                  | `server.js`                |
| Proteccion path traversal | Funcion `sanitizePath()` que elimina segmentos `..` y valida el juego de caracteres | `geometry.js`, `server.js` |
| Lista de MIME permitidos  | El servidor solo sirve tipos de archivo autorizados                                 | `server.js`                |
| Prevencion de XSS         | Uso de `textContent` en lugar de `innerHTML`, nombres de archivo saneados           | `main.js`, `exporter.js`   |
| Cabeceras de seguridad    | X-Content-Type-Options, COOP: same-origin, COEP: require-corp                       | `server.js`                |

### 7. Despliegue e Infraestructura

| Funcionalidad                | Descripcion                                                                              | Archivo                        |
| ---------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------ |
| Servidor local de desarrollo | `server.js` en Node.js con headers de seguridad e instalacion automatica de dependencias | `server.js`                    |
| GitHub Actions CI/CD         | Despliegue automatico a GitHub Pages en cada push a `main`                               | `.github/workflows/deploy.yml` |
| Build reproducible           | El workflow construye `dist/` copiando fuentes, librerias e imagenes                     | `.github/workflows/deploy.yml` |
| Sin bundler requerido        | ES Modules servidos directamente (sin Webpack ni Vite)                                   | arquitectura general           |

---

## Funcionalidades Futuras

Las siguientes propuestas se derivan del analisis de la arquitectura, los comentarios del codigo y las posibilidades naturales de extension del proyecto.

### Prioridad Alta

#### F-01 — Migracion del motor de renderizado a Three.js o PixiJS

- **Motivacion:** La arquitectura ya abstrae el renderizador en `renderer-p5.js` con una interfaz documentada. El `.gitignore` menciona `lib/three.module.js`, lo que sugiere un intento anterior.
- **Impacto:** Renderizado WebGL acelerado por GPU, efectos 3D, mejor rendimiento con mandalas de alta densidad.
- **Esfuerzo estimado:** Medio — se crea `renderer-three.js` o `renderer-pixi.js` sin modificar el resto del sistema.

#### F-02 — Nuevos patrones geometricos

- **Motivacion:** El codigo documenta explicitamente como agregar patrones al `PATTERN_REGISTRY`.
- **Candidatos:**
  - Cuadricula triangular (tiling de triangulos equilateros)
  - Patron de Voronoi
  - Laberinto o espiral de Arquimedes
  - Patrones fractales (copo de nieve de Koch, triangulo de Sierpinski)
- **Esfuerzo estimado:** Bajo por patron — solo se escribe una funcion `computeXxxLayout(config)`.

#### F-03 — Panel de configuracion visual (GUI en tiempo real)

- **Motivacion:** Actualmente toda la configuracion requiere editar `config.js` manualmente.
- **Propuesta:** Controles UI para colores de fondo, velocidades, tamanos, numero de anillos y activacion de loop, sin recargar la pagina.
- **Esfuerzo estimado:** Medio — se agrega un panel lateral que escribe sobre el objeto `CONFIG` en memoria.

#### F-04 — Exportacion a GIF animado

- **Motivacion:** El flujo de CCapture ya controla los frames; GIF es un formato de mayor portabilidad para redes sociales.
- **Propuesta:** Integrar `gif.js` como modo adicional de exportacion al lado de WebM.
- **Esfuerzo estimado:** Bajo — nueva rama en `exporter.js`.

### Prioridad Media

#### F-05 — Carga de imagenes personalizadas desde el navegador

- **Motivacion:** Hoy las imagenes deben colocarse en carpetas del servidor. Permitir arrastrar y soltar (drag & drop) o usar un `<input type="file">` habilitaria uso sin necesidad de editar archivos.
- **Propuesta:** API `FileReader` / `createObjectURL` para sustituir imagenes de anillos en tiempo real.
- **Esfuerzo estimado:** Medio — requiere adaptar la carga de imagenes en `renderer-p5.js` y `main.js`.

#### F-06 — Guardado y carga de presets de configuracion

- **Motivacion:** La infraestructura de LocalStorage ya esta referenciada en el codigo como punto de extension.
- **Propuesta:** Boton "Guardar preset" que serializa `CONFIG` a LocalStorage / JSON descargable, y boton "Cargar preset" para restaurarlo.
- **Esfuerzo estimado:** Bajo.

#### F-07 — Sincronizacion con audio / BPM

- **Motivacion:** Los mandalas animados tienen un nicho claro en visualizaciones musicales.
- **Propuesta:** Entrada de audio (microfono o archivo) con analisis de frecuencia via `Web Audio API`; mapear amplitud y BPM a la velocidad de rotacion y stagger delay.
- **Esfuerzo estimado:** Alto — requiere nuevo modulo `audio-analyzer.js` y bindings en `animator.js`.

#### F-08 — Efectos de entrada adicionales

- **Motivacion:** Solo hay 4 efectos actualmente; agregar mas variedad aumenta el valor creativo.
- **Candidatos:**
  - Flip horizontal / vertical
  - Morph desde circulo
  - Caida con rebote (drop)
  - Giro 3D (requiere F-01 o CSS 3D transforms)
- **Esfuerzo estimado:** Bajo por efecto — nuevo caso en el `switch` de `animator.js`.

#### F-09 — Modo oscuro / temas de color dinamicos

- **Motivacion:** El color de fondo es un string fijo (`#1a0a2e`). Una paleta de temas (cosmos, bosque, oceano, fuego) enriqueceria la experiencia.
- **Propuesta:** Objeto de temas en `config.js` con selector en la UI.
- **Esfuerzo estimado:** Bajo.

#### F-10 — Exportacion a MP4 en el servidor

- **Motivacion:** WebM tiene compatibilidad limitada en algunos reproductores. La conversion a MP4 con H.264 requiere procesamiento en servidor.
- **Propuesta:** Endpoint opcional en `server.js` que recibe el WebM y lo convierte con `fluent-ffmpeg`.
- **Esfuerzo estimado:** Medio — requiere instalar `ffmpeg` en el entorno.

### Prioridad Baja / Experimental

#### F-11 — Mandala en 3D

- **Motivacion:** Requiere F-01 (Three.js). Con WebGL se podria animar el mandala en un torus o esfera 3D.
- **Esfuerzo estimado:** Alto.

#### F-12 — Mandala generativo con IA

- **Motivacion:** Usar un modelo de imagen (DALL-E, Stable Diffusion) para generar las imagenes de cada slot a partir de un prompt del usuario.
- **Propuesta:** Llamada a API de generacion de imagenes antes de iniciar la animacion; los resultados se usan como fuente de imagenes.
- **Esfuerzo estimado:** Alto — requiere integracion externa y manejo de claves de API.

#### F-13 — Modo presentacion / kiosco

- **Motivacion:** Pantalla completa con ciclo automatico de patrones y efectos, util para instalaciones o eventos.
- **Propuesta:** Opcion `kioskMode: true` en `config.js` que itera patrones y efectos automaticamente.
- **Esfuerzo estimado:** Bajo.

#### F-14 — Tests automatizados

- **Motivacion:** El modulo `geometry.js` y `geometry-patterns.js` son funciones puras ideales para pruebas unitarias.
- **Propuesta:** Agregar Vitest o Jest con tests para las funciones de calculo geometrico y el estado de la maquina de animacion.
- **Esfuerzo estimado:** Medio — sin impacto en produccion, mejora la mantenibilidad.

---

## Resumen de Estado

| Categoria                       | Estado                               |
| ------------------------------- | ------------------------------------ |
| Motor de geometria              | Completo (5 patrones)                |
| Sistema de animacion            | Completo (4 efectos, rotacion, loop) |
| Exportacion de video            | Completo (CCapture + MediaRecorder)  |
| Interfaz de usuario             | Funcional (controles basicos)        |
| Seguridad                       | Robusta (CSP, XSS, path traversal)   |
| CI/CD                           | Automatizado (GitHub Pages)          |
| GUI visual en tiempo real       | Pendiente                            |
| Carga de imagenes desde browser | Pendiente                            |
| Sincronizacion con audio        | Pendiente                            |
| Tests automatizados             | Pendiente                            |

---

_Generado el 2026-04-30 mediante analisis estatico del repositorio._
