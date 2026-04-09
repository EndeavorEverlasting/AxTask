from __future__ import annotations

from dataclasses import asdict
from typing import Iterable

import pandas as pd


def build_day_summary(
    attendance: pd.DataFrame,
    task_evidence: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Create one joined day-level summary and one exception table."""
    att = attendance.copy()
    tev = task_evidence.copy()

    att["join_key"] = att["canonical_name"].astype(str) + "|" + att["work_date"].astype(str)
    tev["join_key"] = tev["canonical_name"].astype(str) + "|" + tev["work_date"].astype(str)

    evidence_rollup = (
        tev.groupby("join_key", dropna=False)
        .agg(
            work_date=("work_date", "first"),
            canonical_name=("canonical_name", "first"),
            evidence_count=("task_category", "size"),
            distinct_categories=("task_category", lambda s: sorted(set(map(str, s)))),
            task_notes=("notes", lambda s: " | ".join(str(x) for x in s.dropna().tolist()[:5])),
        )
        .reset_index()
    )

    attendance_rollup = (
        att.groupby("join_key", dropna=False)
        .agg(
            work_date=("work_date", "first"),
            canonical_name=("canonical_name", "first"),
            attendance_hours=("attendance_hours", "sum"),
            clock_in=("clock_in", "min"),
            clock_out=("clock_out", "max"),
        )
        .reset_index()
    )

    merged = attendance_rollup.merge(
        evidence_rollup,
        on="join_key",
        how="outer",
        suffixes=("_attendance", "_evidence"),
    )

    merged["work_date"] = merged["work_date_attendance"].combine_first(merged["work_date_evidence"])
    merged["canonical_name"] = merged["canonical_name_attendance"].combine_first(
        merged["canonical_name_evidence"]
    )
    merged["has_attendance"] = merged["attendance_hours"].notna()
    merged["has_evidence"] = merged["evidence_count"].notna()
    merged["exception_reason"] = None

    merged.loc[merged["has_attendance"] & ~merged["has_evidence"], "exception_reason"] = (
        "attendance_without_task_evidence"
    )
    merged.loc[~merged["has_attendance"] & merged["has_evidence"], "exception_reason"] = (
        "task_evidence_without_attendance"
    )
    merged.loc[
        merged["distinct_categories"].map(lambda x: isinstance(x, list) and len(x) > 1),
        "exception_reason",
    ] = "multiple_categories_same_day"

    exceptions = merged.loc[merged["exception_reason"].notna()].copy()

    keep_cols = [
        "work_date",
        "canonical_name",
        "attendance_hours",
        "clock_in",
        "clock_out",
        "evidence_count",
        "distinct_categories",
        "task_notes",
        "exception_reason",
    ]
    return merged[keep_cols], exceptions[keep_cols]
