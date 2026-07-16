import http from "node:http";
import { existsSync, lstatSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { analyzeAgyRun } from "./explain.mjs";

const UI_DIR = fileURLToPath(new URL("../dist/ui", import.meta.url));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".ico": "image/x-icon", ".woff2": "font/woff2", ".png": "image/png" };

async function serveStatic(response, pathname) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.resolve(UI_DIR, rel);
  if (target !== UI_DIR && !target.startsWith(UI_DIR + path.sep)) { return text(response, 400, "bad path"); }
  let file = target;
  try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("not a file"); }
  catch { file = path.join(UI_DIR, "index.html"); try { await fs.access(file); } catch { return text(response, 404, "UI not built. Run `npm run build`."); } }
  const body = await fs.readFile(file);
  response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": file.endsWith("index.html") ? "no-store" : "public, max-age=3600" });
  response.end(body);
}

const DEFAULT_ROOT = path.join(os.homedir(), "agy-sandbox");
const MAX_TEXT_BYTES = 512 * 1024;
const MAX_FILES = 160;
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function json(response, status, value) { response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); response.end(JSON.stringify(value)); }
function text(response, status, value) { response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }); response.end(value); }
function isDirectRunId(id) { return RUN_ID.test(id) && id !== "." && id !== ".."; }

async function readText(file) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("unsafe file");
  const handle = await fs.open(file, "r");
  try { const start = Math.max(0, stat.size - MAX_TEXT_BYTES); const buffer = Buffer.alloc(stat.size - start); await handle.read(buffer, 0, buffer.length, start); return buffer.toString("utf8"); } finally { await handle.close(); }
}

async function createReader(rootInput) {
  const target = path.resolve(rootInput);
  // Resolved per request rather than once at startup: a fresh install has no sandbox
  // root yet, and the cockpit must still open (empty) and then pick the root up the
  // moment the first `understudy run` creates it. The cockpit is read-only, so it
  // never creates the root itself.
  async function resolveRoot() {
    const root = await fs.realpath(target);
    if (!(await fs.lstat(root)).isDirectory()) throw new Error("AGY sandbox root is invalid");
    return root;
  }
  async function runPath(root, id) {
    if (!isDirectRunId(id)) throw new Error("invalid run id");
    const candidate = path.join(root, id);
    const relative = path.relative(root, candidate);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.dirname(candidate) !== root) throw new Error("outside root");
    const stat = await fs.lstat(candidate);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("invalid run directory");
    const resolved = await fs.realpath(candidate);
    if (path.dirname(resolved) !== root) throw new Error("resolved outside root");
    return resolved;
  }
  async function safeFile(base, relative) {
    const resolved = path.resolve(base, relative);
    if (!resolved.startsWith(base + path.sep)) throw new Error("outside run");
    const stat = await fs.lstat(resolved);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("unsafe file");
    return resolved;
  }
  async function readManifest(base) { try { const parsed = JSON.parse(await readText(await safeFile(base, ".agy-viewer-run.json"))); return typeof parsed === "object" && parsed ? parsed : null; } catch { return null; } }
  async function findPlan(base) {
    for (const name of ["plan.md", "prompt.md", ".agy-prompt.md"]) { try { return { path: name, content: await readText(await safeFile(base, name)) }; } catch { /* next */ } }
    try { const handoff = path.join(base, "handoff"); const stat = await fs.lstat(handoff); if (!stat.isDirectory() || stat.isSymbolicLink()) return null; const name = (await fs.readdir(handoff)).find((entry) => /^plan.*\.md$/i.test(entry)); return name ? { path: path.join("handoff", name), content: await readText(await safeFile(base, path.join("handoff", name))) } : null; } catch { return null; }
  }
  async function listFiles(base, directory = base, depth = 0, files = []) {
    if (depth > 2 || files.length >= MAX_FILES) return files;
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (files.length >= MAX_FILES || [".git", "node_modules", ".wrangler"].includes(entry.name)) continue;
      const full = path.join(directory, entry.name); const stat = await fs.lstat(full); if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) await listFiles(base, full, depth + 1, files);
      else if (stat.isFile() && !entry.name.startsWith(".agy-") && entry.name !== "agy.log") files.push(path.relative(base, full));
    }
    return files.sort();
  }
  async function statusFor(manifest) {
    if (!manifest) return "archived";
    if (manifest.status === "running" && Number.isInteger(manifest.pid)) { try { process.kill(manifest.pid, 0); return "running"; } catch { return manifest.exitCode === 0 ? "completed" : "failed"; } }
    return ["completed", "failed", "stalled", "terminated"].includes(manifest.status) ? manifest.status : "archived";
  }
  async function summary(root, id) {
    const base = await runPath(root, id); const logPath = await safeFile(base, "agy.log"); const logStat = await fs.stat(logPath); const manifest = await readManifest(base);
    const startedAt = typeof manifest?.startedAt === "string" ? manifest.startedAt : null; const endedAt = typeof manifest?.endedAt === "string" ? manifest.endedAt : null; const start = startedAt ? Date.parse(startedAt) : NaN; const end = endedAt ? Date.parse(endedAt) : Date.now();
    const status = await statusFor(manifest);
    // The runs list has no log to analyze client-side, so derive here whether a
    // "completed" run actually stopped to ask a question (see explain.mjs). Only
    // completed runs can be the misleading case, so skip the log read otherwise.
    let endedWithQuestion = false;
    if (status === "completed") {
      try { endedWithQuestion = analyzeAgyRun({ log: await readText(logPath), status }).endedWithQuestion; } catch { /* unreadable log -> leave false */ }
    }
    return { id, status, startedAt, endedAt, lastActivityAt: logStat.mtime.toISOString(), durationMs: Number.isFinite(start) ? Math.max(0, end - start) : null, logBytes: logStat.size, hasManifest: Boolean(manifest), endedWithQuestion };
  }
  async function runs() {
    let root;
    try { root = await resolveRoot(); } catch { return []; } // no sandbox root yet -> nothing to show
    const results = [];
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !isDirectRunId(entry.name)) continue;
      try { const base = await runPath(root, entry.name); const log = path.join(base, "agy.log"); if (!existsSync(log) || lstatSync(log).isSymbolicLink()) continue; results.push(await summary(root, entry.name)); } catch { /* ignore unsafe folders */ }
    }
    return results.sort((a, b) => Date.parse(b.lastActivityAt ?? "") - Date.parse(a.lastActivityAt ?? ""));
  }
  async function detail(id) {
    const root = await resolveRoot();
    const base = await runPath(root, id); const [run, manifest, plan, files] = await Promise.all([summary(root, id), readManifest(base), findPlan(base), listFiles(base)]); const log = await readText(await safeFile(base, "agy.log"));
    let prompt = typeof manifest?.prompt === "string" ? manifest.prompt : null; if (!prompt) { try { prompt = await readText(await safeFile(base, ".agy-prompt.md")); } catch { /* archived run */ } }
    return { ...run, sandboxPath: base, prompt, plan, log, files, pid: Number.isInteger(manifest?.pid) ? manifest.pid : null, pgid: Number.isInteger(manifest?.pgid) ? manifest.pgid : null, exitCode: Number.isInteger(manifest?.exitCode) ? manifest.exitCode : null, termination: typeof manifest?.termination === "string" ? manifest.termination : null };
  }
  return { detail, runs };
}

export async function createBridge({ sandboxRoot = process.env.UNDERSTUDY_ROOT || process.env.AGY_SANDBOX_ROOT || DEFAULT_ROOT, port = 4288 } = {}) {
  const reader = await createReader(sandboxRoot);
  const server = http.createServer(async (request, response) => {
    if (!request.url || request.method !== "GET") return text(response, 405, "method not allowed");
    const url = new URL(request.url, "http://127.0.0.1");
    try {
      if (url.pathname === "/health") return json(response, 200, { ok: true });
      if (url.pathname === "/api/runs") return json(response, 200, { runs: await reader.runs() });
      if (url.pathname === "/api/stream") {
        const id = url.searchParams.get("run") || ""; if (!isDirectRunId(id)) return text(response, 400, "invalid run id");
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
        const send = async () => response.write(`event: snapshot\ndata: ${JSON.stringify(await reader.detail(id))}\n\n`);
        await send(); const timer = setInterval(() => { void send().catch(() => response.end()); }, 1000); request.on("close", () => clearInterval(timer)); return;
      }
      const match = url.pathname.match(/^\/api\/runs\/([A-Za-z0-9][A-Za-z0-9._-]*)$/); if (match) return json(response, 200, await reader.detail(match[1]));
      return serveStatic(response, url.pathname);
    } catch (error) { const message = error instanceof Error ? error.message : "unknown error"; return text(response, /invalid|outside|unsafe|resolved/.test(message) ? 400 : 404, message); }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve)); return server;
}

export async function startServer({ sandboxRoot, port } = {}) {
  return createBridge({ sandboxRoot: sandboxRoot ?? process.env.UNDERSTUDY_ROOT, port: port ?? (Number(process.env.UNDERSTUDY_PORT) || 4288) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then((s) => console.log(`Understudy API on http://127.0.0.1:${s.address().port}`)).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
