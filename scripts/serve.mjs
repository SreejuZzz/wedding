// Zero-dependency static server for previewing site/.
//   npm run serve            -> http://localhost:8000
//   PORT=3000 npm run serve
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "site");
const PORT = Number(process.env.PORT) || 8000;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

async function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const file = path.normalize(path.join(ROOT, clean));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null; // no path traversal
  const info = await stat(file).catch(() => null);
  if (!info) return null;
  return info.isDirectory() ? path.join(file, "index.html") : file;
}

createServer(async (req, res) => {
  const file = await resolveFile(req.url || "/");
  const body = file ? await readFile(file).catch(() => null) : null;
  if (!body) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
  res.end(body);
}).listen(PORT, () => console.log(`Serving site/ at http://localhost:${PORT}`));
