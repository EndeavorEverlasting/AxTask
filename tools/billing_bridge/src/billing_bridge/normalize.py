from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd


def _clean_text(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def normalize_name(value: object) -> str:
    text = _clean_text(value)
    return " ".join(part for part in text.replace("  ", " ").split())


def normalize_date(value: object) -> Optional[pd.Timestamp]:
    if value is None or value == "":
        return None
    if isinstance(value, pd.Timestamp):
        return value.normalize()
    try:
        return pd.to_datetime(value).normalize()
    except Exception:
        return None


def apply_alias_map(df: pd.DataFrame, raw_name_col: str, aliases: pd.DataFrame) -> pd.DataFrame:
    mapping = {
        normalize_name(row["alias_name"]): normalize_name(row["canonical_name"])
        for _, row in aliases.iterrows()
    }
    out = df.copy()
    out["raw_name"] = out[raw_name_col].map(normalize_name)
    out["canonical_name"] = out["raw_name"].map(lambda x: mapping.get(x, x))
    out["alias_resolved"] = out["raw_name"] != out["canonical_name"]
    return out


def normalize_task_categories(df: pd.DataFrame, raw_col: str) -> pd.DataFrame:
    out = df.copy()

    def _map_category(value: object) -> str:
        text = _clean_text(value).lower()
        if "transport" in text or "disposal" in text or "deliver" in text or "logistics" in text:
            return "Logistics"
        if "trouble" in text or "incident" in text or "issue" in text:
            return "Neuron Troubleshooting"
        if "validate" in text or "qa" in text or "testing" in text:
            return "Neuron Validation"
        if "neuron" in text or "deploy" in text or "install" in text:
            return "Neuron Deployment"
        return "Review Required"

    out["internal_task_category"] = out[raw_col].map(_map_category)
    return out


def normalize_sites(df: pd.DataFrame, raw_site_col: str, site_map: pd.DataFrame) -> pd.DataFrame:
    mapping = {
        _clean_text(row["raw_site"]).lower(): _clean_text(row["normalized_site"])
        for _, row in site_map.iterrows()
    }
    out = df.copy()
    out["normalized_site"] = out[raw_site_col].map(
        lambda x: mapping.get(_clean_text(x).lower(), _clean_text(x))
    )
    return out
