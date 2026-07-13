import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the AGY Live Inspector by default while retaining a visible Dataset Lab destination", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>AGY Live Inspector<\/title>/i);
  assert.match(html, /AGY\s*<strong>Live Inspector<\/strong>/);
  // Inspector is the default surface: its welcome copy and the Antigravity primer are server-rendered.
  assert.match(html, /AGY LIVE INSPECTOR/);
  assert.match(html, /Antigravity nasıl çalışır\?/);
  // The Campus Dataset Lab remains reachable from the header nav.
  assert.match(html, /Campus Dataset Lab/);
});

test("product source has no starter preview dependency", async () => {
  const [page, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /_sites-preview|SkeletonPreview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});
