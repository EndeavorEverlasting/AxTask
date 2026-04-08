"""User archetypes from life-mode aggregates — background behavior priors for prediction layers."""
from __future__ import annotations

from collections import Counter
from typing import Any, Dict, List, Optional

import numpy as np

from utils.behavior_markov import markov_summary_from_rows
from utils.life_mode import aggregate_trajectory

_USER_ID_KEYS = (
    "user_id",
    "axtask_user_id",
    "account_id",
    "subject_id",
    "uid",
    "principal_id",
)


def extract_user_id(metadata: Optional[Dict[str, Any]]) -> Optional[str]:
    """Resolve a stable user key from classification metadata (callers should set one of these)."""
    if not isinstance(metadata, dict):
        return None
    for key in _USER_ID_KEYS:
        raw = metadata.get(key)
        if raw is None:
            continue
        s = str(raw).strip()
        if s:
            return s
    return None


def _hist_fractions(counter: Counter, keys: List[str]) -> Dict[str, float]:
    total = sum(counter.values()) or 1
    return {k: round(counter.get(k, 0) / total, 4) for k in keys}


def infer_archetype_scores(
    mean_v: float,
    mean_a: float,
    channel_frac: Dict[str, float],
    mood_frac: Dict[str, float],
) -> List[Dict[str, Any]]:
    """
    Heuristic archetype tags (v1). Scores are 0..1; multiple can apply.
    Replace or augment later with learned clusters / embeddings.
    """
    scores: Dict[str, float] = {}

    forum = channel_frac.get("forum", 0.0)
    feedback = channel_frac.get("feedback", 0.0)
    task = channel_frac.get("task", 0.0)
    note = channel_frac.get("note", 0.0)

    urgent = mood_frac.get("urgent", 0.0)
    frustrated = mood_frac.get("frustrated", 0.0)
    appreciative = mood_frac.get("appreciative", 0.0)
    concerned = mood_frac.get("concerned", 0.0)

    # Community stress + engagement
    scores["community_firefighter"] = min(
        1.0,
        0.45 * forum + 0.35 * (urgent + frustrated) + 0.2 * mean_a,
    )
    # Task throughput under pressure
    scores["deadline_driver"] = min(1.0, 0.5 * task + 0.35 * urgent + 0.15 * mean_a)
    # Journaling / notes — reflective signal
    scores["reflective_archivist"] = min(1.0, 0.55 * note + 0.25 * (1.0 - abs(mean_v)) + 0.2 * concerned)
    # Positive feedback loop
    scores["signal_booster"] = min(1.0, 0.5 * appreciative + 0.35 * feedback + 0.15 * max(0.0, mean_v))
    # Steady neutral operator
    scores["steady_operator"] = min(
        1.0,
        0.4 * mood_frac.get("neutral", 0.0) + 0.3 * task + 0.3 * (1.0 - abs(mean_v)),
    )

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    out = [{"id": k, "score": round(v, 4)} for k, v in ranked if v >= 0.15]
    return out[:5]


def compute_user_archetype(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    rows: output-shaped like samples_from_mode_payload (ts, valence, activation, life_mode).
    """
    if not rows:
        return {"version": "nw-archetype-v1", "sample_count": 0}

    channels = [str(r["life_mode"].get("entity_channel", "expression")) for r in rows]
    moods = [str(r["life_mode"].get("label", "neutral")) for r in rows]
    ch_counter = Counter(channels)
    mood_counter = Counter(moods)

    channel_keys = sorted(set(ch_counter.keys()) | {"task", "forum", "feedback", "note", "expression"})
    mood_keys = sorted(set(mood_counter.keys()) | {"neutral", "urgent", "frustrated", "appreciative", "concerned"})

    v = np.array([float(r["valence"]) for r in rows], dtype=float)
    a = np.array([float(r["activation"]) for r in rows], dtype=float)
    mean_v = float(np.mean(v))
    mean_a = float(np.mean(a))
    std_v = float(np.std(v)) if len(v) > 1 else 0.0
    std_a = float(np.std(a)) if len(a) > 1 else 0.0

    traj = aggregate_trajectory(rows)
    ch_frac = _hist_fractions(ch_counter, channel_keys)
    mood_frac = _hist_fractions(mood_counter, mood_keys)
    archetypes = infer_archetype_scores(mean_v, mean_a, ch_frac, mood_frac)
    markov = markov_summary_from_rows(rows)

    dominant_channel = ch_counter.most_common(1)[0][0] if ch_counter else None
    dominant_mood = mood_counter.most_common(1)[0][0] if mood_counter else None

    return {
        "version": "nw-archetype-v1",
        "sample_count": len(rows),
        "mean_valence": round(mean_v, 4),
        "mean_activation": round(mean_a, 4),
        "std_valence": round(std_v, 4),
        "std_activation": round(std_a, 4),
        "dominant_entity_channel": dominant_channel,
        "dominant_mood": dominant_mood,
        "channel_mix": ch_frac,
        "mood_mix": mood_frac,
        "trajectory": traj,
        "archetypes": archetypes,
        "primary_archetype": archetypes[0]["id"] if archetypes else None,
        "markov": markov,
    }
