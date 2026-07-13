# Campus Dataset Lab implementation

Work only in `/Users/mehmetozel/agy-sandbox/agy-live-viewer`. Implement the requested Campus Dataset Lab alongside the existing AGY Live Inspector. Do not delete, replace, weaken, or regress the Inspector, `bridge.mjs`, its existing GET endpoints, or local-only security controls. Do not access, modify, or discover any other workspace.

## Goal and acceptance checks

Build a calm, local-only Campus Dataset Lab where a student enters a topic, audience/context, learning purpose, requested columns, approximate row count, and optional constraints. It must create clearly labelled synthetic learning datasets. Keep the existing AGY Inspector as a separately visible destination that still lists runs and opens logs.

Implement a small local dataset backend/API layer and UI. Persist each job only below `/Users/mehmetozel/agy-sandbox/datasets/<job-id>/`, with robust job-id validation and protection against traversal, root escape, and symlink traversal. Never collect/create PII, credentials, student records, grades, health records, or production data.

Live research/generation requires a clearly configured provider behind a small interface. Do not add credentials, API keys, paid services, deploy settings, or fabricated sources. If unconfigured, expose an honest `Agent not configured` state for live mode and offer a separate deterministic local demo mode labelled as synthetic/local-demo. In demo mode, a campus-energy sample must complete and create all of:

- `dataset.csv`
- `dataset.json`
- `data-dictionary.md`
- `research-sources.md`
- `assumptions.md`
- `validation.json`

Validation must cover schema/types, requested row count, missing values, duplicate rows, sensible numeric ranges, and explicit synthetic-data labelling. Add job states: queued, researching, generating, validating, completed, failed. Results must have preview, CSV/JSON download controls, data dictionary, source/provenance, assumptions/reproducibility, and validation summary. Demo provenance must explicitly say it is a local deterministic demo and not a live web claim/source. Do not copy source rows.

Add targeted automated tests for path safety (including malformed IDs, root escaping and symlink traversal), artifact creation, validation, and unconfigured-agent error. Expand README with synthetic-data boundary, provenance, local storage location, safe placeholder configuration for live mode, and demo mode. No dependency/package-lock changes unless unavoidable; do not do a framework migration.

Before implementation, inspect README, `bridge.mjs`, `app/page.tsx`, styles, and current tests. Reuse the existing stack. Prefer a narrowly scoped API server that runs local-only and is started through the existing launcher if needed. Keep production/non-local functions absent.

## Verification

Run the smallest relevant tests plus build/lint if viable. Independently exercise a demo campus-energy request and inspect that six artifacts exist. Verify Inspector bridge regression test and rendered page test. Also launch locally and inspect the UI at normal and narrow width if browser tooling is available. Report changed files, commands/results, and any remaining limitation.
