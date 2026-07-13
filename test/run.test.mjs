import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("understudy run records log, manifest and exit with a fake agy", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "understudy-"));
  const bin = path.join(root, "bin");
  await mkdir(bin);
  // fake `agy` that prints one narration line and exits 0
  const fake = path.join(bin, "agy");
  await writeFile(fake, "#!/usr/bin/env bash\necho 'I will read the files.'\nexit 0\n");
  await chmod(fake, 0o755);
  const sandbox = path.join(root, "job1");
  await mkdir(sandbox);
  await writeFile(path.join(sandbox, "prompt.md"), "do the thing");

  const prevPath = process.env.PATH;
  process.env.PATH = `${bin}:${prevPath}`;
  try {
    const { runAgy } = await import("../src/run.mjs");
    const r = await runAgy({ root, sandbox, promptFile: path.join(sandbox, "prompt.md") });
    assert.equal(r.status, "completed");
    assert.equal(r.exitCode, 0);
    const manifest = JSON.parse(await readFile(path.join(sandbox, ".agy-viewer-run.json"), "utf8"));
    assert.equal(manifest.status, "completed");
    const log = await readFile(path.join(sandbox, "agy.log"), "utf8");
    assert.match(log, /I will read the files/);
  } finally { process.env.PATH = prevPath; }
});

test("understudy run rejects a sandbox outside the root", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "understudy-root-"));
  const outside = await mkdtemp(path.join(tmpdir(), "understudy-out-"));
  await writeFile(path.join(outside, "p.md"), "x");
  const { runAgy } = await import("../src/run.mjs");
  await assert.rejects(() => runAgy({ root, sandbox: outside, promptFile: path.join(outside, "p.md") }), /must be inside/);
});

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("watchdog kills the whole process group on stall (no orphaned children)", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "understudy-grp-"));
  const bin = path.join(root, "bin"); await mkdir(bin);
  // fake agy: record a same-group grandchild's pid, then stall (no more output)
  await writeFile(path.join(bin, "agy"), "#!/usr/bin/env bash\necho working\nsleep 30 &\necho $! > gc.pid\nsleep 30\n");
  await chmod(path.join(bin, "agy"), 0o755);
  const sandbox = path.join(root, "job"); await mkdir(sandbox);
  await writeFile(path.join(sandbox, "p.md"), "x");
  const prev = process.env.PATH; process.env.PATH = `${bin}:${prev}`;
  try {
    const { runAgy } = await import("../src/run.mjs");
    const r = await runAgy({ root, sandbox, promptFile: path.join(sandbox, "p.md"), stallMs: 400, killGraceMs: 2000, timeoutMs: 30000 });
    assert.equal(r.status, "stalled");
    assert.equal(r.termination, "stall-90s-no-output");
    const gc = Number((await readFile(path.join(sandbox, "gc.pid"), "utf8")).trim());
    assert.ok(Number.isInteger(gc) && gc > 0, "grandchild pid recorded");
    let dead = false;
    for (let i = 0; i < 25 && !dead; i += 1) { if (!alive(gc)) dead = true; else await sleep(100); }
    assert.ok(dead, `grandchild ${gc} should have been killed with the group`);
  } finally { process.env.PATH = prev; }
});

test("watchdog escalates to SIGKILL and never hangs when agy ignores SIGTERM", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "understudy-kill-"));
  const bin = path.join(root, "bin"); await mkdir(bin);
  // fake agy: ignore SIGTERM and loop forever -> only SIGKILL can end it
  await writeFile(path.join(bin, "agy"), "#!/usr/bin/env bash\ntrap '' TERM\necho working\nwhile true; do sleep 0.2; done\n");
  await chmod(path.join(bin, "agy"), 0o755);
  const sandbox = path.join(root, "job"); await mkdir(sandbox);
  await writeFile(path.join(sandbox, "p.md"), "x");
  const prev = process.env.PATH; process.env.PATH = `${bin}:${prev}`;
  try {
    const { runAgy } = await import("../src/run.mjs");
    const r = await runAgy({ root, sandbox, promptFile: path.join(sandbox, "p.md"), stallMs: 400, killGraceMs: 600, timeoutMs: 30000 });
    assert.equal(r.status, "stalled"); // resolving at all proves the SIGKILL fallback ran and it did not hang
  } finally { process.env.PATH = prev; }
});

test("understudy run reports a clear error when agy is not on PATH", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "understudy-enoent-"));
  const emptyBin = path.join(root, "emptybin"); await mkdir(emptyBin);
  const sandbox = path.join(root, "job"); await mkdir(sandbox);
  await writeFile(path.join(sandbox, "p.md"), "x");
  const prev = process.env.PATH; process.env.PATH = emptyBin; // no agy anywhere
  try {
    const { runAgy } = await import("../src/run.mjs");
    await assert.rejects(() => runAgy({ root, sandbox, promptFile: path.join(sandbox, "p.md") }), /not found on your PATH/);
  } finally { process.env.PATH = prev; }
});

test("understudy run rejects an invalid --mode", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "understudy-mode-"));
  const sandbox = path.join(root, "job"); await mkdir(sandbox);
  await writeFile(path.join(sandbox, "p.md"), "x");
  const { runAgy } = await import("../src/run.mjs");
  await assert.rejects(() => runAgy({ root, sandbox, promptFile: path.join(sandbox, "p.md"), mode: "bogus" }), /must be "plan" or "accept-edits"/);
});
