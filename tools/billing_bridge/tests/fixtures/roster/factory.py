"""Randomized DataFrame generators for Roster / Attendance data."""
from __future__ import annotations

import random
from datetime import date, time, timedelta

import pandas as pd

from ..task_tracker.factory import PERSON_POOL

CLOCK_IN_POOL = [
    time(7, 0), time(7, 30), time(8, 0), time(8, 30), time(9, 0),
]

SHIFT_HOURS_POOL = [6.0, 7.0, 7.5, 8.0, 8.5, 9.0, 10.0]


def _add_hours(t: time, hours: float) -> time:
    from datetime import datetime, timedelta as td
    dt = datetime.combine(date(2026, 1, 1), t) + td(hours=hours)
    return dt.time()


def make_attendance(
    n: int = 10,
    *,
    persons: list[str] | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    seed: int | None = None,
    include_blanks: bool = False,
    include_pto: bool = False,
) -> pd.DataFrame:
    """Generate *n* randomized attendance rows.

    Parameters
    ----------
    n : int
        Number of rows.
    persons : list[str] | None
        Restrict to this pool (default: PERSON_POOL).
    start_date / end_date : date | None
        Date range (default: March 2026).
    seed : int | None
        Random seed.
    include_blanks : bool
        If True, randomly null out some clock fields.
    include_pto : bool
        If True, some rows will have PTO/SICK instead of times.
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

        if include_pto and rng.random() < 0.10:
            rows.append({
                "work_date": work_date,
                "canonical_name": person,
                "clock_in": "PTO" if rng.random() < 0.5 else "OUT SICK",
                "clock_out": None,
                "attendance_hours": None,
            })
            continue

        clock_in = rng.choice(CLOCK_IN_POOL)
        shift_hours = rng.choice(SHIFT_HOURS_POOL)
        clock_out = _add_hours(clock_in, shift_hours)

        ci: object = clock_in
        co: object = clock_out
        ah: object = shift_hours

        if include_blanks and rng.random() < 0.10:
            ci = None
            co = None
            ah = None

        rows.append({
            "work_date": work_date,
            "canonical_name": person,
            "clock_in": ci,
            "clock_out": co,
            "attendance_hours": ah,
        })

    return pd.DataFrame(rows)

