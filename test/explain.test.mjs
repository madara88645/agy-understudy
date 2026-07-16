import assert from "node:assert/strict";
import test from "node:test";
import { analyzeAgyRun, classifyLine, PHASES, AGY_PRIMER } from "../src/explain.mjs";

test("empty running log reports the starting phase", () => {
  const activity = analyzeAgyRun({ log: "", status: "running" });
  assert.equal(activity.phase, "starting");
  assert.equal(activity.isLive, true);
  assert.equal(activity.currentLine, null);
  assert.equal(activity.stepCount, 0);
});

test("classifies the core Antigravity action verbs", () => {
  assert.equal(classifyLine("I will read the bridge.mjs file to understand it.")?.phase, "reading");
  assert.equal(classifyLine("I will explore the workspace directory.")?.phase, "exploring");
  assert.equal(classifyLine("I will list the contents of the folder.")?.phase, "exploring");
  assert.equal(classifyLine("I will create Package.swift and write the App target.")?.phase, "editing");
  assert.equal(classifyLine("I will run the tests to verify the generator.")?.phase, "testing");
  assert.equal(classifyLine("I will run swift build to compile the package.")?.phase, "running");
  assert.equal(classifyLine("I will summarize the changes and report the result.")?.phase, "reporting");
});

test("writing tests counts as editing, running tests counts as testing", () => {
  assert.equal(classifyLine("I will write tests for the path safety module.")?.phase, "editing");
  assert.equal(classifyLine("I will run the tests for the path safety module.")?.phase, "testing");
});

test("questions become asking steps and are surfaced on a live run", () => {
  const q = classifyLine("Does this design outline look correct to you?");
  assert.equal(q?.phase, "asking");
  const activity = analyzeAgyRun({
    log: "I will read the plan.\nDoes this design outline look correct to you?",
    status: "running",
  });
  assert.equal(activity.phase, "asking");
  assert.match(activity.question ?? "", /look correct to you/);
});

test("markdown headings are treated as planning", () => {
  const step = classifyLine("### Proposed Architecture: Campus Dataset Lab macOS App");
  assert.equal(step?.phase, "planning");
  assert.equal(step?.line, "Proposed Architecture: Campus Dataset Lab macOS App");
});

test("prose, blanks and code lines are skipped, order is preserved", () => {
  const log = [
    "I will read the skill.",
    "",
    "This paragraph is just body text with no action.",
    "const x = 1;",
    "I will run the tests.",
  ].join("\n");
  const activity = analyzeAgyRun({ log, status: "running" });
  assert.equal(activity.stepCount, 2);
  assert.equal(activity.steps[0].phase, "reading");
  assert.equal(activity.steps[1].phase, "testing");
  assert.equal(activity.phase, "testing");
});

test("terminal statuses override the last log line", () => {
  const log = "I will read the file.\nI will run the tests.";
  assert.equal(analyzeAgyRun({ log, status: "completed" }).phase, "done");
  assert.equal(analyzeAgyRun({ log, status: "failed" }).phase, "failed");
  assert.equal(analyzeAgyRun({ log, status: "terminated" }).phase, "stalled");
});

test("stalled runs explain the watchdog reason", () => {
  const timeout = analyzeAgyRun({ log: "I will read.", status: "stalled", termination: "timeout-6min" });
  assert.equal(timeout.phase, "stalled");
  assert.match(timeout.explanation, /6-minute time limit/);
  const noOutput = analyzeAgyRun({ log: "I will read.", status: "stalled", termination: "stall-90s-no-output" });
  assert.match(noOutput.explanation, /90 seconds/);
});

test("a run with no status and no log is archived", () => {
  const activity = analyzeAgyRun({ log: "", status: null });
  assert.equal(activity.phase, "archived");
  assert.equal(activity.isLive, false);
});

test("every phase has presentation metadata and the primer is populated", () => {
  const phases = new Set(Object.keys(PHASES));
  for (const phase of ["starting", "reading", "exploring", "planning", "editing", "testing", "running", "asking", "asked", "reporting", "done", "failed", "stalled", "archived"]) {
    assert.ok(phases.has(phase), `missing phase metadata: ${phase}`);
    assert.ok(PHASES[phase].label && PHASES[phase].blurb && PHASES[phase].tone);
  }
  assert.ok(AGY_PRIMER.length >= 4);
  for (const card of AGY_PRIMER) assert.ok(card.q && card.a);
});

test("approval requests without a question mark are classified as questions (#4)", () => {
  // verbatim from a real Antigravity run log that stopped without a "?"
  assert.equal(
    classifyLine("Please let me know if you approve this design or have any adjustments before I proceed to implementation.")?.phase,
    "asking",
  );
  assert.equal(classifyLine("Please confirm so that we can transition to writing the implementation plan.")?.phase, "asking");
  assert.equal(classifyLine("Awaiting your approval before I continue.")?.phase, "asking");
  assert.equal(classifyLine("Let me know if you are happy with this approach.")?.phase, "asking");
});

test("ordinary narration that merely mentions review/proceed/confirmed is NOT a question (#4)", () => {
  assert.notEqual(classifyLine("I will run the tests before I proceed to the next slice.")?.phase, "asking");
  assert.notEqual(classifyLine("I will review the plan file.")?.phase, "asking");
  assert.notEqual(classifyLine("I will proceed with approach A as confirmed.")?.phase, "asking");
});

test("a completed run that ended on a question is 'asked', not 'done' (#3)", () => {
  const log = [
    "I will read the existing files.",
    "### Proposed design",
    "Please let me know if you approve this design before I proceed to implementation.",
  ].join("\n");
  const activity = analyzeAgyRun({ log, status: "completed" });
  assert.equal(activity.phase, "asked");
  assert.equal(activity.endedWithQuestion, true);
  assert.match(activity.question ?? "", /approve this design/);
});

test("a completed run that really finished stays 'done' (#3)", () => {
  const log = "I will read the file.\nI will run the tests to verify the generator.";
  const activity = analyzeAgyRun({ log, status: "completed" });
  assert.equal(activity.phase, "done");
  assert.equal(activity.endedWithQuestion, false);
});

test("only a clean exit becomes 'asked' — failed/stalled/live keep their own state (#3)", () => {
  const log = "I will plan the work.\nShould I proceed with approach A or B?";
  assert.equal(analyzeAgyRun({ log, status: "failed" }).phase, "failed");
  assert.equal(analyzeAgyRun({ log, status: "failed" }).endedWithQuestion, false);
  assert.equal(analyzeAgyRun({ log, status: "stalled" }).phase, "stalled");
  // a LIVE run sitting on a question stays the live "asking", not the terminal "asked"
  const live = analyzeAgyRun({ log, status: "running" });
  assert.equal(live.phase, "asking");
  assert.equal(live.endedWithQuestion, false);
});

test("a question resolved earlier in the log is NOT shown on a finished run", () => {
  const log = [
    "I will read the plan file.",
    "Should I proceed with approach A or approach B?",
    "I will proceed with approach A as confirmed.",
    "I will run the tests to verify the generator.",
  ].join("\n");
  const done = analyzeAgyRun({ log, status: "completed" });
  assert.equal(done.phase, "done");
  assert.equal(done.question, null); // the decision was already resolved mid-run
  // but a run that currently sits on the question does surface it
  const pending = analyzeAgyRun({ log: "I will read the plan.\nShould I proceed?", status: "running" });
  assert.equal(pending.phase, "asking");
  assert.match(pending.question ?? "", /Should I proceed/);
});

test("declarative sentences starting with a question word are not treated as questions", () => {
  assert.equal(classifyLine("Does not require any additional configuration."), null);
  assert.equal(classifyLine("Should be straightforward given the existing structure."), null);
  assert.equal(classifyLine("Which file gets modified depends on the test results."), null);
  // a stray ternary-like "?" without an interrogative cue is not a question
  assert.notEqual(classifyLine("I will set const ok = a ? b : c in the helper.")?.phase, "asking");
});

test("ordinary transition language is not mislabeled as a command or report", () => {
  assert.notEqual(classifyLine("I will move on to the next section of the plan.")?.phase, "running");
  assert.notEqual(classifyLine("I will copy the approach used in the other module.")?.phase, "running");
  assert.notEqual(classifyLine("I will note the tests are done before continuing.")?.phase, "reporting");
});

test("analyzeAgyRun tolerates null / undefined / non-object input", () => {
  for (const bad of [null, undefined, 42, "log", []]) {
    const activity = analyzeAgyRun(/** @type {any} */ (bad));
    assert.equal(activity.phase, "archived");
    assert.equal(activity.stepCount, 0);
    assert.equal(activity.question, null);
  }
});

test("a markdown heading that is a question strips the ### prefix", () => {
  const step = classifyLine("### Should this be a public API?");
  assert.equal(step?.phase, "asking");
  assert.equal(step?.line, "Should this be a public API?");
});
