from __future__ import annotations

from pathlib import Path
import pandas as pd


def build_exception_report(exceptions: pd.DataFrame) -> pd.DataFrame:
    out = exceptions.copy()
    out["review_action"] = out["exception_reason"].map(
        {
            "attendance_without_task_evidence": "Find task evidence or hold row",
            "task_evidence_without_attendance": "Verify punch support before billing",
            "multiple_categories_same_day": "Review split rule before allocation",
        }
    ).fillna("Manual review")
    return out


def build_change_summary(allocations: pd.DataFrame) -> pd.DataFrame:
    if allocations.empty:
        return pd.DataFrame(
            [
                {"metric": "allocated_rows", "value": 0},
                {"metric": "total_allocated_hours", "value": 0.0},
                {"metric": "unique_techs", "value": 0},
                {"metric": "unique_assignments", "value": 0},
            ]
        )

    return pd.DataFrame(
        [
            {"metric": "allocated_rows", "value": len(allocations)},
            {"metric": "total_allocated_hours", "value": float(allocations["allocated_hours"].sum())},
            {"metric": "unique_techs", "value": int(allocations["canonical_name"].nunique())},
            {"metric": "unique_assignments", "value": int(allocations["outward_assignment"].nunique())},
        ]
    )
