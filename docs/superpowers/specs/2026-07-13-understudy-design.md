# Understudy — Design Spec (v1)

**Status:** approved (brainstorm), pending spec review
**Date:** 2026-07-13
**Repo (seed):** `agy-live-viewer` → to become `understudy`

---

## 1. Summary

**Understudy** is a zero-install, local, open-source **live cockpit for the AI coding
agents you hand off to Google Antigravity (`agy` / Gemini).** You watch what a delegated
run is doing — in plain language, in real time — so you can offload grunt work to a cheap
model and keep your scarce **premium** budget for the hard reasoning.

One-liner (README hero):
> **Understudy** — a live cockpit for the AI coding agents you delegate to Google
> Antigravity. Offload the grunt work to a cheap model, watch it work, and save your
> premium budget for opening night.

## 2. Problem / why anyone cares

Premium coding-model budgets (Claude, GPT, etc.) run out fast and rate limits bite. Google
Antigravity / Gemini agents are cheap and have generous limits, but they run "headless" and
you can't easily see what they're doing. Understudy makes delegating to the cheap model
**safe and visible**: you can confidently push routine implementation to the understudy and
save the premium model for what actually needs it.

**Framing (deliberate, ToS-safe):** this is *smart routing / cost optimization* — send the
right work to the right model. It is **not** positioned as quota circumvention or
"limit-stretching." Token savings are a *benefit*, never the mechanism claim.

## 3. Goals / Non-goals

### v1 Goals
- **Live cockpit:** watch `agy` runs under a configurable root, with the deterministic
  plain-language activity explainer (phases + timeline + "how it works" primer).
- **One-command delegate:** `understudy run --dir <sandbox> --prompt <file>` hands a bounded
  task to `agy` and the cockpit auto-focuses it, live.
- **Zero-install:** `npx agy-understudy` starts one local server and opens the cockpit. Minimal
  runtime dependencies; UI shipped pre-built.
- **Star engine:** a sharp English README with a hero GIF, 30-second quickstart, and the
  smart-routing philosophy. MIT license.

### Non-goals (roadmap, explicitly out of v1)
- A delegation "toolkit" (task templates, acceptance-check DSL).
- A routing "brain" that decides what to offload.
- Watching non-`agy` agents / generic log sources.
- Any hosted/cloud component. Understudy is local-only.

## 4. Audience & honest constraint

Primary audience: developers who already use **Google Antigravity (`agy`)**. This caps the
addressable audience (and therefore the star ceiling); we accept it for v1 and note the
"generic backends" expansion in the roadmap. The README states the `agy` requirement plainly.

## 5. Architecture (slim)

Today the seed repo runs a heavy stack: Next.js + vinext + Cloudflare/wrangler + Tailwind,
with **three** processes (UI :3000, AGY bridge :4288, Dataset bridge :4289). That is far too
heavy for a localhost viewer and kills install friction.

**Target: a single Node process on one port that serves both the JSON API and the pre-built
static UI.**

```
 npx agy-understudy
      │
      ▼
 bin/understudy.mjs ──► starts server.mjs (Node http, one port, e.g. 4288)
      │                    ├─ GET  /                → pre-built static UI (dist/ui)
      │                    ├─ GET  /api/runs        → list runs under root
      │                    ├─ GET  /api/runs/:id    → run detail (log, prompt, files, status)
      │                    └─ GET  /api/stream?run= → SSE live snapshots
      │
      └─ understudy run ─► run.mjs: launches `agy` (wrapper, path-agnostic), writes
                           agy.log + manifest into the sandbox the cockpit reads.
```

- **Runtime deps:** aim for **zero** (Node built-ins only) — the server is already plain
  `node:http`. The React UI is **pre-built to static assets at publish time** and shipped in
  the package, so end users never install React/Vite/Tailwind.
- **Build-time deps (devDependencies):** Vite + `@vitejs/plugin-react` build `ui/` → `dist/ui/`.
  All the Next/vinext/Cloudflare/Drizzle/Tailwind machinery is removed.
- **Explainer unchanged:** `explain.mjs` (today `agy-explain.mjs`) stays pure/deterministic and
  is imported by both the UI and its unit tests.

## 6. Components

| Unit | Purpose | Depends on |
| --- | --- | --- |
| `bin/understudy.mjs` | CLI entry: no args → start cockpit + open browser; `run …` → delegate to agy | `server.mjs`, `run.mjs` |
| `src/server.mjs` | Node http server: API (`/api/*`) + static UI; path-safe run reader | Node built-ins, `dist/ui` |
| `src/explain.mjs` | Pure, deterministic AGY-log → activity/phase analyzer + primer | none |
| `src/run.mjs` | Path-agnostic launcher: runs `agy` with a bounded prompt, writes log+manifest, watchdog | Node built-ins, `agy` on PATH |
| `ui/` (App, styles, entry) | React cockpit (from `app/page.tsx`, Dataset Lab removed, English) | `src/explain.mjs` |

Each unit is independently testable: the explainer via unit tests, the server via the
existing path-safety tests, `run.mjs` via a smoke test with a fake `agy`.

## 7. CLI / UX

- `npx agy-understudy` → starts the server, prints the URL, opens the browser. Persistent
  (intentionally stays up so you can watch current + past runs).
- `npx agy-understudy run --dir <sandbox> --prompt <file> [--agent <name>] [--mode plan|accept-edits]`
  → validates the sandbox is under the root, copies the prompt, runs `agy`, records
  log/manifest/PID/exit/watchdog; the cockpit auto-focuses the running run.
- `--root <dir>` / `UNDERSTUDY_ROOT` → where runs live (default `~/agy-sandbox`).
- `--port <n>` / `UNDERSTUDY_PORT` → server port (default 4288).
- Honest failure if `agy` is not on PATH.

## 8. Configuration (generic / everyone-usable)

No Mehmet-specific paths. Nothing hardcoded to `~/.codex` / `~/.claude` skill locations or a
specific home dir. Root and port are flags/env with sane defaults. The old
`ensure-live-viewer.sh` helper coupling is dropped — the CLI *is* the launcher.

## 9. Cleanup / file plan (explicit)

### KEEP (core, reused — possibly moved/renamed)
- `agy-explain.mjs` → `src/explain.mjs`
- `bridge.mjs` → `src/server.mjs` (extended to serve static UI, single port)
- `app/page.tsx` → `ui/App.tsx` (**remove `DatasetLab`**, translate to English, plain-React entry)
- `app/globals.css` → `ui/styles.css` (drop the `@import "tailwindcss"`; keep hand-written CSS + a tiny reset)
- `scripts/run-agy-sandbox.sh` → ported to `src/run.mjs` (path-agnostic, English)
- `tests/agy-explain.test.mjs` → `test/explain.test.mjs` (kept + extended)
- `tests/bridge.test.mjs` → `test/server.test.mjs` (path-safety kept)
- `public/favicon.svg` (rebranded), `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore` (heavily edited)
- `README.md` (rewritten for Understudy)

### REMOVE — Campus Dataset Lab (unrelated, cut for focus)
- `dataset-bridge.mjs`
- `tests/dataset-bridge.test.mjs`
- `campus-dataset-lab.agy-prompt.md`, `campus-macos-app.agy-prompt.md`
- `handoff/` (`campus-dataset-lab-sidechat-prompt.md`)
- the `DatasetLab` component + `datasets` product toggle inside the UI

### REMOVE — heavy Next/vinext/Cloudflare/DB scaffolding (slim stack)
- `worker/index.ts`
- `next.config.ts`
- `db/index.ts`, `db/schema.ts`
- `drizzle.config.ts`, `drizzle/meta/_journal.json`
- `examples/d1/**`
- `.openai/hosting.json`
- `build/sites-vite-plugin.ts`
- `app/chatgpt-auth.ts` (Next-specific, unused by the cockpit)
- `app/_sites-preview/` (empty)
- `postcss.config.mjs` (+ Tailwind dependency)
- `tests/rendered-html.test.mjs` (asserts Next/worker SSR that no longer exists → replaced by a UI smoke test)

### TRANSFORM
- `vite.config.ts` → plain Vite + React static build (no vinext/Cloudflare)
- `package.json` → name `understudy`, add `bin`, `files` (ship `dist/ui`), `prepublishOnly` build; drop next/vinext/wrangler/@cloudflare/drizzle/tailwind deps
- `eslint.config.mjs` → drop the `next` config, keep basic linting

## 10. Distribution & packaging

- **Product/brand name:** **Understudy** (used in the UI title, README hero, docs).
- **GitHub repo + npm package + CLI command:** **`agy-understudy`** (user-chosen; the bare
  `understudy` is taken on npm, and the `agy-` prefix makes the Antigravity tie obvious and
  discoverable). Users run `npx agy-understudy`.
- `bin` field → `agy-understudy` command; published package ships **pre-built** `dist/ui` (via
  `prepublishOnly`) so `npx agy-understudy` needs no build and installs ~no runtime deps.
- `package.json` `files` limited to `bin/`, `src/`, `dist/ui/`, `README.md`, `LICENSE`.
- **License:** MIT.
- Node engines: `>=20` (broad, modern).

## 11. README + GIF (the actual star engine)

Priority artifact. Structure:
1. Hero line + **animated GIF** of the live cockpit changing phases during a real run.
2. "Why" in three seconds: save your premium budget; offload grunt work to a cheap watched agent.
3. 30-second quickstart: `npx agy-understudy` (+ the `run` example).
4. What you see: activity strip, Açıklama→"Explanation" timeline, how-Antigravity-works primer.
5. Requirements: Google Antigravity (`agy`) installed. Local-only, read-only, MIT.
6. Philosophy: smart routing, not quota circumvention.

## 12. Testing

- `test/explain.test.mjs` — unit tests for the analyzer (kept + a couple more real-log cases).
- `test/server.test.mjs` — path-safety + API shape (kept from bridge tests).
- `test/run.test.mjs` — smoke test of `understudy run` against a **fake `agy`** stub script
  (no real Gemini call) asserting log/manifest/exit are recorded.
- `npm test` runs all of the above (no build required for the analyzer/server tests).

## 13. Error handling

- Server: 400 on unsafe/traversal/symlink run ids (kept from current bridge); 404 otherwise;
  API bound to `127.0.0.1` only.
- CLI: clear messages when `agy` missing, sandbox outside root, prompt missing, port in use.
- UI: offline banner when the server is unreachable; empty state (primer) when no runs.

## 14. Roadmap (post-v1)

- `understudy run` templates + acceptance-check helpers (delegation toolkit).
- Optional routing hints ("what to offload").
- Generic backends: watch any agent's run/log, not just `agy`.
- Optional one-file distributable / Homebrew.

## 15. Open questions / resolved

1. **npm name — RESOLVED:** product/brand = **Understudy**; GitHub repo + npm package + CLI
   command = **`agy-understudy`** (`npx agy-understudy`). User-chosen 2026-07-13.
2. **Default port — RESOLVED:** keep `4288` for v1 (avoid bikeshedding), overridable via
   `--port` / `UNDERSTUDY_PORT`.
3. **`understudy run` — RESOLVED:** Node port of the bash wrapper (cross-platform), not the
   shell script.
