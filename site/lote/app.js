// Página pública do lote (visual e lógica do mockup v2 do Emerson), em inglês e português.
// Lê data/lots/<id>.json, recalcula o hash de cada etapa no navegador e compara com o selo (memo) na rede.
// ?simular=<cenário> mostra cada estado com selos simulados; ?lang=en|pt escolhe o idioma.

const { t } = window.BP_I18N;

const HEADER = ["lot", "product", "producer", "municipality", "state", "origin_lot", "purchase_date"];
const STEP = ["n", "step", "date", "input_g", "output_g", "byproduct_g", "units", "profile"];
const ORDEM = ["roasting", "winnowing", "grinding", "tempering_molding", "packaging"];
const UF = { BA: "Bahia", PA: "Pará", ES: "Espírito Santo", RO: "Rondônia", AM: "Amazonas", MG: "Minas Gerais", SP: "São Paulo" };

const PILL_CLS = { verified: "ok", changed: "bad", wrong_signer: "warn", not_found: "bad", network_error: "off", pending: "wait", upcoming: "wait", checking: "check" };
const CHECK_ICON = '<svg class="ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.2 2.2 4.8-4.9"/></svg>';

// Mesmo formato de lote aceito no memo (spec v1)
const FORMATO_LOTE = /^[A-Za-z0-9-]{1,32}$/;

const CFG = window.BP_CONFIG || {};
const FORMATO_ASSINATURA = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

// Cenários de simulação (?simular=...). Os selos são calculados a partir do próprio arquivo do lote.
const CENARIOS = {
  concluido: {},
  producao: { registradas: 3, seladas: [1, 2] },
  alterado: { edicoes: { "2.output_g": "4500" } },
  "outra-carteira": { outraCarteira: [3] },
  "selo-nao-encontrado": { sumidos: [3] },
  "erro-rede": { semRede: true },
};

const estado = { original: null, ancoras: [], selos: {}, edits: {}, cenario: null, carteira: "", aviso: null };
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
let runId = 0;
let shown = null;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = s => s.slice(0, 4) + "…" + s.slice(-4);
const isNum = v => /^\d+$/.test(v);
const label = code => t("steps")[code] || code;
const flow = code => t("flow")[code] || t("flow").fallback;
const grams = v => v === "" ? t("notRecorded") : (isNum(v) ? Number(v).toLocaleString(t("locale")) : v) + " g";
const day = d => { const x = new Date(d + "T12:00:00"); return isNaN(x) ? d : x.toLocaleDateString(t("locale"), { day: "numeric", month: "short", year: "numeric" }); };
const stamp = s => { const x = new Date(s); return x.toLocaleDateString(t("locale"), { day: "numeric", month: "short" }) + ", " + x.toLocaleTimeString(t("locale"), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }); };
const pct = (a, b) => (a / b * 100).toFixed(1).replace(".", t("decimal")) + "%";
const liOf = n => document.querySelector(`#journey li[data-n="${n}"]`);
const keyOf = s => s.upcoming ? "upcoming" : s.status;

// Registro canônico v1: implementação de referência do spec (site/spec/canonical-record-v1.md)
const canonicalV1 = (rec, upTo) => {
  const steps = rec.steps.filter(s => Number(s.n) <= upTo).sort((a, b) => a.n - b.n);
  const values = ["v1", ...HEADER.map(k => rec[k]), ...steps.flatMap(s => STEP.map(k => s[k]))];
  if (steps.length !== upTo || steps.some((s, i) => s.n !== String(i + 1)) || values.some(v => typeof v !== "string")) throw new Error("invalid record");
  return JSON.stringify(["v1", ...HEADER.map(k => rec[k]), ...steps.map(s => STEP.map(k => s[k]))]);
};

// SHA-256 com a Web Crypto do navegador, em hexadecimal minúsculo
async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

const memoDe = async (rec, n) => `v1|${rec.lot}|${n}|${await sha256Hex(canonicalV1(rec, n))}`;

// Texto em base58 com cara de carteira/assinatura, só para a simulação
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function fakeB58(seed, len) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let out = "";
  for (let i = 0; i < len; i++) { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; out += B58[(h >>> 0) % 58]; }
  return out;
}

async function rpc(metodo, parametros) {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const resposta = await fetch(CFG.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: metodo, params: parametros })
    });
    if (resposta.status === 429) { await new Promise(r => setTimeout(r, 1000 * 2 ** tentativa)); continue; }
    if (!resposta.ok) throw new Error(`RPC respondeu ${resposta.status}`);
    const json = await resposta.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }
  throw new Error("RPC ocupada");
}

function horaBRT(blockTime) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(blockTime * 1000)).map(p => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
}

async function buscarSelo(ancora) {
  if (!ancora || !FORMATO_ASSINATURA.test(ancora.signature || "")) return null;
  const transacao = await rpc("getTransaction", [ancora.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
  if (!transacao || transacao.meta?.err || !transacao.blockTime) return null;
  const instrucao = transacao.transaction.message.instructions.find(i => i.programId === CFG.memoProgram && typeof i.parsed === "string");
  if (!instrucao) return null;
  return {
    memo: instrucao.parsed,
    signer: transacao.transaction.message.accountKeys[0].pubkey,
    signature: ancora.signature,
    sealedAt: horaBRT(transacao.blockTime)
  };
}

async function obterSelo(n) {
  if (estado.cenario) {
    await wait(320);
    return estado.selosSimulados[n];
  }
  const ancora = estado.ancoras.find(a => Number(a.step) === n);
  try {
    const selo = await buscarSelo(ancora);
    return selo ? { ...selo, found: true } : { found: false, signature: ancora.signature };
  } catch {
    return { erro: true, signature: ancora.signature };
  }
}

function registroAtual() {
  const original = estado.original;
  return { ...original, steps: original.steps.map(s => {
    const c = { ...s };
    for (const [k, v] of Object.entries(estado.edits)) { const [n, f] = k.split("."); if (n === s.n) c[f] = v; }
    return c;
  }) };
}

// Estado de cada uma das 5 etapas, comparando o hash recalculado com o selo
async function evaluate() {
  const current = registroAtual();
  const seladas = estado.ancoras.map(a => Number(a.step));
  const steps = [];
  for (const [i, code] of ORDEM.entries()) {
    const n = i + 1;
    const rec = current.steps.find(s => Number(s.n) === n);
    if (!rec) { steps.push({ n, upcoming: true, step: code }); continue; }
    const seal = seladas.includes(n) ? estado.selos[n] : undefined;
    const expected = await memoDe(current, n);
    let status;
    if (!seladas.includes(n)) status = "pending";
    else if (!seal) status = "checking";
    else if (seal.erro) status = "network_error";
    else if (!seal.found) status = "not_found";
    else if (seal.signer !== estado.carteira) status = "wrong_signer";
    else status = seal.memo === expected ? "verified" : "changed";
    const originalRec = estado.original.steps.find(s => Number(s.n) === n);
    const edited = Object.keys(estado.edits).some(k => k.split(".")[0] === String(n) && estado.edits[k] !== originalRec[k.split(".")[1]]);
    steps.push({ n, rec, seal, status, expected, edited });
  }
  return { current, steps };
}

function lagText(s) {
  const lag = Math.round((Date.parse(s.seal.sealedAt.slice(0, 10) + "T12:00:00") - Date.parse(s.rec.date + "T12:00:00")) / 86400000);
  if (!isFinite(lag) || lag <= 0) return t("lag.same");
  return lag === 1 ? t("lag.one") : t("lag.many", lag);
}

function derived(r, current) {
  if (!isNum(r.input_g) || !isNum(r.output_g)) return "";
  if (r.step === "roasting") return t("derived.roast", pct(r.input_g - r.output_g, r.input_g));
  if (r.step === "winnowing") { const green = current.steps[0].input_g; return isNum(green) ? t("derived.nibs", pct(r.output_g, green)) : ""; }
  if (r.step === "tempering_molding" && isNum(r.units) && Number(r.units) > 0) return t("derived.bars", r.units, Math.round(r.output_g / r.units));
  return "";
}

function linkTransacao(seal) {
  if (!seal?.signature) return "";
  const sig = `<span class="sig" title="${esc(t("seal.sigTitle"))}">${esc(short(seal.signature))}</span>`;
  if (estado.cenario) return sig + `<span class="fake-link" title="${esc(t("seal.simTitle"))}">Explorer ↗</span>`;
  return sig + `<a class="explorer" href="https://explorer.solana.com/tx/${encodeURIComponent(seal.signature)}?cluster=devnet" target="_blank" rel="noopener">Explorer ↗</a>`;
}

function sealLine(s, key) {
  if (key === "checking") return `<span>${t("seal.checking")}</span>`;
  const sig = linkTransacao(s.seal);
  switch (key) {
    case "verified": return `<span>${t("seal.verified", stamp(s.seal.sealedAt), lagText(s))}</span>${sig}`;
    case "changed": return `<span>${t("seal.changed", stamp(s.seal.sealedAt))}</span>${sig}`;
    case "wrong_signer": return `<span>${t("seal.wrongSigner", esc(short(s.seal.signer)))}</span>${sig}`;
    case "not_found": return `<span>${t("seal.notFound")}</span>${sig}`;
    case "network_error": return `<span>${t("seal.network")}</span>${sig}`;
    case "upcoming": return `<span>${t("seal.upcoming")}</span>`;
    default: return `<span>${t("seal.pending")}</span>`;
  }
}

function paint(li, s, current, override) {
  const key = override || keyOf(s);
  const lineOn = !override && !!s.seal;
  li.className = `step s-${PILL_CLS[key]}${s.upcoming ? " upcoming" : ""}${lineOn ? " line-on" : ""}`;
  const pill = `<span class="pill${key === "pending" ? " dashed" : ""}">${key === "verified" ? CHECK_ICON : ""}${t("pill")[key]}</span>`;
  if (s.upcoming) {
    li.innerHTML = `<span class="dot">${s.n}</span><div class="body"><div class="step-head"><h3 class="step-name">${esc(label(s.step))}</h3>${pill}</div><p class="seal">${sealLine(s, key)}</p></div>`;
    return;
  }
  const r = s.rec;
  const [a, b] = flow(r.step);
  const facts = [
    `<span>${t("produced", esc(day(r.date)))}</span>`,
    `<span>${a} <span class="w">${esc(grams(r.input_g))}</span> → ${b} <span class="w">${esc(grams(r.output_g))}</span></span>`
  ];
  if (r.byproduct_g !== "") facts.push(`<span>${t("husk", esc(grams(r.byproduct_g)))}</span>`);
  if (r.units !== "") facts.push(`<span>${t("bars", esc(r.units))}</span>`);
  const d = derived(r, current);
  li.innerHTML = `<span class="dot">${s.n}</span><div class="body">` +
    `<div class="step-head"><h3 class="step-name">${esc(label(r.step))}${s.edited ? `<span class="edited">${t("edited")}</span>` : ""}</h3>${pill}</div>` +
    `<p class="facts">${facts.join("")}</p>${d ? `<p class="derived">${esc(d)}</p>` : ""}<p class="seal">${sealLine(s, key)}</p></div>`;
}

function shake(li) {
  li.classList.remove("shake");
  void li.offsetWidth;
  li.classList.add("shake");
  setTimeout(() => li.classList.remove("shake"), 400);
}

function summaryChecking(k, total) {
  const el = $("#summary");
  const text = k === 0 ? t("sum.connecting") : t("sum.progress", k, total);
  const prog = $("#sum-progress");
  if (el.classList.contains("s-check") && prog) { prog.textContent = text; return; }
  el.className = "summary s-check";
  el.innerHTML = `<span class="mark spin" aria-hidden="true"></span><div class="swap"><h3>${t("sum.checking")}</h3><p id="sum-progress">${text}</p></div>`;
}

function renderSummary(steps) {
  const fail = steps.find(s => ["changed", "wrong_signer", "not_found"].includes(s.status));
  const semRede = steps.some(s => s.status === "network_error");
  const sealed = steps.filter(s => s.seal).length;
  const pending = steps.filter(s => s.status === "pending").length;
  const upcoming = steps.filter(s => s.upcoming).length;
  let cls = "ok", mark = "✓", title, text, retry = false;
  if (fail) {
    mark = "!";
    const name = label(fail.rec.step);
    if (fail.status === "changed") { cls = "bad"; title = t("sum.changedTitle"); text = t("sum.changedText", fail.n, name); }
    else if (fail.status === "wrong_signer") { cls = "warn"; title = t("sum.signerTitle", fail.n); text = t("sum.signerText", esc(short(fail.seal.signer))); }
    else { cls = "bad"; title = t("sum.notFoundTitle", fail.n); text = t("sum.notFoundText"); }
  } else if (semRede) {
    cls = "off"; mark = "?"; title = t("sum.networkTitle"); retry = true;
    text = t("sum.networkText");
  } else if (sealed === 0) {
    cls = "wait"; mark = "…"; title = t("sum.noneTitle");
    const parts = [t("sum.noneRecorded", steps.length - upcoming, ORDEM.length)];
    if (upcoming) parts.push(t("sum.upcoming", upcoming));
    text = parts.join(" · ") + ".";
  } else {
    title = t("sum.okTitle");
    const parts = [t("sum.sealed", sealed, ORDEM.length)];
    if (pending) parts.push(t("sum.pending", pending));
    if (upcoming) parts.push(t("sum.upcoming", upcoming));
    text = parts.join(" · ") + ".";
  }
  const el = $("#summary");
  el.className = "summary s-" + cls;
  el.innerHTML = `<span class="mark" aria-hidden="true">${mark}</span><div class="swap"><h3>${title}</h3><p>${text}</p>` +
    (retry ? `<button class="btn ghost" type="button" id="tentar-de-novo">${t("retry")}</button>` : "") + `</div>`;
  if (retry) $("#tentar-de-novo").addEventListener("click", play);
}

function verifyPending() {
  $("#verify-body").innerHTML = `<p class="note">${t("verify.pending")}</p>`;
}

async function renderVerify(steps, current) {
  const box = $("#verify-body");
  const last = [...steps].reverse().find(s => s.seal);
  if (!last) { box.innerHTML = `<p class="note">${t("verify.none")}</p>`; return; }
  const canon = canonicalV1(current, last.n);
  const hash = await sha256Hex(canon);
  const reachable = !last.seal.erro && last.seal.found;
  const match = reachable && last.seal.memo === `v1|${current.lot}|${last.n}|${hash}`;
  box.innerHTML = `<dl class="kv">` +
    `<div><dt>${t("verify.record", last.n)}</dt><dd><code class="code">${esc(canon)}</code></dd></div>` +
    `<div><dt>${t("verify.hash")}</dt><dd><code class="code">${hash}</code></dd></div>` +
    `<div><dt>${t("verify.memo")}</dt><dd><code class="code">${reachable ? esc(last.seal.memo) : t("verify.cantLoad")}</code></dd></div>` +
    `<div><dt>${t("verify.match")}</dt><dd>${reachable ? (match ? t("verify.yes") : t("verify.no")) : t("verify.unknown")}</dd></div>` +
    (estado.carteira ? `<div><dt>${t("verify.wallet")}</dt><dd><code class="code">${esc(estado.carteira)}</code></dd></div>` : "") +
    `<div><dt>${t("verify.terminal")}</dt><dd><code class="code">printf '%s' '${esc(canon)}' | sha256sum</code></dd></div>` +
    `</dl>`;
}

function fillValue() {
  const n = $("#t-step").value;
  const f = $("#t-field").value;
  const rec = registroAtual().steps.find(s => s.n === n);
  $("#t-value").value = rec ? rec[f] : "";
  $("#t-value").inputMode = f === "date" ? "text" : "numeric";
}

function syncTamper(current) {
  const sel = $("#t-step");
  const keep = sel.value;
  sel.innerHTML = current.steps.map(s => `<option value="${esc(s.n)}">${esc(s.n)} · ${esc(label(s.step))}</option>`).join("");
  sel.value = current.steps.some(s => s.n === keep) ? keep : (current.steps[1] || current.steps[0]).n;
  fillValue();
}

// Abre a página: mostra as etapas e confere os selos um por um, de cima para baixo
async function play() {
  const my = ++runId;
  shown = null;
  estado.selos = {};
  let ev = await evaluate();
  if (my !== runId) return;
  const ol = $("#journey");
  ol.innerHTML = "";
  ev.steps.forEach((s, i) => {
    const li = document.createElement("li");
    li.dataset.n = s.n;
    li.style.setProperty("--i", i);
    paint(li, s, ev.current, s.status === "checking" ? "checking" : null);
    ol.appendChild(li);
  });
  const sealed = ev.steps.filter(s => s.status === "checking");
  verifyPending();
  syncTamper(ev.current);
  if (sealed.length) {
    summaryChecking(0, sealed.length);
    await wait(400);
  }
  for (let i = 0; i < sealed.length; i++) {
    if (my !== runId) return;
    summaryChecking(i + 1, sealed.length);
    estado.selos[sealed[i].n] = await obterSelo(sealed[i].n);
    if (my !== runId) return;
    ev = await evaluate();
    paint(liOf(sealed[i].n), ev.steps[sealed[i].n - 1], ev.current, null);
  }
  await wait(160);
  if (my !== runId) return;
  renderSummary(ev.steps);
  await renderVerify(ev.steps, ev.current);
  shown = ev;
}

// Depois de uma alteração: repinta só o que mudou, com as etapas ficando vermelhas em cascata
async function refresh(editedN) {
  const prev = shown;
  if (!prev) return play();
  const my = ++runId;
  const ev = await evaluate();
  if (my !== runId) return;
  syncTamper(ev.current);
  const sameRec = (a, b) => JSON.stringify(a.rec || null) === JSON.stringify(b.rec || null) && a.edited === b.edited;
  const statusChanged = [];
  let recChanged = false;
  ev.steps.forEach((s, i) => {
    const p = prev.steps[i];
    if (String(s.n) === String(editedN) && !sameRec(p, s)) recChanged = true;
    if (keyOf(p) !== keyOf(s)) statusChanged.push(s);
    else if (!sameRec(p, s)) paint(liOf(s.n), s, ev.current, null);
  });
  const editedLi = editedN ? liOf(editedN) : null;
  if (editedLi && recChanged && !statusChanged.some(s => String(s.n) === String(editedN))) shake(editedLi);
  for (let i = 0; i < statusChanged.length; i++) {
    if (i) await wait(60);
    if (my !== runId) return;
    const s = statusChanged[i];
    const li = liOf(s.n);
    paint(li, s, ev.current, null);
    if (String(s.n) === String(editedN)) shake(li);
  }
  if (statusChanged.length) await wait(120);
  if (my !== runId) return;
  renderSummary(ev.steps);
  await renderVerify(ev.steps, ev.current);
  shown = ev;
}

function mostrarAviso(tituloKey, mensagemKey, comBotao, ...args) {
  estado.aviso = { tituloKey, mensagemKey, comBotao, args };
  const caixa = $("#aviso");
  caixa.innerHTML = `<h2>${esc(t(tituloKey))}</h2><p>${esc(t(mensagemKey, ...args))}</p>` +
    (comBotao ? `<button class="btn primary" type="button" id="aviso-tentar">${t("retry")}</button>` : "");
  if (comBotao) $("#aviso-tentar").addEventListener("click", () => location.reload());
  caixa.hidden = false;
  $("#passaporte").hidden = true;
}

function preencherTopo(rec) {
  $("#lot").textContent = rec.lot;
  const linhas = [];
  if (rec.municipality) linhas.push(t("top.origin", rec.municipality, rec.state ? (UF[rec.state] || rec.state) : ""));
  const produtor = [rec.producer && t("top.producer", rec.producer), rec.purchase_date && t("top.bought", day(rec.purchase_date))].filter(Boolean).join(" · ");
  if (produtor) linhas.push(produtor);
  linhas.push(rec.product + (estado.cenario ? t("top.example") : ""));
  $("#meta").innerHTML = linhas.map(l => `<span>${esc(l)}</span>`).join("");
  document.title = t("doc.lotTitle", rec.lot, rec.product);
}

function faixaSimulacao() {
  const faixa = $("#faixa-simulacao");
  if (!estado.cenario) { faixa.hidden = true; return; }
  faixa.innerHTML = t("sim.banner", esc(estado.cenario));
  faixa.hidden = false;
}

// Monta os selos simulados a partir do registro original, para o cenário escolhido
async function prepararSimulacao(nome, record) {
  const sc = CENARIOS[nome];
  estado.cenario = nome;
  estado.carteira = fakeB58("acorde-issuer", 44);
  const outra = fakeB58("someone-else", 44);
  const original = sc.registradas ? { ...record, steps: record.steps.filter(s => Number(s.n) <= sc.registradas) } : record;
  estado.original = original;
  const seladas = sc.seladas || original.steps.map(s => Number(s.n));
  estado.ancoras = seladas.map(n => ({ step: String(n), signature: fakeB58("sig-" + n, 88) }));
  estado.selosSimulados = {};
  for (const n of seladas) {
    const rec = original.steps.find(s => Number(s.n) === n);
    if (sc.semRede) { estado.selosSimulados[n] = { erro: true, signature: fakeB58("sig-" + n, 88) }; continue; }
    estado.selosSimulados[n] = {
      memo: await memoDe(original, n),
      signer: (sc.outraCarteira || []).includes(n) ? outra : estado.carteira,
      found: !(sc.sumidos || []).includes(n),
      signature: fakeB58("sig-" + n, 88),
      sealedAt: `${rec.date}T18:00`,
    };
  }
  estado.edits = { ...(sc.edicoes || {}) };
  faixaSimulacao();
}

function aplicarTextosFixos() {
  document.documentElement.lang = t("htmlLang");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.querySelectorAll("[data-i18n-alt]").forEach(el => el.setAttribute("alt", t(el.dataset.i18nAlt)));
  document.querySelector('meta[name="description"]').setAttribute("content", t("doc.description"));
  document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === window.BP_I18N.lang)));
  if (!estado.original) document.title = t("doc.title");
}

async function trocarIdioma(lang) {
  if (lang === window.BP_I18N.lang) return;
  window.BP_I18N.setLang(lang);
  aplicarTextosFixos();
  $("#t-live").textContent = "";
  if (estado.aviso) {
    const { tituloKey, mensagemKey, comBotao, args } = estado.aviso;
    mostrarAviso(tituloKey, mensagemKey, comBotao, ...args);
    return;
  }
  if (!estado.original) return;
  preencherTopo(estado.original);
  faixaSimulacao();
  if (!shown) { play(); return; }
  const ev = await evaluate();
  ev.steps.forEach(s => paint(liOf(s.n), s, ev.current, null));
  renderSummary(ev.steps);
  await renderVerify(ev.steps, ev.current);
  syncTamper(ev.current);
  shown = ev;
}

async function iniciar() {
  aplicarTextosFixos();
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";

  if (!FORMATO_LOTE.test(id)) {
    $("#lot").textContent = "—";
    mostrarAviso("err.notFoundTitle", "err.badId", false);
    return;
  }
  $("#lot").textContent = id;

  let resposta;
  try {
    resposta = await fetch(`../data/lots/${id}.json`, { cache: "no-store" });
  } catch {
    mostrarAviso("err.offlineTitle", "err.offline", true);
    return;
  }
  if (resposta.status === 404) {
    mostrarAviso("err.notFoundTitle", "err.noPassport", false, id);
    return;
  }
  if (!resposta.ok) {
    mostrarAviso("err.offlineTitle", "err.server", true);
    return;
  }

  try {
    const lote = await resposta.json();
    const record = lote.record;
    canonicalV1(record, record.steps.length); // confere se o arquivo segue o formato v1 antes de mostrar
    const cenario = params.get("simular");
    if (Object.hasOwn(CENARIOS, cenario)) {
      await prepararSimulacao(cenario, record);
    } else {
      estado.original = record;
      estado.ancoras = lote.anchors || [];
      estado.carteira = CFG.issuerFor ? CFG.issuerFor(record.lot) : (CFG.issuer || "");
    }
    preencherTopo(estado.original);
  } catch {
    mostrarAviso("err.fileTitle", "err.file", false);
    return;
  }

  $("#passaporte").hidden = false;
  play();
}

document.querySelectorAll(".lang button").forEach(b => b.addEventListener("click", () => trocarIdioma(b.dataset.lang)));
$("#t-step").addEventListener("change", fillValue);
$("#t-field").addEventListener("change", fillValue);
$("#t-apply").addEventListener("click", async () => {
  const n = $("#t-step").value;
  const f = $("#t-field").value;
  const v = $("#t-value").value.trim();
  if (!n) return;
  estado.edits[`${n}.${f}`] = v;
  const { steps } = await evaluate();
  const bad = steps.filter(s => s.status === "changed").map(s => s.n);
  const step = steps.find(s => String(s.n) === n);
  let msg;
  if (!step.seal) msg = t("tamper.notSealed", n);
  else if (step.status === "network_error") msg = t("tamper.offline");
  else if (!bad.length) msg = t("tamper.same");
  else msg = bad.length === 1 ? t("tamper.one", bad[0]) : t("tamper.many", bad[0], bad[bad.length - 1]);
  $("#t-live").textContent = msg;
  refresh(n);
});
$("#t-reset").addEventListener("click", () => {
  estado.edits = {};
  $("#t-live").textContent = t("tamper.back");
  refresh(null);
});

iniciar();
