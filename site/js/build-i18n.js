window.BP_BUILD_I18N = (() => {
  const DICT = {
    en: {
      htmlLang: "en",
      locale: "en-US",
      title: "Bean Passport · Build a seal",
      "lang.label": "Language",
      home: "← Bean Passport home",
      eyebrow: "Bean Passport · how a seal is built",
      heading: "Build a seal",
      intro: "This page does in your browser what the factory's Apps Script does inside its spreadsheet: it turns production numbers into the canonical record, its SHA-256 fingerprint and the memo that gets sealed on Solana.",
      badge: "Demo: nothing is sent or sealed",
      "vector.loading": "Checking this page against the official test vector…",
      "vector.ok": n => `This page reproduces the official test vector: ${n} of ${n} checks pass.`,
      "vector.bad": (failed, n) => `${failed} of ${n} test vector checks fail. Don't trust this page's output.`,
      "vector.err": "Couldn't load the test vector.",
      "start.title": "Start from",
      "start.hint": "Load a published batch, then change any number and watch the fingerprint change.",
      "start.test": "Practice batch TEST-0001 (sealed on devnet)",
      "start.real": "Real batch LOT033-2026",
      "start.blank": "Blank",
      "start.loaded": lot => `Loaded ${lot} from its public batch file, with the weights back in kilograms.`,
      "start.err": lot => `Couldn't load ${lot}.`,
      "numbers.title": "Production numbers",
      "numbers.hint": "As the factory's spreadsheet has them: weights in kilograms with a dot for decimals, dates as dates. Leave a step blank if it hasn't happened yet.",
      "f.lot": "Lot",
      "f.product": "Product",
      "f.producer": "Producer code",
      "f.municipality": "Municipality",
      "f.state": "State",
      "f.origin_lot": "Origin lot",
      "f.purchase_date": "Purchase date",
      "col.step": "Step",
      "col.date": "Date",
      "col.input": "Input (kg)",
      "col.output": "Output (kg)",
      "col.byproduct": "Byproduct (kg)",
      "col.units": "Units",
      "col.profile": "Profile",
      "step.roasting": "Roasting",
      "step.winnowing": "Winnowing",
      "step.grinding": "Grinding (melanger)",
      "step.tempering_molding": "Tempering & molding",
      "step.packaging": "Packaging",
      "norm.title": "Normalize",
      "norm.hint": "The same rules as the Apps Script: kilograms become whole grams, text is trimmed and put in Unicode NFC, dates are yyyy-MM-dd.",
      "norm.none": "Nothing to rewrite: every value is already in canonical form.",
      "n.kg": (where, kg, g) => `${where}: ${kg} kg → "${g}"`,
      "n.trim": where => `${where}: spaces at the start or end removed`,
      "n.nfc": where => `${where}: accents rewritten in Unicode NFC (they look the same, the bytes differ)`,
      "e.lotEmpty": "Fill in the lot code.",
      "e.lot": lot => `Lot "${lot}" must use only letters, digits and hyphens (up to 32).`,
      "e.noSteps": "Fill in at least the first step to build a record.",
      "e.gap": step => `${step} is blank, but a later step is filled. Steps are recorded in order.`,
      "e.date": step => `${step}: the date is empty.`,
      "e.weight": (where, v) => `${where}: "${v}" is not a weight in kilograms. Use digits and a dot, without units (6.08, not 6,08 or 6.08 kg).`,
      "e.units": (where, v) => `${where}: "${v}" must be a whole number.`,
      "canon.title": "Canonical record",
      "canon.hint": "A JSON array of strings in a fixed order, without spaces: the exact bytes that get hashed. The seal of step N covers the header and steps 1 to N.",
      "canon.upTo": "Seal up to step",
      "hash.title": "SHA-256 fingerprint",
      "hash.hint": "Computed in your browser from the bytes above. Change one gram and the whole fingerprint changes.",
      "memo.title": "Memo",
      "memo.hint": "What the official wallet signs on Solana: version, lot, step and fingerprint.",
      "chain.loading": n => `Reading the seal of step ${n} on devnet…`,
      "chain.match": (n, when) => `Matches the seal of step ${n} on devnet, signed by the official wallet on ${when} (BRT).`,
      "chain.matchOther": (n, when) => `Matches the memo of step ${n} on devnet, sealed on ${when} (BRT), but by a wallet that isn't the official one.`,
      "chain.differ": (n, memo) => `Different from the seal of step ${n} on devnet (${memo}). With these numbers in the batch file, the passport would show this step as Changed.`,
      "chain.none": (lot, n) => `Step ${n} of ${lot} isn't sealed yet: this is the memo the official wallet would sign.`,
      "chain.notFound": n => `The seal of step ${n} listed in the batch file wasn't found on devnet.`,
      "chain.offline": "Couldn't reach devnet to compare with the seal.",
      "chain.other": "This record doesn't come from a published batch, so there's no seal to compare with.",
      copy: "Copy",
      copied: "Copied",
      selected: "Selected: press Ctrl+C",
      "next.anchor": "Paste it on the sealing page →",
      "next.passport": lot => `Open the passport of ${lot} →`,
      "next.apps": "Apps Script source on GitHub →",
      footer: "The factory runs these same steps in Google Apps Script, inside its private spreadsheet. This page only shows them: it can't seal anything."
    },
    pt: {
      htmlLang: "pt-BR",
      locale: "pt-BR",
      title: "Bean Passport · Montar um selo",
      "lang.label": "Idioma",
      home: "← Início do Bean Passport",
      eyebrow: "Bean Passport · como um selo é montado",
      heading: "Montar um selo",
      intro: "Esta página faz no seu navegador o que o Apps Script da fábrica faz dentro da planilha: transforma os números de produção no registro canônico, na impressão digital SHA-256 e no memo que é selado na Solana.",
      badge: "Demonstração: nada é enviado nem selado",
      "vector.loading": "Conferindo esta página com o vetor de teste oficial…",
      "vector.ok": n => `Esta página reproduz o vetor de teste oficial: ${n} de ${n} checagens passam.`,
      "vector.bad": (failed, n) => `${failed} de ${n} checagens do vetor de teste falham. Não confie no resultado desta página.`,
      "vector.err": "Não foi possível carregar o vetor de teste.",
      "start.title": "Começar de",
      "start.hint": "Carregue um lote publicado, depois mude qualquer número e veja a impressão digital mudar.",
      "start.test": "Lote de prática TEST-0001 (selado na devnet)",
      "start.real": "Lote real LOT033-2026",
      "start.blank": "Em branco",
      "start.loaded": lot => `${lot} carregado do arquivo público do lote, com os pesos de volta em quilos.`,
      "start.err": lot => `Não foi possível carregar ${lot}.`,
      "numbers.title": "Números de produção",
      "numbers.hint": "Como estão na planilha da fábrica: pesos em quilos com ponto nos decimais, datas como datas. Deixe a etapa em branco se ela ainda não aconteceu.",
      "f.lot": "Lote",
      "f.product": "Produto",
      "f.producer": "Código do produtor",
      "f.municipality": "Município",
      "f.state": "Estado",
      "f.origin_lot": "Lote de origem",
      "f.purchase_date": "Data da compra",
      "col.step": "Etapa",
      "col.date": "Data",
      "col.input": "Entrada (kg)",
      "col.output": "Saída (kg)",
      "col.byproduct": "Subproduto (kg)",
      "col.units": "Unidades",
      "col.profile": "Perfil",
      "step.roasting": "Torra",
      "step.winnowing": "Descasque",
      "step.grinding": "Moagem (melanger)",
      "step.tempering_molding": "Temperagem e moldagem",
      "step.packaging": "Embalagem",
      "norm.title": "Normalizar",
      "norm.hint": "As mesmas regras do Apps Script: quilos viram gramas inteiras, texto perde os espaços das pontas e vai para Unicode NFC, datas ficam em aaaa-MM-dd.",
      "norm.none": "Nada para reescrever: todos os valores já estão na forma canônica.",
      "n.kg": (where, kg, g) => `${where}: ${kg} kg → "${g}"`,
      "n.trim": where => `${where}: espaços do começo ou do fim removidos`,
      "n.nfc": where => `${where}: acentos reescritos em Unicode NFC (parecem iguais, os bytes mudam)`,
      "e.lotEmpty": "Preencha o código do lote.",
      "e.lot": lot => `O lote "${lot}" só pode ter letras, números e hífen (até 32).`,
      "e.noSteps": "Preencha pelo menos a primeira etapa para montar um registro.",
      "e.gap": step => `${step} está em branco, mas uma etapa seguinte está preenchida. As etapas são registradas em ordem.`,
      "e.date": step => `${step}: a data está vazia.`,
      "e.weight": (where, v) => `${where}: "${v}" não é um peso em quilos. Use números e ponto, sem unidade (6.08, não 6,08 nem 6.08 kg).`,
      "e.units": (where, v) => `${where}: "${v}" precisa ser um número inteiro.`,
      "canon.title": "Registro canônico",
      "canon.hint": "Um array JSON de textos em ordem fixa, sem espaços: os bytes exatos que viram o hash. O selo da etapa N cobre o cabeçalho e as etapas 1 a N.",
      "canon.upTo": "Selar até a etapa",
      "hash.title": "Impressão digital SHA-256",
      "hash.hint": "Calculada no seu navegador a partir dos bytes acima. Mude um grama e a impressão digital inteira muda.",
      "memo.title": "Memo",
      "memo.hint": "O que a carteira oficial assina na Solana: versão, lote, etapa e impressão digital.",
      "chain.loading": n => `Lendo o selo da etapa ${n} na devnet…`,
      "chain.match": (n, when) => `Bate com o selo da etapa ${n} na devnet, assinado pela carteira oficial em ${when} (BRT).`,
      "chain.matchOther": (n, when) => `Bate com o memo da etapa ${n} na devnet, selado em ${when} (BRT), mas por uma carteira que não é a oficial.`,
      "chain.differ": (n, memo) => `Diferente do selo da etapa ${n} na devnet (${memo}). Com estes números no arquivo do lote, o passaporte mostraria esta etapa como Alterado.`,
      "chain.none": (lot, n) => `A etapa ${n} do lote ${lot} ainda não foi selada: este é o memo que a carteira oficial assinaria.`,
      "chain.notFound": n => `O selo da etapa ${n} listado no arquivo do lote não foi encontrado na devnet.`,
      "chain.offline": "Não foi possível acessar a devnet para comparar com o selo.",
      "chain.other": "Este registro não vem de um lote publicado, então não há selo para comparar.",
      copy: "Copiar",
      copied: "Copiado",
      selected: "Selecionado: aperte Ctrl+C",
      "next.anchor": "Colar na página de selagem →",
      "next.passport": lot => `Abrir o passaporte do lote ${lot} →`,
      "next.apps": "Código do Apps Script no GitHub →",
      footer: "A fábrica faz estes mesmos passos no Google Apps Script, dentro da planilha privada dela. Esta página só mostra os passos: ela não consegue selar nada."
    }
  };

  const LANGS = Object.keys(DICT);
  const KEY = "bp-lang";

  function initial() {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (LANGS.includes(fromUrl)) return fromUrl;
    try {
      const saved = localStorage.getItem(KEY);
      if (LANGS.includes(saved)) return saved;
    } catch {}
    return "en";
  }

  let lang = initial();

  const t = (key, ...args) => {
    const value = key in DICT[lang] ? DICT[lang][key] : DICT.en[key];
    return typeof value === "function" ? value(...args) : value;
  };

  function setLang(next) {
    if (!LANGS.includes(next)) return;
    lang = next;
    try { localStorage.setItem(KEY, next); } catch {}
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    try { history.replaceState(null, "", url); } catch {}
  }

  return { t, setLang, get lang() { return lang; } };
})();
