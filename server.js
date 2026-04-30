/**
 * server.js — Servidor de desarrollo local
 *
 * Uso:
 *   node server.js
 *   → Primera vez: instala dependencias automáticamente (npm install)
 *   → Abre http://localhost:3000
 *
 * Requisitos: Node.js ≥ 16, npm. Sin otras dependencias externas.
 *
 * Por qué necesitás este servidor (y no file://):
 *   1. ES Modules no funcionan con file:// en Chrome/Firefox.
 *   2. SharedArrayBuffer (necesario para ffmpeg.wasm) requiere los headers:
 *        Cross-Origin-Opener-Policy: same-origin
 *        Cross-Origin-Embedder-Policy: require-corp
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PORT = 3000;
const ROOT = __dirname;

// ─── Auto-instalar dependencias en primera ejecución ──────────────────────

const NODE_MODULES = path.join(ROOT, "node_modules");

if (!fs.existsSync(NODE_MODULES)) {
  console.log("📦 Primera ejecución — instalando dependencias (npm install)…");
  try {
    execSync("npm install --prefer-offline", { cwd: ROOT, stdio: "inherit" });
    console.log("✅ Dependencias instaladas.\n");
  } catch (err) {
    console.error(
      '❌ Error instalando dependencias. Corré "npm install" manualmente.',
    );
    process.exit(1);
  }
}

// ─── Rutas especiales: librerías desde node_modules ──────────────────────
//
// Mapeamos /lib/xxx → node_modules específicos.
// Solo se exponen los archivos exactos que el HTML necesita (allowlist estricta).
// Esto previene servir contenido arbitrario de node_modules (CWE-22).

const LIB_ALLOWLIST = {
  "/lib/p5.min.js": path.join(ROOT, "node_modules", "p5", "lib", "p5.min.js"),
  "/lib/CCapture.all.min.js": path.join(
    ROOT,
    "node_modules",
    "ccapture.js",
    "build",
    "CCapture.all.min.js",
  ),
};

// ─── MIME types permitidos (allowlist) ───────────────────────────────────

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
  ".wasm": "application/wasm",
};

// ─── Headers de seguridad ─────────────────────────────────────────────────

const SECURITY_HEADERS = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cache-Control": "no-cache, no-store, must-revalidate",
  "X-Content-Type-Options": "nosniff",
};

// ─── Servidor ─────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  const urlPath = req.url.split("?")[0];

  // ── 1. Librerías desde node_modules (allowlist exacta) ─────────────────
  if (LIB_ALLOWLIST[urlPath]) {
    const libPath = LIB_ALLOWLIST[urlPath];
    serveFile(libPath, "application/javascript; charset=utf-8", res);
    return;
  }

  // ── 2. Archivos estáticos del proyecto ─────────────────────────────────
  //
  // Sanitizar path para prevenir path traversal (CWE-22).
  const normalized = path.normalize(urlPath);
  const fullPath = path.join(ROOT, normalized);

  // Verificar que el path esté dentro del ROOT
  if (!isInsideRoot(fullPath)) {
    respond(res, 403, "text/plain", "Forbidden");
    return;
  }

  // Si es directorio, servir index.html
  let filePath = fullPath;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    respond(res, 404, "text/plain", "Not Found");
    return;
  }

  // Verificar extensión permitida
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext];

  if (!mimeType) {
    respond(res, 403, "text/plain", "Forbidden — tipo de archivo no permitido");
    return;
  }

  serveFile(filePath, mimeType, res);
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function serveFile(filePath, mimeType, res) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        respond(res, 404, "text/plain", "Not Found");
      } else {
        // No exponer detalles internos del error al cliente (CWE-209)
        console.error("[Server] Error leyendo archivo:", err.code);
        respond(res, 500, "text/plain", "Internal Server Error");
      }
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeType,
      "Content-Length": data.length,
      ...SECURITY_HEADERS,
    });
    res.end(data);
  });
}

function respond(res, status, contentType, body) {
  const buf = Buffer.from(body, "utf-8");
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": buf.length,
    ...SECURITY_HEADERS,
  });
  res.end(buf);
}

function isInsideRoot(resolvedPath) {
  const rootWithSep = ROOT + path.sep;
  return resolvedPath.startsWith(rootWithSep) || resolvedPath === ROOT;
}

// ─── Arrancar ─────────────────────────────────────────────────────────────

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n🌸 Mandala corriendo en http://localhost:${PORT}\n`);
  console.log("   Ctrl+C para detener.\n");
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `❌ Puerto ${PORT} en uso. Cambiá PORT en server.js o cerrá el proceso que lo usa.`,
    );
  } else {
    console.error("❌ Error del servidor:", err.code);
  }
  process.exit(1);
});
