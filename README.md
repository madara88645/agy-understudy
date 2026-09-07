# Understudy

**A live cockpit for the AI coding agents you delegate to Google Antigravity (agy / Gemini).**
Offload the grunt work to a cheap model, watch it work in plain language, and save your
premium model budget for the hard thinking.

> **Requires the Google Antigravity CLI (`agy`) on your `PATH`.** Understudy watches what `agy` does — install it first ([see Requirements](#requirements)).

<p align="center">
  <a href="https://www.npmjs.com/package/agy-understudy"><img src="https://img.shields.io/npm/v/agy-understudy?color=3ecf8e" alt="npm version" /></a>
  <a href="https://github.com/madara88645/agy-understudy/actions/workflows/ci.yml"><img src="https://github.com/madara88645/agy-understudy/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/license-MIT-3ecf8e.svg" alt="MIT License" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-3ecf8e.svg" alt="Node >= 20" />
  <img src="https://img.shields.io/badge/local--only-read--only-3ecf8e.svg" alt="Local-only, read-only" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/madara88645/agy-understudy/main/docs/hero.gif" alt="Understudy cockpit: the live activity strip cycling through Reading, Exploring, Planning, Testing, and Completed while the step-by-step timeline builds up" width="820" />
</p>

## Why

Premium coding-model budgets run out fast, and rate limits bite. Google Antigravity / Gemini
agents are cheap with generous limits — but they run headless and you can't see what they're
doing. Understudy makes delegating to the cheap model **safe and visible**: hand off routine
implementation, watch every step, and keep your premium model for what actually needs it.
Smart routing, not magic.

## Quickstart

Give Antigravity a bounded task and watch it work:

```bash
mkdir -p ~/agy-sandbox/my-task
echo "Add a /health endpoint to server.js and a test for it" > ~/agy-sandbox/my-task/prompt.md

npx agy-understudy run --dir ~/agy-sandbox/my-task --prompt ~/agy-sandbox/my-task/prompt.md
```

Then open the cockpit — in another terminal, or any time after the fact:

```bash
npx agy-understudy
```

It opens at http://127.0.0.1:4288 and streams what each run is doing, live.

## Writing prompts that actually run

A short, goal-style prompt with no execution mode often makes the agent **stop to ask for
approval** instead of doing the work: it proposes a design, asks "does this look right?", and
exits. The process exits cleanly, so the cockpit badges the run **"Ended with question"**
(not "Completed") and shows you the exact question — but no files were written.

To get a run that does the work end to end:

1. Pass **`--mode accept-edits`** so the agent may write files without a confirmation step.
2. Make the prompt **imperative** and explicitly forbid stopping for approval.
3. Give it **absolute paths** it may edit and a **single** validation command.

```bash
mkdir -p ~/agy-sandbox/health-task
cat > ~/agy-sandbox/health-task/prompt.md <<'EOF'
Implement the requested change now. This is a non-interactive run: do NOT ask for
confirmation, do NOT stop at a design proposal, do NOT wait for approval.

Goal: add a GET /health endpoint that returns {"ok": true} to server.js.
You may edit only: /absolute/path/to/server.js and /absolute/path/to/test/server.test.mjs.
Acceptance checks: GET /health responds 200 with {"ok": true}.
Run only this validation command: npm test.
At the end, state the changed files, the validation output, and any remaining limitation.
EOF

npx agy-understudy run \
  --dir ~/agy-sandbox/health-task \
  --prompt ~/agy-sandbox/health-task/prompt.md \
  --mode accept-edits
```

Even on a clean exit, open the run and check the files it produced — always verify the
result independently.

## What you see

- A live **activity strip**: reading / exploring / planning / writing code / testing / question / done.
- An **Explanation** tab: a step-by-step timeline plus a "how Antigravity works" primer.
- The prompt it was given and the files it produced.

Understudy shows the runs **you start through it** (`understudy run` is what records the log
and the run manifest it reads). It is a cockpit for delegated work, not a general-purpose
tail of everything `agy` has ever done on your machine.

## Built with Understudy

[**ctx**](https://github.com/madara88645/ctx) — a zero-dependency "where was I" CLI — was built
end to end through Understudy, and is the first real proof that this delegate-and-watch loop
ships working software. An AI chose the idea; Gemini agents implemented it in **8 bounded
slices** via `understudy run` (7 clean runs + 1 recovery), each watched live in the cockpit;
the orchestrator wrote **no product code**. 41/41 tests, published to npm as
[`@madara88645/ctx`](https://www.npmjs.com/package/@madara88645/ctx).

The honest, slice-by-slice account — including the run that timed out and the Node-version
footgun a cheap agent debugged on its own — is in
[ctx's making-of](https://github.com/madara88645/ctx/blob/main/docs/making-of.md).

## Requirements

- [Google Antigravity](https://antigravity.google) CLI (`agy`) on your PATH.
- Node.js ≥ 20.

## Configuration

Run `agy-understudy --help` for the full list, or `--version` for the version.

Cockpit (`agy-understudy`):

- `--root <dir>` / `UNDERSTUDY_ROOT` — where runs live (default `~/agy-sandbox`).
- `--port <n>` / `UNDERSTUDY_PORT` — cockpit port (default 4288).
- `--no-open` — print the URL but don't open a browser window.

Delegating a run (`agy-understudy run`):

- `--dir <sandbox>` — the run directory, which must sit inside `--root`. Required.
- `--prompt <file>` — the prompt file, which must sit inside `--dir`. Required.
- `--mode plan|accept-edits` — passed through to `agy`; see
  [writing prompts that actually run](#writing-prompts-that-actually-run).
- `--agent <name>` — passed through to `agy` to pick a specific agent.

Both `--root <dir>` and `--root=<dir>` work. A misspelled command or option is an error —
Understudy will not quietly start with a default instead.

## How it works

One Node process serves the cockpit UI and a small API that reads the run directories under
your root. The "what is it doing?" explanation comes from a deterministic local parser — no
LLM, no network call, no telemetry. A watchdog protects delegated runs (6-minute limit,
90-second stall kill) and terminates the whole process group so nothing is orphaned.

The server binds to `127.0.0.1` only, answers `GET` only, and never writes to your run
directories. See [SECURITY.md](SECURITY.md).

## Contributing

Issues and PRs are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

---

*Understudy is an independent open-source project. It is not affiliated with, endorsed by, or
sponsored by Google. "Antigravity" and "Gemini" are trademarks of Google LLC.*
