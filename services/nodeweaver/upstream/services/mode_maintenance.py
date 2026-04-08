"""Background refresh of life-mode aggregates and per-user archetypes (Markov-ready)."""
from __future__ import annotations

import logging
import os
import threading
import time
from collections import defaultdict
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _interval_sec() -> float:
    try:
        return max(15.0, float(os.environ.get("MODE_MAINTENANCE_INTERVAL_SEC", "90")))
    except ValueError:
        return 90.0


def classification_log_to_sample_payload(log) -> Optional[Dict[str, Any]]:
    """Shape one log row into samples_from_mode_payload input (includes ts)."""
    md = log.meta_data or {}
    lm = md.get("life_mode")
    if isinstance(lm, dict) and "valence" in lm:
        item: Dict[str, Any] = {"life_mode": lm}
    elif isinstance(md.get("_nodeweaver_internal"), dict):
        internal = md["_nodeweaver_internal"]
        item = {
            "mood": internal.get("mood"),
            "input_kind": internal.get("input_kind"),
            "mood_confidence": internal.get("mood_confidence"),
        }
    else:
        return None
    if log.created_at is not None:
        item["ts"] = log.created_at.timestamp()
    return item


def _recompute_pulse(app) -> Dict[str, Any]:
    from models import ClassificationLog
    from utils.life_mode import aggregate_trajectory, samples_from_mode_payload

    limit = 200
    rows_db = (
        ClassificationLog.query.order_by(ClassificationLog.log_id.desc())
        .limit(limit)
        .all()
    )
    samples: List[Dict[str, Any]] = []
    for log in reversed(rows_db):
        item = classification_log_to_sample_payload(log)
        if item:
            samples.append(item)

    normalized = samples_from_mode_payload(samples)
    traj = aggregate_trajectory(normalized)

    return {
        "status": "ok",
        "source_logs_scanned": len(rows_db),
        "samples_with_mode": len(normalized),
        "aggregate": traj,
        "updated_at_unix": time.time(),
    }


def _recompute_archetypes(app) -> Dict[str, Any]:
    from models import ClassificationLog
    from utils.life_mode import samples_from_mode_payload
    from utils.user_archetype import compute_user_archetype, extract_user_id

    try:
        lookback = max(50, int(os.environ.get("ARCHETYPE_LOG_LOOKBACK", "800")))
    except ValueError:
        lookback = 800
    try:
        max_users = max(1, int(os.environ.get("ARCHETYPE_MAX_USERS", "200")))
    except ValueError:
        max_users = 200

    logs = (
        ClassificationLog.query.order_by(ClassificationLog.log_id.desc())
        .limit(lookback)
        .all()
    )
    by_user: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for log in reversed(logs):
        md = log.meta_data or {}
        uid = extract_user_id(md)
        if not uid:
            continue
        item = classification_log_to_sample_payload(log)
        if item:
            by_user[uid].append(item)

    sorted_uids = sorted(by_user.keys(), key=lambda u: len(by_user[u]), reverse=True)[:max_users]
    users_out: Dict[str, Any] = {}
    for uid in sorted_uids:
        normalized = samples_from_mode_payload(by_user[uid])
        if len(normalized) < 1:
            continue
        users_out[uid] = compute_user_archetype(normalized)

    return {
        "updated_at_unix": time.time(),
        "log_lookback": lookback,
        "users_tracked": len(users_out),
        "users": users_out,
    }


def start_mode_maintenance(app) -> Optional[threading.Thread]:
    if os.environ.get("MODE_MAINTENANCE_ENABLED", "1").strip().lower() in {"0", "false", "no", "off"}:
        logger.info("Mode maintenance disabled (MODE_MAINTENANCE_ENABLED)")
        return None

    stop = threading.Event()

    def loop():
        while not stop.is_set():
            try:
                with app.app_context():
                    pulse = _recompute_pulse(app)
                    app.extensions["life_mode_pulse"] = pulse
                    arch = _recompute_archetypes(app)
                    app.extensions["user_archetypes_cache"] = arch
                    logger.debug(
                        "life_mode_pulse samples=%s archetype_users=%s",
                        pulse.get("samples_with_mode"),
                        arch.get("users_tracked"),
                    )
            except Exception as e:
                logger.warning("mode maintenance tick failed: %s", e)
            if stop.wait(_interval_sec()):
                break

    t = threading.Thread(target=loop, name="nodeweaver-mode-maintenance", daemon=True)
    t.start()
    logger.info("Mode maintenance thread started (interval=%ss)", _interval_sec())
    return t
