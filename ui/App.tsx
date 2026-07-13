"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { analyzeAgyRun, PHASES, AGY_PRIMER } from "../src/explain.mjs";
import "./styles.css";

const BRIDGE_URL = ""; // same-origin
type RunStatus = "running" | "completed" | "failed" | "archived" | "stalled" | "terminated";
type Run = { id: string; status: RunStatus; startedAt: string | null; endedAt: string | null; lastActivityAt: string | null; durationMs: number | null; logBytes: number; hasManifest: boolean; };
type RunDetail = Run & { sandboxPath: string; prompt: string | null; plan: { path: string; content: string } | null; log: string; files: string[]; pid: number | null; pgid: number | null; exitCode: number | null; termination: string | null; };
type Tab = "log" | "explain" | "prompt" | "files";
type AgyActivity = ReturnType<typeof analyzeAgyRun>;

const STATUS_LABEL: Record<RunStatus, string> = { running: "Running", completed: "Completed", failed: "Failed", archived: "Archived", stalled: "Stalled", terminated: "Terminated" };
const TABS: Array<{ id: Tab; label: string }> = [{ id: "log", label: "Log" }, { id: "explain", label: "Explanation" }, { id: "prompt", label: "Prompt" }, { id: "files", label: "Files" }];

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(value)) : "—"; }
function formatDuration(value: number | null) { if (value === null) return "—"; const seconds = Math.max(0, Math.floor(value / 1000)); const minutes = Math.floor(seconds / 60); return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`; }
function StatusBadge({ status }: { status: RunStatus }) { return <span className={`status status-${status}`}>{STATUS_LABEL[status]}</span>; }

function inlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]*\))/g);
  return parts.filter(Boolean).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("[")) return <span className="markdown-link" key={index}>{part.slice(1, part.indexOf("]"))}</span>;
    return part;
  });
}

function MarkdownDocument({ source, empty }: { source: string; empty: string }) {
  if (!source.trim()) return <p className="empty-copy">{empty}</p>;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let cursor = 0;
  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line.trim()) { cursor += 1; continue; }
    if (/^```/.test(line.trim())) {
      const code: string[] = []; const language = line.trim().slice(3); cursor += 1;
      while (cursor < lines.length && !/^```/.test(lines[cursor].trim())) { code.push(lines[cursor]); cursor += 1; }
      if (cursor < lines.length) cursor += 1;
      blocks.push(<pre className="markdown-code" key={`code-${cursor}`}><span>{language || "kod"}</span><code>{code.join("\n")}</code></pre>); continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { const level = heading[1].length; const content = inlineMarkdown(heading[2]); const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3"; blocks.push(<Tag key={`heading-${cursor}`}>{content}</Tag>); cursor += 1; continue; }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { blocks.push(<hr key={`rule-${cursor}`} />); cursor += 1; continue; }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line); const ordered = /^\s*(\d+)\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered); const items: ReactNode[] = [];
      while (cursor < lines.length) {
        const match = isOrdered ? /^\s*(\d+)\.\s+(.+)$/.exec(lines[cursor]) : /^\s*[-*+]\s+(.+)$/.exec(lines[cursor]);
        if (!match) break;
        items.push(<li key={`item-${cursor}`}>{inlineMarkdown(match[isOrdered ? 2 : 1])}</li>); cursor += 1;
      }
      blocks.push(isOrdered ? <ol key={`list-${cursor}`}>{items}</ol> : <ul key={`list-${cursor}`}>{items}</ul>); continue;
    }
    const paragraph: string[] = [line]; cursor += 1;
    while (cursor < lines.length && lines[cursor].trim() && !/^(#{1,3})\s+|^```|^\s*[-*+]\s+|^\s*\d+\.\s+|^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[cursor])) { paragraph.push(lines[cursor]); cursor += 1; }
    blocks.push(<p key={`paragraph-${cursor}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }
  return <div className="markdown-document">{blocks}</div>;
}

function AgyPrimer() {
  return <details className="agy-primer">
    <summary>How does Antigravity work?</summary>
    <div className="primer-body">{AGY_PRIMER.map((card) => <div className="primer-card" key={card.q}><h4>{card.q}</h4><p>{card.a}</p></div>)}</div>
  </details>;
}

function ActivityStrip({ activity }: { activity: AgyActivity }) {
  const meta = PHASES[activity.phase];
  return <div className={`activity-card tone-${meta.tone} ${activity.isLive ? "is-live" : ""}`}>
    <div className="activity-head">
      <span className="activity-icon" aria-hidden>{meta.icon}</span>
      <div className="activity-headline"><p className="eyebrow">ANTIGRAVITY NOW{activity.isLive ? " · LIVE" : ""}</p><h2>{meta.label}</h2></div>
      {activity.isLive && <span className="live-pulse" aria-label="canlı" />}
    </div>
    <p className="activity-explain">{activity.explanation}</p>
    {activity.currentLine && <p className="activity-line"><span aria-hidden>›</span> {activity.currentLine}</p>}
    {activity.question && <p className="activity-question"><strong>Question / decision:</strong> {activity.question}</p>}
  </div>;
}

function ExplainPanel({ activity }: { activity: AgyActivity }) {
  const meta = PHASES[activity.phase];
  const timeline = [...activity.steps].slice(-14).reverse();
  return <div className="explain-panel">
    <div className={`explain-now tone-${meta.tone}`}>
      <span className="activity-icon" aria-hidden>{meta.icon}</span>
      <div><h3>{meta.label}</h3><p>{activity.explanation}</p>{activity.currentLine && <p className="activity-line"><span aria-hidden>›</span> {activity.currentLine}</p>}{activity.question && <p className="activity-question"><strong>Question / decision:</strong> {activity.question}</p>}</div>
    </div>
    <h3 className="explain-section-title">Step by step <small>{activity.stepCount}</small></h3>
    {timeline.length ? <ol className="agy-timeline">{timeline.map((step, index) => { const stepMeta = PHASES[step.phase]; return <li key={`${step.index}-${index}`} className={`tone-${stepMeta.tone}`}><span className="tl-icon" aria-hidden>{stepMeta.icon}</span><div><b>{stepMeta.label}</b><span>{step.line}</span></div></li>; })}</ol> : <p className="empty-copy">Antigravity hasn't written a trackable step yet.</p>}
    <AgyPrimer />
  </div>;
}

export default function Home() {
  const [runs, setRuns] = useState<Run[]>([]); const [selectedId, setSelectedId] = useState<string | null>(null); const [detail, setDetail] = useState<RunDetail | null>(null);
  const [connection, setConnection] = useState<"connecting" | "online" | "offline">("connecting"); const [follow, setFollow] = useState(true); const [activeTab, setActiveTab] = useState<Tab>("log");
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false); // true once the user manually clicks a run — stops auto-follow from yanking their selection

  const loadRuns = useCallback(async () => { try { const response = await fetch(`${BRIDGE_URL}/api/runs`); if (!response.ok) throw new Error(); const data = (await response.json()) as { runs: Run[] }; setRuns(data.runs); setConnection("online"); const running = data.runs.find((run) => run.status === "running")?.id; setSelectedId((current) => pinnedRef.current ? (current ?? running ?? data.runs[0]?.id ?? null) : (running ?? current ?? data.runs[0]?.id ?? null)); } catch { setConnection("offline"); } }, []);
  const loadDetail = useCallback(async (runId: string) => { try { const response = await fetch(`${BRIDGE_URL}/api/runs/${encodeURIComponent(runId)}`); if (!response.ok) throw new Error(); setDetail((await response.json()) as RunDetail); setConnection("online"); } catch { setConnection("offline"); } }, []);
  useEffect(() => { const initial = window.setTimeout(() => void loadRuns(), 0); const interval = window.setInterval(() => void loadRuns(), 4000); return () => { window.clearTimeout(initial); window.clearInterval(interval); }; }, [loadRuns]);
  useEffect(() => { if (!selectedId) { queueMicrotask(() => setDetail(null)); return; } const initial = window.setTimeout(() => void loadDetail(selectedId), 0); const stream = new EventSource(`${BRIDGE_URL}/api/stream?run=${encodeURIComponent(selectedId)}`); stream.addEventListener("snapshot", (event) => { setDetail(JSON.parse((event as MessageEvent<string>).data) as RunDetail); setConnection("online"); }); stream.onerror = () => { setConnection("offline"); stream.close(); }; return () => { window.clearTimeout(initial); stream.close(); }; }, [selectedId, loadDetail]);
  useEffect(() => { if (follow && activeTab === "log" && contentRef.current) contentRef.current.scrollTop = contentRef.current.scrollHeight; }, [detail?.log, follow, activeTab]);
  const documentSource = activeTab === "log" ? detail?.log ?? "" : detail?.prompt || detail?.plan?.content || "";
  const activity = detail ? analyzeAgyRun({ log: detail.log, status: detail.status, termination: detail.termination }) : null;

  return <main className="app-shell">
    <header className="app-header"><div className="brand"><span className="brand-dot" /><strong>Understudy</strong><span className="brand-sub">live cockpit for Antigravity</span></div><div className={`connection connection-${connection}`}><span />{connection === "online" ? "Connected" : connection === "offline" ? "Server offline" : "Connecting"}</div></header>
    <section className="app-layout">
      <aside className="sidebar"><div className="sidebar-title"><span>Runs</span><b>{runs.length}</b></div>{connection === "offline" && <p className="sidebar-note">Server offline. The cockpit only talks to the local server.</p>}{runs.map((run) => <button key={run.id} className={`run-card ${selectedId === run.id ? "selected" : ""}`} onClick={() => { pinnedRef.current = true; setSelectedId(run.id); setActiveTab("log"); }}><div><strong>{run.id}</strong><StatusBadge status={run.status} /></div><span>{formatDate(run.lastActivityAt)}</span><small>{run.hasManifest ? formatDuration(run.durationMs) : "Archived"}</small></button>)}</aside>
      <section className="reading-pane">
        {detail ? <><div className="run-header"><div><p className="eyebrow">AGY RUN</p><h1>{detail.id}</h1><p className="run-path">{detail.sandboxPath}</p></div><StatusBadge status={detail.status} /></div>
          <div className="summary-row"><div><span>Started</span><strong>{formatDate(detail.startedAt)}</strong></div><div><span>Duration</span><strong>{formatDuration(detail.durationMs)}</strong></div><div><span>Exit</span><strong>{detail.exitCode ?? "—"}</strong></div><div><span>Watchdog</span><strong>{detail.termination || "Clean"}</strong></div></div>
          {activity && <ActivityStrip activity={activity} />}
          <div className="content-toolbar"><nav aria-label="Koşu içeriği">{TABS.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "tab active" : "tab"} onClick={() => setActiveTab(tab.id)}>{tab.label}{tab.id === "files" && <small>{detail.files.length}</small>}</button>)}</nav>{activeTab === "log" && <button className={follow ? "follow active" : "follow"} onClick={() => setFollow((value) => !value)}>{follow ? "Following live" : "Paused"}</button>}</div>
          <div ref={contentRef} className="content-card">{activeTab === "files" ? <ul className="files">{detail.files.length ? detail.files.map((file) => <li key={file}><span>⌁</span>{file}</li>) : <li>No files recorded for this run.</li>}</ul> : activeTab === "explain" ? (activity ? <ExplainPanel activity={activity} /> : null) : <MarkdownDocument source={documentSource} empty={activeTab === "log" ? "This run hasn't written a log yet." : "No saved prompt for this archived run."} />}</div>
        </> : <div className="welcome"><p className="eyebrow">UNDERSTUDY</p><h1>Select a run</h1><p>Open a run from the left to see its live stream, a plain-language explanation of what Antigravity is doing right now, the prompt it was given, and the files it produced.</p><AgyPrimer /></div>}
      </section>
    </section>
  </main>;
}
