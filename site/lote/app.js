// Página pública do lote (visual e lógica do mockup v2 do Emerson, em português).
// Lê data/lots/<id>.json, recalcula o hash de cada etapa no navegador e compara com o selo (memo) na rede.
// Enquanto a leitura da rede não está ligada, ?simular=<cenário> mostra cada estado com selos simulados.

const HEADER = ["lot", "product", "producer", "municipality", "state", "origin_lot", "purchase_date"];
const STEP = ["n", "step", "date", "input_g", "output_g", "byproduct_g", "units", "profile"];
const ORDEM = ["roasting", "winnowing", "grinding", "tempering_molding", "packaging"];

const LABEL = { roasting: "Torra", winnowing: "Descasque", grinding: "Moagem (melanger)", tempering_molding: "Temperagem e moldagem", packaging: "Embalagem" };
const FLOW = { roasting: ["Cacau", "torrado"], winnowing: ["Torrado", "nibs"], grinding: ["Nibs", "massa"], tempering_molding: ["Massa", "barras"], packaging: ["Barras", "embaladas"] };
const UF = { BA: "Bahia", PA: "Pará", ES: "Espírito Santo", RO: "Rondônia", AM: "Amazonas", MG: "Minas Gerais", SP: "São Paulo" };

const PILL = {
  verified: ["Verificado", "ok"], changed: ["Alterado", "bad"], wrong_signer: ["Outra carteira", "warn"], not_found: ["Selo não encontrado", "bad"],
  network_error: ["Sem conexão", "off"], pending: ["Ainda não selado", "wait"], upcoming: ["Ainda não registrado", "wait"], checking: ["Conferindo…", "check"]
};
const CHECK_ICON = '<svg class="ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.2 2.2 4.8-4.9"/></svg>';

// Mesmo formato de lote aceito no memo (spec v1)
const FORMATO_LOTE = /^[A-Za-z0-9-]{1,32}$/;

// Carteira da Acorde que assina os selos. Preencher quando a carteira da empresa existir.
const CARTEIRA_ACORDE = "";

// Cenários de simulação (?simular=...). Os selos são calculados a partir do próprio arquivo do lote.
const CENARIOS = {
  concluido: {},
  producao: { registradas: 3, seladas: [1, 2] },
  alterado: { edicoes: { "2.output_g": "4500" } },
  "outra-carteira": { outraCarteira: [3] },
  "selo-nao-encontrado": { sumidos: [3] },
  "erro-rede": { semRede: true },
};

const estado = { original: null, ancoras: [], selos: {}, edits: {}, cenario: null, carteira: CARTEIRA_ACORDE };
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const wait = ms => new Promise(r => setTimeout(r, reduce ? 0 : ms));
let runId = 0;
let shown = null;

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const short = s => s.slice(0, 4) + "…" + s.slice(-4);
const isNum = v => /^\d+$/.test(v);
const grams = v => v === "" ? "não registrado" : (isNum(v) ? Number(v).toLocaleString("pt-BR") : v) + " g";
const day = d => { const t = new Date(d + "T12:00:00"); return isNaN(t) ? d : t.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric" }); };
const stamp = s => { const t = new Date(s); return t.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }) + ", " + t.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };
const pct = (a, b) => (a / b * 100).toFixed(1).replace(".", ",") + "%";
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

// Busca o selo (memo) de uma etapa na Solana devnet a partir da âncora do arquivo ({ step, signature }).
// A leitura da rede é a parte do Emerson e entra aqui: devolver { memo, signer, signature, sealedAt }
// ou null se a transação não existir. Enquanto não está ligada, qualquer âncora real aparece como "Sem conexão".
async function buscarSelo(ancora) {
  throw new Error(`leitura da rede ainda não ligada (etapa ${ancora.step})`);
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
  if (!isFinite(lag) || lag <= 0) return "no mesmo dia da etapa";
  return lag === 1 ? "1 dia depois da etapa" : `${lag} dias depois da etapa`;
}

function derived(r, current) {
  if (!isNum(r.input_g) || !isNum(r.output_g)) return "";
  if (r.step === "roasting") return `Perda na torra: ${pct(r.input_g - r.output_g, r.input_g)}`;
  if (r.step === "winnowing") { const green = current.steps[0].input_g; return isNum(green) ? `Nibs: ${pct(r.output_g, green)} do cacau que entrou` : ""; }
  if (r.step === "tempering_molding" && isNum(r.units) && Number(r.units) > 0) return `${r.units} barras de ${Math.round(r.output_g / r.units)} g`;
  return "";
}

function linkTransacao(seal) {
  if (!seal?.signature) return "";
  const sig = `<span class="sig" title="Assinatura da transação">${esc(short(seal.signature))}</span>`;
  if (estado.cenario) return sig + `<span class="fake-link" title="Simulação: na página real, abre a transação no Solana Explorer (devnet)">Explorer ↗</span>`;
  return sig + `<a class="explorer" href="https://explorer.solana.com/tx/${encodeURIComponent(seal.signature)}?cluster=devnet" target="_blank" rel="noopener">Explorer ↗</a>`;
}

function sealLine(s, key) {
  if (key === "checking") return `<span>Buscando o selo na Solana devnet…</span>`;
  const sig = linkTransacao(s.seal);
  switch (key) {
    case "verified": return `<span>Selado em ${stamp(s.seal.sealedAt)} (BRT) · ${lagText(s)}</span>${sig}`;
    case "changed": return `<span>Selado em ${stamp(s.seal.sealedAt)} (BRT) · os dados acima não conferem mais</span>${sig}`;
    case "wrong_signer": return `<span>Selado por ${esc(short(s.seal.signer))}, não pela Acorde</span>${sig}`;
    case "not_found": return `<span>O selo indicado não existe na Solana devnet</span>${sig}`;
    case "network_error": return `<span>Não foi possível acessar a rede para conferir este selo</span>${sig}`;
    case "upcoming": return `<span>Esta etapa ainda não aconteceu.</span>`;
    default: return `<span>Registrado. Aguardando o selo.</span>`;
  }
}

function paint(li, s, current, override) {
  const key = override || keyOf(s);
  const [label, cls] = PILL[key];
  const lineOn = !override && !!s.seal;
  li.className = `step s-${cls}${s.upcoming ? " upcoming" : ""}${lineOn ? " line-on" : ""}`;
  const pill = `<span class="pill${key === "pending" ? " dashed" : ""}">${key === "verified" ? CHECK_ICON : ""}${label}</span>`;
  if (s.upcoming) {
    li.innerHTML = `<span class="dot">${s.n}</span><div class="body"><div class="step-head"><h3 class="step-name">${LABEL[s.step]}</h3>${pill}</div><p class="seal">${sealLine(s, key)}</p></div>`;
    return;
  }
  const r = s.rec;
  const [a, b] = FLOW[r.step] || ["Entrada", "saída"];
  const facts = [
    `<span>Produzido em <span class="w">${esc(day(r.date))}</span></span>`,
    `<span>${a} <span class="w">${esc(grams(r.input_g))}</span> → ${b} <span class="w">${esc(grams(r.output_g))}</span></span>`
  ];
  if (r.byproduct_g !== "") facts.push(`<span>Casca <span class="w">${esc(grams(r.byproduct_g))}</span></span>`);
  if (r.units !== "") facts.push(`<span><span class="w">${esc(r.units)}</span> barras</span>`);
  const d = derived(r, current);
  li.innerHTML = `<span class="dot">${s.n}</span><div class="body">` +
    `<div class="step-head"><h3 class="step-name">${esc(LABEL[r.step] || r.step)}${s.edited ? '<span class="edited">editado aqui</span>' : ""}</h3>${pill}</div>` +
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
  const text = k === 0 ? "Conectando…" : `Etapa ${k} de ${total}`;
  const prog = $("#sum-progress");
  if (el.classList.contains("s-check") && prog) { prog.textContent = text; return; }
  el.className = "summary s-check";
  el.innerHTML = `<span class="mark spin" aria-hidden="true"></span><div class="swap"><h3>Conferindo os selos na Solana devnet</h3><p id="sum-progress">${text}</p></div>`;
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
    const name = LABEL[fail.rec.step];
    if (fail.status === "changed") { cls = "bad"; title = "O registro difere do que foi selado"; text = `A alteração começa na etapa ${fail.n}, ${name}. Todos os selos depois dela também falham, porque cada selo cobre as etapas anteriores.`; }
    else if (fail.status === "wrong_signer") { cls = "warn"; title = `A etapa ${fail.n} não foi selada pela Acorde`; text = `O selo veio de outra carteira (${esc(short(fail.seal.signer))}). Só valem selos da carteira da Acorde.`; }
    else { cls = "bad"; title = `Selo da etapa ${fail.n} não encontrado`; text = "O arquivo do lote aponta para um selo que não existe na Solana devnet."; }
  } else if (semRede) {
    cls = "off"; mark = "?"; title = "Não foi possível acessar a rede"; retry = true;
    text = "Não conseguimos conferir os selos agora. Isso não indica adulteração. Tente de novo em instantes.";
  } else if (sealed === 0) {
    cls = "wait"; mark = "…"; title = "Nenhuma etapa selada ainda";
    const parts = [`${steps.length - upcoming} de ${ORDEM.length} etapas registradas, aguardando o selo`];
    if (upcoming) parts.push(`${upcoming} ainda por acontecer`);
    text = parts.join(" · ") + ".";
  } else {
    title = "Sem alterações desde o selo";
    const parts = [`${sealed} de ${ORDEM.length} etapas seladas pela Acorde`];
    if (pending) parts.push(pending === 1 ? "1 registrada aguardando o selo" : `${pending} registradas aguardando o selo`);
    if (upcoming) parts.push(`${upcoming} ainda por acontecer`);
    text = parts.join(" · ") + ".";
  }
  const el = $("#summary");
  el.className = "summary s-" + cls;
  el.innerHTML = `<span class="mark" aria-hidden="true">${mark}</span><div class="swap"><h3>${title}</h3><p>${text}</p>` +
    (retry ? `<button class="btn ghost" type="button" id="tentar-de-novo">Tentar de novo</button>` : "") + `</div>`;
  if (retry) $("#tentar-de-novo").addEventListener("click", play);
}

function verifyPending() {
  $("#verify-body").innerHTML = `<p class="note">Disponível quando a conferência terminar.</p>`;
}

async function renderVerify(steps, current) {
  const box = $("#verify-body");
  const last = [...steps].reverse().find(s => s.seal);
  if (!last) { box.innerHTML = `<p class="note">Nenhuma etapa foi selada ainda.</p>`; return; }
  const canon = canonicalV1(current, last.n);
  const hash = await sha256Hex(canon);
  const reachable = !last.seal.erro && last.seal.found;
  const match = reachable && last.seal.memo === `v1|${current.lot}|${last.n}|${hash}`;
  box.innerHTML = `<dl class="kv">` +
    `<div><dt>Registro até a etapa ${last.n}</dt><dd><code class="code">${esc(canon)}</code></dd></div>` +
    `<div><dt>SHA-256 calculado no seu navegador</dt><dd><code class="code">${hash}</code></dd></div>` +
    `<div><dt>Memo na rede</dt><dd><code class="code">${reachable ? esc(last.seal.memo) : "não foi possível carregar"}</code></dd></div>` +
    `<div><dt>Confere</dt><dd>${reachable ? (match ? "Sim" : "Não") : "Desconhecido"}</dd></div>` +
    (estado.carteira ? `<div><dt>Carteira da Acorde</dt><dd><code class="code">${esc(estado.carteira)}</code></dd></div>` : "") +
    `<div><dt>Confira no terminal</dt><dd><code class="code">printf '%s' '${esc(canon)}' | sha256sum</code></dd></div>` +
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
  sel.innerHTML = current.steps.map(s => `<option value="${esc(s.n)}">${esc(s.n)} · ${esc(LABEL[s.step] || s.step)}</option>`).join("");
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

function mostrarAviso(titulo, mensagem, comBotao) {
  const caixa = $("#aviso");
  caixa.innerHTML = `<h2>${esc(titulo)}</h2><p>${esc(mensagem)}</p>` +
    (comBotao ? `<button class="btn primary" type="button" id="aviso-tentar">Tentar de novo</button>` : "");
  if (comBotao) $("#aviso-tentar").addEventListener("click", () => location.reload());
  caixa.hidden = false;
  $("#passaporte").hidden = true;
}

function preencherTopo(rec) {
  $("#lot").textContent = rec.lot;
  const linhas = [];
  if (rec.municipality) linhas.push(`Cacau de ${rec.municipality}${rec.state ? ", " + (UF[rec.state] || rec.state) : ""}`);
  const produtor = [rec.producer && `Produtor ref. ${rec.producer}`, rec.purchase_date && `comprado em ${day(rec.purchase_date)}`].filter(Boolean).join(" · ");
  if (produtor) linhas.push(produtor);
  linhas.push(rec.product + (estado.cenario ? " · lote de exemplo" : ""));
  $("#meta").innerHTML = linhas.map(l => `<span>${esc(l)}</span>`).join("");
  document.title = `Lote ${rec.lot} · ${rec.product} · Acorde Chocolates`;
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
  const faixa = $("#faixa-simulacao");
  faixa.innerHTML = `<strong>Modo simulação:</strong> cenário "${esc(nome)}", com selos simulados. Nada aqui foi consultado na rede.`;
  faixa.hidden = false;
}

async function iniciar() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id") || "";

  if (!FORMATO_LOTE.test(id)) {
    $("#lot").textContent = "—";
    mostrarAviso("Lote não encontrado", "Abra esta página pelo QR Code da embalagem. Se digitou o endereço, confira o código do lote.");
    return;
  }
  $("#lot").textContent = id;

  let resposta;
  try {
    resposta = await fetch(`../data/lots/${id}.json`, { cache: "no-store" });
  } catch {
    mostrarAviso("Não deu para carregar agora", "Parece que a internet caiu. Confira a conexão e tente de novo.", true);
    return;
  }
  if (resposta.status === 404) {
    mostrarAviso("Lote não encontrado", `Não existe passaporte para o lote ${id}. Confira o código impresso na embalagem.`);
    return;
  }
  if (!resposta.ok) {
    mostrarAviso("Não deu para carregar agora", "O servidor não respondeu como esperado. Tente de novo em instantes.", true);
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
    }
    preencherTopo(estado.original);
  } catch {
    mostrarAviso("O arquivo deste lote está com problema", "Avise a Acorde Chocolates: o passaporte não pôde ser lido.");
    return;
  }

  $("#passaporte").hidden = false;
  play();
}

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
  if (!step.seal) msg = `A etapa ${n} ainda não foi selada, então não há nada na rede para comparar.`;
  else if (step.status === "network_error") msg = "Sem conexão com a rede: não dá para comparar agora.";
  else if (!bad.length) msg = "Mesmo valor do selo. Nada a apontar.";
  else msg = bad.length === 1 ? `Alterado só nesta página. O selo ${bad[0]} não confere mais.` : `Alterado só nesta página. Os selos ${bad[0]} a ${bad[bad.length - 1]} não conferem mais.`;
  $("#t-live").textContent = msg;
  refresh(n);
});
$("#t-reset").addEventListener("click", () => {
  estado.edits = {};
  $("#t-live").textContent = "De volta aos dados selados.";
  refresh(null);
});

iniciar();
