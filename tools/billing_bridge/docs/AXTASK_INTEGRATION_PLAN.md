# AxTask Integration Plan

## Recommendation

Do **not** build a second full app.
Keep AxTask as the app and add this as a worker-oriented companion under `tools/billing_bridge/python`.

## Near-term integration points

1. Reuse AxTask import/export page to upload billing inputs.
2. Save raw files under AxTask-managed storage or local workspace folder.
3. Invoke the Python worker from a small Node wrapper.
4. Persist:
   - normalized day-level allocations
   - exceptions
   - export snapshots
5. Surface results in AxTask as:
   - Exceptions dashboard
   - Monthly close checklist
   - Bonita export download

## Thin Node wrapper idea

- Route: `POST /api/billing-bridge/run`
- Server launches:
  - `python -m billing_bridge.cli audit ...`
- AxTask then reads:
  - `outputs/allocations.csv`
  - `outputs/exceptions.csv`
  - `outputs/manager_export_preview.csv`

## Why this split is sane

- Python wins at workbook ETL.
- AxTask already wins at auth, UI, docs, storage, and workflows.
- This avoids cloning config, auth, and product logic into a second stack.
