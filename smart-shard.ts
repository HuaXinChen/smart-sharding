import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';

interface TestMeta {
  id: string;
  feature: string;
  testName: string;
  duration: number;
}

interface Shard {
  id: number;
  tests: TestMeta[];
  totalDuration: number;
}

interface RunData {
  timestamp: string;
  durations: Record<string, number>;
}

interface TestDurationsArtifact {
  runCount: number;
  runs: RunData[];
}

interface AllureResult {
  name: string;
  start: number;
  stop: number;
  labels: Array<{ name: string; value: string }>;
}

const DEFAULT_DURATION = 1000;
const MAX_RUNS_TO_KEEP = 3;

function parseAllureResults(allureDir: string): Record<string, number> {
  const durations: Record<string, number> = {};
  
  if (!fs.existsSync(allureDir)) {
    console.warn(`Warning: Allure results directory not found: ${allureDir}`);
    return durations;
  }

  const files = fs.readdirSync(allureDir).filter(f => f.endsWith('-result.json'));
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(allureDir, file), 'utf-8');
    try {
      const result: AllureResult = JSON.parse(content);
      const actualDuration = result.stop - result.start;
      
      const featureLabel = result.labels.find(l => l.name === 'package');
      const featureRaw = featureLabel?.value ?? '';
      const feature = featureRaw.replace('features.', '').replace('.spec.ts', '');
      
      const testName = result.name;
      
      const key = `tests/features/${feature}.spec.ts::${testName}`;
      durations[key] = actualDuration;
    } catch (e) {
      console.warn(`Warning: Could not parse ${file}: ${e}`);
    }
  }

  return durations;
}

function getEffectiveDurations(artifact: TestDurationsArtifact): Map<string, number> {
  const effectiveDurations = new Map<string, number>();
  
  if (artifact.runCount <= 0) {
    return effectiveDurations;
  }

  const runsToUse = artifact.runCount <= 4 
    ? artifact.runs 
    : artifact.runs.slice(-MAX_RUNS_TO_KEEP);
  
  for (const run of runsToUse) {
    for (const [testId, duration] of Object.entries(run.durations)) {
      const existing = effectiveDurations.get(testId) ?? 0;
      const count = (effectiveDurations.get(`__count_${testId}`) ?? 0) + 1;
      effectiveDurations.set(testId, existing + duration);
      effectiveDurations.set(`__count_${testId}`, count);
    }
  }

  const result = new Map<string, number>();
  for (const [testId, value] of effectiveDurations.entries()) {
    if (testId.startsWith('__count_')) continue;
    const count = effectiveDurations.get(`__count_${testId}`) ?? 1;
    result.set(testId, Math.round(value / count));
  }

  return result;
}

function loadArtifact(artifactPath: string): TestDurationsArtifact {
  if (!fs.existsSync(artifactPath)) {
    return { runCount: 0, runs: [] };
  }
  return JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
}

function saveArtifact(artifactPath: string, artifact: TestDurationsArtifact): void {
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
}

function mergeDurations(artifactPath: string, allureDir: string): void {
  const artifact = loadArtifact(artifactPath);
  const newDurations = parseAllureResults(allureDir);
  
  console.log(`Found ${Object.keys(newDurations).length} test results from ${allureDir}`);
  
  artifact.runCount += 1;
  artifact.runs.push({
    timestamp: new Date().toISOString(),
    durations: newDurations,
  });

  if (artifact.runs.length > MAX_RUNS_TO_KEEP + 1) {
    artifact.runs = artifact.runs.slice(-(MAX_RUNS_TO_KEEP + 1));
  }

  saveArtifact(artifactPath, artifact);
  console.log(`Updated artifact: runCount = ${artifact.runCount}`);
}

function discoverTests(): TestMeta[] {
  const tests: TestMeta[] = [];
  const testDir = 'tests/features';
  
  if (!fs.existsSync(testDir)) {
    console.error(`Error: Test directory not found: ${testDir}`);
    return tests;
  }
  
  const files = fs.readdirSync(testDir).filter(f => f.endsWith('.spec.ts'));
  
  let idCounter = 1;
  for (const file of files) {
    const content = fs.readFileSync(path.join(testDir, file), 'utf-8');
    const feature = file.replace('.spec.ts', '');
    const testMatches = content.matchAll(/test\(['"]([^'"]+)['"]/g);
    
    for (const match of testMatches) {
      tests.push({
        id: idCounter.toString(),
        feature: feature,
        testName: match[1],
        duration: DEFAULT_DURATION,
      });
      idCounter++;
    }
  }
  
  return tests;
}

function mapArtifactToTests(durations: Map<string, number>): TestMeta[] {
  const tests = discoverTests();
  
  return tests.map(test => {
    const key = `tests/features/${test.feature}.spec.ts::${test.testName}`;
    const duration = durations.get(key);
    return {
      ...test,
      duration: duration ?? DEFAULT_DURATION,
    };
  });
}

function shardTests(tests: TestMeta[], numShards: number): Shard[] {
  const sortedTests = [...tests].sort((a, b) => {
    if (b.duration !== a.duration) {
      return b.duration - a.duration;
    }
    return a.id.localeCompare(b.id);
  });

  const shards: Shard[] = Array.from({ length: numShards }, (_, i) => ({
    id: i + 1,
    tests: [],
    totalDuration: 0,
  }));

  for (const test of sortedTests) {
    const minShard = shards.reduce((min, shard) =>
      shard.totalDuration < min.totalDuration ? shard : min
    );
    minShard.tests.push(test);
    minShard.totalDuration += test.duration;
  }

  return shards;
}

function writeShardFiles(shards: Shard[], outputDir: string, useGrep: boolean): void {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const shard of shards) {
    const filePath = path.join(outputDir, `shard-${shard.id}.txt`);
    let lines: string[];
    if (useGrep) {
      lines = shard.tests.map((test) => test.testName);
    } else {
      lines = shard.tests.map(
        (test) => `tests/features/${test.feature}.spec.ts::${test.testName}`
      );
    }
    fs.writeFileSync(filePath, lines.join('\n') + '\n');
  }
}

function logShardSummary(shards: Shard[]): void {
  for (const shard of shards) {
    const seconds = (shard.totalDuration / 1000).toLocaleString();
    const count = shard.tests.length;
    console.log(`Shard ${shard.id}: ${seconds}s (${count} tests)`);
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      shards: { type: 'string', short: 's' },
      artifact: { type: 'string', short: 'a', default: 'test-durations.json' },
      output: { type: 'string', short: 'o', default: '.' },
      useGrep: { type: 'boolean', short: 'g', default: false },
      merge: { type: 'boolean', default: false },
      'gen-shards': { type: 'boolean', default: false },
      allureDir: { type: 'string', default: 'allure-results' },
      discover: { type: 'boolean', default: false },
    },
  });

  const numShards = parseInt(values.shards ?? '10', 10);
  const artifactPath = values.artifact ?? 'test-durations.json';
  const outputDir = values.output ?? '.';
  const useGrep = values.useGrep ?? false;
  const doMerge = values.merge ?? false;
  const doGenShards = values['gen-shards'] ?? false;
  const doDiscover = values.discover ?? false;
  const allureDir = values.allureDir ?? 'allure-results';

  if (doMerge) {
    mergeDurations(artifactPath, allureDir);
    return;
  }

  if (doDiscover) {
    const tests = discoverTests();
    console.log(`Discovered ${tests.length} tests`);
    return;
  }

  if (doGenShards) {
    const artifact = loadArtifact(artifactPath);
    console.log(`Run count: ${artifact.runCount}`);
    
    if (artifact.runCount <= 1) {
      console.log('Not enough runs for smart sharding (need > 1). Using default Playwright sharding.');
      process.exit(0);
    }

    const effectiveDurations = getEffectiveDurations(artifact);
    const runsUsed = artifact.runCount <= 4 ? artifact.runCount : MAX_RUNS_TO_KEEP;
    console.log(`Using ${runsUsed} runs for duration calculation`);
    
    const tests = mapArtifactToTests(effectiveDurations);
    
    if (tests.length === 0) {
      console.error('Error: No tests discovered');
      process.exit(1);
    }

    const shards = shardTests(tests, numShards);
    writeShardFiles(shards, outputDir, useGrep);
    logShardSummary(shards);

    const totalDuration = shards.reduce((sum, s) => sum + s.totalDuration, 0);
    const avgDuration = totalDuration / numShards;
    const maxDiff = Math.max(...shards.map(s => Math.abs(s.totalDuration - avgDuration)));
    const variance = maxDiff / avgDuration * 100;

      const totalSec = (totalDuration / 1000).toLocaleString();
    const avgSec = Math.round(avgDuration / 1000).toLocaleString();
    console.log(`\nTotal: ${totalSec}s | Avg: ${avgSec}s | Max variance: ${variance.toFixed(1)}%`);
    return;
  }

  console.error('Error: Must specify --merge or --gen-shards');
  console.error('Usage:');
  console.error('  npx tsx smart-shard.ts --gen-shards --artifact=test-durations.json --shards=10 --useGrep');
  console.error('  npx tsx smart-shard.ts --merge --artifact=test-durations.json --allureDir=allure-results');
  console.error('  npx tsx smart-shard.ts --discover');
  process.exit(1);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});