import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workerPath = resolve(projectRoot, "dist/server/index.js");
const manifestPath = resolve(projectRoot, "dist/.openai/hosting.json");

const [source, manifest] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
JSON.parse(manifest);

// A data URL forces ESM parsing even though the generated output has no package.json.
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workerModule = await import(moduleUrl);
assert.equal(
  typeof workerModule.default?.fetch,
  "function",
  `${pathToFileURL(workerPath)} must export default.fetch`,
);
const catalogue = await workerModule.default.fetch(new Request('https://example.test/plans.json'));
assert.equal(catalogue.status, 200);
const plans = await catalogue.json();
assert.ok(plans.length > 0);
const image = await workerModule.default.fetch(new Request('https://example.test/' + plans[0].images[0].local_path));
assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
const page = await workerModule.default.fetch(new Request('https://example.test/'));
assert.match(await page.text(), /assets\/index/);
// PDF.js uses a module worker, which browsers reject with application/octet-stream.
const pdfWorkerAsset = source.match(/\/assets\/pdf\.worker\.min-[^"\\]+\.mjs/);
assert.ok(pdfWorkerAsset, 'PDF renderer worker must be bundled');
const pdfWorker = await workerModule.default.fetch(new Request('https://example.test' + pdfWorkerAsset[0]));
assert.match(pdfWorker.headers.get('Content-Type'), /javascript/);

console.log("Artifact is valid ESM and exports default.fetch");
