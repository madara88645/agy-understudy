# Side-chat prompt: Campus Dataset Lab

You are taking over this existing local project:

`/Users/mehmetozel/agy-sandbox/agy-live-viewer`

First inspect the codebase, README, tests, and the existing AGY Live Inspector behavior. Preserve it: this project already shows local AGY run logs and must keep working. Build the new capability alongside it; do not delete, replace, or weaken its local-only security controls.

## Goal

Turn the project into a polished **Campus Dataset Lab**: a local, campus-safe sandbox where a student can choose any study topic and receive a small, realistic-looking but clearly synthetic dataset to explore.

The user flow should be:

1. Student selects a topic, target audience/context, learning purpose, requested columns, approximate row count, and optional constraints.
2. A research agent searches credible public sources appropriate to that topic and produces a short research brief with source title, URL, access date, and evidence note.
3. A generation agent derives a dataset schema from that brief and creates a simplified, realistic synthetic dataset.
4. The app gives the student a preview, CSV/JSON downloads, a data dictionary, a reproducibility/assumptions note, a research-source list, and a validation summary.

Examples of appropriate topics: campus energy consumption, public transport usage, library study habits, climate observations, retail demand, course attendance patterns, or public-health-style *non-clinical* aggregate indicators. The product must make clear that the output is synthetic and for education/exploration, not evidence about real people or a real campus.

## Product requirements

- Keep everything local and sandboxed. Store each job only beneath `~/agy-sandbox/datasets/<job-id>/`; reject traversal and root-escaping symlinks.
- Do not collect or create real student records, personally identifiable information, credentials, health records, grades, or production data.
- Do not fabricate web research, citations, links, or claims. Live research/generation must require a clearly configured provider/agent. If it is not configured, show a clear “Agent not configured” state and provide a deterministic local demo dataset mode clearly labelled as such.
- Respect source terms and access boundaries. Use public, credible sources; record provenance rather than copying source rows. Do not scrape private, paywalled, authenticated, or protected content.
- Generate derived/synthetic rows, never a pasted copy of identifiable source data.
- Make the interface calm and simple: one obvious create flow, readable results, no dense terminal-style UI for this feature. Preserve the AGY Inspector as a separate visible destination.
- The generated artifact must contain at least: `dataset.csv`, `dataset.json`, `data-dictionary.md`, `research-sources.md`, `assumptions.md`, and `validation.json`.
- Validation must check schema/types, row count, missing values, duplicate rows, sensible numeric ranges, and explicit synthetic-data labeling.
- Include a job status model (queued/researching/generating/validating/completed/failed) and show errors honestly.
- Design the agent/provider layer behind a small interface. Do not add API keys, secrets, paid service setup, deployment config, or opaque hard-coded credentials. Document configuration using safe placeholders only.

## Engineering boundaries

- Stay inside `/Users/mehmetozel/agy-sandbox/agy-live-viewer` and its permitted local dataset output root.
- Reuse the existing stack and local-only architecture where practical. Avoid a large framework migration or unrelated refactor.
- Do not change `.env`, deployment settings, authentication/provider settings, package-lock/dependencies unless genuinely necessary; if dependency changes are needed, explain why and keep them minimal.
- Keep the existing AGY bridge endpoints and wrapper safe and compatible.
- Use robust validation, path safety, and clear error states. Do not silently claim that a live AI/web agent worked when it did not.

## Deliverables

1. Working Campus Dataset Lab UI and local backend/worker flow.
2. A short README section explaining: synthetic-data boundary, research provenance, local storage location, configuration needed for live agent mode, and demo mode.
3. Targeted automated tests for path safety, artifact creation, validation, and the unconfigured-agent error path.
4. Browser/manual verification of the main flow and a narrow-screen check.

## Acceptance checks

- Existing AGY Live Inspector still lists a run and opens its log.
- In demo mode, creating a campus-energy sample completes and produces all six required artifacts.
- The result page renders a source/provenance section, data dictionary, validation summary, and CSV/JSON download controls.
- A malformed job ID, root-escaping path, and symlink traversal request are rejected.
- When live-agent configuration is absent, the app does not fabricate sources and explains the required configuration.

Before editing, give a short plan and identify risky files. Then implement the scope above without waiting for a second confirmation. At the end report changed files, tests/build results, browser verification, and any remaining limitation.
