import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { createGzip } from "node:zlib";

const root = normalize(join(import.meta.dirname, ".."));
const port = Number(process.env.PORT || 8765);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

const compressibleExtensions = new Set([".css", ".html", ".js", ".mjs", ".svg"]);

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = normalize(join(root, relative));
    if (!filePath.startsWith(root)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(filePath);
    if (!info.isFile()) {
      throw new Error("Not a file");
    }
    const extension = extname(filePath).toLowerCase();
    const etag = `W/\"${info.size.toString(16)}-${Math.trunc(info.mtimeMs).toString(16)}\"`;
    const headers = {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      ETag: etag,
      Vary: "Accept-Encoding"
    };
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, headers).end();
      return;
    }
    const acceptsGzip = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(request.headers["accept-encoding"] || "");
    if (acceptsGzip && compressibleExtensions.has(extension)) {
      headers["Content-Encoding"] = "gzip";
      response.writeHead(200, headers);
      createReadStream(filePath).pipe(createGzip()).pipe(response);
      return;
    }
    response.writeHead(200, headers);
    createReadStream(filePath).pipe(response);
  } catch (error) {
    response.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`TsumTsum dev server: http://127.0.0.1:${port}`);
});
