import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const chrome = process.env.CHROME_BIN || "/usr/bin/google-chrome";

const contentTypes = { ".html": "text/html", ".js": "text/javascript" };

test("renders accessibly in light/dark themes at desktop/mobile sizes", async () => {
  const server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    try {
      const file = resolve(root, `.${path}`);
      assert.ok(file.startsWith(root), "request stays inside the repository");
      const contents = await readFile(file);
      response.writeHead(200, { "content-type": contentTypes[extname(file)] || "application/octet-stream" });
      response.end(contents);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  await new Promise(resolveReady => server.listen(0, "127.0.0.1", resolveReady));
  const { port } = server.address();
  const output = await mkdtemp(join(tmpdir(), "solarbridge-render-"));

  try {
    for (const view of ["overview", "system"]) {
      for (const theme of ["light", "dark"]) {
        for (const [width, height] of [[554, 900], [390, 1200]]) {
          const url = `http://127.0.0.1:${port}/test/render-fixture.html?theme=${theme}&view=${view}`;
          const common = ["--headless", "--no-sandbox", "--disable-gpu", `--window-size=${width},${height}`, "--hide-scrollbars", "--virtual-time-budget=2000"];
          const { stdout } = await execFileAsync(chrome, [...common, "--dump-dom", url], { maxBuffer: 2 ** 20 });
          const match = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
          assert.ok(match, `render results exist for ${view}, ${theme} at ${width}px`);
          const result = JSON.parse(match[1].replaceAll("&quot;", '"'));
          assert.deepEqual(Object.entries(result.tests).filter(([, passed]) => !passed), [], JSON.stringify(result));

          const screenshot = join(output, `${view}-${theme}-${width}.png`);
          await execFileAsync(chrome, [...common, `--screenshot=${screenshot}`, url]);
          const png = await readFile(screenshot);
          assert.equal(png.subarray(1, 4).toString(), "PNG");
          assert.ok(png.length > 10_000, `non-empty ${view} ${theme} ${width}px visual render`);
        }
      }
    }

    const reducedUrl = `http://127.0.0.1:${port}/test/render-fixture.html?theme=dark&view=system`;
    const reducedArgs = ["--headless", "--no-sandbox", "--disable-gpu", "--window-size=390,720", "--force-prefers-reduced-motion", "--virtual-time-budget=2000", "--dump-dom", reducedUrl];
    const { stdout } = await execFileAsync(chrome, reducedArgs, { maxBuffer: 2 ** 20 });
    const match = stdout.match(/<pre id="result">([^<]+)<\/pre>/);
    assert.ok(match, "reduced-motion render results exist");
    const result = JSON.parse(match[1].replaceAll("&quot;", '"'));
    assert.deepEqual(Object.entries(result.tests).filter(([, passed]) => !passed), [], JSON.stringify(result));
  } finally {
    server.closeAllConnections();
    await new Promise(resolveClosed => server.close(resolveClosed));
    await rm(output, { recursive: true, force: true });
  }
});
