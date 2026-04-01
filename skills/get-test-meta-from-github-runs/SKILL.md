---
name: get-test-meta-from-github-runs
description: Collects test duration metadata from GitHub Actions runs and merges it into test-durations.json for smart test sharding. Use this when you need to gather historical test durations from CI runs to improve test distribution across shards.
---

# Get Test Meta From GitHub Runs

This skill collects Allure test results from the last **3 successful** GitHub Actions workflow runs and merges them into a `test-durations.json` file for smart sharding.

## When to Use This Skill

- User asks to "collect test durations from CI" or "get test metadata from GitHub runs"
- You need to build historical test duration data for smart test sharding
- User mentions updating `test-durations.json` from past runs
- Before running smart sharding and you need historical duration data

## Prerequisites

1. **GitHub CLI (`gh`)** - Must be authenticated and have repo access
2. **Node.js** - For running `smart-shard.ts`
3. **Allure results** - Workflow must upload `allure-results-*` artifacts
4. **`smart-shard.ts`** - The merging script in the repo

## Workflow

### Step 1: Identify the Last 3 Successful Runs

Find the last 3 successful runs from the workflow:

```bash
gh run list --workflow ci.yml --json number,databaseId,conclusion --limit 5
```

Filter for runs with `status: completed` and `conclusion: success`. Take only the last 3.

### Step 2: Get Artifact List

For each run, list available artifacts:

```bash
gh api "repos/{owner}/{repo}/actions/runs/{run_id}/artifacts" --jq '.artifacts[] | {name, id}'
```

Look for `allure-results-*` artifacts (one per shard).

### Step 3: Download Allure Results

Download all shards' allure results for each run:

```bash
gh run download {run_id} -n "allure-results-1" -n "allure-results-2" ... -n "allure-results-10" -D /tmp/allure-run{N}
```

### Step 4: Flatten Directory Structure

The merge script expects all `*-result.json` files in one directory:

```bash
mkdir -p /tmp/allure-run{N}-flat
cp /tmp/allure-run{N}/allure-results-*/*-result.json /tmp/allure-run{N}-flat/
```

### Step 5: Merge Durations

Run the merge script for each run:

```bash
npx tsx smart-shard.ts --merge --artifact=test-durations.json --allureDir=/tmp/allure-run{N}-flat
```

## Complete Example

Collect durations from the last 3 successful runs:

```bash
# Get run IDs for last 3 successful runs
gh run list --workflow ci.yml --json number,databaseId,conclusion --limit 5
# Filter: take runs with conclusion="success", last 3

# Example: Download and merge run #X (replace with actual run IDs)
RUN_ID=23836301810
mkdir -p /tmp/allure-run
gh run download $RUN_ID -n "allure-results-1" -n "allure-results-2" -n "allure-results-3" -n "allure-results-4" -n "allure-results-5" -n "allure-results-6" -n "allure-results-7" -n "allure-results-8" -n "allure-results-9" -n "allure-results-10" -D /tmp/allure-run
mkdir -p /tmp/allure-run-flat && cp /tmp/allure-run/allure-results-*/*-result.json /tmp/allure-run-flat/
npx tsx smart-shard.ts --merge --artifact=test-durations.json --allureDir=/tmp/allure-run-flat

# Repeat for 2 more runs (total 3)
```

## Important Rules

- **Never collect more than 3 runs** - Always use only the last 3 successful runs
- **runCount must never exceed 3** - The smart-shard.ts script keeps a sliding window, but you should only add new runs when needed
- If current runCount is 3, collect only the latest run to replace the oldest

## Expected Output

After merging, `test-durations.json` should have:

```json
{
  "runCount": 3,
  "runs": [
    { "timestamp": "...", "durations": { "tests/features/feature-01.spec.ts::test-0001": 12345, ... } },
    { "timestamp": "...", "durations": { ... } },
    { "timestamp": "...", "durations": { ... } }
  ]
}
```

Each run should have 500 test duration entries (for 50 features × 10 tests).

## Notes

- The `smart-shard.ts` script uses only the last 3 runs for smart sharding calculations
- If runCount ≤ 1, smart sharding will fall back to default Playwright sharding
- Effective durations are averaged across all available runs
- **Always keep exactly 3 runs** - Never exceed 3 runs in the artifact