"""Tests for billing_bridge.allocate — outward mapping and hour allocation."""
import random

import pandas as pd
import pytest

from billing_bridge.allocate import allocate_hours, map_outward_assignments
from fixtures.config.factory import make_outward_map
from fixtures.task_tracker.factory import TASK_CATEGORY_POOL


# ── Helpers ─────────────────────────────────────────────────────────────

def _day_summary_row(
    *,
    name: str = "Cyen Hines",
    date: str = "2026-03-24",
    hours: float | None = 8.0,
    categories: list[str] | None = None,
    exception_reason: str | None = None,
) -> dict:
    return {
        "work_date": date,
        "canonical_name": name,
        "attendance_hours": hours,
        "clock_in": "08:00",
        "clock_out": "16:00",
        "distinct_categories": categories or ["Deployment"],
        "exception_reason": exception_reason,
    }


def _default_outward_map() -> pd.DataFrame:
    return make_outward_map(seed=0)


# ── map_outward_assignments ─────────────────────────────────────────────

class TestMapOutwardAssignments:
    def test_single_category_maps(self):
        df = pd.DataFrame([_day_summary_row(categories=["Deployment"])])
        mapped = map_outward_assignments(df, _default_outward_map())
        assert mapped.iloc[0]["outward_project"] == "Northwell - Neurons"
        assert mapped.iloc[0]["outward_assignment"] == "Neuron Installation"

    def test_multi_category_no_resolve(self):
        df = pd.DataFrame([_day_summary_row(categories=["Deployment", "Troubleshooting"])])
        mapped = map_outward_assignments(df, _default_outward_map())
        assert pd.isna(mapped.iloc[0]["resolved_category"])

    def test_empty_category_list(self):
        row = _day_summary_row()
        row["distinct_categories"] = []  # bypass the `or` default
        df = pd.DataFrame([row])
        mapped = map_outward_assignments(df, _default_outward_map())
        assert pd.isna(mapped.iloc[0]["resolved_category"])

    @pytest.mark.parametrize("seed", range(5))
    def test_randomized_single_categories_all_map(self, seed):
        rng = random.Random(seed)
        cats = [rng.choice(TASK_CATEGORY_POOL) for _ in range(10)]
        rows = [_day_summary_row(name=f"Tech_{i}", categories=[c]) for i, c in enumerate(cats)]
        df = pd.DataFrame(rows)
        mapped = map_outward_assignments(df, _default_outward_map())
        assert mapped["resolved_category"].notna().all()


# ── allocate_hours ──────────────────────────────────────────────────────

class TestAllocateHours:
    def test_single_supported_category_allocates_full_day(self):
        df = pd.DataFrame([_day_summary_row()])
        outward = _default_outward_map()
        mapped = map_outward_assignments(df, outward)
        allocs, excepts = allocate_hours(mapped)
        assert len(allocs) == 1
        assert allocs.iloc[0]["allocated_hours"] == 8.0
        assert len(excepts) == 0

    def test_missing_attendance_hours_goes_to_exception(self):
        df = pd.DataFrame([_day_summary_row(hours=None)])
        mapped = map_outward_assignments(df, _default_outward_map())
        allocs, excepts = allocate_hours(mapped)
        assert len(allocs) == 0
        assert len(excepts) == 1

    def test_exception_reason_set_goes_to_exception(self):
        df = pd.DataFrame([_day_summary_row(exception_reason="attendance_without_task_evidence")])
        mapped = map_outward_assignments(df, _default_outward_map())
        allocs, excepts = allocate_hours(mapped)
        assert len(allocs) == 0
        assert len(excepts) == 1

    def test_multi_category_goes_to_exception(self):
        df = pd.DataFrame([_day_summary_row(categories=["Deployment", "Troubleshooting"])])
        mapped = map_outward_assignments(df, _default_outward_map())
        allocs, excepts = allocate_hours(mapped)
        assert len(allocs) == 0
        assert len(excepts) == 1

    def test_total_hours_preserved_across_allocation(self):
        rows = [_day_summary_row(name=f"Tech_{i}", hours=float(i + 5)) for i in range(5)]
        df = pd.DataFrame(rows)
        mapped = map_outward_assignments(df, _default_outward_map())
        allocs, excepts = allocate_hours(mapped)
        assert allocs["allocated_hours"].sum() == sum(float(i + 5) for i in range(5))

    @pytest.mark.parametrize("seed", range(10))
    def test_randomized_combos_partition_correctly(self, seed):
        """Every input row ends up in either allocations or exceptions — never lost."""
        rng = random.Random(seed)
        n = rng.randint(5, 30)
        rows = []
        for i in range(n):
            cats = [rng.choice(TASK_CATEGORY_POOL) for _ in range(rng.randint(0, 3))]
            hours = rng.choice([None, 6.0, 7.5, 8.0, 9.0])
            exc = rng.choice([None, None, None, "some_exception"])
            rows.append(_day_summary_row(name=f"Tech_{i}", categories=cats, hours=hours, exception_reason=exc))
        df = pd.DataFrame(rows)
        mapped = map_outward_assignments(df, _default_outward_map())
        allocs, excepts = allocate_hours(mapped)
        assert len(allocs) + len(excepts) == n
