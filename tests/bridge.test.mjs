import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createBridge } from "../bridge.mjs";

test("lists an in-root run and rejects traversal and symlink runs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "agy-viewer-")); const run = path.join(root, "safe-run");
  await mkdir(run); await writeFile(path.join(run, "agy.log"), "hello agy\n"); await writeFile(path.join(run, "plan.md"), "write gen.py\n"); await symlink(tmpdir(), path.join(root, "linked-run"));
  const server = await createBridge({ sandboxRoot: root, port: 0 }); const address = server.address(); const base = `http://127.0.0.1:${address.port}`;
  try { const runs = await (await fetch(`${base}/api/runs`)).json(); assert.equal(runs.runs.length, 1); assert.equal(runs.runs[0].id, "safe-run"); const detail = await (await fetch(`${base}/api/runs/safe-run`)).json(); assert.equal(detail.log, "hello agy\n"); assert.equal(detail.plan.path, "plan.md"); assert.equal((await fetch(`${base}/api/runs/linked-run`)).status, 400); } finally { await new Promise((resolve) => server.close(resolve)); }
});
