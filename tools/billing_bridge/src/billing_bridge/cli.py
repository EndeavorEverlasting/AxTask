from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from .allocate import allocate_hours, map_outward_assignments
from .export_manager import build_manager_rows, replace_month_sheet
from .io_excel import add_lineage, load_workbook_sheets, write_csv_bundle, write_excel
from .normalize import apply_alias_map, normalize_date, normalize_name, normalize_sites, normalize_task_categories
from .reporting import build_change_summary, build_exception_report
from .reconcile import build_day_summary


def _read_config_table(path: str | Path) -> pd.DataFrame:
    return pd.read_csv(path)


def _extract_attendance(roster_sheets: dict[str, pd.DataFrame]) -> pd.DataFrame:
    # TODO: tighten this to your real roster/billing sheet names.
    frames = []
    for sheet_name, frame in roster_sheets.items():
        cols = {str(c).strip().lower(): c for c in frame.columns}
        if "tech" in cols and "total" in cols:
            out = pd.DataFrame(
                {
                    "work_date": frame.get(cols.get("date")),
                    "canonical_name": frame.get(cols.get("tech")),
                    "clock_in": frame.get(cols.get("start")),
                    "clock_out": frame.get(cols.get("end")),
                    "attendance_hours": frame.get(cols.get("total")),
                }
            )
            out = add_lineage(out, "roster", sheet_name)
            out["source_row_id"] = out["__workbook__"] + ":" + out["__sheet__"] + ":" + out["__source_row__"].astype(str)
            frames.append(out)

    if not frames:
        return pd.DataFrame(columns=["work_date", "canonical_name", "clock_in", "clock_out", "attendance_hours", "source_row_id"])
    attendance = pd.concat(frames, ignore_index=True)
    attendance["work_date"] = attendance["work_date"].map(normalize_date)
    attendance["canonical_name"] = attendance["canonical_name"].map(normalize_name)
    attendance["attendance_hours"] = pd.to_numeric(attendance["attendance_hours"], errors="coerce")
    return attendance


def _extract_task_evidence(task_sheets: dict[str, pd.DataFrame]) -> pd.DataFrame:
    frames = []
    for sheet_name, frame in task_sheets.items():
        lower = {str(c).strip().lower(): c for c in frame.columns}
        if "person" in lower and ("date" in lower or "event date" in lower):
            date_col = lower.get("event date") or lower.get("date")
            task_col = lower.get("task category") or lower.get("primary workstream") or lower.get("event type")
            notes_col = lower.get("notes") or lower.get("method / detail") or lower.get("detail") or lower.get("description")
            site_col = lower.get("site")
            out = pd.DataFrame(
                {
                    "work_date": frame.get(date_col),
                    "canonical_name": frame.get(lower.get("person")),
                    "site": frame.get(site_col) if site_col else None,
                    "task_category": frame.get(task_col) if task_col else None,
                    "notes": frame.get(notes_col) if notes_col else None,
                }
            )
            out = add_lineage(out, "task_tracker", sheet_name)
            out["source_row_id"] = out["__workbook__"] + ":" + out["__sheet__"] + ":" + out["__source_row__"].astype(str)
            frames.append(out)

    if not frames:
        return pd.DataFrame(columns=["work_date", "canonical_name", "site", "task_category", "notes", "source_row_id"])
    tasks = pd.concat(frames, ignore_index=True)
    tasks["work_date"] = tasks["work_date"].map(normalize_date)
    tasks["canonical_name"] = tasks["canonical_name"].map(normalize_name)
    return tasks


def run_audit(
    task_tracker: str,
    roster: str,
    manager: str,
    out: str,
    month: str,
    alias_map_path: str,
    outward_map_path: str,
    site_map_path: str,
) -> None:
    out_dir = Path(out)
    out_dir.mkdir(parents=True, exist_ok=True)

    task_sheets = load_workbook_sheets(task_tracker)
    roster_sheets = load_workbook_sheets(roster)

    aliases = _read_config_table(alias_map_path)
    outward_map = _read_config_table(outward_map_path)
    site_map = _read_config_table(site_map_path)

    attendance = _extract_attendance(roster_sheets)
    attendance = apply_alias_map(attendance, "canonical_name", aliases)

    tasks = _extract_task_evidence(task_sheets)
    tasks = apply_alias_map(tasks, "canonical_name", aliases)
    tasks = normalize_task_categories(tasks, "task_category")
    tasks = normalize_sites(tasks, "site", site_map)
    tasks["task_category"] = tasks["internal_task_category"]

    day_summary, base_exceptions = build_day_summary(
        attendance=attendance[["work_date", "canonical_name", "clock_in", "clock_out", "attendance_hours"]],
        task_evidence=tasks[["work_date", "canonical_name", "task_category", "notes"]],
    )
    day_summary = map_outward_assignments(day_summary, outward_map)
    allocations, alloc_exceptions = allocate_hours(day_summary)

    manager_rows = build_manager_rows(allocations)
    exception_report = build_exception_report(pd.concat([base_exceptions, alloc_exceptions], ignore_index=True).drop_duplicates())
    summary = build_change_summary(allocations)

    write_csv_bundle(
        out_dir,
        {
            "allocations": allocations,
            "manager_export_preview": manager_rows,
            "exceptions": exception_report,
            "summary": summary,
        },
    )
    write_excel(
        out_dir / "billing_bridge_audit.xlsx",
        {
            "Allocations": allocations,
            "Manager Export Preview": manager_rows,
            "Exceptions": exception_report,
            "Summary": summary,
        },
    )
    replace_month_sheet(manager, month, manager_rows, out_dir / "manager_workbook_candidate.xlsx")


def main() -> None:
    parser = argparse.ArgumentParser(description="AxTask billing bridge CLI")
    parser.add_argument("command", choices=["audit", "export-bonita"])
    parser.add_argument("--task-tracker", required=True)
    parser.add_argument("--roster", required=True)
    parser.add_argument("--manager", required=True)
    parser.add_argument("--month", default="Mar 26")
    parser.add_argument("--out", required=True)
    parser.add_argument("--alias-map", default="config/person_aliases.example.csv")
    parser.add_argument("--outward-map", default="config/outward_assignment_map.example.csv")
    parser.add_argument("--site-map", default="config/site_map.example.csv")
    args = parser.parse_args()

    run_audit(
        task_tracker=args.task_tracker,
        roster=args.roster,
        manager=args.manager,
        out=args.out,
        month=args.month,
        alias_map_path=args.alias_map,
        outward_map_path=args.outward_map,
        site_map_path=args.site_map,
    )


if __name__ == "__main__":
    main()
