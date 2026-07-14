# Understudy

**A live cockpit for the AI coding agents you delegate to Google Antigravity (agy / Gemini).**
Offload the grunt work to a cheap model, watch it work in plain language, and save your
premium model budget for the hard thinking.

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

## What you see

- A live **activity strip**: reading / exploring / planning / writing code / testing / question / done.
- An **Explanation** tab: a step-by-step timeline plus a "how Antigravity works" primer.
- The prompt it was given and the files it produced.

Understudy shows the runs **you start through it** (`understudy run` is what records the log
and the run manifest it reads). It is a cockpit for delegated work, not a general-purpose
tail of everything `agy` has ever done on your machine.

## Requirements

- [Google Antigravity](https://antigravity.google) CLI (`agy`) on your PATH.
- Node.js ≥ 20.

## Configuration

- `--root <dir>` / `UNDERSTUDY_ROOT` — where runs live (default `~/agy-sandbox`).
- `--port <n>` / `UNDERSTUDY_PORT` — cockpit port (default 4288).

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
