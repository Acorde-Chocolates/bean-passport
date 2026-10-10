const { Connection, PublicKey, Transaction, TransactionInstruction } = window.solanaWeb3;
const CFG = window.BP_CONFIG;
const MEMO_PROGRAM = new PublicKey(CFG.memoProgram);
const MEMO_RE = /^v1\|([A-Za-z0-9-]{1,32})\|([1-9])\|([0-9a-f]{64})$/;
const HEADER = ["lot", "product", "producer", "municipality", "state", "origin_lot", "purchase_date"];
const STEP = ["n", "step", "date", "input_g", "output_g", "byproduct_g", "units", "profile"];
const LOW_BALANCE = 50000;

const conn = new Connection(CFG.rpcUrl, "confirmed");
const state = { wallet: null, memo: null, record: null, ready: false, sending: false };
let checkId = 0;
let testIndex = 0;

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stripMemoPrefix = m => (m || "").replace(/^\[\d+\]\s*/, "");

function log(text) {
  $("log").textContent += `[${new Date().toLocaleTimeString("en-GB")}] ${text}\n`;
}

function show(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.dataset.kind = kind || "";
  el.hidden = !text;
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
  try { arr = JSON.parse(text); } catch { return { error: "The canonical record is not valid JSON." }; }
  if (!Array.isArray(arr) || arr[0] !== "v1" || arr.length < 9) return { error: "This is not a v1 canonical record." };
  const header = arr.slice(1, 8);
  const steps = arr.slice(8);
  if (header.some(v => typeof v !== "string") || steps.some(s => !Array.isArray(s) || s.length !== 8 || s.some(v => typeof v !== "string"))) {
    return { error: "Every value must be a string, and every step must have 8 values." };
  }
  if (steps.some((s, i) => s[0] !== String(i + 1))) return { error: "Steps must be numbered 1, 2, 3 and so on, in order." };
  if (JSON.stringify(arr) !== text) return { error: "The record is not in canonical form (extra spaces or line breaks). Paste it exactly as exported." };
  return { text, header, steps };
}

function renderReview(record) {
  if (!record || record.error) { $("review").hidden = true; return; }
  $("review-header").innerHTML = HEADER.map((k, i) => `<dt>${k}</dt><dd>${esc(record.header[i] || "—")}</dd>`).join("");
  $("review-steps").innerHTML = `<thead><tr>${STEP.map(k => `<th>${k}</th>`).join("")}</tr></thead><tbody>` +
    record.steps.map(s => `<tr>${s.map(v => `<td>${esc(v || "—")}</td>`).join("")}</tr>`).join("") + `</tbody>`;
  $("review").hidden = false;
}

function updatePublicLink() {
  const lot = (state.memo && state.memo.lot) || (state.record && !state.record.error && state.record.header[0]) || "";
  const link = $("public-link-top");
  if (!lot) { link.hidden = true; return; }
  link.href = CFG.publicPage(lot);
  link.textContent = `Public passport for ${lot} ↗`;
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
  renderReview(state.record);
  let msg = "";
  let kind = "";
  if (!memoRaw && !canonRaw) msg = "";
  else if (memoRaw && !state.memo) { msg = "The memo must look like v1|LOT-ID|STEP|HASH: lot with letters, digits and hyphens, step 1 to 9, hash with 64 lowercase hex characters."; kind = "bad"; }
  else if (!state.record) { msg = "Paste the canonical record too. The page needs it to recompute the hash."; kind = "warn"; }
  else if (state.record.error) { msg = state.record.error; kind = "bad"; }
  else if (!state.memo) { msg = "Paste the memo too."; kind = "warn"; }
  else {
    const hash = await sha256Hex(state.record.text);
    if (my !== checkId) return;
    const lot = state.record.header[0];
    const lastStep = state.record.steps.length;
    if (state.memo.lot !== lot) { msg = `The memo is for lot ${state.memo.lot}, but the record is for lot ${lot}.`; kind = "bad"; }
    else if (state.memo.step !== lastStep) { msg = `The memo is for step ${state.memo.step}, but the record goes up to step ${lastStep}.`; kind = "bad"; }
    else if (state.memo.hash !== hash) { msg = `The hash in the memo doesn't match the record. Recomputed here: ${hash}`; kind = "bad"; }
    else { msg = `Memo and record match: lot ${lot}, step ${lastStep}, hash ${hash.slice(0, 12)}…`; kind = "ok"; state.ready = true; }
  }
  if (my !== checkId) return;
  updatePublicLink();
  show("check-msg", msg, kind);
  $("conflict-box").hidden = true;
  $("allow-conflict").checked = false;
  updateSealButton();
}

async function refreshBalance() {
  if (!state.wallet) return;
  try {
    const lamports = await conn.getBalance(state.wallet, "confirmed");
    const sol = (lamports / 1e9).toLocaleString("en-US", { maximumFractionDigits: 4 });
    $("wallet-balance").textContent = lamports < LOW_BALANCE ? `${sol} SOL (devnet). Too low to pay the fee: get devnet SOL first.` : `${sol} SOL (devnet)`;
  } catch (e) {
    $("wallet-balance").textContent = "Couldn't read the balance.";
    log(`Balance error: ${e.message || e}`);
  }
}

function setWallet(publicKey) {
  state.wallet = publicKey;
  if (!publicKey) {
    $("wallet-info").hidden = true;
    $("connect").textContent = "Connect Phantom";
    show("issuer-msg", "Wallet disconnected.", "warn");
    updateSealButton();
    return;
  }
  const address = publicKey.toBase58();
  $("wallet-address").innerHTML = `<a href="${CFG.explorerAddress(address)}" target="_blank" rel="noopener">${esc(address)}</a>`;
  $("wallet-info").hidden = false;
  $("connect").textContent = "Reconnect";
  log(`Connected: ${address}`);
  if (CFG.testIssuer === address) show("issuer-msg", "This is the team's test wallet. Its seals verify on the public page for TEST-* lots only.", "ok");
  else if (!CFG.issuer) show("issuer-msg", "Acorde's wallet is not set in js/config.js yet. Seals only verify on the public page after it is set to the address that signs them.", "warn");
  else if (CFG.issuer === address) show("issuer-msg", "This is Acorde's wallet. Seals from it verify on the public page.", "ok");
  else show("issuer-msg", "This is not Acorde's wallet. Use it to practice: on the public page its seals show as \"Other wallet\".", "warn");
  updateSealButton();
  refreshBalance();
}

async function connect() {
  const p = provider();
  if (!p) {
    show("issuer-msg", "Phantom not found. Use a desktop browser with the Phantom extension, or open this page inside the Phantom app.", "warn");
    const link = $("open-in-phantom");
    link.href = `https://phantom.com/ul/browse/${encodeURIComponent(location.href)}?ref=${encodeURIComponent(location.origin)}`;
    link.hidden = false;
    return;
  }
  try {
    const { publicKey } = await p.connect();
    setWallet(publicKey);
  } catch (e) {
    show("issuer-msg", e && e.code === 4001 ? "Connection cancelled in Phantom." : `Couldn't connect: ${(e && e.message) || e}`, "bad");
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
    if (s && s.err) throw new Error(`The transaction failed on devnet: ${JSON.stringify(s.err)}`);
    if (s && (s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized")) return;
    if (await conn.getBlockHeight("confirmed") > lastValidBlockHeight) {
      throw new Error("The transaction never showed up on devnet. Check that Phantom is set to Solana Devnet (Settings › Developer Settings › Testnet Mode) and try again.");
    }
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
  if (e && e.code === 4001) return "Cancelled in Phantom. Nothing was sent.";
  const message = (e && e.message) || String(e);
  if (/insufficient|debit|0x1$/i.test(message)) return "Not enough devnet SOL to pay the fee.";
  return message;
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
    show("status", "Checking earlier seals from this wallet…");
    const earlier = await findEarlier(memo);
    if (earlier.same) {
      log(`Already sealed: ${earlier.same}`);
      showResult(earlier.same, memo);
      show("status", "This exact memo was already sealed by this wallet. Nothing new was sent.", "ok");
      return;
    }
    if (earlier.conflict && !$("allow-conflict").checked) {
      $("conflict-box").hidden = false;
      show("status", `This wallet already sealed step ${memo.step} of ${memo.lot} with a different hash (${earlier.conflict.slice(0, 8)}…). Check the record before sealing again.`, "warn");
      return;
    }
    show("status", "Approve the transaction in Phantom…");
    const ix = new TransactionInstruction({
      programId: MEMO_PROGRAM,
      keys: [{ pubkey: state.wallet, isSigner: true, isWritable: false }],
      data: Uint8Array.from(new TextEncoder().encode(memo.text))
    });
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    const tx = new Transaction({ feePayer: state.wallet, blockhash, lastValidBlockHeight }).add(ix);
    const { signature } = await p.signAndSendTransaction(tx);
    log(`Sent: ${signature}`);
    show("status", "Sent. Waiting for devnet to confirm…");
    await waitConfirmation(signature, lastValidBlockHeight);
    show("status", "Confirmed. Reading the memo back from devnet…");
    const chainMemo = await readMemo(signature);
    showResult(signature, memo);
    if (chainMemo === memo.text) show("status", "Sealed. The memo read back from devnet matches.", "ok");
    else show("status", `Sealed, but the memo read back doesn't match yet (${chainMemo || "not found"}). Check it on the explorer.`, "warn");
    refreshBalance();
  } catch (e) {
    log(`Error: ${(e && (e.message || JSON.stringify(e))) || e}`);
    show("status", friendlyError(e), "bad");
  } finally {
    state.sending = false;
    updateSealButton();
  }
}

async function fillTest() {
  try {
    const res = await fetch("spec/test-vector-v1.json", { cache: "no-store" });
    const vector = await res.json();
    const c = vector.cases[testIndex % 2];
    testIndex++;
    $("memo").value = c.memo;
    $("canonical").value = c.canonical;
    $("reviewed").checked = false;
    $("fill-test").textContent = `Fill with TEST-0001 step ${(testIndex % 2) + 1} (practice)`;
    await checkInputs();
  } catch (e) {
    show("check-msg", `Couldn't load the test vector: ${e.message || e}`, "bad");
  }
}

async function copy(text, button, source) {
  const label = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = "Copied";
  } catch {
    window.getSelection().selectAllChildren(source);
    button.textContent = "Selected: press Ctrl+C";
  }
  setTimeout(() => { button.textContent = label; }, 1800);
}

["memo", "canonical"].forEach(id => $(id).addEventListener("input", () => {
  $("reviewed").checked = false;
  checkInputs();
}));
$("reviewed").addEventListener("change", updateSealButton);
$("allow-conflict").addEventListener("change", updateSealButton);
$("connect").addEventListener("click", connect);
$("seal").addEventListener("click", seal);
$("fill-test").addEventListener("click", fillTest);
$("copy-signature").addEventListener("click", e => copy($("result-signature").textContent, e.currentTarget, $("result-signature")));
$("copy-snippet").addEventListener("click", e => copy($("result-snippet").textContent, e.currentTarget, $("result-snippet")));

window.addEventListener("load", () => {
  const p = provider();
  if (!p) return;
  if (p.on) p.on("accountChanged", pk => setWallet(pk || null));
  p.connect({ onlyIfTrusted: true }).then(r => setWallet(r.publicKey)).catch(() => {});
});
