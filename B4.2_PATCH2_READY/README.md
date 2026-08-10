# RabTradebot — B4.2 Patch 2

Built from the exact `B4.2_PATCH2_SOURCE.zip` snapshot supplied after commit `dd17e64`.

## What this patch does

- Routes **live Spot entry and exit market execution** through:
  `PositionCommand -> ExecutionRouter -> SpotExecutionBroker`.
- Adds a production `spotOnlyExecutionRouter` whose Futures slot is deliberately parked/fail-closed.
- Preserves the Patch-1 hard guard that rejects Spot `SELL` as an entry.
- Persists `product: "SPOT"` and explicit position/execution metadata on new live entries.
- Legacy live trades without product metadata still resolve to Spot through the existing migration adapter.
- A persisted Futures trade fails closed before Spot protective-order cancellation or execution.
- Tightens Spot fill semantics:
  - only a full `FILLED` quantity is treated as reconciled;
  - `PARTIALLY_FILLED`, unknown, or short execution stays `requiresReconciliation=true`.
- If an exit is accepted but still needs reconciliation, the local trade is put in
  `LIVE_EXIT_PENDING_RECONCILIATION` instead of incorrectly marking it `CLOSED`.

## Files changed

Modified:
- `src/services/realTradingEngine.ts`
- `src/services/execution/spotExecutionBroker.ts`
- `tests/fase1-live-engine.test.ts`

New:
- `src/services/execution/spotOnlyExecutionRouter.ts`
- `tests/realTradingEngine.b4-2-router.test.ts`
- `tests/spotExecutionBroker.b4-2-reconciliation.test.ts`

## Safety mechanism

The installer checks SHA-256 hashes of the exact source files from your uploaded snapshot.
If your local source differs, it exits **before writing anything**.

## Apply

Extract the ZIP so this folder exists under the repo root:

```text
RabTradebot/
  B4.2_PATCH2_READY/
    apply_B4.2_PATCH2.cjs
    payload/
```

From `RabTradebot` root:

```powershell
node .\B4.2_PATCH2_READY\apply_B4.2_PATCH2.cjs --check
```

Only if preflight PASS:

```powershell
node .\B4.2_PATCH2_READY\apply_B4.2_PATCH2.cjs --apply
```

Then:

```powershell
git diff --check
git status
```

Focused gate:

```powershell
npx jest --runInBand tests/executionRouter.phase-b4.test.ts tests/b4-2-safety.test.ts tests/spotExecutionBroker.b4-2-reconciliation.test.ts tests/realTradingEngine.b4-2-router.test.ts tests/fase1-live-engine.test.ts
```

Build:

```powershell
npm run build
```

Full regression:

```powershell
npx jest --runInBand
```

## Expected test-count direction

Before Patch 2 your confirmed checkpoint was 47 suites / 620 tests.
This package adds two test suites and seven tests, so **49 suites / 627 tests is the expected count if no other tests changed**.
Treat the terminal output as the source of truth; do not force counts.

## Do not commit yet

Do not commit/deploy until:
- focused tests PASS,
- TypeScript build PASS,
- full regression PASS,
- diff is limited to intended files.

## After Patch 2

The next B4 sub-milestone should be a dedicated reconciliation/recovery path for
`LIVE_EXIT_PENDING_RECONCILIATION` and entry metadata with `requiresReconciliation=true`
before moving on to MD4.3 acceptance and NI0 continuous news collection.
