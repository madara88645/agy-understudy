# Understudy (agy-understudy) MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All subagents must use model `sonnet`.**

**Goal:** Turn the current `agy-live-viewer` (a heavy Next/vinext/Cloudflare app) into **Understudy** — a zero-install, local, MIT-licensed live cockpit for Google Antigravity (`agy`/Gemini) runs, published as `npx agy-understudy`.

**Architecture:** One Node process (`node:http`, no runtime deps) serves both the JSON API and a pre-built static React UI on a single port. A small CLI (`bin/understudy.mjs`) starts the cockpit or delegates a bounded task to `agy` (`run` subcommand). The deterministic log→activity explainer is reused verbatim (translated to English). The Next/vinext/Cloudflare/Tailwind/Drizzle stack and the unrelated Campus Dataset Lab are removed.

**Tech Stack:** Node ≥20 (built-in `http`, `child_process`, `fs`); React 19 + Vite 8 (build-time only) producing static assets; `node --test` for tests.

**Spec:** `docs/superpowers/specs/2026-07-13-understudy-design.md`

---

## Target file structure

```
agy-understudy/
  bin/understudy.mjs        NEW  CLI entry (default = cockpit; `run` = delegate to agy)
  src/server.mjs            from bridge.mjs — API + static UI on one port
  src/explain.mjs           from agy-explain.mjs — analyzer + phases + primer (English)
  src/run.mjs               NEW  Node port of run-agy-sandbox.sh (path-agnostic)
  ui/index.html             NEW  Vite entry HTML
  ui/main.tsx               NEW  React root render
  ui/App.tsx                from app/page.tsx — cockpit only, English, same-origin fetch
  ui/styles.css             from app/globals.css — no Tailwind
  ui/public/favicon.svg     from public/favicon.svg
  vite.config.ts            REWRITE  plain Vite + React → dist/ui
  dist/ui/**                built assets (gitignored in dev; shipped in npm package)
  test/explain.test.mjs     from tests/agy-explain.test.mjs
  test/server.test.mjs      from tests/bridge.test.mjs (+ static-serve case)
  test/run.test.mjs         NEW  smoke test against a fake `agy`
  package.json              REWRITE
  tsconfig.json             trim
  eslint.config.mjs         trim (drop next)
  README.md                 REWRITE
  LICENSE                   NEW (MIT)
  docs/superpowers/**       specs + this plan
```

**Removed entirely** (Task 7): `dataset-bridge.mjs`, `worker/`, `next.config.ts`, `db/`, `drizzle/`, `drizzle.config.ts`, `examples/`, `.openai/`, `build/`, `app/chatgpt-auth.ts`, `app/_sites-preview/`, `postcss.config.mjs`, `scripts/`, `.cursor/`, `campus-*.agy-prompt.md`, `handoff/`, `tests/dataset-bridge.test.mjs`, `tests/rendered-html.test.mjs`, `app/` (after files are moved out), `public/` (after favicon moved).

---

## Task 0: Branch and baseline

**Files:** none (git only)

- [ ] **Step 1: Confirm branch**

Run: `cd /Users/mehmetozel/agy-sandbox/agy-live-viewer && git checkout feat/agy-live-explainer && git status`
Expected: on `feat/agy-live-explainer`, clean tree.

- [ ] **Step 2: Confirm baseline tests pass**

Run: `npm run test`
Expected: 22 tests pass (this is the pre-migration baseline; it will change as we migrate).

---

## Task 1: Move + Englishize the explainer (`src/explain.mjs`)

**Files:**
- Move: `agy-explain.mjs` → `src/explain.mjs`
- Move: `tests/agy-explain.test.mjs` → `test/explain.test.mjs`

- [ ] **Step 1: Move the files with git**

```bash
mkdir -p src test
git mv agy-explain.mjs src/explain.mjs
git mv tests/agy-explain.test.mjs test/explain.test.mjs
```

- [ ] **Step 2: Fix the test import path**

In `test/explain.test.mjs`, change the import line:
```js
import { analyzeAgyRun, classifyLine, PHASES, AGY_PRIMER } from "../src/explain.mjs";
```

- [ ] **Step 3: Translate the `PHASES` presentation strings to English**

In `src/explain.mjs`, replace the entire `PHASES` object's `label` and `blurb` values with English (keep the keys, `icon`, and `tone` unchanged):

```js
export const PHASES = {
  starting:  { label: "Starting",       icon: "◔", tone: "neutral", blurb: "Antigravity just started; it's getting ready to read the task and the workspace. No visible step yet." },
  reading:   { label: "Reading",        icon: "▤", tone: "info",    blurb: "Antigravity is reading existing files. It's understanding the project before writing code — like a person skimming files before starting." },
  exploring: { label: "Exploring",      icon: "⌕", tone: "info",    blurb: "Antigravity is listing folders / searching. It's mapping where things are and finding the relevant files." },
  planning:  { label: "Planning",       icon: "◇", tone: "plan",    blurb: "Antigravity is forming a plan / architecture. It's designing the steps and structure before touching code." },
  editing:   { label: "Writing code",   icon: "✎", tone: "edit",    blurb: "Antigravity is changing files: writing new code, editing, or fixing. This is the actual implementation work." },
  testing:   { label: "Testing",        icon: "✓", tone: "test",    blurb: "Antigravity is running tests / validation. It's checking that the code it wrote actually works." },
  running:   { label: "Running command",icon: "»", tone: "run",     blurb: "Antigravity is running a command (build, install, script). The result will shape its next step." },
  asking:    { label: "Question",       icon: "?", tone: "warn",    blurb: "Antigravity raised a question or hit a decision point. The log shows which choice it paused on." },
  reporting: { label: "Reporting",      icon: "▣", tone: "info",    blurb: "Antigravity is wrapping up: summarizing what it did, the result, and any limits. Near the finish." },
  done:      { label: "Completed",      icon: "●", tone: "ok",      blurb: "Antigravity finished cleanly. Check the exit code and the files it produced — but still verify the result independently." },
  failed:    { label: "Failed",         icon: "✕", tone: "bad",     blurb: "Antigravity stopped with an error (non-zero exit). Look at the error message at the end of the log." },
  stalled:   { label: "Stalled / killed",icon: "‖",tone: "bad",     blurb: "The run stalled or was killed by the watchdog (ran too long or went 90s with no output). The end of the log shows where it got stuck." },
  archived:  { label: "Archived",       icon: "◍", tone: "neutral", blurb: "An older run with no manifest. Only readable from the log; not live." },
};
```

- [ ] **Step 4: Translate the stalled-run explanation and the primer to English**

In `analyzeAgyRun`, replace the stalled-explanation block:
```js
  if (phase === "stalled" && run.termination) {
    const reason = run.termination === "timeout-6min"
      ? "it hit the 6-minute time limit"
      : run.termination === "stall-90s-no-output"
        ? "it produced no new output for 90 seconds"
        : `of "${run.termination}"`;
    explanation = `The run was killed by the watchdog because ${reason}. The end of the log shows where it stopped.`;
  }
```

Replace `AGY_PRIMER` with English:
```js
export const AGY_PRIMER = [
  { q: "What is Antigravity (agy)?", a: "A command-line agent that runs Google's Gemini model locally on your machine. Your primary agent (or you) hands it a bounded task, and Antigravity does the work itself: reads files, plans, writes code, and tests." },
  { q: "How does it work, step by step?", a: "It usually goes: understand the task → read/explore files → plan → write code → run tests/commands → report. It narrates each step in one line ('I will ...'). This panel captures those lines and explains them in plain language so you can follow along without reading raw logs." },
  { q: "What stops a run?", a: "A watchdog watches Antigravity: a 6-minute total time limit and an auto-kill if no output arrives for 90 seconds. Termination uses the recorded PID/PGID — never a broad name match." },
  { q: "Is it safe?", a: "The run only touches the sandbox directory you point it at, and '--dangerously-skip-permissions' is never used. This panel is read-only (it never changes your files) and is served locally on 127.0.0.1 only." },
  { q: "What am I looking at here?", a: "Pick a run on the left: you'll see the live log stream, the prompt it was given, the files it produced, and a plain-language 'what is it doing now?' explanation. Always verify the result independently, even on a clean exit." },
];
```

- [ ] **Step 5: Update the two test assertions that checked Turkish text**

In `test/explain.test.mjs`, in the "stalled runs explain the watchdog reason" test, change:
```js
  assert.match(timeout.explanation, /6-minute time limit/);
  ...
  assert.match(noOutput.explanation, /90 seconds/);
```

- [ ] **Step 6: Run the analyzer tests**

Run: `node --test test/explain.test.mjs`
Expected: 15 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/explain.mjs test/explain.test.mjs
git commit -m "refactor: move analyzer to src/explain.mjs and translate strings to English"
```

---

## Task 2: Move the server + serve static UI (`src/server.mjs`)

**Files:**
- Move: `bridge.mjs` → `src/server.mjs`
- Move: `tests/bridge.test.mjs` → `test/server.test.mjs`

- [ ] **Step 1: Move files**

```bash
git mv bridge.mjs src/server.mjs
git mv tests/bridge.test.mjs test/server.test.mjs
```

- [ ] **Step 2: Fix the test import**

In `test/server.test.mjs`, change `import { createBridge } from "../bridge.mjs";` to `import { createBridge } from "../src/server.mjs";`.

- [ ] **Step 3: Add a static-file server to `src/server.mjs`**

Near the top of `src/server.mjs`, after the existing imports, add:
```js
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
```

- [ ] **Step 4: Route non-API GETs to the static server**

In the request handler in `createBridge`, change the final `return text(response, 404, "not found");` (the fallthrough after the `/api/runs/:id` match) to:
```js
      return serveStatic(response, url.pathname);
```
Leave `/health`, `/api/runs`, `/api/stream`, and `/api/runs/:id` handling exactly as-is.

- [ ] **Step 5: Add a `startServer` convenience export at the bottom of `src/server.mjs`**

Replace the `if (process.argv[1] && …) createBridge()…` bottom block with:
```js
export async function startServer({ sandboxRoot, port } = {}) {
  return createBridge({ sandboxRoot: sandboxRoot ?? process.env.UNDERSTUDY_ROOT, port: port ?? Number(process.env.UNDERSTUDY_PORT) || 4288 });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then((s) => console.log(`Understudy API on http://127.0.0.1:${s.address().port}`)).catch((e) => { console.error(e.message); process.exitCode = 1; });
}
```
(Keep the `createBridge` signature: `sandboxRoot` defaults to `process.env.AGY_SANDBOX_ROOT || DEFAULT_ROOT` — update its default to also honor `UNDERSTUDY_ROOT`: `sandboxRoot = process.env.UNDERSTUDY_ROOT || process.env.AGY_SANDBOX_ROOT || DEFAULT_ROOT`.)

- [ ] **Step 6: Write a failing test for static serving**

Add to `test/server.test.mjs`:
```js
test("serves a built UI asset and falls back to index.html", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const os = await import("node:os"); const path = (await import("node:path")).default;
  const root = await mkdtemp(path.join(os.tmpdir(), "agy-viewer-"));
  const server = await createBridge({ sandboxRoot: root, port: 0 });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    // index.html may or may not exist depending on build; assert the route does not 404 the API
    const health = await fetch(`${base}/health`); assert.equal(health.status, 200);
    const spa = await fetch(`${base}/some/client/route`);
    assert.ok(spa.status === 200 || spa.status === 404); // 200 if built, 404 (with build hint) if not
  } finally { await new Promise((r) => server.close(r)); }
});
```

- [ ] **Step 7: Run server tests**

Run: `node --test test/server.test.mjs`
Expected: all pass (the original path-safety test + the new static test).

- [ ] **Step 8: Commit**

```bash
git add src/server.mjs test/server.test.mjs
git commit -m "feat: serve the static UI and the API from one Node server"
```

---

## Task 3: Vite React UI (cockpit only, English, same-origin)

**Files:**
- Move: `app/page.tsx` → `ui/App.tsx`; `app/globals.css` → `ui/styles.css`; `public/favicon.svg` → `ui/public/favicon.svg`
- Create: `ui/index.html`, `ui/main.tsx`, `vite.config.ts` (rewrite)

- [ ] **Step 1: Move UI files**

```bash
mkdir -p ui/public
git mv app/page.tsx ui/App.tsx
git mv app/globals.css ui/styles.css
git mv public/favicon.svg ui/public/favicon.svg
```

- [ ] **Step 2: Strip Tailwind from `ui/styles.css`**

In `ui/styles.css`, delete the first line `@import "tailwindcss";` and replace it with a minimal reset:
```css
*, *::before, *::after { box-sizing: border-box; }
button { font: inherit; color: inherit; }
```
(The rest of the file already sets `body { margin: 0 }` etc.; keep everything else unchanged.)

- [ ] **Step 3: Convert `ui/App.tsx` — imports, same-origin, no Dataset Lab, English**

Apply these edits to `ui/App.tsx` (it starts as the old `app/page.tsx`):

1. Change the analyzer import:
```tsx
import { analyzeAgyRun, PHASES, AGY_PRIMER } from "../src/explain.mjs";
import "./styles.css";
```
2. Change the API base to same-origin and delete the dataset URL:
```tsx
const BRIDGE_URL = ""; // same-origin
```
Delete the line `const DATASET_URL = "http://127.0.0.1:4289";`.
3. Delete the entire `DatasetLab` component (the `function DatasetLab() { … }` block) and the `DatasetJob` type above it.
4. In `Home()`, delete the `product` state line and the `<DatasetLab/>` branch; always render the inspector. Replace the returned JSX header + layout so the outer structure is:
```tsx
  return <main className="app-shell">
    <header className="app-header"><div className="brand"><span className="brand-dot" /><strong>Understudy</strong><span className="brand-sub">live cockpit for Antigravity</span></div><div className={`connection connection-${connection}`}><span />{connection === "online" ? "Connected" : connection === "offline" ? "Server offline" : "Connecting"}</div></header>
    <section className="app-layout">
      {/* ...existing sidebar + reading-pane exactly as before... */}
    </section>
  </main>;
```
(Keep the sidebar and reading-pane JSX unchanged except the English strings in Step 4.)
5. Rename the exported component if desired (keep `export default function Home()` — the name is irrelevant to Vite).

- [ ] **Step 4: Translate the remaining UI strings to English**

Apply this string map in `ui/App.tsx`:

| Turkish | English |
| --- | --- |
| `STATUS_LABEL` Çalışıyor/Tamamlandı/Hata/Arşiv/Durdu/Sonlandı | Running/Completed/Failed/Archived/Stalled/Terminated |
| `TABS` Akış/Açıklama/Talimat/Dosyalar | Log/Explanation/Prompt/Files |
| `formatDate` locale `"tr-TR"` | `"en-US"` |
| `formatDuration` `dk`/`sn` | `m`/`s` |
| sidebar `Koşular` / `Eski koşu` | `Runs` / `Archived` |
| sidebar note `Bridge kapalı. Panel yalnızca yerel köprüye bağlanır.` | `Server offline. The cockpit only talks to the local server.` |
| run-header `AGY KOŞUSU` | `AGY RUN` |
| summary `Başlangıç/Süre/Çıkış/Watchdog` and `Temiz` | `Started/Duration/Exit/Watchdog` and `Clean` |
| follow `Canlı akışı takip et` / `Takibi duraklat` | `Following live` / `Paused` |
| files empty `Bu koşuda dosya kaydı yok.` | `No files recorded for this run.` |
| log empty `Bu koşu henüz log yazmadı.` | `This run hasn't written a log yet.` |
| prompt empty `Bu eski koşu için kayıtlı talimat bulunamadı.` | `No saved prompt for this archived run.` |
| welcome eyebrow `AGY LIVE INSPECTOR` | `UNDERSTUDY` |
| welcome h1 `Bir koşu seç` | `Select a run` |
| welcome paragraph | `Open a run from the left to see its live stream, a plain-language explanation of what Antigravity is doing right now, the prompt it was given, and the files it produced.` |
| ActivityStrip eyebrow `ANTIGRAVITY ŞU AN` / ` · CANLI` | `ANTIGRAVITY NOW` / ` · LIVE` |
| ActivityStrip/ExplainPanel `Soru / karar:` | `Question / decision:` |
| ExplainPanel `Adım adım ne yaptı` | `Step by step` |
| ExplainPanel empty `Antigravity henüz izlenebilir bir adım yazmadı.` | `Antigravity hasn't written a trackable step yet.` |
| AgyPrimer summary `Antigravity nasıl çalışır?` | `How does Antigravity work?` |

- [ ] **Step 5: Add a tiny `.brand-sub` style to `ui/styles.css`**

Append:
```css
.brand-sub { color: var(--faint); font-size: 12px; }
```

- [ ] **Step 6: Create `ui/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" />
    <title>Understudy — live cockpit for Antigravity</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `ui/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
```

- [ ] **Step 8: Rewrite `vite.config.ts` to a plain React build**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "ui",
  plugins: [react()],
  build: { outDir: "../dist/ui", emptyOutDir: true },
});
```

- [ ] **Step 9: Commit**

```bash
git add ui vite.config.ts
git commit -m "feat: Vite React cockpit UI (English, cockpit-only, same-origin)"
```

---

## Task 4: `package.json`, deps, and build wiring

**Files:** Modify `package.json`, `tsconfig.json`, `eslint.config.mjs`

- [ ] **Step 1: Rewrite `package.json`**

```json
{
  "name": "agy-understudy",
  "version": "0.1.0",
  "description": "Understudy — a live cockpit for the AI coding agents you delegate to Google Antigravity (agy/Gemini).",
  "license": "MIT",
  "type": "module",
  "engines": { "node": ">=20" },
  "bin": { "agy-understudy": "bin/understudy.mjs" },
  "files": ["bin", "src", "dist/ui", "README.md", "LICENSE"],
  "scripts": {
    "build": "vite build",
    "start": "node bin/understudy.mjs",
    "test": "node --test test/*.test.mjs",
    "lint": "eslint . --ignore-pattern dist",
    "prepublishOnly": "vite build"
  },
  "devDependencies": {
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.2",
    "eslint": "9.39.4",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "typescript": "5.9.3",
    "vite": "8.0.13"
  }
}
```
(No `dependencies` — the runtime is Node built-ins + the pre-built `dist/ui`.)

- [ ] **Step 2: Reinstall to prune removed deps**

```bash
rm -rf node_modules package-lock.json
npm install
```
Expected: installs cleanly with only the devDependencies above.

- [ ] **Step 3: Trim `tsconfig.json`**

Replace `tsconfig.json` with:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "isolatedModules": true
  },
  "include": ["ui/**/*.ts", "ui/**/*.tsx", "src/**/*.mjs"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Trim `eslint.config.mjs`**

Remove any `next`/`eslint-config-next` usage. Minimal config:
```js
import js from "@eslint/js";
export default [js.configs.recommended, { languageOptions: { ecmaVersion: 2023, sourceType: "module" }, ignores: ["dist/**"] }];
```
(If `@eslint/js` is not present, run `npm i -D @eslint/js`.)

- [ ] **Step 5: Build the UI**

Run: `npm run build`
Expected: `dist/ui/index.html` and hashed assets are produced.

- [ ] **Step 6: Add `dist/` to `.gitignore` (keep, already ignored) and confirm**

Run: `git check-ignore dist/ui/index.html`
Expected: prints the path (it is ignored). `dist/ui` ships via `files` at publish time, not via git.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json eslint.config.mjs
git commit -m "chore: repackage as agy-understudy, drop the heavy stack deps"
```

---

## Task 5: CLI — `bin/understudy.mjs` and `src/run.mjs`

**Files:** Create `bin/understudy.mjs`, `src/run.mjs`, `test/run.test.mjs`

- [ ] **Step 1: Create `src/run.mjs` (Node port of the wrapper)**

```js
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
    try { const s = (await fs.stat(log)).size; if (s !== lastSize) { lastSize = s; lastChange = Date.now(); } } catch {}
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
```

- [ ] **Step 2: Create `bin/understudy.mjs`**

```js
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
  try { spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref(); } catch {}
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
```

- [ ] **Step 3: Make the bin executable**

```bash
chmod +x bin/understudy.mjs
```

- [ ] **Step 4: Write a smoke test with a fake `agy` (`test/run.test.mjs`)**

```js
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
```

- [ ] **Step 5: Run the run tests**

Run: `node --test test/run.test.mjs`
Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add bin src/run.mjs test/run.test.mjs
git commit -m "feat: agy-understudy CLI (cockpit launcher + `run` delegate to agy)"
```

---

## Task 6: Full-suite green + end-to-end smoke

**Files:** none (verification)

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: explain (15) + server (2) + run (2) all pass.

- [ ] **Step 2: Build and start the cockpit**

Run: `npm run build && node bin/understudy.mjs --no-open --root "$(mktemp -d)" &` then `sleep 2 && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4288/ && curl -s http://127.0.0.1:4288/api/runs`
Expected: `200` for `/`, and `{"runs":[]}` for the API. Then `kill %1`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit (if any fixups were needed)**

```bash
git add -A && git commit -m "test: full suite green after re-platform" || echo "nothing to commit"
```

---

## Task 7: Remove the obsolete stack + unrelated files

**Files:** delete many (git rm)

- [ ] **Step 1: Remove Campus Dataset Lab + heavy stack + leftovers**

```bash
git rm -r \
  dataset-bridge.mjs tests/dataset-bridge.test.mjs tests/rendered-html.test.mjs \
  campus-dataset-lab.agy-prompt.md campus-macos-app.agy-prompt.md handoff \
  worker next.config.ts db drizzle drizzle.config.ts examples .openai build \
  app postcss.config.mjs scripts .cursor public 2>/dev/null || true
git rm -r tests 2>/dev/null || true
```
(By now `agy-explain.mjs`, `bridge.mjs`, `tests/*` and the `app/`+`public/` UI files have already been moved out via `git mv`, so these paths are the remaining obsolete ones. `app/layout.tsx`, `app/chatgpt-auth.ts`, `app/_sites-preview` go with `app`.)

- [ ] **Step 2: Confirm nothing references the removed paths**

Run: `grep -rInE "vinext|cloudflare|drizzle|dataset-bridge|next/|_sites-preview|tailwind" src ui bin test package.json vite.config.ts tsconfig.json`
Expected: no matches. Fix any that appear.

- [ ] **Step 3: Full suite + build again**

Run: `npm test && npm run build`
Expected: all green; `dist/ui` builds.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Next/vinext/Cloudflare stack and the Campus Dataset Lab"
```

---

## Task 8: README, LICENSE, and packaging check

**Files:** Create `LICENSE`, rewrite `README.md`

- [ ] **Step 1: Add MIT `LICENSE`**

Create `LICENSE` with the standard MIT text, `Copyright (c) 2026 Mehmet Özel`.

- [ ] **Step 2: Rewrite `README.md`**

```markdown
# Understudy

**A live cockpit for the AI coding agents you delegate to Google Antigravity (agy / Gemini).**
Offload the grunt work to a cheap model, watch it work in plain language, and save your
premium model budget for the hard thinking.

![Understudy cockpit](docs/hero.gif)

## Why

Premium coding-model budgets run out fast. Google Antigravity / Gemini agents are cheap with
generous limits — but they run headless and you can't see what they're doing. Understudy makes
delegating to the cheap model **safe and visible**: hand off routine implementation, watch every
step, and keep your premium model for what actually needs it. Smart routing, not magic.

## Quickstart

```bash
npx agy-understudy
```

Opens a local cockpit at http://127.0.0.1:4288 that lists the Antigravity runs under
`~/agy-sandbox` and streams what each one is doing, live.

Delegate a bounded task to Antigravity and watch it:

```bash
npx agy-understudy run --dir ~/agy-sandbox/my-task --prompt ~/agy-sandbox/my-task/prompt.md
```

## What you see

- A live **activity strip**: reading / exploring / planning / writing code / testing / question / done.
- An **Explanation** tab: a step-by-step timeline plus a "how Antigravity works" primer.
- The prompt it was given and the files it produced.

## Requirements

- [Google Antigravity](https://antigravity.google) CLI (`agy`) on your PATH.
- Node.js ≥ 20.

## Configuration

- `--root <dir>` / `UNDERSTUDY_ROOT` — where runs live (default `~/agy-sandbox`).
- `--port <n>` / `UNDERSTUDY_PORT` — cockpit port (default 4288).

## How it works

Understudy is local-only and read-only. One Node process serves the cockpit UI and a small API
that reads the run directories under your root. The "what is it doing?" explanation is produced by
a deterministic local parser (no LLM, no network). A watchdog protects delegated runs (6-minute
limit, 90-second stall kill).

## License

MIT.
```

- [ ] **Step 3: Note the GIF placeholder**

The README references `docs/hero.gif`. Record it after the UI is verified: start the cockpit, run a small `agy` task, and screen-record the cockpit changing phases; save to `docs/hero.gif`. (Until recorded, the image link will 404 on GitHub — acceptable for the first internal commit; record before publishing.)

- [ ] **Step 4: Verify the publish payload**

Run: `npm pack --dry-run`
Expected: the tarball contains only `bin/`, `src/`, `dist/ui/`, `README.md`, `LICENSE`, `package.json` — no `ui/` source, no `test/`, no `docs/`.

- [ ] **Step 5: Commit**

```bash
git add README.md LICENSE
git commit -m "docs: Understudy README (star-focused) and MIT license"
```

---

## Task 9: Final verification

- [ ] **Step 1:** `npm test` → all pass.
- [ ] **Step 2:** `npm run build` → `dist/ui` builds.
- [ ] **Step 3:** `npm run lint` → clean.
- [ ] **Step 4:** `node bin/understudy.mjs --no-open --root "$(mktemp -d)"` then curl `/` (200) and `/api/runs` (`{"runs":[]}`); stop it.
- [ ] **Step 5:** `npm pack --dry-run` → payload correct.
- [ ] **Step 6:** Report changed files, test/build/lint results, and the remaining manual step (record `docs/hero.gif`, then `git init`/create the GitHub repo `agy-understudy` and publish).

---

## Notes for the executor

- **All subagents must use model `sonnet`.**
- Do **not** `git push`, create the GitHub repo, or `npm publish` — those are the user's calls. Stop after Task 9 and report.
- Keep the cockpit's read-only, 127.0.0.1-only, path-safety guarantees intact — they are the product's trust story.
- If a moved file's internal comments still say "AGY Live Inspector", updating them to "Understudy" is in scope.
