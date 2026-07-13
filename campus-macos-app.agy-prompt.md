# Native Campus Dataset Lab macOS app

Work only inside `/Users/mehmetozel/agy-sandbox/agy-live-viewer/macos-app`. Create a standalone, native macOS SwiftUI app there. You may also add a small README subsection only if needed, but do not edit the existing Node/React app, `bridge.mjs`, `dataset-bridge.mjs`, `scripts/`, package files, or any path outside `macos-app`.

## Product goal

Build a polished desktop app named **Campus Dataset Lab** that a student can open and use as a normal macOS `.app`. It is a native SwiftUI replacement surface, not a WKWebView wrapper.

Use a native `NavigationSplitView` with:

- a light native sidebar containing **Dataset Lab** and **AGY Runs**;
- a calm, well-spaced Dataset Lab composer with topic, context, learning goal, requested columns, row count, optional constraints, local demo / live research choices, and obvious synthetic-data boundary;
- a result detail view with a table preview, CSV/JSON export buttons, validation badges, data dictionary, provenance/source notes, and reproducibility assumptions;
- an AGY Runs view that safely reads the direct child run folders below `~/agy-sandbox`, lists available `agy.log` files, and renders the selected log read-only.

## Safety and behavior

- Generate only deterministic local demo data. It must always be clearly labelled synthetic and educational, never real people/campus records.
- Persist a completed job only under `~/agy-sandbox/datasets/<job-id>/` and create exactly: `dataset.csv`, `dataset.json`, `data-dictionary.md`, `research-sources.md`, `assumptions.md`, and `validation.json`.
- Validate schema/type shape, row count, missing values, duplicate rows, sensible numeric ranges, and a synthetic label. Show the actual validation result in the UI.
- Reject path traversal and symlinks that escape the dataset root or AGY run root.
- The live research UI must display an honest unconfigured state. Do not add keys, network calls, fabricated citations, or a fake provider.
- Use app-appropriate system colors/materials; do not hardcode a light-only full-window background. Include toolbar actions and useful keyboard shortcuts where reasonable.

## Project shape and build contract

- Use a SwiftPM package with a single macOS executable target, source split into App, Models, Services, Stores, Views, and Support folders.
- Minimum macOS 14.0; no third-party dependencies.
- Add focused Swift tests for generator artifact creation/validation and path safety.
- Add `macos-app/script/build_and_run.sh` following the GUI SwiftPM bundle pattern: build, stage `macos-app/dist/CampusDatasetLab.app`, and support `--verify`.
- Add `macos-app/.codex/environments/environment.toml` with a `Run` action wired to that script.

## Verification

Run `swift test`, `swift build`, and `./script/build_and_run.sh --verify`. Report the changed files, test/build/launch result, and any limitation. Do not ask for further confirmation; implement now.
