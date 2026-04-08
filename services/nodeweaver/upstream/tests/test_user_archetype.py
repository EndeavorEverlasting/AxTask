import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.user_archetype import compute_user_archetype, extract_user_id


class UserArchetypeTests(unittest.TestCase):
    def test_extract_user_id(self):
        self.assertEqual(extract_user_id({"user_id": "u-1"}), "u-1")
        self.assertEqual(extract_user_id({"axtask_user_id": 42}), "42")
        self.assertIsNone(extract_user_id({}))

    def test_compute_archetype(self):
        rows = [
            {
                "ts": float(i * 3600),
                "valence": -0.2,
                "activation": 0.85,
                "life_mode": {"entity_channel": "task", "label": "urgent"},
            }
            for i in range(5)
        ]
        rows += [
            {
                "ts": 99999.0,
                "valence": 0.7,
                "activation": 0.4,
                "life_mode": {"entity_channel": "feedback", "label": "appreciative"},
            }
        ]
        p = compute_user_archetype(rows)
        self.assertEqual(p["sample_count"], 6)
        self.assertTrue(p["archetypes"])
        self.assertIn("markov", p)
        self.assertTrue(p["markov"].get("ready") or p["sample_count"] >= 2)


if __name__ == "__main__":
    unittest.main()
