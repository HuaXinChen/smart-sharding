# smart-sharding Repository Reference

## Workflow File

- **Path**: `.github/workflows/ci.yml`
- **Name**: "Playwright Tests with Smart Sharding"

## Test Configuration

- **Shards**: 10 parallel jobs
- **Test count**: ~500 tests (50 features × 10 tests each)
- **Artifact pattern**: `allure-results-{shard_number}` (e.g., allure-results-1, allure-results-2, ... allure-results-10)
- **Artifact retention**: 30 days

## Key Jobs

1. **prepare**: Downloads existing test-durations.json, checks run count
2. **test**: Runs Playwright tests on 10 shards
3. **update**: Merges new durations and updates artifact (only if smart sharding is used)
4. **report**: Generates Allure report and deploys to GitHub Pages

## Smart Sharding Logic

From `smart-shard.ts`:

- `MAX_RUNS_TO_KEEP = 3` - Only keeps last 3 runs
- If `runCount <= 1`, falls back to default Playwright sharding
- Effective durations = average across all available runs (or last 3 if >4 runs)

## Test Duration Artifact Format

```json
{
  "runCount": 3,
  "runs": [
    {
      "timestamp": "2026-04-01T06:05:48.348Z",
      "durations": {
        "tests/features/feature-01.spec.ts::test-0001": 12345,
        ...
      }
    }
  ]
}
```

## Example Run IDs

| Run # | Run ID       | Status    | Conclusion |
|-------|--------------|-----------|------------|
| 5     | 23830174766  | completed | success    |
| 4     | 23829463523  | completed | success    |
| 3     | 23815950830  | completed | success    |