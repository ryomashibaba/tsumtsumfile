import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { get as httpGet } from "node:http";
import { createConnection, createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = dirname(fileURLToPath(import.meta.url));

function request(port, pathname, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const requestHandle = httpGet({ host: "127.0.0.1", port, path: pathname }, (response) => {
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode,
          contentType: response.headers["content-type"],
          bytes
        });
      });
    });
    requestHandle.setTimeout(timeoutMs, () => requestHandle.destroy(new Error("request timed out")));
    requestHandle.on("error", reject);
  });
}

async function reservePort() {
  const reservation = createServer();
  await new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", resolve);
  });
  const address = reservation.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(port) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await request(port, "/", 500);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw lastError || new Error("server did not become ready");
}

test("static server serves every Tsum PNG in parallel while an idle socket is open", async (context) => {
  const port = await reservePort();
  const child = spawn(process.execPath, [join(PROJECT_ROOT, "scripts", "serve.mjs")], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  context.after(() => {
    if (!child.killed) {
      child.kill();
    }
  });

  const rootResponse = await waitForServer(port);
  assert.equal(rootResponse.status, 200);
  assert.match(rootResponse.contentType, /^text\/html/);

  const idleSocket = createConnection({ host: "127.0.0.1", port });
  await new Promise((resolve, reject) => {
    idleSocket.once("connect", resolve);
    idleSocket.once("error", reject);
  });
  context.after(() => idleSocket.destroy());

  const imageDirectory = join(PROJECT_ROOT, "tsum_image");
  const imageNames = (await readdir(imageDirectory)).filter((name) => name.endsWith(".png")).sort();
  assert.equal(imageNames.length, 17);

  const responses = await Promise.all(imageNames.map(async (name) => {
    const response = await request(port, `/tsum_image/${encodeURIComponent(name)}?v=tsum-images-5`);
    const fileInfo = await stat(join(imageDirectory, name));
    return { name, response, expectedBytes: fileInfo.size };
  }));

  for (const { name, response, expectedBytes } of responses) {
    assert.equal(response.status, 200, name);
    assert.equal(response.contentType, "image/png", name);
    assert.equal(response.bytes, expectedBytes, name);
  }
});
