"""Tests for billing_bridge.reconcile — build_day_summary join logic."""
import random
from datetime import date

import pandas as pd
import pytest

from billing_bridge.reconcile import build_day_summary
from fixtures.task_tracker.factory import make_task_evidence
from fixtures.roster.factory import make_attendance


# ── Helpers ─────────────────────────────────────────────────────────────

def _evidence(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=["work_date", "canonical_name", "task_category", "notes"])


def _attendance(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows, columns=["work_date", "canonical_name", "clock_in", "clock_out", "attendance_hours"])


# ── Tests ───────────────────────────────────────────────────────────────

class TestBuildDaySummary:
    def test_matched_day_no_exceptions(self):
        ev = _evidence([{"work_date": "2026-03-10", "canonical_name": "Rich Perez", "task_category": "Deployment", "notes": "ok"}])
        att = _attendance([{"work_date": "2026-03-10", "canonical_name": "Rich Perez", "clock_in": "08:00", "clock_out": "16:00", "attendance_hours": 8.0}])
        summary, exceptions = build_day_summary(att, ev)
        assert len(summary) == 1
        assert exceptions["exception_reason"].notna().sum() == 0 or len(exceptions) == 0

    def test_attendance_only_flagged(self):
        ev = _evidence([])
        att = _attendance([{"work_date": "2026-03-10", "canonical_name": "Rich Perez", "clock_in": "08:00", "clock_out": "16:00", "attendance_hours": 8.0}])
        summary, exceptions = build_day_summary(att, ev)
        assert len(exceptions) >= 1
        assert "attendance_without_task_evidence" in exceptions["exception_reason"].values

    def test_evidence_only_flagged(self):
        ev = _evidence([{"work_date": "2026-03-10", "canonical_name": "Rich Perez", "task_category": "Deployment", "notes": "ok"}])
        att = _attendance([])
        summary, exceptions = build_day_summary(att, ev)
        assert len(exceptions) >= 1
        assert "task_evidence_without_attendance" in exceptions["exception_reason"].values

    def test_multiple_categories_same_day_flagged(self):
        ev = _evidence([
            {"work_date": "2026-03-10", "canonical_name": "Rich Perez", "task_category": "Deployment", "notes": "a"},
            {"work_date": "2026-03-10", "canonical_name": "Rich Perez", "task_category": "Troubleshooting", "notes": "b"},
        ])
        att = _attendance([{"work_date": "2026-03-10", "canonical_name": "Rich Perez", "clock_in": "08:00", "clock_out": "16:00", "attendance_hours": 8.0}])
        summary, exceptions = build_day_summary(att, ev)
        assert "multiple_categories_same_day" in summary["exception_reason"].values

    def test_multiple_people_separate_rows(self):
        ev = _evidence([
            {"work_date": "2026-03-10", "canonical_name": "Rich Perez", "task_category": "Deployment", "notes": "a"},
            {"work_date": "2026-03-10", "canonical_name": "Chris Cummings", "task_category": "Deployment", "notes": "b"},
        ])
        att = _attendance([
            {"work_date": "2026-03-10", "canonical_name": "Rich Perez", "clock_in": "08:00", "clock_out": "16:00", "attendance_hours": 8.0},
            {"work_date": "2026-03-10", "canonical_name": "Chris Cummings", "clock_in": "07:00", "clock_out": "15:00", "attendance_hours": 8.0},
        ])
        summary, exceptions = build_day_summary(att, ev)
        assert len(summary) == 2

    @pytest.mark.parametrize("seed", range(10))
    def test_randomized_no_rows_lost(self, seed):
        """Every unique person+date in input appears somewhere in the output."""
        rng = random.Random(seed)
        persons = ["Rich Perez", "Chris Cummings", "Julio Mojica"]
        ev = make_task_evidence(n=rng.randint(5, 20), persons=persons, seed=seed)
        att = make_attendance(n=rng.randint(5, 20), persons=persons, seed=seed + 1000)
        # Ensure required columns
        ev = ev[["work_date", "canonical_name", "task_category", "notes"]]
        att = att[["work_date", "canonical_name", "clock_in", "clock_out", "attendance_hours"]]
        summary, exceptions = build_day_summary(att, ev)
        # Union of input join keys
        ev_keys = set(ev["canonical_name"].astype(str) + "|" + ev["work_date"].astype(str))
        att_keys = set(att["canonical_name"].astype(str) + "|" + att["work_date"].astype(str))
        all_keys = ev_keys | att_keys
        summary_keys = set(summary["canonical_name"].astype(str) + "|" + summary["work_date"].astype(str))
        assert all_keys == summary_keys

    @pytest.mark.parametrize("seed", range(5))
    def test_randomized_exceptions_are_subset_of_summary(self, seed):
        persons = ["Rich Perez", "Chris Cummings"]
        ev = make_task_evidence(n=10, persons=persons, seed=seed)
        att = make_attendance(n=10, persons=persons, seed=seed + 500)
        ev = ev[["work_date", "canonical_name", "task_category", "notes"]]
        att = att[["work_date", "canonical_name", "clock_in", "clock_out", "attendance_hours"]]
        summary, exceptions = build_day_summary(att, ev)
        assert len(exceptions) <= len(summary)

