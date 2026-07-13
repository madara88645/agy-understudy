#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

function parseFlags(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) { const key = a.slice(2); const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true; out[key] = val; }
  }
  return out;
}
function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try { spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref(); } catch { /* best-effort; ignore if no opener is available */ }
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === "run") {
  const f = parseFlags(rest);
  const { runAgy } = await import("../src/run.mjs");
  try {
    const r = await runAgy({ root: f.root, sandbox: f.dir, promptFile: f.prompt, mode: f.mode || "", agent: f.agent || "" });
    console.log(`status=${r.status} exit=${r.exitCode} termination=${r.termination ?? "-"}`);
    process.exitCode = r.exitCode;
  } catch (e) { console.error("understudy run:", e.message); process.exitCode = 2; }
} else {
  const f = parseFlags(process.argv.slice(2));
  const { startServer } = await import("../src/server.mjs");
  try {
    const server = await startServer({ sandboxRoot: f.root, port: f.port ? Number(f.port) : undefined });
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`Understudy cockpit → ${url}  (Ctrl+C to stop)`);
    if (!f["no-open"]) openBrowser(url);
  } catch (e) { console.error("understudy:", e.message); process.exitCode = 1; }
}
