# Contributing

Thanks for taking a look. Issues and pull requests are both welcome.

## Getting set up

You need Node.js ≥ 20. The [Google Antigravity](https://antigravity.google) CLI (`agy`) is
only needed to actually delegate a run — the test suite fakes it, so you can work on
Understudy without it.

```bash
npm install
npm test          # node --test, no agy required
npm run lint
npm run build     # builds the cockpit UI into dist/ui
npm start         # serves the cockpit at http://127.0.0.1:4288
```

`npm start` reads runs from `~/agy-sandbox`. Point it somewhere else with
`--root <dir>` or `UNDERSTUDY_ROOT` while you work.

## Before you open a PR

Please make sure these four are green — CI runs exactly the same set on Linux and macOS,
Node 20 and 22:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm test
```

New behaviour should come with a test. The existing suite is plain `node:test`, and it fakes
`agy` with a small shell script rather than requiring the real CLI — copy that pattern.

## Things worth knowing

- **Zero runtime dependencies, and it should stay that way.** React and Vite are build-time
  only; the published package ships a pre-built `dist/ui`. A PR that adds a runtime
  dependency needs a good reason.
- **The cockpit is read-only and local-only.** It binds to `127.0.0.1`, answers `GET` only,
  and must never write into a run directory. Please don't loosen that — see
  [SECURITY.md](SECURITY.md).
- **The explainer is deterministic.** `src/explain.mjs` turns raw agy output into
  plain-language activity with no LLM and no network call. Keep it that way: it is what makes
  the cockpit instant and free.

## Scope

Understudy is deliberately small. If you have an idea that grows it a lot, open an issue
first so we can talk about it before you spend time on the code.
