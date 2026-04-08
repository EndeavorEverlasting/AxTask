"""Discrete Markov scaffold over (entity_channel × mood) for next-behavior prediction."""
from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List

_DISC_SEP = "|"


def discrete_state(entity_channel: str, mood_label: str) -> str:
    ch = (entity_channel or "expression").strip().lower() or "expression"
    mood = (mood_label or "neutral").strip().lower() or "neutral"
    return f"{ch}{_DISC_SEP}{mood}"


def build_transition_counts(ordered_states: List[str]) -> Dict[str, Dict[str, int]]:
    """For each state s, count successors s -> next."""
    out: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for i in range(len(ordered_states) - 1):
        a, b = ordered_states[i], ordered_states[i + 1]
        if not a or not b:
            continue
        out[a][b] += 1
    return {k: dict(v) for k, v in out.items()}


def transition_counts_to_probabilities(
    counts: Dict[str, Dict[str, int]],
    laplace: float = 1.0,
) -> Dict[str, Dict[str, float]]:
    """Row-normalized transition dict with Laplace smoothing over all observed states."""
    probs: Dict[str, Dict[str, float]] = {}
    all_states: set = set(counts.keys())
    for nxt in counts.values():
        all_states.update(nxt.keys())

    for src, row in counts.items():
        smoothed = {t: float(row.get(t, 0)) + laplace for t in all_states}
        total = sum(smoothed.values()) or 1.0
        probs[src] = {t: round(v / total, 5) for t, v in smoothed.items()}
    return probs


def predict_next_distribution(
    current_state: str,
    probs: Dict[str, Dict[str, float]],
    top_k: int = 5,
) -> List[Dict[str, Any]]:
    row = probs.get(current_state) or {}
    ranked = sorted(row.items(), key=lambda x: x[1], reverse=True)[:top_k]
    return [{"state": s, "p": p} for s, p in ranked]


def markov_summary_from_rows(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    rows: sorted by ts, each with life_mode.entity_channel and life_mode.label.
    """
    if len(rows) < 2:
        return {
            "version": "nw-markov-v1",
            "ready": False,
            "reason": "need_ordered_states",
            "state_count": len(rows),
        }

    ordered = [
        discrete_state(
            str(r["life_mode"].get("entity_channel", "")),
            str(r["life_mode"].get("label", "")),
        )
        for r in rows
    ]
    counts = build_transition_counts(ordered)
    probs = transition_counts_to_probabilities(counts, laplace=1.0)
    last = ordered[-1]
    nxt = predict_next_distribution(last, probs, top_k=6)
    prediction_basis = last
    if not nxt and len(ordered) >= 2:
        prev = ordered[-2]
        nxt = predict_next_distribution(prev, probs, top_k=6)
        prediction_basis = prev
    if not nxt:
        obs = sorted(set(ordered))
        if obs:
            p = 1.0 / len(obs)
            nxt = [{"state": s, "p": round(p, 5)} for s in obs[:6]]
        prediction_basis = "uniform_over_observed"

    return {
        "version": "nw-markov-v1",
        "ready": True,
        "unique_states": len(set(ordered)),
        "transition_edges": sum(sum(d.values()) for d in counts.values()),
        "last_state": last,
        "prediction_basis_state": prediction_basis,
        "next_step_candidates": nxt,
        # Full matrix omitted by default (can grow large); callers can rebuild from logs
        "transition_probs_sample": {
            k: dict(list(v.items())[:8]) for k, v in list(probs.items())[:12]
        },
    }
