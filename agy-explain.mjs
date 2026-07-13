// Deterministic, local-only explainer for Google Antigravity (agy) runs.
//
// Antigravity narrates its work as a stream of natural-language lines
// ("I will read ...", "I will run the tests ...", "Does this look correct?").
// This module turns that raw stream into a plain-Turkish, human-readable answer
// to a single question: *Antigravity şu an ne yapıyor, neden?*
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
 * Static, per-phase presentation + plain-Turkish meaning. `tone` maps to a CSS
 * class in globals.css; `icon` is a text glyph so it renders without an icon font.
 * @type {Record<AgyPhase, { label: string, icon: string, tone: string, blurb: string }>}
 */
export const PHASES = {
  starting: {
    label: "Başlıyor",
    icon: "◔",
    tone: "neutral",
    blurb: "Antigravity yeni başladı; görevi ve çalışma alanını okumaya hazırlanıyor. Henüz gözle görülür bir adım yazmadı.",
  },
  reading: {
    label: "Okuyor",
    icon: "▤",
    tone: "info",
    blurb: "Antigravity mevcut dosyaları okuyor. Kod yazmadan önce projeyi anlamaya çalışıyor — bir insanın işe başlamadan önce dosyalara göz atması gibi.",
  },
  exploring: {
    label: "Keşfediyor",
    icon: "⌕",
    tone: "info",
    blurb: "Antigravity klasörleri listeliyor / arama yapıyor. Nerede ne olduğunu haritalıyor, ilgili dosyaları buluyor.",
  },
  planning: {
    label: "Planlıyor",
    icon: "◇",
    tone: "plan",
    blurb: "Antigravity bir plan / mimari kuruyor. Koda geçmeden önce adımları ve yapıyı tasarlıyor.",
  },
  editing: {
    label: "Kod yazıyor",
    icon: "✎",
    tone: "edit",
    blurb: "Antigravity dosyalarda değişiklik yapıyor: yeni kod yazıyor, düzenliyor ya da düzeltiyor. İşin asıl uygulama kısmı burada oluyor.",
  },
  testing: {
    label: "Test ediyor",
    icon: "✓",
    tone: "test",
    blurb: "Antigravity testleri / doğrulamayı çalıştırıyor. Yazdığı kodun gerçekten çalışıp çalışmadığını kendi kendine kontrol ediyor.",
  },
  running: {
    label: "Komut çalıştırıyor",
    icon: "»",
    tone: "run",
    blurb: "Antigravity bir komut çalıştırıyor (derleme, kurulum, script). Sonucu bir sonraki adımını belirleyecek.",
  },
  asking: {
    label: "Karar / soru",
    icon: "?",
    tone: "warn",
    blurb: "Antigravity bir soru sordu ya da bir karar noktasına geldi. Log'da hangi seçime takıldığını görebilirsin.",
  },
  reporting: {
    label: "Raporluyor",
    icon: "▣",
    tone: "info",
    blurb: "Antigravity işi topluyor: ne yaptığını, sonucu ve varsa kısıtları özetliyor. Bitişe yakın.",
  },
  done: {
    label: "Tamamlandı",
    icon: "●",
    tone: "ok",
    blurb: "Antigravity koşuyu temiz bitirdi. Çıktı kodunu ve üretilen dosyaları kontrol edebilirsin — ama sonucu yine de bağımsız doğrula.",
  },
  failed: {
    label: "Hata",
    icon: "✕",
    tone: "bad",
    blurb: "Antigravity hata ile durdu (sıfırdan farklı çıkış kodu). Log'un sonundaki hata mesajına bakmak gerekir.",
  },
  stalled: {
    label: "Takıldı / durduruldu",
    icon: "‖",
    tone: "bad",
    blurb: "Koşu takıldı ya da watchdog tarafından durduruldu (çok uzun sürdü veya 90 sn çıktı gelmedi). Nerede kaldığını log'un sonu gösterir.",
  },
  archived: {
    label: "Arşiv",
    icon: "◍",
    tone: "neutral",
    blurb: "Bu, manifesti olmayan eski bir koşu. Sadece log'dan okunabiliyor; canlı değil.",
  },
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
 * Build a live, plain-Turkish explanation of what an Antigravity run is doing.
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
      ? "6 dakikalık süre sınırına takıldığı için"
      : run.termination === "stall-90s-no-output"
        ? "90 saniye boyunca yeni çıktı üretmediği için"
        : `“${run.termination}” nedeniyle`;
    explanation = `Koşu ${reason} watchdog tarafından durduruldu. Log'un sonu nerede kaldığını gösterir.`;
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
 * Shown in the Inspector so Mehmet can follow along even between runs.
 * @type {{ q: string, a: string }[]}
 */
export const AGY_PRIMER = [
  {
    q: "Antigravity (agy) nedir?",
    a: "Google'ın Gemini modelini çalıştıran, yerel makinende koşan bir komut satırı ajanı. Senin lokal ajanların (Claude, Codex, Cursor) sınırları belli bir işi ona devrediyor; Antigravity de o işi kendi yapıyor: dosyaları okuyor, plan kuruyor, kod yazıyor ve test ediyor.",
  },
  {
    q: "Adım adım nasıl çalışıyor?",
    a: "Genelde şu sırayı izler: görevi anla → dosyaları oku/keşfet → plan yap → kod yaz → test/komut çalıştır → sonucu raporla. Her adımı 'I will ...' diye tek cümlede yazar. Bu panel o cümleleri yakalayıp sade Türkçeye çeviriyor, böylece kod bilmeden de ne yaptığını takip edebilirsin.",
  },
  {
    q: "Bu koşuyu ne durdurur?",
    a: "Antigravity'i bir 'watchdog' izliyor: toplam 6 dakikalık süre sınırı ve 90 saniye boyunca hiç çıktı gelmezse otomatik durdurma. Durdurma, sürecin kaydedilmiş PID/PGID'si ile güvenli yapılır — isimle geniş arama yapılmaz.",
  },
  {
    q: "Güvenli mi?",
    a: "Evet. Antigravity yalnızca ~/agy-sandbox altında çalışır, '--dangerously-skip-permissions' asla kullanılmaz. Bu panel salt-okunurdur (dosyalarına dokunmaz) ve sadece 127.0.0.1 üzerinden yerel olarak yayınlanır.",
  },
  {
    q: "Bu panelde ne görüyorum?",
    a: "Soldaki listeden bir koşu seç: canlı log akışını, Antigravity'e verilen talimatı, ürettiği dosyaları ve 'şu an ne yapıyor?' açıklamasını görürsün. Çıktı kodu 0 olsa bile sonucu her zaman bağımsız doğrula.",
  },
];
