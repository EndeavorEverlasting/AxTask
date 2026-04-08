"""Life-mode semantics: numeric axes for aggregation, trajectories, and rhythm fitting."""
from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

_MOOD_AXES: Dict[str, Tuple[float, float]] = {
    # (valence [-1, 1], activation [0, 1])
    "neutral": (0.0, 0.35),
    "appreciative": (0.78, 0.42),
    "concerned": (-0.38, 0.52),
    "frustrated": (-0.72, 0.68),
    "urgent": (-0.15, 0.92),
}

_ENTITY_ACTIVATION_NUDGE = {
    "task": 0.06,
    "forum": 0.04,
    "feedback": 0.03,
    "expression": 0.0,
    "note": -0.05,
}


def _clamp(val: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, val))


def compute_life_mode_public(metadata: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Build a client-safe life_mode object from classifier metadata (uses _nodeweaver_internal if present).
    """
    metadata = metadata or {}
    internal = metadata.get("_nodeweaver_internal")
    if not isinstance(internal, dict):
        internal = {}

    mood = str(internal.get("mood", "neutral")).strip().lower() or "neutral"
    if mood not in _MOOD_AXES:
        mood = "neutral"

    input_kind = str(internal.get("input_kind", "expression")).strip().lower() or "expression"
    if input_kind not in _ENTITY_ACTIVATION_NUDGE:
        input_kind = "expression"

    valence, activation = _MOOD_AXES[mood]
    activation = _clamp(activation + _ENTITY_ACTIVATION_NUDGE.get(input_kind, 0.0), 0.05, 1.0)
    valence = _clamp(valence, -1.0, 1.0)

    mood_conf = internal.get("mood_confidence")
    try:
        mood_conf_f = float(mood_conf) if mood_conf is not None else 0.5
    except (TypeError, ValueError):
        mood_conf_f = 0.5
    mood_conf_f = _clamp(mood_conf_f, 0.0, 1.0)

    # Phase on a synthetic circle: energy vs valence → angle for rhythm / sinusoid overlays
    rhythm_phase = math.atan2(valence, activation - 0.5 + 1e-6)

    return {
        "label": mood,
        "entity_channel": input_kind,
        "valence": round(valence, 4),
        "activation": round(activation, 4),
        "mood_confidence": round(mood_conf_f, 4),
        "rhythm_phase_rad": round(rhythm_phase, 4),
        "signal_version": "nw-life-mode-v1",
    }


def samples_from_mode_payload(
    items: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Normalize API samples to rows with ts (unix float), valence, activation.
    Each item may include: ts (iso or unix), life_mode (object), or mood + input_kind.
    """
    rows: List[Dict[str, Any]] = []
    for raw in items:
        if not isinstance(raw, dict):
            continue
        ts_parsed = _parse_ts(raw.get("ts") or raw.get("timestamp"))
        if ts_parsed is None:
            continue

        lm = raw.get("life_mode")
        if isinstance(lm, dict) and "valence" in lm and "activation" in lm:
            try:
                v = float(lm["valence"])
                a = float(lm["activation"])
            except (TypeError, ValueError):
                continue
        else:
            meta = {
                "_nodeweaver_internal": {
                    "mood": str(raw.get("mood", "neutral")).lower(),
                    "input_kind": str(raw.get("input_kind", "expression")).lower(),
                    "mood_confidence": raw.get("mood_confidence", 0.6),
                }
            }
            lm = compute_life_mode_public(meta)
            v, a = lm["valence"], lm["activation"]

        rows.append({"ts": ts_parsed, "valence": v, "activation": a, "life_mode": lm})
    rows.sort(key=lambda r: r["ts"])
    return rows


def _parse_ts(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return float(s)
        except ValueError:
            pass
        try:
            if s.endswith("Z"):
                s = s[:-1] + "+00:00"
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.timestamp()
        except ValueError:
            return None
    return None


def aggregate_trajectory(samples: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Mean valence/activation and simple momentum (delta per day) over the window."""
    if not samples:
        return {"count": 0, "mean_valence": None, "mean_activation": None, "momentum_valence_per_day": None}

    vals_v = np.array([float(s["valence"]) for s in samples], dtype=float)
    vals_a = np.array([float(s["activation"]) for s in samples], dtype=float)
    ts = np.array([float(s["ts"]) for s in samples], dtype=float)

    mean_v = float(np.mean(vals_v))
    mean_a = float(np.mean(vals_a))
    span_sec = float(ts[-1] - ts[0]) if len(ts) > 1 else 0.0
    span_days = span_sec / 86400.0 if span_sec > 0 else 0.0
    if span_days > 1e-6 and len(ts) > 1:
        mom_v = float((vals_v[-1] - vals_v[0]) / span_days)
        mom_a = float((vals_a[-1] - vals_a[0]) / span_days)
    else:
        mom_v = mom_a = 0.0

    return {
        "count": len(samples),
        "mean_valence": round(mean_v, 4),
        "mean_activation": round(mean_a, 4),
        "momentum_valence_per_day": round(mom_v, 6),
        "momentum_activation_per_day": round(mom_a, 6),
        "window_start_ts": ts[0],
        "window_end_ts": ts[-1],
    }


def fit_rhythm_sinusoid(
    samples: List[Dict[str, Any]],
    value_axis: str = "valence",
    period_seconds: float = 7 * 86400,
) -> Dict[str, Any]:
    """
    Fit y ≈ offset + amplitude * sin(ω t + φ) via linear least squares in sin/cos basis.
    Default period is one week (ebbs and flows on a weekly rhythm).
    """
    if len(samples) < 3:
        return {
            "fit_ok": False,
            "reason": "need_at_least_3_samples",
            "period_seconds": period_seconds,
        }

    ts = np.array([float(s["ts"]) for s in samples], dtype=float)
    if value_axis == "activation":
        y = np.array([float(s["activation"]) for s in samples], dtype=float)
    else:
        y = np.array([float(s["valence"]) for s in samples], dtype=float)

    t0 = float(ts[0])
    tn = float(ts[-1])
    if tn - t0 < 3600:  # under one hour — still fit, but mark low_span
        low_span = True
    else:
        low_span = False

    omega = 2.0 * math.pi / max(period_seconds, 3600.0)
    t_rel = ts - t0
    s = np.sin(omega * t_rel)
    c = np.cos(omega * t_rel)
    X = np.column_stack([np.ones_like(y), s, c])
    coef, _, rank, _ = np.linalg.lstsq(X, y, rcond=None)
    if rank < 3 and len(samples) < 5:
        return {"fit_ok": False, "reason": "rank_deficient", "period_seconds": period_seconds}

    offset, A, B = float(coef[0]), float(coef[1]), float(coef[2])
    amplitude = float(math.sqrt(A * A + B * B))
    phase = float(math.atan2(B, A))

    y_hat = X @ coef
    ss_res = float(np.sum((y - y_hat) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2)) + 1e-12
    r_squared = 1.0 - ss_res / ss_tot

    return {
        "fit_ok": True,
        "value_axis": value_axis,
        "period_seconds": period_seconds,
        "omega_rad_per_sec": round(omega, 10),
        "offset": round(offset, 4),
        "amplitude": round(amplitude, 4),
        "phase_rad": round(phase, 4),
        "r_squared": round(_clamp(r_squared, -1.0, 1.0), 4),
        "low_span": low_span,
        "interpretation": (
            "Sinusoid summarizes recurring lift and dip versus the chosen period; "
            "higher amplitude suggests stronger ebbs and flows over that horizon."
        ),
    }
