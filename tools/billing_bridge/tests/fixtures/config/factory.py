"""Randomized generators for config / mapping tables."""
from __future__ import annotations

import random

import pandas as pd

from ..task_tracker.factory import PERSON_POOL, TASK_CATEGORY_POOL, SITE_POOL

# Alias variants for fuzzy matching
_ALIAS_VARIANTS: dict[str, list[str]] = {
    "Rich Perez": ["Richard Perez", "R. Perez"],
    "Chris Cummings": ["Christopher Cummings", "C. Cummings"],
    "Khalida Abdul-Rahman": ["Khalida Abdulrahman", "Khalida A."],
    "Emmanuel Sanchez": ["Manny Sanchez", "E. Sanchez"],
    "Khadejah Harrison": ["Khadejah H."],
    "Cristian Munoz": ["Cristian"],
}


def make_alias_map(
    *,
    persons: list[str] | None = None,
    seed: int | None = None,
    extra_noise: int = 0,
) -> pd.DataFrame:
    """Generate a person alias mapping table.

    Every person gets an identity alias, plus any known variants.
    ``extra_noise`` adds random duplicate rows to stress dedup logic.
    """
    rng = random.Random(seed)
    persons = persons or PERSON_POOL
    rows: list[dict] = []

    for person in persons:
        # Identity row
        rows.append({"alias_name": person, "canonical_name": person})
        for alias in _ALIAS_VARIANTS.get(person, []):
            rows.append({"alias_name": alias, "canonical_name": person})

    for _ in range(extra_noise):
        person = rng.choice(persons)
        rows.append({"alias_name": person, "canonical_name": person})

    return pd.DataFrame(rows)


def make_outward_map(
    *,
    categories: list[str] | None = None,
    seed: int | None = None,
) -> pd.DataFrame:
    """Generate an outward assignment mapping table."""
    rng = random.Random(seed)
    categories = categories or list(TASK_CATEGORY_POOL)

    rows: list[dict] = []
    for cat in categories:
        is_delivery = any(kw in cat.lower() for kw in ["logistics", "staging"])
        rows.append({
            "internal_task_category": cat,
            "outward_project": "Northwell - Neurons",
            "outward_assignment": "Delivery / Transport / Disposal" if is_delivery else "Neuron Installation",
        })

    return pd.DataFrame(rows)


def make_site_map(
    *,
    seed: int | None = None,
) -> pd.DataFrame:
    """Generate a site normalization table."""
    real_sites = [s for s in SITE_POOL if s is not None]
    canonical = {
        "JH": "Jackson Heights",
        "MH": "Manhasset",
        "Jackson Heights": "Jackson Heights",
        "Manhasset": "Manhasset",
        "Bay Shore": "Bay Shore",
        "Syosset": "Syosset",
    }
    rows = [{"raw_site": k, "normalized_site": v} for k, v in canonical.items()]
    return pd.DataFrame(rows)

