import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.join(os.homedir(), "agy-sandbox", "datasets");
const JOB_ID = /^[a-z0-9][a-z0-9-]{7,63}$/;
const ARTIFACTS = new Set(["dataset.csv", "dataset.json", "data-dictionary.md", "research-sources.md", "assumptions.md", "validation.json"]);
const BLOCKED_COLUMNS = /(?:name|email|phone|address|student.?id|grade|diagnos|patient|credential|password|token)/i;
function localCorsOrigin(origin) { return /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin || "") ? origin : "http://localhost:3000"; }

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, { "Content-Type": type, "Access-Control-Allow-Origin": response.corsOrigin || "http://localhost:3000", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" });
  response.end(type.startsWith("application/json") ? JSON.stringify(body) : body);
}
function error(response, status, code, message) { send(response, status, { error: { code, message } }); }
function validJobId(id) { return typeof id === "string" && JOB_ID.test(id) && id !== "." && id !== ".."; }
function csvCell(value) { const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text; }
function dateString(date) { return date.toISOString().slice(0, 10); }

export async function createDatasetService({ datasetsRoot = process.env.CAMPUS_DATASETS_ROOT || DEFAULT_ROOT, liveProvider = process.env.CAMPUS_DATASET_AGENT_URL ? { configured: true } : { configured: false } } = {}) {
  await fs.mkdir(datasetsRoot, { recursive: true });
  const root = await fs.realpath(datasetsRoot);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("dataset root is invalid");

  async function jobPath(id, create = false) {
    if (!validJobId(id)) throw new Error("invalid job id");
    const candidate = path.join(root, id);
    if (path.dirname(candidate) !== root) throw new Error("outside dataset root");
    if (create) await fs.mkdir(candidate, { recursive: false });
    const candidateStat = await fs.lstat(candidate);
    if (!candidateStat.isDirectory() || candidateStat.isSymbolicLink()) throw new Error("unsafe job directory");
    const resolved = await fs.realpath(candidate);
    if (path.dirname(resolved) !== root) throw new Error("resolved outside dataset root");
    return resolved;
  }
  async function safeArtifact(id, name) {
    if (!ARTIFACTS.has(name)) throw new Error("invalid artifact");
    const base = await jobPath(id);
    const candidate = path.join(base, name);
    const stat = await fs.lstat(candidate);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("unsafe artifact");
    const resolved = await fs.realpath(candidate);
    if (path.dirname(resolved) !== base) throw new Error("resolved outside job");
    return resolved;
  }
  function normalizeRequest(input) {
    if (!input || typeof input !== "object") throw new Error("invalid request");
    const pick = (key, max) => typeof input[key] === "string" ? input[key].trim().slice(0, max) : "";
    const topic = pick("topic", 120); const audience = pick("audience", 120); const purpose = pick("purpose", 160); const constraints = pick("constraints", 400);
    const columns = Array.isArray(input.columns) ? input.columns.map((column) => String(column).trim().replace(/[^a-zA-Z0-9_ -]/g, "").slice(0, 48)).filter(Boolean).slice(0, 10) : [];
    const rowCount = Math.max(5, Math.min(250, Number.parseInt(String(input.rowCount), 10) || 24));
    const mode = input.mode === "live" ? "live" : "demo";
    if (!topic || !audience || !purpose) throw new Error("topic, audience and purpose are required");
    if (columns.some((column) => BLOCKED_COLUMNS.test(column))) throw new Error("requested columns may not contain personal or sensitive data");
    return { topic, audience, purpose, constraints, columns, rowCount, mode };
  }
  function buildDemoRows(request) {
    const start = new Date("2026-02-02T00:00:00.000Z");
    return Array.from({ length: request.rowCount }, (_, index) => {
      const day = new Date(start); day.setDate(day.getDate() + index);
      const weekday = day.getDay(); const occupancy = 44 + ((index * 11) % 49) + (weekday === 0 || weekday === 6 ? -15 : 0);
      const energy = Math.round((188 + occupancy * 3.2 + ((index * 17) % 29)) * 10) / 10;
      return { date: dateString(day), building_zone: ["Library", "Studio", "Learning commons", "Science wing"][index % 4], occupancy_index: occupancy, energy_kwh: energy, outdoor_temp_c: Math.round((8 + ((index * 7) % 16)) * 10) / 10, synthetic_label: "Synthetic local demo data — not real campus records" };
    });
  }
  function chooseColumns(rows, request) {
    const defaults = ["date", "building_zone", "occupancy_index", "energy_kwh", "outdoor_temp_c", "synthetic_label"];
    const normalized = request.columns.map((column) => column.toLowerCase().replaceAll(" ", "_")).filter((column) => defaults.includes(column));
    const columns = [...new Set([...(normalized.length ? normalized : defaults), "synthetic_label"])];
    return { columns, rows: rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? "not_applicable"]))) };
  }
  function validate(rows, columns, expectedRows) {
    const missingValues = rows.flatMap((row, rowIndex) => columns.filter((column) => row[column] === "" || row[column] === null || row[column] === undefined).map((column) => `${rowIndex + 1}:${column}`));
    const serialized = rows.map((row) => JSON.stringify(row)); const duplicates = serialized.length - new Set(serialized).size;
    const numericRanges = ["occupancy_index", "energy_kwh", "outdoor_temp_c"].filter((column) => columns.includes(column)).map((column) => ({ column, valid: rows.every((row) => typeof row[column] === "number" && Number.isFinite(row[column]) && (column !== "occupancy_index" || (row[column] >= 0 && row[column] <= 100)) && (column !== "energy_kwh" || row[column] >= 0) && (column !== "outdoor_temp_c" || (row[column] >= -50 && row[column] <= 60))) }));
    const checks = { schemaTypes: rows.every((row) => columns.every((column) => typeof row[column] === "string" || typeof row[column] === "number")), rowCount: rows.length === expectedRows, missingValues: missingValues.length === 0, duplicateRows: duplicates === 0, sensibleNumericRanges: numericRanges.every((item) => item.valid), syntheticLabel: rows.every((row) => typeof row.synthetic_label === "string" && row.synthetic_label.includes("Synthetic")) };
    return { status: Object.values(checks).every(Boolean) ? "passed" : "failed", checks, rowCount: rows.length, missingValueLocations: missingValues, duplicateRowCount: duplicates, numericRanges };
  }
  async function writeJob(job, request, rows, columns, validation) {
    const base = await jobPath(job.id, true);
    const digest = createHash("sha256").update(JSON.stringify(request)).digest("hex").slice(0, 12);
    const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\n") + "\n";
    const dictionary = ["# Data dictionary", "", "This is a clearly labelled synthetic educational dataset.", "", "| Column | Type | Meaning |", "| --- | --- | --- |", ...columns.map((column) => `| ${column} | ${typeof rows[0]?.[column] === "number" ? "number" : "string"} | ${column === "synthetic_label" ? "Required synthetic-data label" : `Synthetic ${column.replaceAll("_", " ")}`} |`), ""].join("\n");
    const sources = ["# Research sources / provenance", "", "- Mode: deterministic local demo", "- Live web research: not performed", "- Evidence note: values use a fixed teaching-oriented pattern and are not copied from a source, campus, or person.", "- Source title / URL / access date: unavailable because no live source was used.", ""].join("\n");
    const assumptions = ["# Reproducibility and assumptions", "", `- Request fingerprint: ${digest}`, `- Topic: ${request.topic}`, `- Context: ${request.audience}`, `- Purpose: ${request.purpose}`, `- Requested rows: ${request.rowCount}`, "- Generator: deterministic local campus-energy demo pattern.", "- Boundary: synthetic data for education/exploration only; not evidence about a real campus or people.", request.constraints ? `- Constraint note: ${request.constraints}` : "", ""].filter(Boolean).join("\n");
    const artifactWrites = [["dataset.csv", csv], ["dataset.json", JSON.stringify({ synthetic: true, mode: "local-demo", rows }, null, 2) + "\n"], ["data-dictionary.md", dictionary], ["research-sources.md", sources], ["assumptions.md", assumptions], ["validation.json", JSON.stringify(validation, null, 2) + "\n"]];
    await Promise.all(artifactWrites.map(([name, content]) => fs.writeFile(path.join(base, name), content, "utf8")));
    const completed = { ...job, status: validation.status === "passed" ? "completed" : "failed", updatedAt: new Date().toISOString(), events: [...job.events, { status: "researching", at: new Date().toISOString() }, { status: "generating", at: new Date().toISOString() }, { status: "validating", at: new Date().toISOString() }, { status: validation.status === "passed" ? "completed" : "failed", at: new Date().toISOString() }], validation, request, artifacts: [...ARTIFACTS] };
    await fs.writeFile(path.join(base, "job.json"), JSON.stringify(completed, null, 2) + "\n", "utf8");
    return completed;
  }
  async function createJob(input) {
    const request = normalizeRequest(input);
    if (request.mode === "live" && !liveProvider.configured) {
      const err = new Error("Agent not configured. Configure CAMPUS_DATASET_AGENT_URL for live research, or use deterministic local demo mode."); err.code = "agent_not_configured"; throw err;
    }
    if (request.mode === "live") { const err = new Error("Configured live providers are an interface placeholder in this local-only build."); err.code = "agent_not_available"; throw err; }
    const now = new Date().toISOString(); const job = { id: `job-${randomUUID()}`, status: "queued", createdAt: now, updatedAt: now, events: [{ status: "queued", at: now }] };
    const { columns, rows } = chooseColumns(buildDemoRows(request), request); const validation = validate(rows, columns, request.rowCount);
    const completed = await writeJob(job, request, rows, columns, validation);
    return { ...completed, preview: rows.slice(0, 8) };
  }
  async function getJob(id) {
    const base = await jobPath(id); const file = path.join(base, "job.json"); const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("unsafe job metadata");
    return JSON.parse(await fs.readFile(file, "utf8"));
  }
  return { createJob, getJob, safeArtifact, root, validJobId, artifacts: [...ARTIFACTS] };
}

export async function createDatasetBridge(options = {}) {
  const service = await createDatasetService(options);
  const server = http.createServer(async (request, response) => {
    response.corsOrigin = localCorsOrigin(request.headers.origin);
    const url = new URL(request.url || "/", "http://127.0.0.1");
    try {
      if (request.method === "OPTIONS") { response.writeHead(204, { "Access-Control-Allow-Origin": response.corsOrigin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Cache-Control": "no-store" }); return response.end(); }
      if (request.method === "GET" && url.pathname === "/health") return send(response, 200, { ok: true, localOnly: true });
      if (request.method === "POST" && url.pathname === "/api/datasets/jobs") {
        let raw = ""; for await (const part of request) { raw += part; if (raw.length > 64 * 1024) throw new Error("request too large"); }
        const job = await service.createJob(JSON.parse(raw || "{}")); return send(response, 201, job);
      }
      const jobMatch = url.pathname.match(/^\/api\/datasets\/jobs\/([^/]+)$/);
      if (request.method === "GET" && jobMatch) return send(response, 200, await service.getJob(decodeURIComponent(jobMatch[1])));
      const artifactMatch = url.pathname.match(/^\/api\/datasets\/jobs\/([^/]+)\/artifacts\/([^/]+)$/);
      if (request.method === "GET" && artifactMatch) {
        const artifact = decodeURIComponent(artifactMatch[2]); const file = await service.safeArtifact(decodeURIComponent(artifactMatch[1]), artifact);
        return send(response, 200, await fs.readFile(file, "utf8"), artifact.endsWith(".json") ? "application/json; charset=utf-8" : artifact.endsWith(".csv") ? "text/csv; charset=utf-8" : "text/markdown; charset=utf-8");
      }
      return error(response, 404, "not_found", "Local dataset endpoint not found.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unknown local dataset error"; const code = caught && typeof caught === "object" && "code" in caught ? caught.code : "invalid_request";
      return error(response, code === "agent_not_configured" ? 503 : code === "agent_not_available" ? 501 : /invalid|outside|unsafe|resolved/.test(message) ? 400 : 422, code, message);
    }
  });
  await new Promise((resolve) => server.listen(options.port ?? 4289, "127.0.0.1", resolve));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) createDatasetBridge().then(() => console.log("Campus Dataset bridge listening on http://127.0.0.1:4289")).catch((caught) => { console.error(caught.message); process.exitCode = 1; });
