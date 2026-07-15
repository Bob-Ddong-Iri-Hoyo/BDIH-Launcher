import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.cwd(), "tests", "Release", "feed");
const portArgumentIndex = process.argv.indexOf("--port");
const port = Number(portArgumentIndex >= 0
  ? process.argv[portArgumentIndex + 1]
  : process.env.BDIH_UPDATE_TEST_PORT || 45678);
const mimeTypes = new Map([
  [".yml", "text/yaml; charset=utf-8"],
  [".yaml", "text/yaml; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".zip", "application/zip"],
  [".blockmap", "application/octet-stream"],
]);

function send(response, statusCode, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

const server = http.createServer(async (request, response) => {
  try {
    const requestPath = decodeURIComponent(new URL(request.url || "/", `http://127.0.0.1:${port}`).pathname);
    if (requestPath === "/") {
      const files = await readdir(root);
      send(response, 200, `${JSON.stringify({ files }, null, 2)}\n`, "application/json; charset=utf-8");
      return;
    }

    const targetPath = path.resolve(root, `.${requestPath}`);
    const relativePath = path.relative(root, targetPath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      send(response, 403, "Forbidden\n");
      return;
    }

    const fileStat = await stat(targetPath);
    if (!fileStat.isFile()) {
      send(response, 404, "Not found\n");
      return;
    }

    response.writeHead(200, {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes.get(path.extname(targetPath)) || "application/octet-stream",
      "Content-Length": fileStat.size,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(targetPath).pipe(response);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
    send(response, code === "ENOENT" ? 404 : 500, code === "ENOENT" ? "Not found\n" : "Server error\n");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`BDIH update test feed: http://127.0.0.1:${port}/\n`);
  process.stdout.write(`Serving: ${root}\n`);
});
