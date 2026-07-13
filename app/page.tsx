"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { analyzeAgyRun, PHASES, AGY_PRIMER } from "../agy-explain.mjs";

const BRIDGE_URL = "http://127.0.0.1:4288";
const DATASET_URL = "http://127.0.0.1:4289";
type RunStatus = "running" | "completed" | "failed" | "archived" | "stalled" | "terminated";
type Run = { id: string; status: RunStatus; startedAt: string | null; endedAt: string | null; lastActivityAt: string | null; durationMs: number | null; logBytes: number; hasManifest: boolean; };
type RunDetail = Run & { sandboxPath: string; prompt: string | null; plan: { path: string; content: string } | null; log: string; files: string[]; pid: number | null; pgid: number | null; exitCode: number | null; termination: string | null; };
type Tab = "log" | "explain" | "prompt" | "files";
type AgyActivity = ReturnType<typeof analyzeAgyRun>;

const STATUS_LABEL: Record<RunStatus, string> = { running: "Çalışıyor", completed: "Tamamlandı", failed: "Hata", archived: "Arşiv", stalled: "Durdu", terminated: "Sonlandı" };
const TABS: Array<{ id: Tab; label: string }> = [{ id: "log", label: "Akış" }, { id: "explain", label: "Açıklama" }, { id: "prompt", label: "Talimat" }, { id: "files", label: "Dosyalar" }];

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }).format(new Date(value)) : "—"; }
function formatDuration(value: number | null) { if (value === null) return "—"; const seconds = Math.max(0, Math.floor(value / 1000)); const minutes = Math.floor(seconds / 60); return minutes ? `${minutes} dk ${seconds % 60} sn` : `${seconds} sn`; }
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

type DatasetJob = { id: string; status: "queued" | "researching" | "generating" | "validating" | "completed" | "failed"; request: { topic: string; audience: string; purpose: string; rowCount: number; mode: "demo" | "live" }; artifacts: string[]; validation: { status: string; checks: Record<string, boolean>; rowCount: number; duplicateRowCount: number; missingValueLocations: string[] }; preview?: Array<Record<string, string | number>>; };

function DatasetLab() {
  const [mode, setMode] = useState<"demo" | "live">("demo"); const [topic, setTopic] = useState("Campus energy consumption"); const [audience, setAudience] = useState("A university sustainability class"); const [purpose, setPurpose] = useState("Practice exploratory analysis and charting"); const [columns, setColumns] = useState("date, building_zone, occupancy_index, energy_kwh, outdoor_temp_c"); const [rowCount, setRowCount] = useState("24"); const [constraints, setConstraints] = useState("");
  const [job, setJob] = useState<DatasetJob | null>(null); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function createDataset(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null); setJob(null);
    try {
      const response = await fetch(`${DATASET_URL}/api/datasets/jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, topic, audience, purpose, columns: columns.split(",").map((value) => value.trim()).filter(Boolean), rowCount, constraints }) });
      const payload = await response.json() as DatasetJob | { error: { message: string } }; if (!response.ok || !("id" in payload)) throw new Error("error" in payload ? payload.error.message : "Dataset could not be created."); setJob(payload);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : "Local dataset service is unavailable."); } finally { setBusy(false); }
  }
  const artifactUrl = (name: string) => job ? `${DATASET_URL}/api/datasets/jobs/${encodeURIComponent(job.id)}/artifacts/${encodeURIComponent(name)}` : "#";
  return <section className="lab-shell">
    <div className="lab-intro"><p className="eyebrow">LOCAL-ONLY LEARNING SANDBOX</p><h1>Campus Dataset Lab</h1><p>Gerçek kampüs veya kişi verisi değil: analiz pratiği için açıkça etiketli, sentetik küçük veri setleri.</p></div>
    <div className="lab-grid"><form className="dataset-form" onSubmit={createDataset}>
      <div className="mode-row"><button type="button" className={mode === "demo" ? "mode-choice active" : "mode-choice"} onClick={() => setMode("demo")}>Yerel demo <small>Deterministik</small></button><button type="button" className={mode === "live" ? "mode-choice active" : "mode-choice"} onClick={() => setMode("live")}>Canlı araştırma <small>Yapılandırma gerekir</small></button></div>
      <label>Konu<input value={topic} onChange={(event) => setTopic(event.target.value)} required maxLength={120} /></label>
      <label>Hedef kitle / bağlam<input value={audience} onChange={(event) => setAudience(event.target.value)} required maxLength={120} /></label>
      <label>Öğrenme amacı<input value={purpose} onChange={(event) => setPurpose(event.target.value)} required maxLength={160} /></label>
      <label>İstenen sütunlar <span>Virgülle ayır</span><input value={columns} onChange={(event) => setColumns(event.target.value)} /></label>
      <div className="form-split"><label>Yaklaşık satır<input type="number" min="5" max="250" value={rowCount} onChange={(event) => setRowCount(event.target.value)} /></label><label>Ek koşullar <span>İsteğe bağlı</span><input value={constraints} onChange={(event) => setConstraints(event.target.value)} maxLength={400} /></label></div>
      <p className="form-boundary">Kişi, öğrenci kaydı, not, sağlık verisi, kimlik veya gerçek kaynak satırı üretilmez.</p><button className="create-dataset" disabled={busy}>{busy ? "Hazırlanıyor…" : mode === "demo" ? "Sentetik demo oluştur" : "Canlı ajanı dene"}</button>
      {mode === "live" && <p className="agent-note">Canlı mod, yalnızca açıkça yapılandırılmış yerel sağlayıcı ile çalışır. Yapılandırma yoksa kaynak uydurulmaz.</p>}{message && <p className="lab-error" role="alert">{message}</p>}
    </form>
    <section className="dataset-results" aria-live="polite">
      {!job && <div className="result-empty"><p className="eyebrow">SONUÇ</p><h2>Önizleme burada açılır</h2><p>Yerel demo; doğrulama, veri sözlüğü ve indirilebilir CSV/JSON ile gelir. Canlı araştırma yapılandırılmamışsa bunu açıkça söyler.</p></div>}
      {job && <div className="result-ready"><div className="result-heading"><div><p className="eyebrow">{job.status === "completed" ? "TAMAMLANDI" : job.status.toUpperCase()}</p><h2>{job.request.topic}</h2></div><span className="synthetic-chip">SENTETİK • YEREL DEMO</span></div><p className="result-meta">{job.validation.rowCount} satır · {job.request.audience} · Gerçek kişi/kampüs verisi değildir.</p>
        <div className="preview-table"><table><thead><tr>{Object.keys(job.preview?.[0] ?? {}).map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{job.preview?.slice(0, 5).map((row, index) => <tr key={index}>{Object.entries(row).map(([key, value]) => <td key={key}>{String(value)}</td>)}</tr>)}</tbody></table></div>
        <div className="download-row"><a href={artifactUrl("dataset.csv")} download>CSV indir</a><a href={artifactUrl("dataset.json")} download>JSON indir</a></div>
        <div className="result-sections"><article><h3>Provenance / kaynaklar</h3><p>Bu demo canlı web araştırması yapmadı; `research-sources.md` bunu açıkça kaydeder. Kaynak veya alıntı uydurulmamıştır.</p><a href={artifactUrl("research-sources.md")} target="_blank" rel="noreferrer">Kaynak notunu aç</a></article><article><h3>Veri sözlüğü</h3><p>Sütun tipleri ve öğretim amaçlı anlamları ayrı bir dosyada bulunur.</p><a href={artifactUrl("data-dictionary.md")} target="_blank" rel="noreferrer">Veri sözlüğünü aç</a></article><article><h3>Doğrulama özeti</h3><p>{job.validation.status === "passed" ? "Başarılı" : "Başarısız"}: şema, satır sayısı, eksik/tekrar satırlar, sayı aralıkları ve sentetik etiket kontrol edildi.</p><a href={artifactUrl("validation.json")} target="_blank" rel="noreferrer">Doğrulamayı aç</a></article><article><h3>Tekrarlanabilirlik</h3><p>Varsayımlar ve sabit demo üretim yaklaşımı kaydedildi.</p><a href={artifactUrl("assumptions.md")} target="_blank" rel="noreferrer">Varsayımları aç</a></article></div>
      </div>}
    </section></div>
  </section>;
}

function AgyPrimer() {
  return <details className="agy-primer">
    <summary>Antigravity nasıl çalışır?</summary>
    <div className="primer-body">{AGY_PRIMER.map((card) => <div className="primer-card" key={card.q}><h4>{card.q}</h4><p>{card.a}</p></div>)}</div>
  </details>;
}

function ActivityStrip({ activity }: { activity: AgyActivity }) {
  const meta = PHASES[activity.phase];
  return <div className={`activity-card tone-${meta.tone} ${activity.isLive ? "is-live" : ""}`}>
    <div className="activity-head">
      <span className="activity-icon" aria-hidden>{meta.icon}</span>
      <div className="activity-headline"><p className="eyebrow">ANTIGRAVITY ŞU AN{activity.isLive ? " · CANLI" : ""}</p><h2>{meta.label}</h2></div>
      {activity.isLive && <span className="live-pulse" aria-label="canlı" />}
    </div>
    <p className="activity-explain">{activity.explanation}</p>
    {activity.currentLine && <p className="activity-line"><span aria-hidden>›</span> {activity.currentLine}</p>}
    {activity.question && <p className="activity-question"><strong>Soru / karar:</strong> {activity.question}</p>}
  </div>;
}

function ExplainPanel({ activity }: { activity: AgyActivity }) {
  const meta = PHASES[activity.phase];
  const timeline = [...activity.steps].slice(-14).reverse();
  return <div className="explain-panel">
    <div className={`explain-now tone-${meta.tone}`}>
      <span className="activity-icon" aria-hidden>{meta.icon}</span>
      <div><h3>{meta.label}</h3><p>{activity.explanation}</p>{activity.currentLine && <p className="activity-line"><span aria-hidden>›</span> {activity.currentLine}</p>}{activity.question && <p className="activity-question"><strong>Soru / karar:</strong> {activity.question}</p>}</div>
    </div>
    <h3 className="explain-section-title">Adım adım ne yaptı <small>{activity.stepCount}</small></h3>
    {timeline.length ? <ol className="agy-timeline">{timeline.map((step, index) => { const stepMeta = PHASES[step.phase]; return <li key={`${step.index}-${index}`} className={`tone-${stepMeta.tone}`}><span className="tl-icon" aria-hidden>{stepMeta.icon}</span><div><b>{stepMeta.label}</b><span>{step.line}</span></div></li>; })}</ol> : <p className="empty-copy">Antigravity henüz izlenebilir bir adım yazmadı.</p>}
    <AgyPrimer />
  </div>;
}

export default function Home() {
  const [runs, setRuns] = useState<Run[]>([]); const [selectedId, setSelectedId] = useState<string | null>(null); const [detail, setDetail] = useState<RunDetail | null>(null);
  const [connection, setConnection] = useState<"connecting" | "online" | "offline">("connecting"); const [follow, setFollow] = useState(true); const [activeTab, setActiveTab] = useState<Tab>("log");
  const [product, setProduct] = useState<"inspector" | "datasets">("inspector");
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
    <header className="app-header"><div className="brand"><span className="brand-dot" /><button className={product === "inspector" ? "product-link active" : "product-link"} onClick={() => setProduct("inspector")}>AGY <strong>Live Inspector</strong></button><button className={product === "datasets" ? "product-link active" : "product-link"} onClick={() => setProduct("datasets")}>Campus Dataset Lab</button></div><div className={`connection connection-${connection}`}><span />{connection === "online" ? "AGY bağlı" : connection === "offline" ? "AGY köprü kapalı" : "Bağlanıyor"}</div></header>
    {product === "datasets" ? <DatasetLab /> : <section className="app-layout">
      <aside className="sidebar"><div className="sidebar-title"><span>Koşular</span><b>{runs.length}</b></div>{connection === "offline" && <p className="sidebar-note">Bridge kapalı. Panel yalnızca yerel köprüye bağlanır.</p>}{runs.map((run) => <button key={run.id} className={`run-card ${selectedId === run.id ? "selected" : ""}`} onClick={() => { pinnedRef.current = true; setSelectedId(run.id); setActiveTab("log"); }}><div><strong>{run.id}</strong><StatusBadge status={run.status} /></div><span>{formatDate(run.lastActivityAt)}</span><small>{run.hasManifest ? formatDuration(run.durationMs) : "Eski koşu"}</small></button>)}</aside>
      <section className="reading-pane">
        {detail ? <><div className="run-header"><div><p className="eyebrow">AGY KOŞUSU</p><h1>{detail.id}</h1><p className="run-path">{detail.sandboxPath}</p></div><StatusBadge status={detail.status} /></div>
          <div className="summary-row"><div><span>Başlangıç</span><strong>{formatDate(detail.startedAt)}</strong></div><div><span>Süre</span><strong>{formatDuration(detail.durationMs)}</strong></div><div><span>Çıkış</span><strong>{detail.exitCode ?? "—"}</strong></div><div><span>Watchdog</span><strong>{detail.termination || "Temiz"}</strong></div></div>
          {activity && <ActivityStrip activity={activity} />}
          <div className="content-toolbar"><nav aria-label="Koşu içeriği">{TABS.map((tab) => <button key={tab.id} className={activeTab === tab.id ? "tab active" : "tab"} onClick={() => setActiveTab(tab.id)}>{tab.label}{tab.id === "files" && <small>{detail.files.length}</small>}</button>)}</nav>{activeTab === "log" && <button className={follow ? "follow active" : "follow"} onClick={() => setFollow((value) => !value)}>{follow ? "Canlı akışı takip et" : "Takibi duraklat"}</button>}</div>
          <div ref={contentRef} className="content-card">{activeTab === "files" ? <ul className="files">{detail.files.length ? detail.files.map((file) => <li key={file}><span>⌁</span>{file}</li>) : <li>Bu koşuda dosya kaydı yok.</li>}</ul> : activeTab === "explain" ? (activity ? <ExplainPanel activity={activity} /> : null) : <MarkdownDocument source={documentSource} empty={activeTab === "log" ? "Bu koşu henüz log yazmadı." : "Bu eski koşu için kayıtlı talimat bulunamadı."} />}</div>
        </> : <div className="welcome"><p className="eyebrow">AGY LIVE INSPECTOR</p><h1>Bir koşu seç</h1><p>Soldaki listeden bir koşu açtığında canlı akış, Antigravity’nin şu an ne yaptığının sade açıklaması, verilen talimat ve üretilen dosyalar burada görünür.</p><AgyPrimer /></div>}
      </section>
    </section>}
  </main>;
}
