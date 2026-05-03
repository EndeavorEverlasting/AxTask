"""Tests for billing_bridge.reporting — exception reports and change summaries."""
import random

import pandas as pd
import pytest

from billing_bridge.reporting import build_change_summary, build_exception_report


# ── build_exception_report ──────────────────────────────────────────────

class TestBuildExceptionReport:
    EXCEPTION_REASONS = [
        "attendance_without_task_evidence",
        "task_evidence_without_attendance",
        "multiple_categories_same_day",
    ]

    def test_maps_known_actions(self):
        df = pd.DataFrame([
            {"exception_reason": "attendance_without_task_evidence", "work_date": "2026-03-10"},
            {"exception_reason": "task_evidence_without_attendance", "work_date": "2026-03-11"},
            {"exception_reason": "multiple_categories_same_day", "work_date": "2026-03-12"},
        ])
        out = build_exception_report(df)
        assert out.iloc[0]["review_action"] == "Find task evidence or hold row"
        assert out.iloc[1]["review_action"] == "Verify punch support before billing"
        assert out.iloc[2]["review_action"] == "Review split rule before allocation"

    def test_unknown_reason_gets_manual_review(self):
        df = pd.DataFrame([{"exception_reason": "something_new", "work_date": "2026-03-10"}])
        out = build_exception_report(df)
        assert out.iloc[0]["review_action"] == "Manual review"

    def test_empty_input(self):
        df = pd.DataFrame(columns=["exception_reason", "work_date"])
        out = build_exception_report(df)
        assert len(out) == 0
        assert "review_action" in out.columns

    @pytest.mark.parametrize("seed", range(5))
    def test_randomized_exceptions_all_get_actions(self, seed):
        rng = random.Random(seed)
        n = rng.randint(5, 30)
        rows = [{"exception_reason": rng.choice(self.EXCEPTION_REASONS + ["custom_" + str(i)]), "work_date": f"2026-03-{i + 1:02d}"} for i in range(n)]
        df = pd.DataFrame(rows)
        out = build_exception_report(df)
        assert out["review_action"].notna().all()
        assert len(out) == n


# ── build_change_summary ────────────────────────────────────────────────

class TestBuildChangeSummary:
    def test_empty_allocations(self):
        df = pd.DataFrame(columns=["allocated_hours", "canonical_name", "outward_assignment"])
        out = build_change_summary(df)
        assert len(out) == 4
        assert out.set_index("metric").loc["allocated_rows", "value"] == 0

    def test_single_row(self):
        df = pd.DataFrame([{
            "allocated_hours": 8.0,
            "canonical_name": "Rich Perez",
            "outward_assignment": "Neuron Installation",
        }])
        out = build_change_summary(df)
        metrics = out.set_index("metric")
        assert metrics.loc["allocated_rows", "value"] == 1
        assert metrics.loc["total_allocated_hours", "value"] == 8.0
        assert metrics.loc["unique_techs", "value"] == 1
        assert metrics.loc["unique_assignments", "value"] == 1

    @pytest.mark.parametrize("seed", range(5))
    def test_randomized_summaries_are_consistent(self, seed):
        rng = random.Random(seed)
        n = rng.randint(1, 50)
        names = [f"Tech_{rng.randint(1, 10)}" for _ in range(n)]
        assignments = [rng.choice(["Neuron Installation", "Delivery", "Training"]) for _ in range(n)]
        hours = [round(rng.uniform(1, 10), 2) for _ in range(n)]
        df = pd.DataFrame({
            "allocated_hours": hours,
            "canonical_name": names,
            "outward_assignment": assignments,
        })
        out = build_change_summary(df)
        metrics = out.set_index("metric")
        assert metrics.loc["allocated_rows", "value"] == n
        assert abs(metrics.loc["total_allocated_hours", "value"] - sum(hours)) < 0.01
        assert metrics.loc["unique_techs", "value"] == len(set(names))
        assert metrics.loc["unique_assignments", "value"] == len(set(assignments))

