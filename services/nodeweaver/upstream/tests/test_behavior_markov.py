import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from utils.behavior_markov import (
    build_transition_counts,
    discrete_state,
    markov_summary_from_rows,
    predict_next_distribution,
    transition_counts_to_probabilities,
)


class BehaviorMarkovTests(unittest.TestCase):
    def test_discrete_state(self):
        self.assertEqual(discrete_state("task", "urgent"), "task|urgent")

    def test_transitions_and_prediction(self):
        states = ["task|urgent", "task|urgent", "forum|frustrated", "feedback|appreciative"]
        c = build_transition_counts(states)
        self.assertEqual(c["task|urgent"]["task|urgent"], 1)
        self.assertEqual(c["task|urgent"]["forum|frustrated"], 1)
        p = transition_counts_to_probabilities(c, laplace=1.0)
        nxt = predict_next_distribution("task|urgent", p, top_k=3)
        self.assertTrue(nxt)

    def test_markov_summary_from_rows(self):
        rows = [
            {
                "ts": 100.0,
                "valence": 0.0,
                "activation": 0.5,
                "life_mode": {"entity_channel": "task", "label": "urgent"},
            },
            {
                "ts": 200.0,
                "valence": -0.5,
                "activation": 0.7,
                "life_mode": {"entity_channel": "forum", "label": "frustrated"},
            },
            {
                "ts": 300.0,
                "valence": 0.6,
                "activation": 0.4,
                "life_mode": {"entity_channel": "note", "label": "appreciative"},
            },
        ]
        s = markov_summary_from_rows(rows)
        self.assertTrue(s["ready"])
        self.assertEqual(s["last_state"], "note|appreciative")
        self.assertTrue(s["next_step_candidates"])


if __name__ == "__main__":
    unittest.main()
