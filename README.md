# Smart Playwright Sharding

Deterministic, runtime-aware test sharding that balances execution time across shards using historical test duration data.

## Problem

Default Playwright sharding (`--shard=x/y`) distributes tests evenly by count, not by execution time. This leads to:
- Uneven shard durations
- Idle CI resources
- Slower feedback loops

## Solution

Smart sharding uses the **Longest Processing Time (LPT)** algorithm:

1. Sort tests by descending duration
2. Iteratively assign each test to the shard with the lowest total duration
3. Use deterministic secondary sort (by test ID) when durations are equal

## Requirements

- Node.js 18+
- Playwright test suite

## Quick Start

```bash
# Generate smart shards from artifact
npx tsx smart-shard.ts --gen-shards --artifact=test-durations.json --shards=10 --useGrep

# Run tests with generated shards
npx playwright test -g "$(cat shard-1.txt | tr '\n' '|')" --workers=10
```

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--gen-shards` | Generate shard files from artifact | false |
| `--merge` | Merge new durations from allure-results into artifact | false |
| `--discover` | Discover tests in test directory | false |
| `-s, --shards` | Number of shards | 10 |
| `-a, --artifact` | Path to test-durations artifact | test-durations.json |
| `-o, --output` | Output directory for shard files | . |
| `-g, --useGrep` | Use grep format (test names only) | false |
| `--allureDir` | Path to allure-results directory | allure-results |

## Artifact Format

The system stores duration data in `test-durations.json`:

```json
{
  "runCount": 6,
  "runs": [
    {
      "timestamp": "2026-04-01T05:09:49.760Z",
      "durations": {
        "tests/features/feature-01.spec.ts::test-0001": 102000
      }
    }
  ]
}
```

### Run Count Logic

| Run Count | Behavior |
|-----------|----------|
| 0 | Fallback to Playwright sharding (no data collection) |
| 1 | Fallback (insufficient for smart sharding) |
| 2-4 | Smart sharding using all available runs |
| >4 | Smart sharding using last 3 runs (sliding window) |

## GitHub Actions Integration

The workflow in `.github/workflows/ci.yml` provides:

1. **prepare job**: Checks run count, determines if smart sharding is possible
2. **test job**: Runs tests with either smart shards or default Playwright sharding
3. **update job**: Merges new duration data into artifact (only when smart sharding active)
4. **report job**: Generates Allure report

### Workflow Logic

```yaml
prepare:
  - Download test-durations artifact
  - Check runCount > 0
  - Output: use_smart (true/false)

test (10 parallel jobs):
  - If use_smart: generate shards, run with -g grep
  - If !use_smart: run with --shard=N/10

update (conditional):
  - Only runs if use_smart
  - Merge new durations into artifact
  - Commit and upload updated artifact
```

## Example Output

```
Shard 1: 4,204s (49 tests)
Shard 2: 4,201s (49 tests)
Shard 3: 4,203s (50 tests)
...
Total: 42,025s | Avg: 4,203s | Max variance: 0.1%
```

## Design Principles

- **Deterministic**: Same input always produces same output
- **No external dependencies**: Pure TypeScript implementation
- **Extensible**: Interfaces support future flakiness weighting, failure prioritization, ML-based prediction
- **Graceful fallback**: Default Playwright sharding when insufficient data

## Files

```
smart-shard.ts        # Main CLI tool
.github/workflows/ci.yml  # CI workflow
```

## License

ISC