const BP_TEST_VECTOR_V1 = {
  "spec": "canonical-record-v1",
  "cases": [
    {
      "name": "TEST-0001 up to step 1",
      "record": {
        "lot": "TEST-0001",
        "product": "Test Bar 70",
        "producer": "TST-01",
        "municipality": "Testville",
        "state": "BA",
        "origin_lot": "",
        "purchase_date": "2026-07-15",
        "steps": [
          {
            "n": "1",
            "step": "roasting",
            "date": "2026-10-01",
            "input_g": "1000",
            "output_g": "965",
            "byproduct_g": "",
            "units": "",
            "profile": ""
          },
          {
            "n": "2",
            "step": "winnowing",
            "date": "2026-10-02",
            "input_g": "965",
            "output_g": "700",
            "byproduct_g": "250",
            "units": "",
            "profile": ""
          }
        ]
      },
      "upTo": 1,
      "canonical": "[\"v1\",\"TEST-0001\",\"Test Bar 70\",\"TST-01\",\"Testville\",\"BA\",\"\",\"2026-07-15\",[\"1\",\"roasting\",\"2026-10-01\",\"1000\",\"965\",\"\",\"\",\"\"]]",
      "sha256": "7c63092d2e44d3b53ccc7e8b5f2b4cc7e1f53996fc7bf1514d7a8ba332c52055",
      "memo": "v1|TEST-0001|1|7c63092d2e44d3b53ccc7e8b5f2b4cc7e1f53996fc7bf1514d7a8ba332c52055"
    },
    {
      "name": "TEST-0001 up to step 2",
      "record": {
        "lot": "TEST-0001",
        "product": "Test Bar 70",
        "producer": "TST-01",
        "municipality": "Testville",
        "state": "BA",
        "origin_lot": "",
        "purchase_date": "2026-07-15",
        "steps": [
          {
            "n": "1",
            "step": "roasting",
            "date": "2026-10-01",
            "input_g": "1000",
            "output_g": "965",
            "byproduct_g": "",
            "units": "",
            "profile": ""
          },
          {
            "n": "2",
            "step": "winnowing",
            "date": "2026-10-02",
            "input_g": "965",
            "output_g": "700",
            "byproduct_g": "250",
            "units": "",
            "profile": ""
          }
        ]
      },
      "upTo": 2,
      "canonical": "[\"v1\",\"TEST-0001\",\"Test Bar 70\",\"TST-01\",\"Testville\",\"BA\",\"\",\"2026-07-15\",[\"1\",\"roasting\",\"2026-10-01\",\"1000\",\"965\",\"\",\"\",\"\"],[\"2\",\"winnowing\",\"2026-10-02\",\"965\",\"700\",\"250\",\"\",\"\"]]",
      "sha256": "3c7a84598116994a8cba9fc890b86329b2b788f29721c0854c08eceddea281b2",
      "memo": "v1|TEST-0001|2|3c7a84598116994a8cba9fc890b86329b2b788f29721c0854c08eceddea281b2"
    },
    {
      "name": "TEST-0002 accents and empty values",
      "record": {
        "lot": "TEST-0002",
        "product": "Maracujá",
        "producer": "Sítio São João",
        "municipality": "Ilhéus",
        "state": "BA",
        "origin_lot": "",
        "purchase_date": "",
        "steps": [
          {
            "n": "1",
            "step": "roasting",
            "date": "2026-10-01",
            "input_g": "1000",
            "output_g": "",
            "byproduct_g": "",
            "units": "",
            "profile": ""
          }
        ]
      },
      "upTo": 1,
      "canonical": "[\"v1\",\"TEST-0002\",\"Maracujá\",\"Sítio São João\",\"Ilhéus\",\"BA\",\"\",\"\",[\"1\",\"roasting\",\"2026-10-01\",\"1000\",\"\",\"\",\"\",\"\"]]",
      "sha256": "d407a0b5f16bbccb36ee2b55f6eda58c5fe3fdc4a9d1562a3bed135fb293652d",
      "memo": "v1|TEST-0002|1|d407a0b5f16bbccb36ee2b55f6eda58c5fe3fdc4a9d1562a3bed135fb293652d"
    }
  ],
  "normalization": [
    {
      "kind": "grams",
      "input": 6.08,
      "expected": "6080"
    },
    {
      "kind": "grams",
      "input": 4.302,
      "expected": "4302"
    },
    {
      "kind": "grams",
      "input": "",
      "expected": ""
    },
    {
      "kind": "text",
      "input": " Ibirapitanga ",
      "expected": "Ibirapitanga"
    },
    {
      "kind": "text",
      "input": "Riachões",
      "expected": "Riachões"
    },
    {
      "kind": "date",
      "input": "2026-10-07T02:30:00Z",
      "expected": "2026-10-06"
    },
    {
      "kind": "date",
      "input": "07/10/2026",
      "expected": "error"
    }
  ]
};

function testVectorV1() {
  let checks = 0;
  const results = BP_TEST_VECTOR_V1.cases.map(function(testCase) {
    const result = prepareAnchorV1(testCase.record, testCase.upTo);
    assertEqualV1_(result.canonical, testCase.canonical, testCase.name + ': canonical JSON');
    assertEqualV1_(result.sha256, testCase.sha256, testCase.name + ': SHA-256');
    assertEqualV1_(result.memo, testCase.memo, testCase.name + ': memo');
    checks += 3;
    return { name: testCase.name, sha256: result.sha256, memo: result.memo };
  });
  BP_TEST_VECTOR_V1.normalization.forEach(function(testCase, index) {
    const run = function() {
      if (testCase.kind === 'grams') return kilogramsToGramsV1(testCase.input);
      if (testCase.kind === 'text') return normalizeTextV1(testCase.input);
      if (testCase.kind === 'date') {
        const input = /^\d{4}-\d{2}-\d{2}T/.test(testCase.input) ?
          new Date(testCase.input) : testCase.input;
        return normalizeDateV1(input);
      }
      throw new Error('Unknown test kind: ' + testCase.kind);
    };
    if (testCase.expected === 'error') {
      let threw = false;
      try { run(); } catch (error) { threw = true; }
      if (!threw) throw new Error('Normalization ' + index + ': expected an error.');
    } else {
      assertEqualV1_(run(), testCase.expected, 'Normalization ' + index);
    }
    checks++;
  });
  const summary = {
    passed: true,
    cases: results.length,
    normalizations: BP_TEST_VECTOR_V1.normalization.length,
    checks: checks,
    results: results
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

function demonstrateTamperingV1() {
  const record = JSON.parse(JSON.stringify(BP_TEST_VECTOR_V1.cases[1].record));
  const before = [prepareAnchorV1(record, 1), prepareAnchorV1(record, 2)];
  record.steps[0].output_g = '966';
  const after = [prepareAnchorV1(record, 1), prepareAnchorV1(record, 2)];
  const results = before.map(function(anchor, index) {
    if (anchor.sha256 === after[index].sha256) {
      throw new Error('The change must affect the hash of step ' + (index + 1));
    }
    return { step: index + 1, before: anchor.sha256, after: after[index].sha256 };
  });
  console.log(JSON.stringify(results, null, 2));
  return results;
}

function assertEqualV1_(actual, expected, context) {
  if (actual !== expected) {
    throw new Error(context + '\nExpected: ' + expected + '\nActual: ' + actual);
  }
}
