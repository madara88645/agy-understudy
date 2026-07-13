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
