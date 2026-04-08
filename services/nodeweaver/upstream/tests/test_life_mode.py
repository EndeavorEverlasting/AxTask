import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.life_mode import (
    aggregate_trajectory,
    compute_life_mode_public,
    fit_rhythm_sinusoid,
    samples_from_mode_payload,
)


class LifeModeTests(unittest.TestCase):
    def test_compute_life_mode_maps_mood_and_channel(self):
        meta = {
            "_nodeweaver_internal": {
                "mood": "appreciative",
                "input_kind": "forum",
                "mood_confidence": 0.9,
            }
        }
        lm = compute_life_mode_public(meta)
        self.assertEqual(lm["label"], "appreciative")
        self.assertEqual(lm["entity_channel"], "forum")
        self.assertGreater(lm["valence"], 0.5)
        self.assertIn("rhythm_phase_rad", lm)

    def test_trajectory_aggregate_and_sinusoid(self):
        base = 1_700_000_000
        samples = [
            {"ts": base, "mood": "frustrated", "input_kind": "feedback"},
            {"ts": base + 86400, "mood": "concerned", "input_kind": "feedback"},
            {"ts": base + 2 * 86400, "mood": "appreciative", "input_kind": "note"},
        ]
        rows = samples_from_mode_payload(samples)
        self.assertEqual(len(rows), 3)
        traj = aggregate_trajectory(rows)
        self.assertEqual(traj["count"], 3)
        self.assertIsNotNone(traj["mean_valence"])

        wave = fit_rhythm_sinusoid(rows, value_axis="valence", period_seconds=7 * 86400)
        self.assertTrue(wave["fit_ok"])
        self.assertIn("amplitude", wave)
        self.assertGreaterEqual(wave["r_squared"], -1.0)

    def test_sinusoid_insufficient_samples(self):
        wave = fit_rhythm_sinusoid([], period_seconds=86400)
        self.assertFalse(wave["fit_ok"])


if __name__ == "__main__":
    unittest.main()
