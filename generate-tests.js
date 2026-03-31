const fs = require('fs');
const path = require('path');

const TOTAL_TESTS = 500;
const NUM_FEATURES = 30;
const MIN_TESTS_PER_FEATURE = 10;
const MAX_TESTS_PER_FEATURE = 100;
const MIN_DURATION = 10;
const MAX_DURATION = 120;

function getDurationRange(featureNum) {
  if (featureNum <= 10) {
    return { min: 90, max: 120 };
  } else if (featureNum <= 20) {
    return { min: 50, max: 89 };
  } else {
    return { min: 10, max: 49 };
  }
}

const testsDir = path.join(__dirname, 'tests', 'features');
if (!fs.existsSync(testsDir)) {
  fs.mkdirSync(testsDir, { recursive: true });
}

const featureCounts = [];
let remainingTests = TOTAL_TESTS;

for (let i = 0; i < NUM_FEATURES; i++) {
  const isLastFeature = i === NUM_FEATURES - 1;
  const maxForThis = Math.min(MAX_TESTS_PER_FEATURE, remainingTests - (NUM_FEATURES - i - 1) * MIN_TESTS_PER_FEATURE);
  const minForThis = isLastFeature ? remainingTests : MIN_TESTS_PER_FEATURE;
  const count = Math.floor(Math.random() * (maxForThis - minForThis + 1)) + minForThis;
  featureCounts.push(count);
  remainingTests -= count;
}

featureCounts[NUM_FEATURES - 1] += remainingTests;

const testMetadata = [];
let globalTestId = 1;

for (let f = 0; f < NUM_FEATURES; f++) {
  const featureNum = f + 1;
  const featureName = `feature-${String(featureNum).padStart(2, '0')}`;
  const testCount = featureCounts[f];
  const tests = [];

  for (let t = 0; t < testCount; t++) {
    const testId = globalTestId++;
    const testName = `test-${String(testId).padStart(4, '0')}`;
    const range = getDurationRange(featureNum);
    const baseDuration = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;

    tests.push({
      id: testId,
      name: testName,
      baseDuration: baseDuration,
    });

    testMetadata.push({
      id: testId,
      feature: featureName,
      testName: testName,
      baseDuration: baseDuration,
    });
  }

  const testCases = tests.map(t => {
    return `test('test-${String(t.id).padStart(4, '0')}', async () => {
  await sleep(${t.baseDuration});
});`;
  }).join('\n');

  const specContent = `import { test, sleep } from '../utils';
${testCases}
`;

  const specPath = path.join(testsDir, `${featureName}.spec.ts`);
  fs.writeFileSync(specPath, specContent);
  console.log(`Created ${featureName}.spec.ts with ${testCount} tests`);
}

const metadataPath = path.join(__dirname, 'tests', 'test-metadata.json');
fs.writeFileSync(metadataPath, JSON.stringify(testMetadata, null, 2));
console.log(`\nTotal features: ${NUM_FEATURES}`);
console.log(`Total tests: ${testMetadata.length}`);
console.log(`Total base duration: ${testMetadata.reduce((a, b) => a + b.baseDuration, 0)} seconds`);
console.log(`Metadata saved to ${metadataPath}`);
