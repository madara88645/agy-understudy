# Security

## Reporting a vulnerability

Please **do not open a public issue** for a security problem. Report it privately through
GitHub: go to the [Security tab](https://github.com/madara88645/agy-understudy/security/advisories)
and choose **Report a vulnerability**. You will get a response as soon as possible.

## Threat model

Understudy is a local developer tool. What that means in practice:

- **The cockpit binds to `127.0.0.1` only.** It is never exposed on your network, and there
  is no authentication because there is no remote surface to authenticate.
- **The cockpit is read-only.** It answers `GET` only, and it never writes to, deletes from,
  or creates anything inside your run directories.
- **It reads only inside the sandbox root** (`~/agy-sandbox` by default). Run ids are
  validated, paths are resolved with `realpath`, and symlinks and traversal out of the root
  are rejected.
- **No network calls and no telemetry.** The plain-language explanation of what Antigravity
  is doing is produced by a deterministic local parser, not an LLM.
- **`understudy run` executes `agy`** with an argument array — never through a shell — and
  only inside a sandbox directory you named. It kills the whole process group on timeout or
  stall so nothing is left orphaned.

## Scope

Run logs and prompts are shown verbatim in the cockpit. If you put a secret in a prompt, it
will appear in the run log and in the UI on your own machine. Treat the sandbox root like any
other directory that holds your source code.
