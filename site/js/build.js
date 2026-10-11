const CFG = window.BP_CONFIG;
const I18N = window.BP_BUILD_I18N;
const { t } = I18N;
const HEADER = ["lot", "product", "producer", "municipality", "state", "origin_lot", "purchase_date"];
const STEP = ["n", "step", "date", "input_g", "output_g", "byproduct_g", "units", "profile"];
const STEP_CODES = ["roasting", "winnowing", "grinding", "tempering_molding", "packaging"];
const COLUMNS = ["date", "input", "output", "byproduct", "units", "profile"];
const KG_COLUMNS = { input: "input_g", output: "output_g", byproduct: "byproduct_g" };
const LOT_RE = /^[A-Za-z0-9-]{1,32}$/;
const DEFAULT_LOT = "TEST-0001";

const state = { batch: null, upTo: null, upToPinned: false, last: null, notes: [], errors: [], seals: {}, msgs: {} };
let runId = 0;

const $ = id => document.getElementById(id);
const field = (n, column) => $(`s${n}-${column}`);
const resolve = args => args.map(a => typeof a === "function" ? a() : a);
const tr = ([key, ...args]) => t(key, ...resolve(args));
const stepName = code => () => t(`step.${code}`);
const cellName = (code, column) => () => `${t(`step.${code}`)} · ${t(`col.${column}`)}`;

async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function canonicalV1(record, upTo) {
  const steps = record.steps.filter(s => Number(s.n) <= upTo).sort((a, b) => Number(a.n) - Number(b.n));
  return JSON.stringify(["v1", ...HEADER.map(k => record[k]), ...steps.map(s => STEP.map(k => s[k]))]);
}

function kilogramsToGrams(text) {
  const value = text.trim();
  if (value === "") return "";
  if (!/^\d+(?:\.\d+)?$/.test(value)) return null;
  const grams = Math.round(Number(value) * 1000);
  return Number.isSafeInteger(grams) ? String(grams) : null;
}

const gramsToKilograms = grams => grams === "" ? "" : String(Number(grams) / 1000);

function normalizeText(raw, where, notes) {
  const trimmed = raw.trim();
  const value = trimmed.normalize("NFC");
  if (trimmed !== raw) notes.push(["n.trim", where]);
  if (value !== trimmed) notes.push(["n.nfc", where]);
  return value;
}

function show(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.dataset.kind = kind || "";
  el.hidden = !text;
}

function say(id, kind, message) {
  state.msgs[id] = message ? { kind, message } : null;
  show(id, message ? tr(message) : "", kind);
}

function readRecord() {
  const notes = [];
  const errors = [];
  const record = {};
  for (const key of HEADER) {
    const raw = $(`h-${key}`).value;
    record[key] = key === "purchase_date" ? raw : normalizeText(raw, () => t(`f.${key}`), notes);
  }
  if (!record.lot) errors.push(["e.lotEmpty"]);
  else if (!LOT_RE.test(record.lot)) errors.push(["e.lot", record.lot]);
  const filled = STEP_CODES.map((_, i) => COLUMNS.some(c => field(i + 1, c).value.trim() !== ""));
  const count = filled.lastIndexOf(true) + 1;
  record.steps = [];
  for (let n = 1; n <= count; n++) {
    const code = STEP_CODES[n - 1];
    if (!filled[n - 1]) { errors.push(["e.gap", stepName(code)]); continue; }
    const step = { n: String(n), step: code, date: field(n, "date").value };
    if (!step.date) errors.push(["e.date", stepName(code)]);
    for (const [column, key] of Object.entries(KG_COLUMNS)) {
      const raw = field(n, column).value;
      const grams = kilogramsToGrams(raw);
      if (grams === null) errors.push(["e.weight", cellName(code, column), raw.trim()]);
      else if (grams !== "") notes.push(["n.kg", cellName(code, column), raw.trim(), grams]);
      step[key] = grams === null ? "" : grams;
    }
    const units = normalizeText(field(n, "units").value, cellName(code, "units"), notes);
    if (!/^\d*$/.test(units)) errors.push(["e.units", cellName(code, "units"), units]);
    step.units = units;
    step.profile = normalizeText(field(n, "profile").value, cellName(code, "profile"), notes);
    record.steps.push(step);
  }
  if (!count) errors.push(["e.noSteps"]);
  return { record, count, notes, errors };
}

function renderMessages() {
  const list = $("notes");
  const items = [
    ...state.errors.map(e => ["err", tr(e)]),
    ...state.notes.map(n => ["", tr(n)])
  ];
  list.replaceChildren(...items.map(([kind, text]) => {
    const li = document.createElement("li");
    li.className = kind;
    li.textContent = text;
    return li;
  }));
  list.hidden = !items.length;
  $("norm-none").hidden = items.length > 0;
}

function renderUpTo(count) {
  if (!state.upToPinned || !state.upTo || state.upTo > count) state.upTo = count || null;
  const select = $("up-to");
  select.replaceChildren(...STEP_CODES.slice(0, count).map((code, i) => {
    const option = document.createElement("option");
    option.value = String(i + 1);
    option.textContent = `${i + 1} · ${t(`step.${code}`)}`;
    return option;
  }));
  select.value = state.upTo ? String(state.upTo) : "";
  select.disabled = !count;
}

function renderOutput() {
  const r = state.last;
  $("canonical").textContent = r ? r.canonical : "—";
  $("hash").textContent = r ? r.hash : "—";
  $("memo").textContent = r ? r.memo : "—";
  $("copy-canonical").disabled = !r;
  $("copy-memo").disabled = !r;
  const passport = $("next-passport");
  if (r) {
    passport.href = CFG.publicPage(r.record.lot);
    passport.textContent = t("next.passport", r.record.lot);
  }
  passport.hidden = !r;
  if (!r) say("chain-msg", "", null);
}

function formatTime(blockTime) {
  return new Intl.DateTimeFormat(t("locale"), { timeZone: "America/Sao_Paulo", dateStyle: "medium", timeStyle: "short" }).format(new Date(blockTime * 1000));
}

function readSeal(signature) {
  if (!state.seals[signature]) {
    state.seals[signature] = fetch(CFG.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getTransaction", params: [signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }] })
    }).then(res => res.json()).then(({ result }) => {
      if (!result || (result.meta && result.meta.err)) return { found: false };
      const ix = result.transaction.message.instructions.find(i => i.programId === CFG.memoProgram && typeof i.parsed === "string");
      return { found: Boolean(ix), memo: ix ? ix.parsed : null, signer: result.transaction.message.accountKeys[0].pubkey, time: result.blockTime };
    });
  }
  return state.seals[signature];
}

async function compareWithChain(my) {
  const r = state.last;
  const batch = state.batch;
  if (!batch || batch.record.lot !== r.record.lot) return say("chain-msg", "", ["chain.other"]);
  const anchor = (batch.anchors || []).find(a => Number(a.step) === r.upTo);
  if (!anchor) return say("chain-msg", "", ["chain.none", r.record.lot, r.upTo]);
  say("chain-msg", "", ["chain.loading", r.upTo]);
  try {
    const seal = await readSeal(anchor.signature);
    if (my !== runId) return;
    const when = () => formatTime(seal.time);
    if (!seal.found) say("chain-msg", "bad", ["chain.notFound", r.upTo]);
    else if (seal.memo !== r.memo) say("chain-msg", "bad", ["chain.differ", r.upTo, seal.memo]);
    else if (seal.signer !== CFG.issuerFor(r.record.lot)) say("chain-msg", "warn", ["chain.matchOther", r.upTo, when]);
    else say("chain-msg", "ok", ["chain.match", r.upTo, when]);
  } catch {
    delete state.seals[anchor.signature];
    if (my === runId) say("chain-msg", "warn", ["chain.offline"]);
  }
}

async function compute() {
  const my = ++runId;
  const { record, count, notes, errors } = readRecord();
  state.notes = notes;
  state.errors = errors;
  renderMessages();
  renderUpTo(count);
  if (errors.length || !state.upTo) {
    state.last = null;
    renderOutput();
    return;
  }
  const upTo = state.upTo;
  const canonical = canonicalV1(record, upTo);
  const hash = await sha256Hex(canonical);
  if (my !== runId) return;
  state.last = { record, upTo, canonical, hash, memo: `v1|${record.lot}|${upTo}|${hash}` };
  renderOutput();
  compareWithChain(my);
}

function fill(record) {
  for (const key of HEADER) $(`h-${key}`).value = record ? record[key] : "";
  STEP_CODES.forEach((_, i) => {
    const n = i + 1;
    const s = record && record.steps.find(x => Number(x.n) === n);
    field(n, "date").value = s ? s.date : "";
    for (const [column, key] of Object.entries(KG_COLUMNS)) field(n, column).value = s ? gramsToKilograms(s[key]) : "";
    field(n, "units").value = s ? s.units : "";
    field(n, "profile").value = s ? s.profile : "";
  });
}

async function load(lot) {
  state.upToPinned = false;
  try {
    const res = await fetch(`data/lots/${encodeURIComponent(lot)}.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const batch = await res.json();
    fill(batch.record);
    state.batch = batch;
    say("start-msg", "ok", ["start.loaded", lot]);
  } catch {
    say("start-msg", "bad", ["start.err", lot]);
  }
  compute();
}

function clear() {
  state.batch = null;
  state.upToPinned = false;
  fill(null);
  say("start-msg", "", null);
  compute();
}

async function checkVector() {
  say("vector-msg", "", ["vector.loading"]);
  try {
    const vector = await (await fetch("spec/test-vector-v1.json", { cache: "no-store" })).json();
    let checks = 0;
    let failed = 0;
    for (const c of vector.cases) {
      const canonical = canonicalV1(c.record, c.upTo);
      const hash = await sha256Hex(canonical);
      checks++;
      if (canonical !== c.canonical || hash !== c.sha256 || `v1|${c.record.lot}|${c.upTo}|${hash}` !== c.memo) failed++;
    }
    for (const c of vector.normalization) {
      if (c.kind === "grams") { checks++; if (kilogramsToGrams(String(c.input)) !== c.expected) failed++; }
      if (c.kind === "text") { checks++; if (normalizeText(c.input, "", []) !== c.expected) failed++; }
    }
    say("vector-msg", failed ? "bad" : "ok", failed ? ["vector.bad", failed, checks] : ["vector.ok", checks]);
  } catch {
    say("vector-msg", "warn", ["vector.err"]);
  }
}

function buildSteps() {
  const head = `<thead><tr><th data-i18n="col.step"></th>${COLUMNS.map(c => `<th data-i18n="col.${c}"></th>`).join("")}</tr></thead>`;
  const mode = { date: 'type="date"', input: 'inputmode="decimal"', output: 'inputmode="decimal"', byproduct: 'inputmode="decimal"', units: 'inputmode="numeric"', profile: "" };
  const rows = STEP_CODES.map((code, i) => `<tr><th scope="row" data-i18n="step.${code}"></th>${COLUMNS.map(c =>
    `<td><input id="s${i + 1}-${c}" class="col-${c}" ${mode[c]} autocomplete="off" spellcheck="false" data-step="${code}" data-col="${c}"></td>`).join("")}</tr>`).join("");
  $("steps").innerHTML = `${head}<tbody>${rows}</tbody>`;
}

async function copy(text, button, source) {
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = t("copied");
  } catch {
    window.getSelection().selectAllChildren(source);
    button.textContent = t("selected");
  }
  setTimeout(() => { button.textContent = t("copy"); }, 1800);
}

function applyLanguage() {
  document.documentElement.lang = t("htmlLang");
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.querySelectorAll("#steps input").forEach(el => el.setAttribute("aria-label", cellName(el.dataset.step, el.dataset.col)()));
  document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === I18N.lang)));
  for (const [id, m] of Object.entries(state.msgs)) if (m) show(id, tr(m.message), m.kind);
  renderMessages();
  renderUpTo(state.upTo ? $("up-to").options.length : 0);
  renderOutput();
}

buildSteps();
document.querySelectorAll(".lang button").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.lang === I18N.lang) return;
  I18N.setLang(b.dataset.lang);
  applyLanguage();
}));
document.querySelectorAll("#numbers input").forEach(el => el.addEventListener("input", compute));
$("up-to").addEventListener("change", e => {
  state.upTo = Number(e.target.value);
  state.upToPinned = true;
  compute();
});
$("load-test").addEventListener("click", () => load("TEST-0001"));
$("load-real").addEventListener("click", () => load("ACD-0142"));
$("load-blank").addEventListener("click", clear);
$("copy-canonical").addEventListener("click", e => copy($("canonical").textContent, e.currentTarget, $("canonical")));
$("copy-memo").addEventListener("click", e => copy($("memo").textContent, e.currentTarget, $("memo")));

applyLanguage();
checkVector();
const requested = new URLSearchParams(location.search).get("lot");
load(LOT_RE.test(requested || "") ? requested : DEFAULT_LOT);
