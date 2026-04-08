"""Shared classification profile helpers for NodeWeaver integrations."""
import re
from typing import Any, Dict, List, Optional

from config import Config

AXTASK_PROFILE_NAME = 'axtask'
AXTASK_CATEGORY_ALIASES = {
    'development': 'Development',
    'dev': 'Development',
    'technology': 'Development',
    'tech': 'Development',
    'software': 'Development',
    'meeting': 'Meeting',
    'call': 'Meeting',
    'conference': 'Meeting',
    'standup': 'Meeting',
    'research': 'Research',
    'academic': 'Research',
    'study': 'Research',
    'analysis': 'Research',
    'maintenance': 'Maintenance',
    'ops': 'Maintenance',
    'support': 'Maintenance',
    'administrative': 'Administrative',
    'admin': 'Administrative',
    'documentation': 'Administrative',
    'legal': 'Administrative',
    'political': 'Administrative',
    'general': 'General',
    'work': 'General',
    'personal': 'General',
    'health': 'General',
    'finance': 'General',
    'shopping': 'General',
    'travel': 'General',
    'entertainment': 'General',
    'other': 'General',
}
DEFAULT_AXTASK_CATEGORY_MAPPING = dict(AXTASK_CATEGORY_ALIASES)

_AXTASK_KEYWORDS = {
    'Development': ['api', 'backend', 'bug', 'build', 'code', 'database', 'debug', 'deploy', 'development', 'feature', 'fix', 'frontend', 'implementation', 'programming', 'refactor', 'release', 'repo', 'software', 'test'],
    'Meeting': ['1:1', 'call', 'conference', 'demo', 'discuss', 'discussion', 'kickoff', 'meeting', 'presentation', 'present', 'retro', 'review meeting', 'standup', 'sync', 'workshop'],
    'Research': ['analyze', 'analysis', 'benchmark', 'compare', 'evaluate', 'explore', 'investigate', 'learn', 'prototype', 'research', 'study'],
    'Maintenance': ['backup', 'cleanup', 'configure', 'install', 'maintain', 'maintenance', 'migrate', 'monitor', 'patch', 'renew', 'restore', 'setup', 'update', 'upgrade'],
    'Administrative': ['admin', 'approve', 'compliance', 'confirm', 'contract', 'coordination', 'document', 'email', 'follow-up', 'followup', 'invoice', 'paperwork', 'report', 'sign', 'submit'],
}

_MOOD_KEYWORDS = {
    'appreciative': ['awesome', 'excellent', 'good', 'great', 'happy', 'impressed', 'love', 'nice', 'perfect', 'solid', 'thanks', 'wonderful'],
    'concerned': ['concern', 'difficult', 'issue', 'maybe', 'risky', 'unclear', 'unsure', 'worry'],
    'frustrated': ['annoying', 'bad', 'broken', 'fail', 'frustrated', 'hate', 'problem', 'stuck', 'terrible', 'wrong'],
    'urgent': ['asap', 'critical', 'immediately', 'now', 'priority', 'rush', 'soon', 'today', 'urgent'],
}
_INPUT_KINDS = {'expression', 'feedback', 'task', 'forum', 'note'}
_FORUM_MARKERS = {
    'source': {'forum', 'community', 'community_forum', 'discourse', 'reddit'},
    'target_system': {'forum', 'community', 'community_forum'},
}


def resolve_classification_profile(metadata: Optional[Dict[str, Any]] = None) -> str:
    """Resolve the classification profile from request metadata."""
    if not isinstance(metadata, dict):
        return 'default'

    markers = [
        metadata.get('classification_profile'),
        metadata.get('target_system'),
        metadata.get('source'),
    ]
    for marker in markers:
        value = str(marker or '').strip().lower().replace('-', '').replace('_', '')
        if value == AXTASK_PROFILE_NAME:
            return AXTASK_PROFILE_NAME
    return 'default'


def is_axtask_payload(payload: Optional[Dict[str, Any]]) -> bool:
    """Return True when a request payload looks like an AxTask task."""
    if not isinstance(payload, dict):
        return False
    return any(key in payload for key in ('activity', 'notes', 'prerequisites', 'classification'))


def build_axtask_metadata(metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Merge request metadata with AxTask profile markers."""
    combined = dict(metadata or {})
    combined.setdefault('source', 'axtask')
    combined.setdefault('target_system', 'axtask')
    combined.setdefault('classification_profile', 'axtask')
    return combined


def extract_task_text(payload: Optional[Dict[str, Any]]) -> str:
    """Extract classifier text from AxTask or generic task payloads."""
    if not isinstance(payload, dict):
        return ''

    if isinstance(payload.get('text'), str) and payload['text'].strip():
        return payload['text'].strip()

    text_parts = []
    for field in (
        'activity',
        'notes',
        'prerequisites',
        'title',
        'description',
        'note',
        'note_body',
        'body',
        'journal',
        'journal_entry',
    ):
        value = payload.get(field)
        if isinstance(value, str) and value.strip():
            text_parts.append(value.strip())

    return ' | '.join(text_parts).strip()


def normalize_axtask_category(category: Optional[str], fallback: str = 'General') -> str:
    """Normalize a raw category into AxTask's canonical classification set."""
    key = str(category or '').strip().lower()
    if not key:
        return fallback
    if category in Config.AXTASK_CATEGORIES:
        return category
    return AXTASK_CATEGORY_ALIASES.get(key, fallback)


def predict_axtask_categories(text: str) -> List[Dict[str, Any]]:
    """Predict AxTask-compatible classifications from free-form task text."""
    text_lower = (text or '').lower().strip()
    if not text_lower:
        return [{'category': 'General', 'confidence': 0.35, 'keyword_matches': 0}]

    tokens = set(re.findall(r"[a-z0-9']+", text_lower))
    results = []
    for category, keywords in _AXTASK_KEYWORDS.items():
        matches = 0
        for keyword in keywords:
            if (' ' in keyword and keyword in text_lower) or keyword in tokens:
                matches += 1
        if matches:
            confidence = min(0.96, 0.62 + matches * 0.08)
            results.append({
                'category': category,
                'confidence': confidence,
                'keyword_matches': matches,
            })

    if not results:
        return [{'category': 'General', 'confidence': 0.45, 'keyword_matches': 0}]

    results.sort(key=lambda item: (item['confidence'], item['keyword_matches']), reverse=True)
    return results


def detect_input_kind(payload: Optional[Dict[str, Any]] = None, metadata: Optional[Dict[str, Any]] = None) -> str:
    """Infer whether the payload is an expression, feedback entry, or task."""
    if isinstance(metadata, dict):
        metadata_kind = str(metadata.get('input_kind', '')).strip().lower()
        if metadata_kind in _INPUT_KINDS:
            return metadata_kind
        et = str(metadata.get('entity_type', '')).strip().lower()
        if et in {'community_post', 'forum_post', 'thread'}:
            return 'forum'
        if et in {'feedback', 'review'}:
            return 'feedback'
        if et in {'note', 'journal', 'annotation'}:
            return 'note'
        if et in {'task', 'activity', 'todo'}:
            return 'task'
        for marker_key, allowed_values in _FORUM_MARKERS.items():
            marker_value = str(metadata.get(marker_key, '')).strip().lower()
            if marker_value in allowed_values:
                return 'forum'

    if isinstance(payload, dict):
        lowered_keys = {str(key).strip().lower() for key in payload.keys()}
        if {'thread', 'reply', 'replies', 'forum_post', 'community_post', 'upvotes', 'downvotes', 'reactions'} & lowered_keys:
            return 'forum'
        if {'feedback', 'review', 'rating', 'comment'} & lowered_keys:
            return 'feedback'
        if {'note', 'note_body', 'journal', 'journal_entry'} & lowered_keys:
            return 'note'
        if {'activity', 'prerequisites', 'task', 'todo', 'title', 'description', 'deadline', 'due_date'} & lowered_keys:
            return 'task'

    return 'expression'


def infer_hidden_mood(
    text: str,
    input_kind: str = 'expression',
    signal_boosts: Optional[Dict[str, int]] = None,
) -> Dict[str, Any]:
    """Infer a lightweight mood signal used only for internal classification cues."""
    text_lower = (text or '').lower().strip()
    if not text_lower:
        return {'mood': 'neutral', 'confidence': 0.2}

    tokens = re.findall(r"[a-z0-9']+", text_lower)
    token_set = set(tokens)
    scores = {mood: 0 for mood in _MOOD_KEYWORDS}
    for mood, keywords in _MOOD_KEYWORDS.items():
        for keyword in keywords:
            if (' ' in keyword and keyword in text_lower) or keyword in token_set:
                scores[mood] += 1

    punctuation_boost = text_lower.count('!') + text_lower.count('??')
    if punctuation_boost:
        scores['urgent'] += punctuation_boost
    if input_kind == 'feedback' and ('not ' in text_lower or "didn't" in text_lower):
        scores['frustrated'] += 1
    if isinstance(signal_boosts, dict):
        for mood, boost in signal_boosts.items():
            if mood in scores:
                scores[mood] += max(0, int(boost))

    top_mood = max(scores, key=scores.get)
    top_score = scores[top_mood]
    if top_score <= 0:
        return {'mood': 'neutral', 'confidence': 0.35}

    confidence = min(0.96, 0.55 + top_score * 0.1)
    return {'mood': top_mood, 'confidence': confidence}


def extract_forum_signal_boosts(
    payload: Optional[Dict[str, Any]] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, int]:
    """Extract mood hints from community forum engagement signals."""
    boosts = {'appreciative': 0, 'concerned': 0, 'frustrated': 0, 'urgent': 0}

    if isinstance(payload, dict):
        upvotes = payload.get('upvotes')
        downvotes = payload.get('downvotes')
        if isinstance(upvotes, int) and upvotes >= 10:
            boosts['appreciative'] += 1
        if isinstance(downvotes, int) and downvotes >= 4:
            boosts['frustrated'] += 1
            boosts['concerned'] += 1

        reactions = payload.get('reactions')
        if isinstance(reactions, dict):
            negative_reaction_count = 0
            for key, value in reactions.items():
                if not isinstance(value, int):
                    continue
                key_lower = str(key).lower()
                if key_lower in {'angry', 'downvote', 'thumbs_down', 'confused'} and value > 0:
                    negative_reaction_count += value
                elif key_lower in {'heart', 'like', 'thumbs_up'} and value > 0:
                    boosts['appreciative'] += 1
            if negative_reaction_count >= 2:
                boosts['frustrated'] += 1

        hot_words = str(payload.get('tags', '')).lower()
        if any(term in hot_words for term in ('incident', 'outage', 'breaking', 'urgent', 'help')):
            boosts['urgent'] += 1
            boosts['concerned'] += 1

    if isinstance(metadata, dict):
        thread_health = str(metadata.get('thread_health', '')).strip().lower()
        if thread_health in {'heated', 'conflict'}:
            boosts['frustrated'] += 1
        if thread_health in {'supportive', 'helpful'}:
            boosts['appreciative'] += 1
        if str(metadata.get('is_hot_thread', '')).strip().lower() in {'true', '1', 'yes'}:
            boosts['urgent'] += 1

    return boosts


def attach_hidden_nodeweaver_signals(
    text: str,
    metadata: Optional[Dict[str, Any]] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Attach hidden NodeWeaver-only signal metadata for downstream classification.

    For per-user archetypes and Markov behavior models, pass one of: user_id, axtask_user_id,
    account_id, subject_id, uid, principal_id on metadata (see utils.user_archetype).
    """
    merged_metadata = dict(metadata or {})
    input_kind = detect_input_kind(payload=payload, metadata=merged_metadata)
    forum_boosts = extract_forum_signal_boosts(payload=payload, metadata=merged_metadata) if input_kind == 'forum' else None
    mood = infer_hidden_mood(text, input_kind=input_kind, signal_boosts=forum_boosts)

    existing_internal = merged_metadata.get('_nodeweaver_internal')
    internal = dict(existing_internal) if isinstance(existing_internal, dict) else {}
    internal.update({
        'input_kind': input_kind,
        'mood': mood['mood'],
        'mood_confidence': mood['confidence'],
        'signal_version': 'nw-secret-mood-v1',
        'mode_layer': 'life_mode_v1',
    })
    if isinstance(forum_boosts, dict):
        internal['forum_signal_boosts'] = {key: value for key, value in forum_boosts.items() if value > 0}
    merged_metadata['_nodeweaver_internal'] = internal
    return merged_metadata