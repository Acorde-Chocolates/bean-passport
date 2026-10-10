import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "site");
const CHAIN = process.argv.includes("--chain");
const HEADER = ["lot", "product", "producer", "municipality", "state", "origin_lot", "purchase_date"];
const STEP = ["n", "step", "date", "input_g", "output_g", "byproduct_g", "units", "profile"];
const STEP_CODES = ["roasting", "winnowing", "grinding", "tempering_molding", "packaging"];
const WEIGHTS = ["input_g", "output_g", "byproduct_g", "units"];
const LOT_RE = /^[A-Za-z0-9-]{1,32}$/;
const SIGNATURE_RE = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const PAGES = ["index.html", "anchor.html", "lote/index.html"];

const failures = [];
const warnings = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);
const sha256 = text => createHash("sha256").update(text, "utf8").digest("hex");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

function canonicalV1(rec, upTo) {
  const steps = rec.steps.filter(s => Number(s.n) <= upTo).sort((a, b) => a.n - b.n);
  const values = ["v1", ...HEADER.map(k => rec[k]), ...steps.flatMap(s => STEP.map(k => s[k]))];
  if (steps.length !== upTo || steps.some((s, i) => s.n !== String(i + 1)) || values.some(v => typeof v !== "string")) throw new Error("invalid record");
  return JSON.stringify(["v1", ...HEADER.map(k => rec[k]), ...steps.map(s => STEP.map(k => s[k]))]);
}

function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const x = new Date(d + "T12:00:00Z");
  return !isNaN(x) && x.toISOString().slice(0, 10) === d;
}

function loadConfig() {
  const context = { window: {} };
  vm.runInNewContext(readFileSync(join(SITE, "js/config.js"), "utf8"), context);
  return context.window.BP_CONFIG;
}

function checkVector() {
  const where = "spec/test-vector-v1.json";
  const vector = JSON.parse(readFileSync(join(SITE, "spec/test-vector-v1.json"), "utf8"));
  for (const c of vector.cases) {
    const text = canonicalV1(c.record, c.upTo);
    if (text !== c.canonical) fail(where, `${c.name}: canonical text differs from the reference implementation`);
    if (sha256(text) !== c.sha256) fail(where, `${c.name}: sha256 differs`);
    if (c.memo !== `v1|${c.record.lot}|${c.upTo}|${c.sha256}`) fail(where, `${c.name}: memo differs`);
  }
  return vector.cases.length;
}

function checkRecord(where, record) {
  for (const k of HEADER) if (typeof record[k] !== "string") fail(where, `record.${k} must be a string`);
  if (!Array.isArray(record.steps)) { fail(where, "record.steps must be an array"); return false; }
  if (!LOT_RE.test(record.lot || "")) fail(where, `lot "${record.lot}" must use only letters, digits and hyphens (up to 32)`);
  if (!record.product) fail(where, "product is empty");
  if (record.purchase_date && !validDate(record.purchase_date)) fail(where, `purchase_date "${record.purchase_date}" is not a real yyyy-MM-dd date`);
  if (record.steps.length > STEP_CODES.length) fail(where, `${record.steps.length} steps, the format allows ${STEP_CODES.length}`);
  const strings = [...HEADER.map(k => [k, record[k]]), ...record.steps.flatMap((s, i) => STEP.map(k => [`step ${i + 1} ${k}`, s[k]]))];
  for (const [label, v] of strings) {
    if (typeof v !== "string") { fail(where, `${label} must be a string`); continue; }
    if (v !== v.trim()) fail(where, `${label} has spaces at the start or end`);
    if (v !== v.normalize("NFC")) fail(where, `${label} is not in NFC form`);
  }
  record.steps.forEach((s, i) => {
    const n = i + 1;
    if (s.n !== String(n)) fail(where, `step ${n} has n "${s.n}", steps must be 1..N in order`);
    if (s.step !== STEP_CODES[i]) fail(where, `step ${n} code is "${s.step}", expected "${STEP_CODES[i]}"`);
    if (!validDate(s.date || "")) fail(where, `step ${n} date "${s.date}" is not a real yyyy-MM-dd date`);
    else if (s.date > today) fail(where, `step ${n} date ${s.date} is in the future`);
    for (const k of WEIGHTS) if (typeof s[k] === "string" && !/^\d*$/.test(s[k])) fail(where, `step ${n} ${k} "${s[k]}" must be digits only`);
  });
  try { record.steps.forEach((s, i) => canonicalV1(record, i + 1)); return true; }
  catch { fail(where, "record does not serialize as canonical v1"); return false; }
}

async function rpc(url, method, params) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    if (res.status === 429) { await new Promise(r => setTimeout(r, 1500 * 2 ** attempt)); continue; }
    if (!res.ok) throw new Error(`RPC answered ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }
  throw new Error("RPC busy");
}

async function checkAnchorOnChain(where, config, record, anchor) {
  const tx = await rpc(config.rpcUrl, "getTransaction", [anchor.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" }]);
  if (!tx) { fail(where, `step ${anchor.step} signature not found on devnet`); return; }
  if (tx.meta && tx.meta.err) { fail(where, `step ${anchor.step} transaction failed on devnet`); return; }
  const ix = tx.transaction.message.instructions.find(i => i.programId === config.memoProgram && typeof i.parsed === "string");
  const expected = `v1|${record.lot}|${anchor.step}|${sha256(canonicalV1(record, Number(anchor.step)))}`;
  if (!ix) fail(where, `step ${anchor.step} transaction has no memo`);
  else if (ix.parsed !== expected) fail(where, `step ${anchor.step} memo on chain does not match the record (the sealed values changed, or the signature belongs to another step)`);
  const signer = tx.transaction.message.accountKeys[0].pubkey;
  const issuer = config.issuerFor(record.lot);
  if (!issuer) warn(where, `no issuer configured for ${record.lot}: the page will show this seal as "Other wallet"`);
  else if (signer !== issuer) fail(where, `step ${anchor.step} was signed by ${signer}, not by the issuer ${issuer}`);
}

async function checkLots(config) {
  const dir = join(SITE, "data/lots");
  const files = readdirSync(dir).filter(f => f.endsWith(".json"));
  let anchors = 0;
  for (const file of files) {
    const where = `data/lots/${file}`;
    let lot;
    try { lot = JSON.parse(readFileSync(join(dir, file), "utf8")); } catch { fail(where, "is not valid JSON"); continue; }
    if (lot.schema !== "bean-passport.lot.v1") fail(where, `schema must be "bean-passport.lot.v1"`);
    if (!lot.record) { fail(where, "has no record"); continue; }
    if (lot.record.lot !== basename(file, ".json")) fail(where, `record.lot "${lot.record.lot}" must match the file name`);
    const recordOk = checkRecord(where, lot.record);
    if (!Array.isArray(lot.anchors)) { fail(where, "anchors must be an array"); continue; }
    const seen = new Set();
    for (const a of lot.anchors) {
      const n = Number(a.step);
      if (typeof a.step !== "string" || !Number.isInteger(n) || n < 1 || n > lot.record.steps.length) fail(where, `anchor step "${a.step}" must be a recorded step`);
      if (seen.has(a.step)) fail(where, `step ${a.step} has more than one anchor`);
      seen.add(a.step);
      if (!SIGNATURE_RE.test(a.signature || "")) fail(where, `step ${a.step} signature is not a valid base58 signature`);
    }
    anchors += lot.anchors.length;
    if (CHAIN && recordOk) {
      for (const a of lot.anchors) {
        if (!SIGNATURE_RE.test(a.signature || "") || !seen.has(a.step)) continue;
        try { await checkAnchorOnChain(where, config, lot.record, a); }
        catch (e) { warn(where, `could not reach devnet to check step ${a.step} (${e.message}); not blocking`); }
      }
    }
  }
  return { files: files.length, anchors };
}

function checkPages() {
  for (const page of PAGES) {
    const html = readFileSync(join(SITE, page), "utf8");
    for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+\.(?:css|js)(?:\?[^"]*)?)"/g)) {
      if (/^https?:/.test(ref) || ref.includes("/vendor/") || ref.startsWith("vendor/")) continue;
      if (!ref.endsWith("?v=__V__")) fail(page, `"${ref}" must end with ?v=__V__ so each deploy busts the cache`);
    }
  }
}

const config = loadConfig();
const cases = checkVector();
const lots = await checkLots(config);
checkPages();

console.log(`test vector: ${cases} cases`);
console.log(`batch files: ${lots.files}, anchors: ${lots.anchors}${CHAIN ? " (checked on devnet)" : ""}`);
console.log(`pages: ${PAGES.length}`);
for (const w of warnings) console.log(`warning  ${w}`);
for (const f of failures) console.log(`FAIL     ${f}`);
if (failures.length) {
  console.log(`\n${failures.length} problem(s). The deploy stops here and the current site stays online.`);
  process.exit(1);
}
console.log("\nall checks passed");
