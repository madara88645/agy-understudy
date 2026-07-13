import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readdir, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatasetBridge } from "../dataset-bridge.mjs";

async function start(root) {
  const server = await createDatasetBridge({ datasetsRoot: root, port: 0 }); const address = server.address();
  return { server, base: `http://127.0.0.1:${address.port}` };
}
async function close(server) { await new Promise((resolve) => server.close(resolve)); }

const request = { mode: "demo", topic: "Campus energy consumption", audience: "Sustainability class", purpose: "Learn charts", columns: ["date", "energy_kwh", "occupancy_index"], rowCount: 12 };

test("local demo creates all required artifacts with a passing validation summary", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "campus-datasets-")); const { server, base } = await start(root);
  try {
    const response = await fetch(`${base}/api/datasets/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) }); const job = await response.json();
    assert.equal(response.status, 201); assert.equal(job.status, "completed"); assert.equal(job.validation.status, "passed"); assert.equal(job.preview.length, 8);
    const files = await readdir(path.join(root, job.id)); assert.deepEqual(new Set(["dataset.csv", "dataset.json", "data-dictionary.md", "research-sources.md", "assumptions.md", "validation.json"]).difference(new Set(files)).size, 0);
    const sources = await (await fetch(`${base}/api/datasets/jobs/${job.id}/artifacts/research-sources.md`)).text(); assert.match(sources, /Live web research: not performed/);
  } finally { await close(server); }
});

test("rejects malformed IDs, escaping paths, and symlink job directories", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "campus-datasets-")); await mkdir(path.join(root, "job-linked")); await symlink(tmpdir(), path.join(root, "job-linked", "dataset.csv")); await symlink(tmpdir(), path.join(root, "job-escape")); const { server, base } = await start(root);
  try {
    assert.equal((await fetch(`${base}/api/datasets/jobs/bad`)).status, 400);
    assert.equal((await fetch(`${base}/api/datasets/jobs/job-escape`)).status, 400);
    assert.equal((await fetch(`${base}/api/datasets/jobs/job-linked/artifacts/dataset.csv`)).status, 400);
  } finally { await close(server); }
});

test("does not fabricate live research when no agent is configured", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "campus-datasets-")); const { server, base } = await start(root);
  try {
    const response = await fetch(`${base}/api/datasets/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...request, mode: "live" }) }); const body = await response.json();
    assert.equal(response.status, 503); assert.equal(body.error.code, "agent_not_configured"); assert.match(body.error.message, /Agent not configured/);
  } finally { await close(server); }
});

test("accepts the browser preflight required by the local UI", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "campus-datasets-")); const { server, base } = await start(root);
  try { const response = await fetch(`${base}/api/datasets/jobs`, { method: "OPTIONS", headers: { Origin: "http://127.0.0.1:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } }); assert.equal(response.status, 204); assert.equal(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:3000"); } finally { await close(server); }
});
