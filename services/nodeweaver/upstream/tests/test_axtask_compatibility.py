import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from integration.axtask_client import AxTaskIntegration, ClassificationResult, NodeWeaverAxTaskClient
from utils.classification_profiles import (
    attach_hidden_nodeweaver_signals,
    detect_input_kind,
    extract_forum_signal_boosts,
    extract_task_text,
    infer_hidden_mood,
    predict_axtask_categories,
)
from utils.validators import validate_classification_input


class RecordingClient(NodeWeaverAxTaskClient):
    def _verify_connection(self):
        return None

    def _make_request(self, endpoint, method='GET', data=None, retries=3):
        self.last_request = {'endpoint': endpoint, 'method': method, 'data': data}
        if endpoint.startswith('/categories'):
            return {'categories': ['Development', 'Meeting', 'Research', 'Maintenance', 'Administrative', 'General']}
        if endpoint == '/classify/batch':
            return {
                'results': [{'predicted_category': 'Development', 'confidence_score': 0.91}],
                'processing_time': 0.01,
            }
        return {'predicted_category': 'technology', 'confidence_score': 0.88, 'similar_topics': [], 'similar_nodes': [], 'processing_time': 0.01}


class StubClassifier:
    def __init__(self):
        self.calls = []

    def classify_task(self, task_text, metadata=None):
        self.calls.append({'task_text': task_text, 'metadata': metadata})
        return ClassificationResult('technology', 0.87, [], [], 0.02)


class AxTaskCompatibilityTests(unittest.TestCase):
    def test_extract_task_text_and_validator_accept_axtask_fields(self):
        payload = {'activity': 'Implement classifier endpoint', 'notes': 'Match AxTask schema', 'prerequisites': 'Review API contract'}
        self.assertEqual(
            extract_task_text(payload),
            'Implement classifier endpoint | Match AxTask schema | Review API contract',
        )
        self.assertIsNone(validate_classification_input(payload))

    def test_validator_rejects_payload_without_text_sources(self):
        self.assertIn('Provide', validate_classification_input({'metadata': {'source': 'axtask'}}))

    def test_predict_axtask_categories_returns_canonical_labels(self):
        results = predict_axtask_categories('Fix backend API bug and deploy release')
        self.assertEqual(results[0]['category'], 'Development')

    def test_hidden_mood_detection_handles_feedback_and_urgency(self):
        self.assertEqual(detect_input_kind({'feedback': 'This release was rough'}), 'feedback')
        mood = infer_hidden_mood('This is broken and urgent, fix now!', input_kind='feedback')
        self.assertIn(mood['mood'], {'frustrated', 'urgent'})
        self.assertGreaterEqual(mood['confidence'], 0.55)

    def test_forum_payload_detects_kind_and_boosts_mood(self):
        payload = {
            'thread': 'Auth outage is breaking login flow',
            'replies': ['same here', 'still broken'],
            'upvotes': 18,
            'downvotes': 5,
            'tags': ['incident', 'help'],
            'reactions': {'angry': 3, 'like': 1},
        }
        self.assertEqual(
            detect_input_kind(payload, metadata={'source': 'community_forum'}),
            'forum',
        )
        boosts = extract_forum_signal_boosts(payload, metadata={'thread_health': 'heated'})
        self.assertGreaterEqual(boosts['urgent'], 1)
        self.assertGreaterEqual(boosts['frustrated'], 1)

    def test_attach_hidden_nodeweaver_signals_keeps_metadata_private(self):
        metadata = attach_hidden_nodeweaver_signals(
            text='Great work on this fix, thanks!',
            metadata={'source': 'axtask'},
            payload={'feedback': 'Great work on this fix, thanks!'},
        )
        self.assertEqual(metadata['source'], 'axtask')
        self.assertIn('_nodeweaver_internal', metadata)
        self.assertEqual(metadata['_nodeweaver_internal']['input_kind'], 'feedback')
        self.assertIn(metadata['_nodeweaver_internal']['mood'], {'appreciative', 'neutral'})

    def test_attach_hidden_nodeweaver_signals_includes_forum_internal_hints(self):
        metadata = attach_hidden_nodeweaver_signals(
            text='Login is broken for everyone, urgent help needed.',
            metadata={'source': 'community_forum', 'thread_health': 'heated'},
            payload={'thread': 'Login issue', 'upvotes': 12, 'downvotes': 5, 'tags': ['incident']},
        )
        internal = metadata['_nodeweaver_internal']
        self.assertEqual(internal['input_kind'], 'forum')
        self.assertIn(internal['mood'], {'urgent', 'frustrated', 'concerned'})
        self.assertIn('forum_signal_boosts', internal)

    def test_client_classify_task_adds_axtask_metadata(self):
        client = RecordingClient(api_url='http://nodeweaver.test')
        result = client.classify_task('Schedule sprint review', metadata={'axtask_id': 42})
        metadata = client.last_request['data']['metadata']

        self.assertEqual(client.last_request['endpoint'], '/classify')
        self.assertEqual(metadata['classification_profile'], 'axtask')
        self.assertEqual(metadata['target_system'], 'axtask')
        self.assertEqual(metadata['axtask_id'], 42)
        self.assertEqual(result.predicted_category, 'technology')

    def test_client_batch_classification_uses_axtask_profile(self):
        client = RecordingClient(api_url='http://nodeweaver.test')
        client.classify_tasks_batch(['Refactor API layer', '   '])
        payload = client.last_request['data']

        self.assertEqual(client.last_request['endpoint'], '/classify/batch')
        self.assertEqual(payload['texts'], ['Refactor API layer'])
        self.assertEqual(payload['metadata']['classification_profile'], 'axtask')

    def test_integration_maps_legacy_categories_to_axtask(self):
        classifier = StubClassifier()
        integration = AxTaskIntegration(nodeweaver_client=classifier)
        task = {'id': 7, 'activity': 'Implement webhook handler', 'notes': 'Ship this sprint'}

        updated = integration.categorize_task(task)

        self.assertEqual(updated['classification'], 'Development')
        self.assertEqual(updated['category'], 'Development')
        self.assertTrue(updated['auto_categorized'])
        self.assertEqual(updated['classification_metadata']['nodeweaver_category'], 'technology')
        self.assertEqual(classifier.calls[0]['task_text'], 'Implement webhook handler | Ship this sprint')


if __name__ == '__main__':
    unittest.main()