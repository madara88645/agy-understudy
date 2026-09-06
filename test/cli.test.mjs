import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../bin/understudy.mjs", import.meta.url));
const PKG = fileURLToPath(new URL("../package.json", import.meta.url));

// Every one of these used to boot the cockpit server instead of answering (#10), so the
// assertions that matter are "exited at all" and "said something", not just the exit code.
function cli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { timeout: 10_000 }, (error, stdout, stderr) =>
      resolve({ code: error?.code ?? 0, stdout, stderr }));
  });
}

test("--help and -h print usage and exit 0 without starting the cockpit (#10)", async () => {
  for (const flag of ["--help", "-h"]) {
    const { code, stdout } = await cli([flag]);
    assert.equal(code, 0, `${flag} should exit 0`);
    assert.match(stdout, /Usage/);
    assert.match(stdout, /agy-understudy run --dir <sandbox> --prompt <file>/);
    assert.doesNotMatch(stdout, /Understudy cockpit →/, `${flag} must not start the server`);
  }
});

test("--version and -v print the package version and exit 0 (#10)", async () => {
  const version = JSON.parse(await readFile(PKG, "utf8")).version;
  for (const flag of ["--version", "-v"]) {
    const { code, stdout } = await cli([flag]);
    assert.equal(code, 0, `${flag} should exit 0`);
    assert.equal(stdout.trim(), version);
  }
});

test("an unknown subcommand fails with usage instead of starting the cockpit (#10)", async () => {
  const { code, stdout, stderr } = await cli(["serv"]);
  assert.equal(code, 1);
  assert.match(stderr, /unknown command "serv"/);
  assert.match(stderr, /Usage/);
  assert.doesNotMatch(stdout, /Understudy cockpit →/);
});

test("a mistyped option fails instead of silently falling back to a default (#10)", async () => {
  const { code, stdout, stderr } = await cli(["--pot", "5000"]);
  assert.equal(code, 1);
  assert.match(stderr, /unknown option "--pot"/);
  assert.doesNotMatch(stdout, /Understudy cockpit →/);

  const run = await cli(["run", "--dirr", "/tmp/nope"]);
  assert.equal(run.code, 1);
  assert.match(run.stderr, /unknown option "--dirr"/);
});

test("`run` still reports its own missing arguments with exit 2", async () => {
  const { code, stderr } = await cli(["run"]);
  assert.equal(code, 2);
  assert.match(stderr, /run requires --dir <sandbox> and --prompt <file>/);
});

test("--flag=value is accepted alongside --flag value", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "understudy-cli-"));
  const missing = path.join(root, "no-such-run");
  // The value has to have parsed for `run` to get as far as the sandbox check.
  const { code, stderr } = await cli(["run", `--root=${root}`, `--dir=${missing}`, `--prompt=${path.join(missing, "p.md")}`]);
  assert.equal(code, 2);
  assert.match(stderr, /sandbox directory not found/);
  assert.ok(stderr.includes(missing), `error should name the parsed --dir value, got: ${stderr}`);
});
