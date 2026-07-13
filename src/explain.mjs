// Deterministic, local-only explainer for Google Antigravity (agy) runs.
//
// Antigravity narrates its work as a stream of natural-language lines
// ("I will read ...", "I will run the tests ...", "Does this look correct?").
// This module turns that raw stream into a plain-language, human-readable answer
// to a single question: what is Antigravity doing right now, and why?
//
// It runs the same in the browser (imported by app/page.tsx) and in Node tests.
// No LLM call, no network, no filesystem — pure string analysis, so it is fully
// deterministic and unit-testable, matching this project's local-only ethos.

/**
 * @typedef {"starting"|"reading"|"exploring"|"planning"|"editing"|"testing"|"running"|"asking"|"reporting"|"done"|"failed"|"stalled"|"archived"} AgyPhase
 * @typedef {{ phase: AgyPhase, line: string, index: number }} AgyStep
 * @typedef {{ phase: AgyPhase, headline: string, explanation: string, currentLine: string|null, isLive: boolean, question: string|null, steps: AgyStep[], stepCount: number }} AgyActivity
 */

/**
 * Static, per-phase presentation + plain-language meaning. `tone` maps to a CSS
 * class in globals.css; `icon` is a text glyph so it renders without an icon font.
 * @type {Record<AgyPhase, { label: string, icon: string, tone: string, blurb: string }>}
 */
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

// A line is only a question if it actually contains a "?" AND an interrogative
// cue. Requiring the "?" avoids declaratives ("Does not require config.",
// "Should be straightforward.") being misread as pending decisions; the cue
// avoids stray "?" in code/URLs (e.g. `a ? b : c`) triggering a false question.
const QUESTION_CUE = /\b(how|should|would|does|do|did|shall|which|what|why|when|where|can|could|is it|is this|are you|are these|may i|will i)\b/i;
const NARRATION_START = /^(i will\b|i'll\b|i am going to\b|i'm going to\b|i am now\b|i'm now\b|i am\b|i'm\b|i have\b|i've\b|let me\b|now i\b|next,? i\b|first,? i\b|then i\b|i need to\b|i plan to\b|i should\b|i can\b|going to\b|proceeding to\b)/i;
const HEADING = /^#{1,6}\s+\S/;

// Ordered verb → phase matchers. First match wins, so the order encodes priority
// (a "run the tests" line must resolve to testing before the generic run rule).
const VERB_RULES = [
  ["testing", /\b(swift test|npm (run )?test|pytest|go test|cargo test|jest|vitest|run(ning)? the tests?|run(ning)? tests?|execute the tests?|re-?run the tests?|typecheck|lint\b|verify the (build|result|output|artifacts?)|validate the)\b/i],
  ["reading", /\b(read|view|open|inspect|look at|looking at|examine|reading|viewing|cat |review the|check the .*(file|log|config|contents))\b/i],
  ["exploring", /\b(explore|exploring|list|listing|search|searching|find|finding|scan|grep|browse|locate|discover|map the|survey|ls\b|glob)\b/i],
  ["editing", /\b(write|writing|create|creating|edit|editing|add|adding|update|updating|modify|implement|implementing|build the|generate|generating|refactor|fix|fixing|apply|applying|rename|delete|remove|removing|scaffold|draft|patch|insert|append to|replace)\b/i],
  ["running", /\b(run|running|execute|executing|install|installing|compile|compiling|start the|launch|invoke|npm install|git |chmod|mkdir)\b/i],
  ["reporting", /\b(report|summar(y|ize|ising|izing)|final report|finalize|conclude|wrap up|deliver|present the (results?|summary))\b/i],
  ["planning", /\b(plan|planning|design|designing|outline|propose|proposing|architect|consider|refine|refining|brainstorm|strategy|approach|structure the|decide|think through|break (this|the task) down)\b/i],
];

/**
 * Classify a single raw log line into a step, or null if it is body prose /
 * blank / code that does not represent a discrete Antigravity action.
 * @param {string} raw
 * @param {number} index
 * @returns {AgyStep|null}
 */
export function classifyLine(raw, index = 0) {
  if (typeof raw !== "string") return null;
  const line = raw.trim();
  if (!line) return null;

  const display = line.replace(/^#{1,6}\s+/, "");
  const isQuestion = line.includes("?") && QUESTION_CUE.test(line);
  const isNarration = NARRATION_START.test(line);
  const isHeading = HEADING.test(line);

  if (isQuestion) return { phase: "asking", line: display, index };
  if (isHeading) return { phase: "planning", line: display, index };
  if (!isNarration) return null;

  for (const [phase, pattern] of VERB_RULES) {
    if (pattern.test(line)) return { phase: /** @type {AgyPhase} */ (phase), line, index };
  }
  // Narration we recognize as an action but can't categorize → treat as reading
  // (Antigravity almost always narrates a look-before-act step).
  return { phase: "reading", line, index };
}

/**
 * Map a terminal run status to its phase. Returns null for live/unknown states.
 * @param {string|null|undefined} status
 * @returns {AgyPhase|null}
 */
function terminalPhase(status) {
  switch (status) {
    case "completed": return "done";
    case "failed": return "failed";
    case "stalled": return "stalled";
    case "terminated": return "stalled";
    case "archived": return "archived";
    default: return null;
  }
}

/**
 * Build a live, plain-language explanation of what an Antigravity run is doing.
 * @param {{ log?: string|null, status?: string|null, termination?: string|null, endedAt?: string|null }} run
 * @returns {AgyActivity}
 */
export function analyzeAgyRun(run = {}) {
  if (!run || typeof run !== "object") run = {};
  const log = typeof run.log === "string" ? run.log : "";
  const status = run.status ?? null;
  const isLive = status === "running";

  const steps = [];
  const lines = log.replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const step = classifyLine(lines[i], i);
    if (step) steps.push(step);
  }

  const lastStep = steps.length ? steps[steps.length - 1] : null;

  const finished = terminalPhase(status);
  /** @type {AgyPhase} */
  let phase;
  if (isLive) {
    phase = lastStep ? lastStep.phase : "starting";
  } else if (finished) {
    phase = finished;
  } else if (lastStep) {
    // Unknown status but we have activity — reflect the last thing it did.
    phase = lastStep.phase;
  } else {
    phase = "archived";
  }

  const meta = PHASES[phase] ?? PHASES.starting;
  const currentLine = lastStep ? lastStep.line : null;

  let explanation = meta.blurb;
  if (phase === "stalled" && run.termination) {
    const reason = run.termination === "timeout-6min"
      ? "it hit the 6-minute time limit"
      : run.termination === "stall-90s-no-output"
        ? "it produced no new output for 90 seconds"
        : `of "${run.termination}"`;
    explanation = `The run was killed by the watchdog because ${reason}. The end of the log shows where it stopped.`;
  }

  // Surface a question/decision ONLY when it was Antigravity's *last* action —
  // i.e. the run currently sits on it. A question resolved earlier in the log is
  // not a pending decision and must not be shown next to a done/failed run.
  const endedOnQuestion = lastStep?.phase === "asking";

  return {
    phase,
    headline: meta.label,
    explanation,
    currentLine,
    isLive,
    question: endedOnQuestion ? lastStep.line : null,
    steps,
    stepCount: steps.length,
  };
}

/**
 * Always-available primer explaining how Antigravity works, in plain Turkish.
 * Shown in the cockpit so you can follow along even between runs.
 * @type {{ q: string, a: string }[]}
 */
export const AGY_PRIMER = [
  { q: "What is Antigravity (agy)?", a: "A command-line agent that runs Google's Gemini model locally on your machine. Your primary agent (or you) hands it a bounded task, and Antigravity does the work itself: reads files, plans, writes code, and tests." },
  { q: "How does it work, step by step?", a: "It usually goes: understand the task → read/explore files → plan → write code → run tests/commands → report. It narrates each step in one line ('I will ...'). This panel captures those lines and explains them in plain language so you can follow along without reading raw logs." },
  { q: "What stops a run?", a: "A watchdog watches Antigravity: a 6-minute total time limit and an auto-kill if no output arrives for 90 seconds. Termination uses the recorded PID/PGID — never a broad name match." },
  { q: "Is it safe?", a: "The run only touches the sandbox directory you point it at, and '--dangerously-skip-permissions' is never used. This panel is read-only (it never changes your files) and is served locally on 127.0.0.1 only." },
  { q: "What am I looking at here?", a: "Pick a run on the left: you'll see the live log stream, the prompt it was given, the files it produced, and a plain-language 'what is it doing now?' explanation. Always verify the result independently, even on a clean exit." },
];
