function buildMpbRecordV1() {
  const header = {
    lot: 'LOT033-2026',
    product: 'Barra MPB 60 g',
    producer: 'FOR004',
    municipality: 'Ibirapitanga',
    state: 'BA',
    origin_lot: '4/2026',
    purchase_date: '2026-07-04'
  };
  const facts = [
    { date: '2026-10-05', input_g: '6300', output_g: '6080', byproduct_g: '', units: '' },
    { date: '2026-10-07', input_g: '6080', output_g: '4302', byproduct_g: '1602', units: '' },
    { date: '2026-10-10', input_g: '1013', output_g: '1518', byproduct_g: '', units: '' },
    { date: '2026-10-10', input_g: '240', output_g: '240', byproduct_g: '', units: '4' },
    { date: '2026-10-10', input_g: '240', output_g: '240', byproduct_g: '', units: '4' }
  ];
  BP_V1_HEADER_FIELDS.forEach(function(field) {
    header[field] = normalizeTextV1(header[field]);
  });
  header.steps = facts.map(function(fact, index) {
    return {
      n: String(index + 1),
      step: stepCodeV1(index + 1),
      date: fact.date,
      input_g: fact.input_g,
      output_g: fact.output_g,
      byproduct_g: fact.byproduct_g,
      units: fact.units,
      profile: ''
    };
  });
  return header;
}

function prepareMpbAnchorsV1() {
  const record = buildMpbRecordV1();
  const anchors = record.steps.map(function(step) {
    const prepared = prepareAnchorV1(record, Number(step.n));
    return {
      lot: record.lot,
      step: step.n,
      canonical: prepared.canonical,
      sha256: prepared.sha256,
      memo: prepared.memo
    };
  });
  anchors.forEach(function(anchor) {
    console.log('Step ' + anchor.step + '\nMemo\n' + anchor.memo +
      '\nCanonical\n' + anchor.canonical);
  });
  return anchors;
}
