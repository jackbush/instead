// Serves the extension's pages (settings, suggestion page, list) as a website
// with a stand-in for the extension API (scripts/fake-extension.js), straight
// from src/, so a reload shows an edit. Settings are kept in the browser's
// localStorage for this address; the suggestion page reads them.
//
//   npm run preview   then open http://localhost:8001/options.html?welcome
//
// PORT changes the port.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 8001);
// Where build.sh copies from, later ones overriding earlier ones.
const DIRS = ["src/extension", "src/page", "src/shared"].map((d) => join(ROOT, d));
const FAKE = "fake-extension.js";
const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".txt": "text/plain", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml",
};

function find(path) {
  if (path === FAKE) return readFileSync(join(ROOT, "scripts", FAKE));
  for (const dir of DIRS) {
    try { return readFileSync(join(dir, path)); } catch {}
  }
  return null;
}

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "") || "options.html";
  let body = find(path);
  if (body === null) return res.writeHead(404).end();
  // The stand-in loads before any of the page's own scripts.
  if (path.endsWith(".html")) body = body.toString().replace(/<meta charset="utf-8">/, `$&\n  <script src="${FAKE}"></script>`);
  res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream", "cache-control": "no-store" });
  res.end(body);
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Settings:         http://localhost:${PORT}/options.html?welcome
Suggestion page:  http://localhost:${PORT}/demo.html
Every suggestion: http://localhost:${PORT}/list.html`);
});
