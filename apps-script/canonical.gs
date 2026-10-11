const BP_V1_HEADER_FIELDS = Object.freeze([
  'lot', 'product', 'producer', 'municipality', 'state', 'origin_lot', 'purchase_date'
]);
const BP_V1_STEP_FIELDS = Object.freeze([
  'n', 'step', 'date', 'input_g', 'output_g', 'byproduct_g', 'units', 'profile'
]);
const BP_V1_STEP_CODES = Object.freeze([
  'roasting', 'winnowing', 'grinding', 'tempering_molding', 'packaging'
]);
const BP_V1_TIME_ZONE = 'America/Sao_Paulo';

function normalizeTextV1(value) {
  if (value === null || value === undefined) return '';
  requireStringV1_(value, 'Text');
  return value.trim().normalize('NFC');
}

function kilogramsToGramsV1(kilograms) {
  if (kilograms === null || kilograms === undefined ||
      (typeof kilograms === 'string' && kilograms.trim() === '')) return '';
  if (typeof kilograms !== 'number' && typeof kilograms !== 'string') {
    throw new TypeError('Weight must be a number or a decimal string in kilograms.');
  }
  if (typeof kilograms === 'string' && !/^\d+(?:\.\d+)?$/.test(kilograms.trim())) {
    throw new Error('Weight must be a nonnegative decimal without units or exponents.');
  }
  const numericValue = Number(kilograms);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error('Weight must be finite and nonnegative.');
  }
  const grams = Math.round(numericValue * 1000);
  if (!Number.isSafeInteger(grams)) {
    throw new Error('Weight exceeds the safe integer precision for grams.');
  }
  return String(grams);
}

function normalizeDateV1(value) {
  if (value === null || value === undefined || value === '') return '';
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('Date must be a valid spreadsheet Date cell, not a string.');
  }
  return Utilities.formatDate(value, BP_V1_TIME_ZONE, 'yyyy-MM-dd');
}

function stepCodeV1(stepNumber) {
  const number = Number(stepNumber);
  if ((typeof stepNumber !== 'number' && typeof stepNumber !== 'string') ||
      !Number.isInteger(number) || number < 1 || number > 5 ||
      (typeof stepNumber === 'string' && stepNumber !== String(number))) {
    throw new Error('Step number must be an integer from 1 to 5.');
  }
  return BP_V1_STEP_CODES[number - 1];
}

function canonicalV1(record, upTo) {
  const steps = selectStepsV1_(record, upTo);
  const headerValues = BP_V1_HEADER_FIELDS.map(function(field) {
    return requireStringV1_(record[field], 'record.' + field);
  });
  const stepValues = steps.map(function(step) {
    return BP_V1_STEP_FIELDS.map(function(field) {
      return requireStringV1_(step[field], 'steps[' + step.n + '].' + field);
    });
  });
  return JSON.stringify(['v1'].concat(headerValues, stepValues));
}

function sha256V1(canonicalText) {
  requireStringV1_(canonicalText, 'Canonical text');
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    canonicalText,
    Utilities.Charset.UTF_8
  );
  return bytes.map(function(byte) {
    return (byte & 0xff).toString(16).padStart(2, '0');
  }).join('');
}

function buildMemoV1(lot, step, hash) {
  requireAnchorStepV1_(step);
  requireStringV1_(lot, 'Lot');
  requireStringV1_(hash, 'SHA-256');
  const memo = 'v1|' + lot + '|' + step + '|' + hash;
  if (hash.length !== 64 || !/^v1\|[A-Za-z0-9-]{1,32}\|[1-5]\|[0-9a-f]{64}$/.test(memo)) {
    throw new Error('Memo must contain a valid lot, step and lowercase SHA-256.');
  }
  return memo;
}

function prepareAnchorV1(record, upTo) {
  const canonical = canonicalV1(record, upTo);
  const sha256 = sha256V1(canonical);
  return { canonical: canonical, sha256: sha256, memo: buildMemoV1(record.lot, upTo, sha256) };
}

function selectStepsV1_(record, upTo) {
  requireAnchorStepV1_(upTo);
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      !Array.isArray(record.steps)) {
    throw new TypeError('Record must be an object with a steps array.');
  }
  const steps = record.steps.filter(function(step) {
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new TypeError('Each step must be an object.');
    }
    return Number(step.n) <= upTo;
  }).sort(function(left, right) {
    return Number(left.n) - Number(right.n);
  });
  if (steps.length !== upTo ||
      steps.some(function(step, index) { return step.n !== String(index + 1); })) {
    throw new Error('Selected steps must be contiguous from 1 through ' + upTo + ', without duplicates.');
  }
  return steps;
}

function requireStringV1_(value, field) {
  if (typeof value !== 'string') {
    throw new TypeError(field + ' must be a string; an empty value is "".');
  }
  return value;
}

function requireAnchorStepV1_(upTo) {
  if (!Number.isInteger(upTo) || upTo < 1 || upTo > 5) {
    throw new Error('Anchor step must be an integer from 1 to 5.');
  }
}
