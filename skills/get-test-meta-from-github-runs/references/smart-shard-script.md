# smart-shard.ts Reference

## Usage

```bash
npx tsx smart-shard.ts <command> [options]
```

## Commands

### --merge

Merges test durations from Allure results into the artifact file.

```bash
npx tsx smart-shard.ts --merge --artifact=test-durations.json --allureDir=allure-results
```

**Options:**
- `--artifact` ( `-a` ): Path to the artifact JSON file (default: `test-durations.json`)
- `--allureDir`: Directory containing Allure result JSON files (default: `allure-results`)

**Behavior:**
1. Reads existing artifact or creates new with `runCount: 0`
2. Parses all `*-result.json` files from `--allureDir`
3. For each result, extracts:
   - Test name from `name` field
   - Feature from `labels` where `name === 'package'`
   - Duration = `stop - start`
4. Creates key as `tests/features/{feature}.spec.ts::{testName}`
5. Increments `runCount` by 1
6. Adds new run entry with timestamp and durations
7. Keeps only last 4 runs (MAX_RUNS_TO_KEEP + 1)

### --gen-shards

Generates smart shard files based on historical durations.

```bash
npx tsx smart-shard.ts --gen-shards --artifact=test-durations.json --shards=10 --useGrep
```

**Options:**
- `--shards` ( `-s` ): Number of shards to generate (default: 10)
- `--artifact` ( `-a` ): Path to the artifact JSON file
- `--output` ( `-o` ): Output directory for shard files (default: `.`)
- `--useGrep` ( `-g` ): Output test names only (for Playwright `-g` flag)

**Behavior:**
1. Loads artifact, checks `runCount > 1` (otherwise uses default sharding)
2. Calculates effective durations (averaged across runs)
3. Discovers all tests from `tests/features/*.spec.ts`
4. Sorts tests by duration (descending)
5. Distributes tests across shards to minimize variance
6. Writes shard files (either full paths or grep patterns)

### --discover

Lists all available tests without generating shards.

```bash
npx tsx smart-shard.ts --discover
```

## Important Constants

- `DEFAULT_DURATION = 1000` - Fallback duration when no historical data
- `MAX_RUNS_TO_KEEP = 3` - Number of historical runs to preserve

## Key Interfaces

```typescript
interface TestDurationsArtifact {
  runCount: number;
  runs: Array<{
    timestamp: string;
    durations: Record<string, number>;
  }>;
}

interface AllureResult {
  name: string;
  start: number;
  stop: number;
  labels: Array<{ name: string; value: string }>;
}
```

## Error Handling

- If `--allureDir` doesn't exist: returns empty durations with warning
- If artifact file doesn't exist: creates new one with `runCount: 0`
- If no tests discovered for `--gen-shards`: exits with error
- If `runCount <= 1` for `--gen-shards`: exits with message to use default sharding