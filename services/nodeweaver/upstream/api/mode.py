"""Life-mode trajectory and rhythm endpoints."""
import logging

from flask import Blueprint, current_app, jsonify, request

from utils.life_mode import (
    aggregate_trajectory,
    fit_rhythm_sinusoid,
    samples_from_mode_payload,
)
from utils.user_archetype import compute_user_archetype

logger = logging.getLogger(__name__)

mode_bp = Blueprint("mode", __name__)


@mode_bp.route("/mode/pulse", methods=["GET"])
def mode_pulse():
    """Rolling aggregate from the mode maintenance worker (last refresh)."""
    pulse = current_app.extensions.get("life_mode_pulse") or {
        "status": "cold",
        "message": "Maintenance loop not yet run or disabled",
    }
    return jsonify(pulse)


@mode_bp.route("/mode/trajectory", methods=["POST"])
def mode_trajectory():
    """
    Aggregate samples into mean axes and optional sinusoidal fit (weekly period by default).

    Body: { "samples": [ { "ts": "<iso or unix>", "life_mode": {...} } | { "mood", "input_kind" } ], "period_days": 7, "value_axis": "valence"|"activation" }
    """
    try:
        data = request.get_json()
        if not data or not isinstance(data.get("samples"), list):
            return jsonify({"error": "Provide a JSON object with a non-empty samples array"}), 400

        period_days = data.get("period_days", 7)
        try:
            period_days_f = float(period_days)
        except (TypeError, ValueError):
            period_days_f = 7.0
        period_sec = max(3600.0, period_days_f * 86400.0)

        value_axis = str(data.get("value_axis") or "valence").strip().lower()
        if value_axis not in {"valence", "activation"}:
            value_axis = "valence"

        rows = samples_from_mode_payload(data["samples"])
        traj = aggregate_trajectory(rows)
        wave = fit_rhythm_sinusoid(rows, value_axis=value_axis, period_seconds=period_sec)

        return jsonify(
            {
                "trajectory": traj,
                "sinusoid": wave,
                "series": [
                    {
                        "ts": r["ts"],
                        "valence": r["valence"],
                        "activation": r["activation"],
                        "entity_channel": r["life_mode"].get("entity_channel"),
                        "label": r["life_mode"].get("label"),
                    }
                    for r in rows
                ],
            }
        )
    except Exception as e:
        logger.error("mode/trajectory failed: %s", e)
        return jsonify({"error": "trajectory failed", "details": str(e)}), 500


@mode_bp.route("/mode/archetypes", methods=["GET"])
def mode_archetypes_list():
    """Compact index of background-computed user archetypes (requires metadata.user_id on logs)."""
    cache = current_app.extensions.get("user_archetypes_cache") or {}
    users = cache.get("users") or {}
    compact = []
    for uid, profile in users.items():
        if not isinstance(profile, dict):
            continue
        compact.append(
            {
                "user_id": uid,
                "primary_archetype": profile.get("primary_archetype"),
                "sample_count": profile.get("sample_count"),
                "mean_valence": profile.get("mean_valence"),
                "mean_activation": profile.get("mean_activation"),
                "dominant_entity_channel": profile.get("dominant_entity_channel"),
            }
        )
    return jsonify(
        {
            "updated_at_unix": cache.get("updated_at_unix"),
            "log_lookback": cache.get("log_lookback"),
            "users_tracked": cache.get("users_tracked", len(compact)),
            "users": compact,
        }
    )


@mode_bp.route("/mode/archetype", methods=["GET"])
def mode_archetype_detail():
    """Full archetype + Markov summary for one user (from background cache)."""
    uid = (request.args.get("user_id") or "").strip()
    if not uid:
        return jsonify({"error": "Query user_id is required"}), 400
    cache = current_app.extensions.get("user_archetypes_cache") or {}
    users = cache.get("users") or {}
    profile = users.get(uid)
    if not isinstance(profile, dict):
        return jsonify({"error": "Unknown user or no cached archetype yet"}), 404
    return jsonify({"user_id": uid, "profile": profile})


@mode_bp.route("/mode/archetype", methods=["POST"])
def mode_archetype_compute():
    """
    On-demand archetype from a client-supplied time series (for prediction pipelines).

    Body: { "samples": [ { ts, life_mode? | mood, input_kind } ], "user_id": optional }
    """
    try:
        data = request.get_json()
        if not data or not isinstance(data.get("samples"), list) or len(data["samples"]) < 1:
            return jsonify({"error": "Provide samples array with at least one timed row"}), 400
        rows = samples_from_mode_payload(data["samples"])
        if not rows:
            return jsonify({"error": "No valid samples (each needs ts)"}), 400
        profile = compute_user_archetype(rows)
        uid = data.get("user_id")
        if uid is not None:
            profile = {**profile, "user_id": str(uid).strip()}
        return jsonify({"profile": profile})
    except Exception as e:
        logger.error("mode/archetype POST failed: %s", e)
        return jsonify({"error": "archetype compute failed", "details": str(e)}), 500
