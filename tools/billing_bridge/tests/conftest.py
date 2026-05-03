"""Shared pytest fixtures for billing bridge tests.

Factories are intentionally deterministic (seeded) by default so tests
are reproducible, but individual tests can override the seed or row
count to explore edge cases.
"""
from __future__ import annotations

from datetime import date

import pytest
import pandas as pd

from fixtures.task_tracker.factory import make_task_evidence
from fixtures.roster.factory import make_attendance
from fixtures.manager.factory import make_manager_rows
from fixtures.config.factory import make_alias_map, make_outward_map, make_site_map


# ── Shared person pool (subset for faster, focused tests) ──────────────
SHARED_PERSONS = [
    "Rich Perez", "Chris Cummings", "Khalida Abdul-Rahman",
    "Emmanuel Sanchez", "Julio Mojica",
]
SHARED_DATE_START = date(2026, 3, 1)
SHARED_DATE_END = date(2026, 3, 31)


# ── Per-spreadsheet-type fixtures ──────────────────────────────────────

@pytest.fixture
def task_evidence_df() -> pd.DataFrame:
    """20 deterministic task evidence rows."""
    return make_task_evidence(
        n=20, persons=SHARED_PERSONS, seed=42,
        start_date=SHARED_DATE_START, end_date=SHARED_DATE_END,
    )


@pytest.fixture
def attendance_df() -> pd.DataFrame:
    """20 deterministic attendance rows."""
    return make_attendance(
        n=20, persons=SHARED_PERSONS, seed=42,
        start_date=SHARED_DATE_START, end_date=SHARED_DATE_END,
    )


@pytest.fixture
def manager_df() -> pd.DataFrame:
    """10 deterministic manager export rows."""
    return make_manager_rows(n=10, persons=SHARED_PERSONS, seed=42)


@pytest.fixture
def alias_map_df() -> pd.DataFrame:
    return make_alias_map(persons=SHARED_PERSONS, seed=42)


@pytest.fixture
def outward_map_df() -> pd.DataFrame:
    return make_outward_map(seed=42)


@pytest.fixture
def site_map_df() -> pd.DataFrame:
    return make_site_map(seed=42)


# ── Composite fixtures for pipeline tests ──────────────────────────────

@pytest.fixture
def matched_pair():
    """Task evidence + attendance for the *same* persons and date range.

    Guarantees at least some person+date overlaps for reconcile testing.
    """
    persons = ["Rich Perez", "Chris Cummings"]
    dates = [date(2026, 3, 10), date(2026, 3, 11), date(2026, 3, 12)]

    evidence_rows = []
    attendance_rows = []

    for person in persons:
        for d in dates:
            evidence_rows.append({
                "work_date": d,
                "canonical_name": person,
                "site": "Jackson Heights",
                "task_category": "Deployment",
                "notes": f"Deployed at JH on {d}",
            })
            attendance_rows.append({
                "work_date": d,
                "canonical_name": person,
                "clock_in": "08:00",
                "clock_out": "16:00",
                "attendance_hours": 8.0,
            })

    return pd.DataFrame(evidence_rows), pd.DataFrame(attendance_rows)

