const { Connection, PublicKey, Transaction, TransactionInstruction } = window.solanaWeb3;
const CFG = window.BP_CONFIG;
const I18N = window.BP_ANCHOR_I18N;
const { t } = I18N;
const MEMO_PROGRAM = new PublicKey(CFG.memoProgram);
const MEMO_RE = /^v1\|([A-Za-z0-9-]{1,32})\|([1-5])\|([0-9a-f]{64})$/;
const HEADER = ["lot", "product", "producer", "municipality", "state", "origin_lot", "purchase_date"];
const STEP = ["n", "step", "date", "input_g", "output_g", "byproduct_g", "units", "profile"];
const STEP_CODES = ["roasting", "winnowing", "grinding", "tempering_molding", "packaging"];
const WEIGHT_FIELDS = [3, 4, 5];
const MIN_G = 50;
const MAX_G = 50000;
const LOW_BALANCE = 50000;

const conn = new Connection(CFG.rpcUrl, "confirmed");
const state = { wallet: null, lamports: null, balanceError: false, memo: null, record: null, validation: null, check: null, ready: false, sending: false, msgs: {} };
let checkId = 0;

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stripMemoPrefix = m => (m || "").replace(/^\[\d+\]\s*/, "");
const resolve = args => args.map(a => typeof a === "function" ? a() : a);
const tr = ([key, ...args]) => t(key, ...resolve(args));

function log(text) {
  $("log").textContent += `[${new Date().toLocaleTimeString("en-GB")}] ${text}\n`;
}

function show(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.dataset.kind = kind || "";
  el.hidden = !text;
}

function say(id, kind, key, ...args) {
  state.msgs[id] = key ? { kind, key, args } : null;
  show(id, key ? t(key, ...resolve(args)) : "", kind);
}

function i18nError(key, ...args) {
  const e = new Error(t(key, ...resolve(args)));
  e.i18n = [key, ...args];
  return e;
}

function provider() {
  const p = window.phantom && window.phantom.solana;
  return p && p.isPhantom ? p : null;
}

async function sha256Hex(text) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function parseMemo(raw) {
  const text = raw.trim();
  const m = text.match(MEMO_RE);
  return m ? { text, lot: m[1], step: Number(m[2]), hash: m[3] } : null;
}

function parseCanonical(raw) {
  const text = raw.trim();
  if (!text) return null;
  let arr;
  try { arr = JSON.parse(text); } catch { return { error: "parse.json" }; }
  if (!Array.isArray(arr) || arr[0] !== "v1" || arr.length < 9) return { error: "parse.notV1" };
  const header = arr.slice(1, 8);
  const steps = arr.slice(8);
  if (header.some(v => typeof v !== "string") || steps.some(s => !Array.isArray(s) || s.length !== 8 || s.some(v => typeof v !== "string"))) {
    return { error: "parse.types" };
  }
  if (steps.some((s, i) => s[0] !== String(i + 1))) return { error: "parse.numbering" };
  if (JSON.stringify(arr) !== text) return { error: "parse.canonical" };
  return { text, header, steps };
}

const isDigits = v => /^\d*$/.test(v);
const num = v => Number(v).toLocaleString(t("locale"));
const kg = v => `${(Number(v) / 1000).toLocaleString(t("locale"), { maximumFractionDigits: 3 })} kg`;
const todayBRT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const x = new Date(d + "T12:00:00Z");
  return !isNaN(x) && x.toISOString().slice(0, 10) === d;
}

function validateRecord(record) {
  const errors = [];
  const warnings = [];
  const today = todayBRT();
  const [lot, product, producer, , uf, , purchaseDate] = record.header;
  const values = [
    ...record.header.map((v, i) => [HEADER[i], v]),
    ...record.steps.flatMap((s, i) => s.map((v, j) => [() => t("label.step", i + 1, STEP[j]), v]))
  ];
  for (const [label, v] of values) {
    if (v !== v.trim()) errors.push(["v.spaces", label]);
    if (v !== v.normalize("NFC")) errors.push(["v.nfc", label]);
  }
  if (!/^[A-Za-z0-9-]{1,32}$/.test(lot)) errors.push(["v.lot", lot]);
  if (!product) errors.push(["v.product"]);
  if (!producer) warnings.push(["v.producer"]);
  if (uf && !/^[A-Z]{2}$/.test(uf)) warnings.push(["v.state", uf]);
  if (purchaseDate && !validDate(purchaseDate)) errors.push(["v.purchaseInvalid", purchaseDate]);
  if (purchaseDate && validDate(purchaseDate) && purchaseDate > today) errors.push(["v.purchaseFuture", purchaseDate]);
  if (record.steps.length > STEP_CODES.length) errors.push(["v.tooMany", record.steps.length, STEP_CODES.length]);
  let previousDate = purchaseDate && validDate(purchaseDate) ? purchaseDate : "";
  record.steps.forEach((s, i) => {
    const n = i + 1;
    const [, code, date, input, output, byproduct, units] = s;
    const expected = STEP_CODES[i];
    if (expected && code !== expected) errors.push(["v.code", n, code, expected]);
    if (!date) errors.push(["v.dateEmpty", n]);
    else if (!validDate(date)) errors.push(["v.dateInvalid", n, date]);
    else {
      if (date > today) errors.push(["v.dateFuture", n, date]);
      if (previousDate && date < previousDate) warnings.push(["v.dateOrder", n, date, previousDate]);
      previousDate = date;
    }
    for (const j of WEIGHT_FIELDS) {
      const v = s[j];
      if (!isDigits(v)) errors.push(["v.weightDigits", n, STEP[j], v]);
      else if (v !== "" && (Number(v) < MIN_G || Number(v) > MAX_G)) warnings.push(["v.weightRange", n, STEP[j], () => num(v), () => kg(v)]);
    }
    if (!isDigits(units)) errors.push(["v.units", n, units]);
    if (input === "") warnings.push(["v.inputEmpty", n]);
    if (isDigits(input) && isDigits(output) && input !== "" && output !== "" && Number(output) > Number(input) && code !== "grinding") {
      warnings.push(["v.outputLarger", n, () => num(output), () => num(input)]);
    }
    if (byproduct !== "" && code !== "winnowing") warnings.push(["v.byproduct", n]);
  });
  return { errors, warnings };
}

function renderIssues() {
  const list = $("issues");
  const result = state.validation;
  if (!result || (!result.errors.length && !result.warnings.length)) { list.hidden = true; list.innerHTML = ""; return; }
  list.innerHTML = result.errors.map(e => `<li class="err">${esc(tr(e))}</li>`).join("") + result.warnings.map(w => `<li class="warn">${esc(tr(w))}</li>`).join("");
  list.hidden = false;
}

function cell(v, j) {
  if (v === "") return "—";
  if (WEIGHT_FIELDS.includes(j) && /^\d+$/.test(v)) return `${esc(v)} <span class="kg">${kg(v)}</span>`;
  return esc(v);
}

function renderReview() {
  const record = state.record;
  if (!record || record.error) { $("review").hidden = true; return; }
  $("review-header").innerHTML = HEADER.map((k, i) => `<dt>${k}</dt><dd>${esc(record.header[i] || "—")}</dd>`).join("");
  $("review-steps").innerHTML = `<thead><tr>${STEP.map(k => `<th>${k}</th>`).join("")}</tr></thead><tbody>` +
    record.steps.map(s => `<tr>${s.map((v, j) => `<td>${cell(v, j)}</td>`).join("")}</tr>`).join("") + `</tbody>`;
  $("review").hidden = false;
}

function renderCheck() {
  const c = state.check;
  show("check-msg", c ? tr(c.msg) : "", c ? c.kind : "");
}

function updatePublicLink() {
  const lot = (state.memo && state.memo.lot) || (state.record && !state.record.error && state.record.header[0]) || "";
  const link = $("public-link-top");
  if (!lot) { link.hidden = true; return; }
  link.href = CFG.publicPage(lot);
  link.textContent = t("publicLink", lot);
  link.hidden = false;
}

function updateSealButton() {
  $("seal").disabled = !(state.wallet && state.ready && $("reviewed").checked && !state.sending);
}

async function checkInputs() {
  const my = ++checkId;
  state.ready = false;
  const memoRaw = $("memo").value.trim();
  const canonRaw = $("canonical").value.trim();
  state.memo = memoRaw ? parseMemo(memoRaw) : null;
  state.record = parseCanonical(canonRaw);
  renderReview();
  state.validation = state.record && !state.record.error ? validateRecord(state.record) : null;
  renderIssues();
  let check = null;
  if (!memoRaw && !canonRaw) check = null;
  else if (memoRaw && !state.memo) check = { msg: ["check.memoFormat"], kind: "bad" };
  else if (!state.record) check = { msg: ["check.needCanonical"], kind: "warn" };
  else if (state.record.error) check = { msg: [state.record.error], kind: "bad" };
  else if (!state.memo) check = { msg: ["check.needMemo"], kind: "warn" };
  else {
    const hash = await sha256Hex(state.record.text);
    if (my !== checkId) return;
    const lot = state.record.header[0];
    const lastStep = state.record.steps.length;
    const v = state.validation;
    if (state.memo.lot !== lot) check = { msg: ["check.lotMismatch", state.memo.lot, lot], kind: "bad" };
    else if (state.memo.step !== lastStep) check = { msg: ["check.stepMismatch", state.memo.step, lastStep], kind: "bad" };
    else if (state.memo.hash !== hash) check = { msg: ["check.hashMismatch", hash], kind: "bad" };
    else if (v.errors.length) check = { msg: ["check.problems", v.errors.length], kind: "bad" };
    else if (v.warnings.length) { check = { msg: ["check.warnings", lot, lastStep, hash.slice(0, 12)], kind: "warn" }; state.ready = true; }
    else { check = { msg: ["check.ok", lot, lastStep, hash.slice(0, 12)], kind: "ok" }; state.ready = true; }
  }
  if (my !== checkId) return;
  state.check = check;
  updatePublicLink();
  renderCheck();
  $("conflict-box").hidden = true;
  $("allow-conflict").checked = false;
  updateSealButton();
}

function renderBalance() {
  if (!state.wallet) return;
  if (state.balanceError) { $("wallet-balance").textContent = t("balance.err"); return; }
  if (state.lamports === null) { $("wallet-balance").textContent = ""; return; }
  const sol = (state.lamports / 1e9).toLocaleString(t("locale"), { maximumFractionDigits: 4 });
  $("wallet-balance").textContent = t(state.lamports < LOW_BALANCE ? "balance.low" : "balance.ok", sol);
}

async function refreshBalance() {
  if (!state.wallet) return;
  try {
    state.lamports = await conn.getBalance(state.wallet, "confirmed");
    state.balanceError = false;
  } catch (e) {
    state.balanceError = true;
    log(`Balance error: ${e.message || e}`);
  }
  renderBalance();
}

function renderConnect() {
  $("connect").textContent = t(state.wallet ? "reconnect" : "connect");
}

function setWallet(publicKey) {
  state.wallet = publicKey;
  state.lamports = null;
  state.balanceError = false;
  renderConnect();
  if (!publicKey) {
    $("wallet-info").hidden = true;
    say("issuer-msg", "warn", "wallet.disconnected");
    updateSealButton();
    return;
  }
  const address = publicKey.toBase58();
  $("wallet-address").innerHTML = `<a href="${CFG.explorerAddress(address)}" target="_blank" rel="noopener">${esc(address)}</a>`;
  $("wallet-info").hidden = false;
  log(`Connected: ${address}`);
  if (CFG.testIssuer === address) say("issuer-msg", "ok", "issuer.test");
  else if (!CFG.issuer) say("issuer-msg", "warn", "issuer.unset");
  else if (CFG.issuer === address) say("issuer-msg", "ok", "issuer.acorde");
  else say("issuer-msg", "warn", "issuer.other");
  updateSealButton();
  refreshBalance();
}

async function connect() {
  const p = provider();
  if (!p) {
    say("issuer-msg", "warn", "phantom.missing");
    const link = $("open-in-phantom");
    link.href = `https://phantom.com/ul/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`;
    link.hidden = false;
    return;
  }
  try {
    const { publicKey } = await p.connect();
    setWallet(publicKey);
  } catch (e) {
    if (e && e.code === 4001) say("issuer-msg", "bad", "connect.cancelled");
    else say("issuer-msg", "bad", "connect.failed", (e && e.message) || String(e));
  }
}

async function findEarlier(memo) {
  const signatures = await conn.getSignaturesForAddress(state.wallet, { limit: 200 }, "confirmed");
  const prefix = `v1|${memo.lot}|${memo.step}|`;
  let same = null;
  let conflict = null;
  for (const s of signatures) {
    if (s.err || !s.memo) continue;
    for (const text of s.memo.split("; ").map(stripMemoPrefix)) {
      if (text === memo.text) same = same || s.signature;
      else if (text.startsWith(prefix)) conflict = conflict || s.signature;
    }
  }
  return { same, conflict };
}

async function waitConfirmation(signature, lastValidBlockHeight) {
  for (;;) {
    const { value } = await conn.getSignatureStatuses([signature]);
    const s = value[0];
    if (s && s.err) throw i18nError("err.failed", JSON.stringify(s.err));
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
    if (await conn.getBlockHeight("confirmed") > lastValidBlockHeight) throw i18nError("err.neverShowed");
    await sleep(2000);
  }
}

async function readMemo(signature) {
  for (let i = 0; i < 5; i++) {
    const tx = await conn.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (tx) {
      const ix = tx.transaction.message.instructions.find(x => x.programId.toBase58() === CFG.memoProgram && typeof x.parsed === "string");
      return ix ? ix.parsed : null;
    }
    await sleep(1500);
  }
  return null;
}

function friendlyError(e) {
  if (e && e.code === 4001) return ["err.cancelled"];
  if (e && e.i18n) return e.i18n;
  const message = (e && e.message) || String(e);
  if (/insufficient|debit|0x1$/i.test(message)) return ["err.noSol"];
  return ["raw", message];
}

function showResult(signature, memo) {
  $("result-signature").textContent = signature;
  $("result-explorer").href = CFG.explorerTx(signature);
  $("result-public").href = CFG.publicPage(memo.lot);
  $("result-snippet").textContent = JSON.stringify({ step: String(memo.step), signature });
  $("result").hidden = false;
}

async function seal() {
  const memo = state.memo;
  const p = provider();
  if (!memo || !state.ready || !state.wallet || !p) return;
  state.sending = true;
  updateSealButton();
  $("result").hidden = true;
  try {
    say("status", "", "st.checking");
    const earlier = await findEarlier(memo);
    if (earlier.same) {
      log(`Already sealed: ${earlier.same}`);
      showResult(earlier.same, memo);
      say("status", "ok", "st.already");
      return;
    }
    if (earlier.conflict && !$("allow-conflict").checked) {
      $("conflict-box").hidden = false;
      say("status", "warn", "st.conflict", memo.step, memo.lot, earlier.conflict.slice(0, 8));
      return;
    }
    say("status", "", "st.approve");
    const ix = new TransactionInstruction({
      programId: MEMO_PROGRAM,
      keys: [{ pubkey: state.wallet, isSigner: true, isWritable: false }],
      data: Uint8Array.from(new TextEncoder().encode(memo.text))
    });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: state.wallet, blockhash, lastValidBlockHeight }).add(ix);
    const { signature } = await p.signAndSendTransaction(tx);
    log(`Sent: ${signature}`);
    say("status", "", "st.sent");
    await waitConfirmation(signature, lastValidBlockHeight);
    say("status", "", "st.confirmed");
    const chainMemo = await readMemo(signature);
    showResult(signature, memo);
    if (chainMemo === memo.text) say("status", "ok", "st.sealed");
    else say("status", "warn", "st.mismatch", chainMemo ? chainMemo : () => t("notFound"));
    refreshBalance();
  } catch (e) {
    log(`Error: ${(e && (e.message || JSON.stringify(e))) || e}`);
    const [key, ...args] = friendlyError(e);
    say("status", "bad", key, ...args);
  } finally {
    state.sending = false;
    updateSealButton();
  }
}

function labelPractice() {
  document.querySelectorAll("#practice button").forEach(b => { b.textContent = t("practice.button", b.dataset.lot, b.dataset.step); });
}

async function loadPractice() {
  try {
    const res = await fetch("spec/test-vector-v1.json", { cache: "no-store" });
    const vector = await res.json();
    const row = $("practice");
    for (const c of vector.cases) {
      const button = document.createElement("button");
      button.className = "btn ghost";
      button.type = "button";
      button.dataset.lot = c.record.lot;
      button.dataset.step = String(c.upTo);
      button.addEventListener("click", () => {
        $("memo").value = c.memo;
        $("canonical").value = c.canonical;
        $("reviewed").checked = false;
        checkInputs();
      });
      row.appendChild(button);
    }
    labelPractice();
    row.hidden = false;
  } catch (e) {
    log(`Practice cases unavailable: ${e.message || e}`);
  }
}

async function copy(text, button, source) {
  const key = button.dataset.i18n;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = t("copied");
  } catch {
    window.getSelection().selectAllChildren(source);
    button.textContent = t("selected");
  }
  setTimeout(() => { button.textContent = t(key); }, 1800);
}

function applyLanguage() {
  document.documentElement.lang = t("htmlLang");
  document.title = t("title");
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder)));
  document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === I18N.lang)));
  renderConnect();
  renderBalance();
  for (const [id, m] of Object.entries(state.msgs)) if (m) show(id, t(m.key, ...resolve(m.args)), m.kind);
  renderCheck();
  renderIssues();
  renderReview();
  updatePublicLink();
  labelPractice();
}

document.querySelectorAll(".lang button").forEach(b => b.addEventListener("click", () => {
  if (b.dataset.lang === I18N.lang) return;
  I18N.setLang(b.dataset.lang);
  applyLanguage();
}));
["memo", "canonical"].forEach(id => $(id).addEventListener("input", () => {
  $("reviewed").checked = false;
  checkInputs();
}));
$("reviewed").addEventListener("change", updateSealButton);
$("allow-conflict").addEventListener("change", updateSealButton);
$("connect").addEventListener("click", connect);
$("seal").addEventListener("click", seal);
$("copy-signature").addEventListener("click", e => copy($("result-signature").textContent, e.currentTarget, $("result-signature")));
$("copy-snippet").addEventListener("click", e => copy($("result-snippet").textContent, e.currentTarget, $("result-snippet")));

applyLanguage();
loadPractice();

window.addEventListener("load", () => {
  const p = provider();
  if (!p) return;
  if (p.on) p.on("accountChanged", pk => setWallet(pk || null));
  p.connect({ onlyIfTrusted: true }).then(r => setWallet(r.publicKey)).catch(() => {});
});
