---
name: get-test-meta-from-github-runs
description: Collects test duration metadata from GitHub Actions runs and merges it into test-durations.json for smart test sharding. Use this when you need to gather historical test durations from CI runs to improve test distribution across shards.
---

# Get Test Meta From GitHub Runs

This skill collects Allure test results from the last N successful GitHub Actions workflow runs and merges them into a `test-durations.json` file for smart sharding.

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

### Step 1: Identify the Workflow and Runs

Find the last N successful runs from the workflow:

```bash
gh run list --workflow ci.yml --json name,number,status,conclusion --limit 10
```

Filter for runs with `status: completed` and `conclusion: success`.

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

Collect durations from last 3 runs:

```bash
# Find last 3 successful runs
gh run list --workflow ci.yml --json number,status,conclusion | jq '.[] | select(.status == "completed" and .conclusion == "success") | .number' | head -3

# Download and merge run #5
mkdir -p /tmp/allure-run5
gh run download 12345678901 -n "allure-results-1" -n "allure-results-2" ... -n "allure-results-10" -D /tmp/allure-run5
mkdir -p /tmp/allure-run5-flat && cp /tmp/allure-run5/allure-results-*/*-result.json /tmp/allure-run5-flat/
npx tsx smart-shard.ts --merge --artifact=test-durations.json --allureDir=/tmp/allure-run5-flat

# Repeat for runs #4 and #3
```

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

- The `smart-shard.ts` script keeps only the last 4 runs (MAX_RUNS_TO_KEEP + 1)
- If runCount ≤ 1, smart sharding will fall back to default Playwright sharding
- Effective durations are averaged across all available runs