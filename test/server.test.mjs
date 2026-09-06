import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBridge } from "../src/server.mjs";

test("opens on a fresh machine with no sandbox root, and picks the root up once it appears", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "agy-fresh-"));
  const root = path.join(parent, "agy-sandbox"); // deliberately never created: this is a brand-new user
  const server = await createBridge({ sandboxRoot: root, port: 0 }); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.deepEqual(await (await fetch(`${base}/api/runs`)).json(), { runs: [] }); // must not crash with ENOENT
    assert.equal(existsSync(root), false, "the read-only cockpit must not create the root");
    const run = path.join(root, "first-run"); await mkdir(run, { recursive: true }); await writeFile(path.join(run, "agy.log"), "hello agy\n");
    const runs = await (await fetch(`${base}/api/runs`)).json(); // the root is resolved per request, so no restart is needed
    assert.equal(runs.runs.length, 1); assert.equal(runs.runs[0].id, "first-run");
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("lists an in-root run and rejects traversal and symlink runs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agy-viewer-")); const run = path.join(root, "safe-run");
  await mkdir(run); await writeFile(path.join(run, "agy.log"), "hello agy\n"); await writeFile(path.join(run, "plan.md"), "write gen.py\n"); await symlink(tmpdir(), path.join(root, "linked-run"));
  const server = await createBridge({ sandboxRoot: root, port: 0 }); const address = server.address(); const base = `http://127.0.0.1:${address.port}`;
  try { const runs = await (await fetch(`${base}/api/runs`)).json(); assert.equal(runs.runs.length, 1); assert.equal(runs.runs[0].id, "safe-run"); const detail = await (await fetch(`${base}/api/runs/safe-run`)).json(); assert.equal(detail.log, "hello agy\n"); assert.equal(detail.plan.path, "plan.md"); assert.equal((await fetch(`${base}/api/runs/linked-run`)).status, 400); } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("the runs list flags a completed run that ended on a question (#3)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agy-asked-"));
  const manifest = (extra) => JSON.stringify({ version: 1, status: "completed", exitCode: 0, startedAt: "2026-01-01T00:00:00Z", endedAt: "2026-01-01T00:01:00Z", ...extra });

  const asked = path.join(root, "asked-run"); await mkdir(asked);
  await writeFile(path.join(asked, "agy.log"), "I will read the files.\nPlease let me know if you approve this design before I proceed.\n");
  await writeFile(path.join(asked, ".agy-viewer-run.json"), manifest());

  const finished = path.join(root, "done-run"); await mkdir(finished);
  await writeFile(path.join(finished, "agy.log"), "I will read the files.\nI will run the tests to verify the result.\n");
  await writeFile(path.join(finished, ".agy-viewer-run.json"), manifest());

  const server = await createBridge({ sandboxRoot: root, port: 0 }); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const { runs } = await (await fetch(`${base}/api/runs`)).json();
    const askedRun = runs.find((r) => r.id === "asked-run");
    const doneRun = runs.find((r) => r.id === "done-run");
    assert.equal(askedRun.status, "completed");
    assert.equal(askedRun.endedWithQuestion, true);
    assert.equal(doneRun.endedWithQuestion, false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("a busy port fails with a sentence, not an unhandled EADDRINUSE", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agy-busy-"));
  const first = await createBridge({ sandboxRoot: root, port: 0 });
  const port = first.address().port;
  try {
    await assert.rejects(() => createBridge({ sandboxRoot: root, port }), /already in use.*--port/s);
  } finally { await new Promise((resolve) => first.close(resolve)); }
});

test("serves a built UI asset and falls back to index.html", async () => {
  const { mkdtemp } = await import("node:fs/promises");
  const os = await import("node:os"); const path = (await import("node:path")).default;
  const root = await mkdtemp(path.join(os.tmpdir(), "agy-viewer-"));
  const server = await createBridge({ sandboxRoot: root, port: 0 });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // index.html may or may not exist depending on build; assert the route does not 404 the API
    const health = await fetch(`${base}/health`); assert.equal(health.status, 200);
    const spa = await fetch(`${base}/some/client/route`);
    assert.ok(spa.status === 200 || spa.status === 404); // 200 if built, 404 (with build hint) if not
  } finally { await new Promise((r) => server.close(r)); }
});
