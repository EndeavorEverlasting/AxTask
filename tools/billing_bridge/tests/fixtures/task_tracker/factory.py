"""Randomized DataFrame generators for Task Tracker (Event Log) data."""
from __future__ import annotations

import random
from datetime import date, timedelta

import pandas as pd

PERSON_POOL = [
    "Rich Perez", "Chris Cummings", "Khalida Abdul-Rahman",
    "Emmanuel Sanchez", "Julio Mojica", "Alberto Montalvo",
    "Cyen Hines", "Jonathan Canas", "Khadejah Harrison",
    "Cristian Munoz", "Delroy", "Maria Torres",
]

SITE_POOL = [
    "Jackson Heights", "Manhasset", "JH", "MH",
    "Bay Shore", "Syosset", None,
]

WORKSTREAM_POOL = [
    "Neuron Deployment", "Neuron Validation", "Device Staging",
    "Field Support", "Transport", None,
]

TASK_CATEGORY_POOL = [
    "Deployment", "Troubleshooting", "Validation / Testing",
    "Repurposing / Reallocation", "Incident Response",
    "Reimage Support", "Production Support", "Workflow Continuity",
    "Training / Enablement", "Documentation / Survey",
    "Logistics / Disposal", "Staging / Count", "Other",
]

EVIDENCE_SOURCE_POOL = [
    "Photo of rack", "Work order #12345", "Supervisor confirmation",
    "Badge swipe log", "Team chat screenshot", None,
]

NOTES_POOL = [
    "Installed 12 neurons in rack B3.",
    "Replaced faulty NIC on unit 4.",
    "Counted and staged 30 units for Monday.",
    "Delivered to loading dock, signed off.",
    "Conducted validation walkthrough with site lead.",
    None,
]


def make_task_evidence(
    n: int = 10,
    *,
    persons: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    seed: int | None = None,
    include_blanks: bool = False,
) -> pd.DataFrame:
    """Generate *n* randomized task evidence rows.

    Parameters
    ----------
    n : int
        Number of rows.
    persons : list[str] | None
        Restrict person names to this pool (default: full PERSON_POOL).
    start_date / end_date : date | None
        Date range (default: March 2026).
    seed : int | None
        Random seed for reproducibility.
    include_blanks : bool
        If True, randomly set some fields to None to exercise edge cases.
    """
    rng = random.Random(seed)
    persons = persons or PERSON_POOL
    start = start_date or date(2026, 3, 1)
    end = end_date or date(2026, 3, 31)
    day_range = (end - start).days + 1

    rows: list[dict] = []
    for _ in range(n):
        work_date = start + timedelta(days=rng.randint(0, day_range - 1))
        person = rng.choice(persons)
        site = rng.choice(SITE_POOL)
        workstream = rng.choice(WORKSTREAM_POOL)
        task_cat = rng.choice(TASK_CATEGORY_POOL)
        evidence = rng.choice(EVIDENCE_SOURCE_POOL)
        notes = rng.choice(NOTES_POOL)

        if include_blanks and rng.random() < 0.15:
            task_cat = None
        if include_blanks and rng.random() < 0.10:
            person = None

        rows.append({
            "work_date": work_date,
            "canonical_name": person,
            "site": site,
            "workstream": workstream,
            "task_category": task_cat,
            "evidence_source": evidence,
            "notes": notes,
        })

    return pd.DataFrame(rows)

