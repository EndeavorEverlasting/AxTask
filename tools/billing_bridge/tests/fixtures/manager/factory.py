"""Randomized DataFrame generators for Manager workbook (Bonita export) data."""
from __future__ import annotations

import random
from datetime import time

import pandas as pd

from ..task_tracker.factory import PERSON_POOL

PROJECT_POOL = [
    "Northwell - Neurons",
    "Internal - Training",
]

ASSIGNMENT_POOL = [
    "Neuron Installation",
    "Delivery / Transport / Disposal",
    "Training / Enablement",
    "Documentation / Survey",
]


def make_manager_rows(
    n: int = 10,
    *,
    persons: list[str] | None = None,
    seed: int | None = None,
) -> pd.DataFrame:
    """Generate *n* randomized manager export rows.

    Columns: TECH, START, END, TOTAL, PROJECT, ASSIGNMENT.
    """
    rng = random.Random(seed)
    persons = persons or PERSON_POOL

    rows: list[dict] = []
    for _ in range(n):
        person = rng.choice(persons)
        start_hour = rng.randint(7, 9)
        shift = rng.choice([6.0, 7.0, 7.5, 8.0, 8.5, 9.0])
        end_hour = int(start_hour + shift)
        end_min = int((shift % 1) * 60)

        rows.append({
            "TECH": person,
            "START": time(start_hour, 0),
            "END": time(min(end_hour, 23), end_min),
            "TOTAL": shift,
            "PROJECT": rng.choice(PROJECT_POOL),
            "ASSIGNMENT": rng.choice(ASSIGNMENT_POOL),
        })

    return pd.DataFrame(rows)

