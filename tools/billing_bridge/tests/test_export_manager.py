"""Tests for billing_bridge.export_manager — build_manager_rows."""
import random

import pandas as pd
import pytest

from billing_bridge.export_manager import MANAGER_COLUMNS, build_manager_rows


# ── Helpers ─────────────────────────────────────────────────────────────

def _allocation_row(
    *,
    name: str = "Rich Perez",
    hours: float = 8.0,
    project: str = "Northwell - Neurons",
    assignment: str = "Neuron Installation",
    clock_in: str = "08:00",
    clock_out: str = "16:00",
) -> dict:
    return {
        "canonical_name": name,
        "clock_in": clock_in,
        "clock_out": clock_out,
        "allocated_hours": hours,
        "outward_project": project,
        "outward_assignment": assignment,
    }


# ── Tests ───────────────────────────────────────────────────────────────

class TestBuildManagerRows:
    def test_columns_match_spec(self):
        df = pd.DataFrame([_allocation_row()])
        out = build_manager_rows(df)
        assert list(out.columns) == MANAGER_COLUMNS

    def test_single_row_values(self):
        df = pd.DataFrame([_allocation_row()])
        out = build_manager_rows(df)
        assert out.iloc[0]["TECH"] == "Rich Perez"
        assert out.iloc[0]["TOTAL"] == 8.0
        assert out.iloc[0]["PROJECT"] == "Northwell - Neurons"

    def test_empty_allocations(self):
        df = pd.DataFrame(columns=["canonical_name", "clock_in", "clock_out", "allocated_hours", "outward_project", "outward_assignment"])
        out = build_manager_rows(df)
        assert len(out) == 0
        assert list(out.columns) == MANAGER_COLUMNS

    @pytest.mark.parametrize("seed", range(10))
    def test_randomized_allocation_data(self, seed):
        """Manager rows should have the same count as input and correct columns."""
        rng = random.Random(seed)
        n = rng.randint(1, 40)
        names = [f"Tech_{rng.randint(1, 10)}" for _ in range(n)]
        rows = [
            _allocation_row(
                name=names[i],
                hours=round(rng.uniform(1, 10), 2),
                assignment=rng.choice(["Neuron Installation", "Delivery / Transport / Disposal"]),
            )
            for i in range(n)
        ]
        df = pd.DataFrame(rows)
        out = build_manager_rows(df)
        assert len(out) == n
        assert list(out.columns) == MANAGER_COLUMNS
        assert (out["TOTAL"] > 0).all()

    @pytest.mark.parametrize("seed", range(5))
    def test_total_hours_preserved(self, seed):
        rng = random.Random(seed)
        n = rng.randint(5, 20)
        hours = [round(rng.uniform(1, 10), 2) for _ in range(n)]
        rows = [_allocation_row(name=f"Tech_{i}", hours=h) for i, h in enumerate(hours)]
        df = pd.DataFrame(rows)
        out = build_manager_rows(df)
        assert abs(out["TOTAL"].sum() - sum(hours)) < 0.01

