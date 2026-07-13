import { spawn } from "node:child_process";
import { promises as fs, openSync, closeSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const TIMEOUT_MS = 6 * 60 * 1000;
const STALL_MS = 90 * 1000;
function isoNow() { return new Date().toISOString().replace(/\.\d+Z$/, "Z"); }

export async function runAgy({ root, sandbox, promptFile, mode = "", agent = "" }) {
  if (!sandbox || !promptFile) throw new Error("run requires --dir <sandbox> and --prompt <file>");
  // realpath ALL three paths so the containment check is symlink-safe
  // (macOS /var -> /private/var would otherwise produce false "outside root" errors).
  const rootReal = await fs.realpath(path.resolve(root ?? process.env.UNDERSTUDY_ROOT ?? path.join(os.homedir(), "agy-sandbox")));
  let sandboxReal;
  try { sandboxReal = await fs.realpath(path.resolve(sandbox)); }
  catch { throw new Error(`sandbox directory not found: ${sandbox}`); }
  if (!(sandboxReal === rootReal || sandboxReal.startsWith(rootReal + path.sep))) throw new Error(`sandbox must be inside ${rootReal}`);
  let promptReal;
  try { promptReal = await fs.realpath(path.resolve(promptFile)); }
  catch { throw new Error(`prompt file not found: ${promptFile}`); }
  if (!promptReal.startsWith(sandboxReal + path.sep)) throw new Error("prompt file must be inside the sandbox");

  const log = path.join(sandboxReal, "agy.log");
  const manifestPath = path.join(sandboxReal, ".agy-viewer-run.json");
  const promptCopy = path.join(sandboxReal, ".agy-prompt.md");
  const promptText = await fs.readFile(promptReal, "utf8");
  await fs.writeFile(promptCopy, promptText);
  await fs.writeFile(log, "");

  const args = [];
  if (agent) args.push("--agent", agent);
  if (mode) args.push("--mode", mode);
  args.push("--add-dir", sandboxReal, "--print", promptText);

  const startedAt = isoNow();
  const fd = openSync(log, "a"); // agy writes stdout+stderr straight to the log (matches `> log 2>&1`)
  let child;
  try { child = spawn("agy", args, { cwd: sandboxReal, stdio: ["ignore", fd, fd] }); }
  catch (e) { closeSync(fd); throw new Error(`could not start agy: ${e.message}`); }

  async function writeManifest(status, extra = {}) {
    const m = { version: 1, status, sandboxPath: sandboxReal, prompt: promptText, startedAt, pid: child.pid ?? null, pgid: child.pid ?? null, mode: mode || null, agent: agent || null, ...extra };
    await fs.writeFile(manifestPath, JSON.stringify(m, null, 2) + "\n");
  }

  // Attach exit/error listeners synchronously so a fast-exiting child is never missed.
  let sawError = null;
  const done = new Promise((resolve) => {
    child.once("error", (e) => { sawError = e; resolve(undefined); });
    child.once("exit", (c) => resolve(c ?? 1));
  });
  await writeManifest("running");

  let termination = "";
  let lastSize = -1, lastChange = Date.now();
  const t0 = Date.now();
  const watchdog = setInterval(async () => {
    try { const s = (await fs.stat(log)).size; if (s !== lastSize) { lastSize = s; lastChange = Date.now(); } } catch { /* stat may fail transiently; ignore */ }
    if (Date.now() - t0 >= TIMEOUT_MS) { termination = "timeout-6min"; child.kill("SIGTERM"); }
    else if (Date.now() - lastChange >= STALL_MS) { termination = "stall-90s-no-output"; child.kill("SIGTERM"); }
  }, 5000);

  const code = await done;
  clearInterval(watchdog);
  closeSync(fd);

  if (sawError) {
    const msg = sawError.code === "ENOENT" ? "`agy` was not found on your PATH. Install Google Antigravity first." : sawError.message;
    await writeManifest("failed", { endedAt: isoNow(), exitCode: 127, termination: "agy-not-found" });
    throw new Error(msg);
  }
  const status = termination ? "stalled" : code !== 0 ? "failed" : "completed";
  await writeManifest(status, { endedAt: isoNow(), exitCode: code, ...(termination ? { termination } : {}) });
  return { status, exitCode: code, termination: termination || null, sandbox: sandboxReal };
}
