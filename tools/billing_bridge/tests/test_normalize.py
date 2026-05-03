"""Tests for billing_bridge.normalize — name, date, alias, site, and category normalizers."""
import random

import pandas as pd
import pytest

from billing_bridge.normalize import (
    apply_alias_map,
    normalize_date,
    normalize_name,
    normalize_sites,
    normalize_task_categories,
)
from fixtures.config.factory import make_alias_map, make_site_map
from fixtures.task_tracker.factory import TASK_CATEGORY_POOL, make_task_evidence


# ── normalize_name ──────────────────────────────────────────────────────

class TestNormalizeName:
    def test_collapses_whitespace(self):
        assert normalize_name("  Rich   Perez  ") == "Rich Perez"

    def test_none_returns_empty(self):
        assert normalize_name(None) == ""

    def test_nan_returns_empty(self):
        assert normalize_name(float("nan")) == ""

    def test_already_clean(self):
        assert normalize_name("Chris Cummings") == "Chris Cummings"

    @pytest.mark.parametrize("seed", range(5))
    def test_randomized_names_are_stripped(self, seed):
        rng = random.Random(seed)
        base = rng.choice(["Rich Perez", "Julio Mojica", "Cyen Hines"])
        padded = f"  {base}   "
        assert normalize_name(padded) == base


# ── normalize_date ──────────────────────────────────────────────────────

class TestNormalizeDate:
    def test_none_returns_none(self):
        assert normalize_date(None) is None

    def test_empty_string_returns_none(self):
        assert normalize_date("") is None

    def test_iso_string(self):
        result = normalize_date("2026-03-15")
        assert result is not None
        assert result.day == 15

    def test_timestamp_passthrough(self):
        ts = pd.Timestamp("2026-03-20")
        assert normalize_date(ts) == ts.normalize()

    def test_garbage_returns_none(self):
        assert normalize_date("not-a-date") is None

    @pytest.mark.parametrize("seed", range(5))
    def test_randomized_date_strings(self, seed):
        rng = random.Random(seed)
        month = rng.randint(1, 12)
        day = rng.randint(1, 28)
        result = normalize_date(f"2026-{month:02d}-{day:02d}")
        assert result is not None
        assert result.month == month


# ── apply_alias_map ─────────────────────────────────────────────────────

class TestApplyAliasMap:
    def test_resolves_alias(self):
        df = pd.DataFrame([{"person": "Rich Perez"}])
        aliases = pd.DataFrame([{"alias_name": "Rich Perez", "canonical_name": "Richard Perez"}])
        out = apply_alias_map(df, "person", aliases)
        assert out.iloc[0]["canonical_name"] == "Richard Perez"

    def test_unmatched_name_preserved(self):
        df = pd.DataFrame([{"person": "Unknown Person"}])
        aliases = pd.DataFrame([{"alias_name": "Rich Perez", "canonical_name": "Richard Perez"}])
        out = apply_alias_map(df, "person", aliases)
        assert out.iloc[0]["canonical_name"] == "Unknown Person"

    def test_alias_resolved_flag(self):
        df = pd.DataFrame([{"person": "Rich Perez"}, {"person": "Julio Mojica"}])
        aliases = pd.DataFrame([{"alias_name": "Rich Perez", "canonical_name": "Richard Perez"}])
        out = apply_alias_map(df, "person", aliases)
        assert out.iloc[0]["alias_resolved"] is True or out.iloc[0]["alias_resolved"] == True
        assert out.iloc[1]["alias_resolved"] is False or out.iloc[1]["alias_resolved"] == False

    @pytest.mark.parametrize("seed", range(5))
    def test_randomized_alias_map(self, seed):
        aliases = make_alias_map(seed=seed)
        evidence = make_task_evidence(n=15, seed=seed)
        out = apply_alias_map(evidence, "canonical_name", aliases)
        assert "canonical_name" in out.columns
        assert len(out) == 15


# ── normalize_task_categories ───────────────────────────────────────────

class TestNormalizeTaskCategories:
    EXPECTED_MAPPINGS = {
        "Deployment": "Neuron Deployment",
        "Troubleshooting": "Neuron Troubleshooting",
        "Validation / Testing": "Neuron Validation",
        "Logistics / Disposal": "Logistics",
        "Other": "Review Required",
    }

    @pytest.mark.parametrize("raw,expected", list(EXPECTED_MAPPINGS.items()))
    def test_known_categories(self, raw, expected):
        df = pd.DataFrame([{"task_category": raw}])
        out = normalize_task_categories(df, "task_category")
        assert out.iloc[0]["internal_task_category"] == expected

    @pytest.mark.parametrize("seed", range(5))
    def test_randomized_categories_always_resolve(self, seed):
        evidence = make_task_evidence(n=20, seed=seed)
        out = normalize_task_categories(evidence, "task_category")
        for val in out["internal_task_category"]:
            assert val in {
                "Neuron Deployment", "Neuron Troubleshooting",
                "Neuron Validation", "Logistics", "Review Required",
            }


# ── normalize_sites ─────────────────────────────────────────────────────

class TestNormalizeSites:
    def test_abbreviation_resolved(self):
        df = pd.DataFrame([{"site": "JH"}])
        site_map = make_site_map()
        out = normalize_sites(df, "site", site_map)
        assert out.iloc[0]["normalized_site"] == "Jackson Heights"

    def test_unknown_site_passthrough(self):
        df = pd.DataFrame([{"site": "Queens"}])
        site_map = make_site_map()
        out = normalize_sites(df, "site", site_map)
        assert out.iloc[0]["normalized_site"] == "Queens"

    def test_none_site(self):
        df = pd.DataFrame([{"site": None}])
        site_map = make_site_map()
        out = normalize_sites(df, "site", site_map)
        assert out.iloc[0]["normalized_site"] == ""

    @pytest.mark.parametrize("seed", range(5))
    def test_randomized_evidence_sites(self, seed):
        evidence = make_task_evidence(n=15, seed=seed)
        site_map = make_site_map(seed=seed)
        out = normalize_sites(evidence, "site", site_map)
        assert "normalized_site" in out.columns
        assert len(out) == 15
