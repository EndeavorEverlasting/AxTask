"""End-to-end pipeline tests: factories → normalize → reconcile → allocate → export.

Each parameterized seed exercises a different randomized combination of
people, dates, categories, and attendance patterns through the full pipeline.
"""
import random
from datetime import date

import pandas as pd
import pytest

from billing_bridge.normalize import (
    apply_alias_map,
    normalize_sites,
    normalize_task_categories,
)
from billing_bridge.reconcile import build_day_summary
from billing_bridge.allocate import allocate_hours, map_outward_assignments
from billing_bridge.export_manager import MANAGER_COLUMNS, build_manager_rows
from billing_bridge.reporting import build_change_summary, build_exception_report

from fixtures.task_tracker.factory import make_task_evidence
from fixtures.roster.factory import make_attendance
from fixtures.config.factory import make_alias_map, make_outward_map, make_site_map


SHARED_PERSONS = [
    "Rich Perez", "Chris Cummings", "Khalida Abdul-Rahman",
    "Emmanuel Sanchez", "Julio Mojica",
]


def _run_pipeline(seed: int):
    """Run the full billing bridge pipeline with a given seed and return key outputs."""
    rng = random.Random(seed)
    n_evidence = rng.randint(10, 50)
    n_attendance = rng.randint(10, 50)

    evidence = make_task_evidence(
        n=n_evidence, persons=SHARED_PERSONS, seed=seed,
        start_date=date(2026, 3, 1), end_date=date(2026, 3, 31),
    )
    attendance = make_attendance(
        n=n_attendance, persons=SHARED_PERSONS, seed=seed + 1000,
        start_date=date(2026, 3, 1), end_date=date(2026, 3, 31),
    )
    aliases = make_alias_map(persons=SHARED_PERSONS, seed=seed)
    outward_map = make_outward_map(seed=seed)
    site_map = make_site_map(seed=seed)

    # Normalize
    evidence = apply_alias_map(evidence, "canonical_name", aliases)
    evidence = normalize_task_categories(evidence, "task_category")
    evidence = normalize_sites(evidence, "site", site_map)
    evidence["task_category"] = evidence["internal_task_category"]

    attendance = apply_alias_map(attendance, "canonical_name", aliases)

    # Reconcile
    day_summary, base_exceptions = build_day_summary(
        attendance=attendance[["work_date", "canonical_name", "clock_in", "clock_out", "attendance_hours"]],
        task_evidence=evidence[["work_date", "canonical_name", "task_category", "notes"]],
    )

    # Allocate
    day_summary = map_outward_assignments(day_summary, outward_map)
    allocations, alloc_exceptions = allocate_hours(day_summary)

    # Export
    if not allocations.empty:
        manager_rows = build_manager_rows(allocations)
    else:
        manager_rows = pd.DataFrame(columns=MANAGER_COLUMNS)

    all_exceptions = pd.concat([base_exceptions, alloc_exceptions], ignore_index=True)
    exception_report = build_exception_report(all_exceptions) if not all_exceptions.empty else pd.DataFrame()
    summary = build_change_summary(allocations)

    return {
        "n_evidence": n_evidence,
        "n_attendance": n_attendance,
        "day_summary": day_summary,
        "allocations": allocations,
        "alloc_exceptions": alloc_exceptions,
        "manager_rows": manager_rows,
        "exception_report": exception_report,
        "summary": summary,
    }


class TestEndToEndPipeline:
    @pytest.mark.parametrize("seed", range(20))
    def test_no_rows_lost_in_allocation(self, seed):
        result = _run_pipeline(seed)
        total = len(result["allocations"]) + len(result["alloc_exceptions"])
        assert total == len(result["day_summary"])

    @pytest.mark.parametrize("seed", range(20))
    def test_manager_rows_match_allocations(self, seed):
        result = _run_pipeline(seed)
        assert len(result["manager_rows"]) == len(result["allocations"])

    @pytest.mark.parametrize("seed", range(20))
    def test_summary_row_count_matches(self, seed):
        result = _run_pipeline(seed)
        metrics = result["summary"].set_index("metric")
        assert metrics.loc["allocated_rows", "value"] == len(result["allocations"])

    @pytest.mark.parametrize("seed", range(10))
    def test_manager_columns_spec(self, seed):
        result = _run_pipeline(seed)
        if not result["manager_rows"].empty:
            assert list(result["manager_rows"].columns) == MANAGER_COLUMNS

    @pytest.mark.parametrize("seed", range(10))
    def test_allocated_hours_are_non_negative(self, seed):
        result = _run_pipeline(seed)
        if not result["allocations"].empty:
            assert (result["allocations"]["allocated_hours"] >= 0).all()

    @pytest.mark.parametrize("seed", range(5))
    def test_exception_report_has_actions(self, seed):
        result = _run_pipeline(seed)
        if not result["exception_report"].empty:
            assert "review_action" in result["exception_report"].columns
            assert result["exception_report"]["review_action"].notna().all()

