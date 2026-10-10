const DEMO_LOTS = [
  { id: "TEST-0001", kind: "test", steps: 2 }
];

const DICT = {
  en: {
    htmlLang: "en",
    title: "Bean Passport · Acorde Chocolates",
    description: "Every chocolate batch from Acorde, sealed on Solana from bean to bar. Check a batch from the QR code on the wrapper.",
    "lang.label": "Language",
    "brand.tagline": "Acorde Chocolates · bean to bar",
    "brand.logoAlt": "Acorde Chocolates logo",
    "hero.title": "Every batch, sealed from bean to bar.",
    "hero.lead": "Acorde Chocolates records each production step of a batch. Bean Passport seals a fingerprint of that record on Solana, so anyone can check it from the QR code on the wrapper, without trusting us.",
    "check.label": "Check a batch",
    "check.placeholder": "Batch code, e.g. TEST-0001",
    "check.button": "Open passport",
    "check.empty": "Type the batch code printed on the wrapper.",
    "check.invalid": "Batch codes use only letters, numbers and hyphens.",
    "demo.eyebrow": "Live on Solana devnet",
    "demo.title": "See it working",
    "demo.test": n => `Practice batch: ${n} steps sealed on devnet by the team's test wallet. Try changing a number on the page.`,
    "demo.real": n => `Real batch from the factory: ${n} steps sealed by Acorde's wallet.`,
    "demo.pill": "Sealed on devnet",
    "demo.go": "Open passport →",
    "how.eyebrow": "Three steps",
    "how.title": "How it works",
    "how.1.title": "Record",
    "how.1.text": "The factory's spreadsheet turns each closed production step into a canonical record: dates, weights in grams, origin. Nothing personal or financial.",
    "how.2.title": "Seal",
    "how.2.text": 'Acorde signs a Solana memo carrying the SHA-256 of that record. Each seal covers every earlier step, so a later edit breaks all the seals after it. <a href="anchor.html">For producers: seal a step →</a>',
    "how.3.title": "Verify",
    "how.3.text": "The batch passport recomputes the hash in your browser from the data it shows and compares it with the memo on Solana. You can also check it in a terminal.",
    limit: "A seal proves the record hasn't changed since it was sealed, and when it was sealed. It doesn't prove the numbers are true: a wrong number typed before sealing stays wrong, and the seal attests it faithfully.",
    "open.title": "Open by design",
    "open.repo": "Source code (MIT)",
    "open.spec": "Canonical record spec v1",
    "open.vector": "Test vector",
    "open.anchor": "Sealing page (for producers)",
    footer: "Solana devnet · canonical record v1 · built for the Crypto World's Fair hackathon"
  },
  pt: {
    htmlLang: "pt-BR",
    title: "Bean Passport · Acorde Chocolates",
    description: "Cada lote de chocolate da Acorde, selado na Solana do grão à barra. Confira um lote pelo QR Code da embalagem.",
    "lang.label": "Idioma",
    "brand.tagline": "Acorde Chocolates · do grão à barra",
    "brand.logoAlt": "Logo da Acorde Chocolates",
    "hero.title": "Cada lote, selado do grão à barra.",
    "hero.lead": "A Acorde Chocolates registra cada etapa de produção de um lote. O Bean Passport sela uma impressão digital desse registro na Solana, e qualquer pessoa confere pelo QR Code da embalagem, sem precisar confiar na gente.",
    "check.label": "Confira um lote",
    "check.placeholder": "Código do lote, ex.: TEST-0001",
    "check.button": "Abrir passaporte",
    "check.empty": "Digite o código do lote impresso na embalagem.",
    "check.invalid": "O código do lote usa só letras, números e hífen.",
    "demo.eyebrow": "No ar na Solana devnet",
    "demo.title": "Veja funcionando",
    "demo.test": n => `Lote de prática: ${n} etapas seladas na devnet pela carteira de teste da equipe. Teste alterar um número na página.`,
    "demo.real": n => `Lote real da fábrica: ${n} etapas seladas pela carteira da Acorde.`,
    "demo.pill": "Selado na devnet",
    "demo.go": "Abrir passaporte →",
    "how.eyebrow": "Três etapas",
    "how.title": "Como funciona",
    "how.1.title": "Registrar",
    "how.1.text": "A planilha da fábrica transforma cada etapa de produção concluída num registro canônico: datas, pesos em gramas, origem. Nada pessoal nem financeiro.",
    "how.2.title": "Selar",
    "how.2.text": 'A Acorde assina um memo na Solana com o SHA-256 desse registro. Cada selo cobre todas as etapas anteriores, então uma edição posterior quebra todos os selos seguintes. <a href="anchor.html">Para produtores: selar uma etapa →</a>',
    "how.3.title": "Verificar",
    "how.3.text": "O passaporte do lote recalcula o hash no seu navegador a partir dos dados que exibe e compara com o memo na Solana. Dá para conferir no terminal também.",
    limit: "Um selo prova que o registro não mudou desde que foi selado, e quando foi selado. Ele não prova que os números são verdadeiros: um número errado digitado antes do selo continua errado, e o selo atesta isso fielmente.",
    "open.title": "Aberto por princípio",
    "open.repo": "Código-fonte (MIT)",
    "open.spec": "Especificação do registro canônico v1",
    "open.vector": "Vetor de teste",
    "open.anchor": "Página de selagem (para produtores)",
    footer: "Solana devnet · registro canônico v1 · feito para o hackathon Crypto World's Fair"
  }
};

const LANGS = Object.keys(DICT);
const STORE = "bp-lang";
const FORMAT = /^[A-Za-z0-9-]{1,32}$/;

function initialLang() {
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (LANGS.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORE);
    if (LANGS.includes(saved)) return saved;
  } catch {}
  return "en";
}

let lang = initialLang();

const t = (key, ...args) => {
  const value = key in DICT[lang] ? DICT[lang][key] : DICT.en[key];
  return typeof value === "function" ? value(...args) : value;
};

function renderDemo() {
  document.getElementById("demo").innerHTML = DEMO_LOTS.map(lot =>
    `<a href="lote/?id=${encodeURIComponent(lot.id)}">` +
      `<span class="pill">${t("demo.pill")}</span>` +
      `<span class="lot">${lot.id}</span>` +
      `<p>${lot.kind === "test" ? t("demo.test", lot.steps) : t("demo.real", lot.steps)}</p>` +
      `<span class="go">${t("demo.go")}</span>` +
    `</a>`).join("");
}

function apply() {
  document.documentElement.lang = t("htmlLang");
  document.title = t("title");
  document.querySelector('meta[name="description"]').setAttribute("content", t("description"));
  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  document.querySelectorAll("[data-i18n-alt]").forEach(el => el.setAttribute("alt", t(el.dataset.i18nAlt)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder)));
  document.querySelectorAll(".lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  document.getElementById("check-msg").textContent = "";
  renderDemo();
}

function setLang(next) {
  if (!LANGS.includes(next) || next === lang) return;
  lang = next;
  try { localStorage.setItem(STORE, next); } catch {}
  const url = new URL(location.href);
  url.searchParams.set("lang", next);
  try { history.replaceState(null, "", url); } catch {}
  apply();
}

document.querySelectorAll(".lang button").forEach(b => b.addEventListener("click", () => setLang(b.dataset.lang)));
document.getElementById("check").addEventListener("submit", e => {
  e.preventDefault();
  const id = document.getElementById("lot-id").value.trim();
  const msg = document.getElementById("check-msg");
  if (!id) { msg.textContent = t("check.empty"); return; }
  if (!FORMAT.test(id)) { msg.textContent = t("check.invalid"); return; }
  location.href = `lote/?id=${encodeURIComponent(id)}`;
});

apply();
