# Funcionalidades — Mandala Animada

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
