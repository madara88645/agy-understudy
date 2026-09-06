#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const USAGE = `Understudy — a live cockpit for the AI coding agents you delegate to Google Antigravity.

Usage
  agy-understudy [options]                                    start the cockpit (default)
  agy-understudy run --dir <sandbox> --prompt <file> [options] delegate one run to agy

Cockpit options
  --root <dir>     where runs live (default ~/agy-sandbox, or UNDERSTUDY_ROOT)
  --port <n>       cockpit port (default 4288, or UNDERSTUDY_PORT)
  --no-open        do not open a browser window

Run options
  --dir <sandbox>  run directory, must be inside --root  (required)
  --prompt <file>  prompt file, must be inside --dir     (required)
  --root <dir>     sandbox root (default ~/agy-sandbox, or UNDERSTUDY_ROOT)
  --mode <mode>    plan | accept-edits
  --agent <name>   Antigravity agent to use

  -h, --help       show this help and exit
  -v, --version    show the version and exit

Docs: https://github.com/madara88645/agy-understudy#readme`;

// Only these are real flags. Anything else is a typo, and a typo used to be swallowed
// silently (`--pot 5000` quietly started the cockpit on the default port) — see #10.
const COCKPIT_FLAGS = new Set(["root", "port", "no-open"]);
const RUN_FLAGS = new Set(["root", "dir", "prompt", "mode", "agent"]);

function parseFlags(argv, allowed) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    // `--root=/path` and `--root /path` are both common muscle memory; accept both.
    const eq = a.indexOf("=");
    const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
    if (!allowed.has(key)) fail(`unknown option "--${key}"`);
    out[key] = eq === -1 ? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true) : a.slice(eq + 1);
  }
  return out;
}
function fail(message) {
  console.error(`understudy: ${message}\n`);
  console.error(USAGE);
  process.exit(1);
}
function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try { spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref(); } catch { /* best-effort; ignore if no opener is available */ }
}

const argv = process.argv.slice(2);
// Handled before anything else so `--help` never boots a server the user did not ask for.
if (argv.includes("--help") || argv.includes("-h")) { console.log(USAGE); process.exit(0); }
if (argv.includes("--version") || argv.includes("-v")) { console.log(pkg.version); process.exit(0); }

const [cmd, ...rest] = argv;
if (cmd && !cmd.startsWith("-") && cmd !== "run") fail(`unknown command "${cmd}"`);

if (cmd === "run") {
  const f = parseFlags(rest, RUN_FLAGS);
  const { runAgy } = await import("../src/run.mjs");
  try {
    const r = await runAgy({ root: f.root, sandbox: f.dir, promptFile: f.prompt, mode: f.mode || "", agent: f.agent || "" });
    console.log(`status=${r.status} exit=${r.exitCode} termination=${r.termination ?? "-"}`);
    process.exitCode = r.exitCode;
  } catch (e) { console.error("understudy run:", e.message); process.exitCode = 2; }
} else {
  const f = parseFlags(argv, COCKPIT_FLAGS);
  const { startServer } = await import("../src/server.mjs");
  try {
    const server = await startServer({ sandboxRoot: f.root, port: f.port ? Number(f.port) : undefined });
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`Understudy cockpit → ${url}  (Ctrl+C to stop)`);
    if (!f["no-open"]) openBrowser(url);
  } catch (e) { console.error("understudy:", e.message); process.exitCode = 1; }
}
