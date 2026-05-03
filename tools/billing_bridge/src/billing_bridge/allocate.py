from __future__ import annotations

import pandas as pd


def map_outward_assignments(day_summary: pd.DataFrame, outward_map: pd.DataFrame) -> pd.DataFrame:
    mapping = outward_map.copy()
    mapping = mapping.rename(
        columns={
            "internal_task_category": "resolved_category",
            "outward_project": "outward_project",
            "outward_assignment": "outward_assignment",
        }
    )
    out = day_summary.copy()

    def resolve_category(categories: object) -> str | None:
        if not isinstance(categories, list) or len(categories) == 0:
            return None
        return categories[0] if len(categories) == 1 else None

    out["resolved_category"] = out["distinct_categories"].map(resolve_category)
    out = out.merge(mapping, on="resolved_category", how="left")
    return out


def allocate_hours(day_summary: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    out = day_summary.copy()
    out["allocated_hours"] = 0.0
    out["allocation_rule"] = "exception"
    out["exception_flag"] = True

    single_supported = (
        out["exception_reason"].isna()
        & out["resolved_category"].notna()
        & out["attendance_hours"].notna()
        & out["outward_project"].notna()
        & out["outward_assignment"].notna()
    )

    out.loc[single_supported, "allocated_hours"] = out.loc[single_supported, "attendance_hours"]
    out.loc[single_supported, "allocation_rule"] = "direct_full_day"
    out.loc[single_supported, "exception_flag"] = False

    exceptions = out.loc[out["exception_flag"]].copy()
    allocations = out.loc[~out["exception_flag"]].copy()

    return allocations, exceptions
