"""Document-type classifier for Billing Bridge.

Uses filename patterns and optional extracted text to classify inbound billing
files.  Returns the detected type, a confidence score, and any notes.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence


# ── Supported document types ──────────────────────────────────────────────

PAYLOCITY_PDF = "paylocity_pdf"
AAA_LOGISTICS_INVOICE = "aaa_logistics_invoice"
NEW_YORK_MINUTE_COURIER_INVOICE = "new_york_minute_courier_invoice"
AGILANT_WEEKDAY_LOGISTICS_INVOICE = "agilant_weekday_logistics_invoice"
ATTENDANCE_WORKBOOK = "attendance_workbook"
BILLING_SUMMARY_WORKBOOK = "billing_summary_workbook"
DEPRECATED_CANDIDATE = "deprecated_candidate"
UNKNOWN_REVIEW_REQUIRED = "unknown_review_required"

ALL_DOCUMENT_TYPES: tuple[str, ...] = (
    PAYLOCITY_PDF,
    AAA_LOGISTICS_INVOICE,
    NEW_YORK_MINUTE_COURIER_INVOICE,
    AGILANT_WEEKDAY_LOGISTICS_INVOICE,
    ATTENDANCE_WORKBOOK,
    BILLING_SUMMARY_WORKBOOK,
    DEPRECATED_CANDIDATE,
    UNKNOWN_REVIEW_REQUIRED,
)

# ── Classifier result container ───────────────────────────────────────────

@dataclass(slots=True, frozen=True)
class DocumentTypeResult:
    detected_type: str
    confidence: float
    notes: list[str]


# ── Heuristic helpers ─────────────────────────────────────────────────────

def _filename_tokens(filename: str) -> set[str]:
    """Lower-case, non-empty tokens from the filename (stem only)."""
    stem = filename.split("/")[-1].split("\\")[-1]
    stem = stem.rsplit(".", 1)[0] if "." in stem else stem
    return {t.lower() for t in re.split(r"[_\-\s.]", stem) if t}


def _text_tokens(text: str) -> set[str]:
    """Lower-case word-ish tokens from extracted text."""
    return {t.lower() for t in re.findall(r"[A-Za-z0-9]+", text)}


def _score_match(tokens: set[str], patterns: Sequence[str]) -> float:
    """Return ratio of matched patterns (0.0 – 1.0).

    Handles single-word exact/substring matches and multi-word phrase
    matches (all words must appear in the token set).
    """
    if not patterns:
        return 0.0

    matched = 0
    for p in patterns:
        p_lower = p.lower()
        words = p_lower.split()
        if len(words) == 1:
            if p_lower in tokens or any(p_lower in t for t in tokens):
                matched += 1
        else:
            if all(w in tokens for w in words):
                matched += 1
    return matched / len(patterns)


# ── Per-type matchers ─────────────────────────────────────────────────────

_TYPE_PATTERNS: dict[str, dict[str, list[str]]] = {
    PAYLOCITY_PDF: {
        "filename": ["paylocity", "payroll", "paystub"],
        "text": ["paylocity", "payroll", "pay period", "net pay", "gross pay"],
    },
    AAA_LOGISTICS_INVOICE: {
        "filename": ["aaa", "disposal", "logistics", "invoice"],
        "text": ["aaa", "disposal", "logistics", "invoice", "po", "purchase order"],
    },
    NEW_YORK_MINUTE_COURIER_INVOICE: {
        "filename": ["new_york_minute", "nyminute", "courier", "invoice"],
        "text": ["new york minute", "courier", "delivery", "invoice", "rate"],
    },
    AGILANT_WEEKDAY_LOGISTICS_INVOICE: {
        "filename": ["agilant", "weekday", "logistics", "invoice"],
        "text": ["agilant", "weekday", "logistics", "invoice", "services"],
    },
    ATTENDANCE_WORKBOOK: {
        "filename": ["attendance", "roster", "hours", "track", "time"],
        "text": ["attendance", "clock in", "clock out", "hours", "employee", "roster"],
    },
    BILLING_SUMMARY_WORKBOOK: {
        "filename": ["billing", "summary", "pack", "bridge", "month"],
        "text": ["billing", "summary", "total", "allocated", "reconcile"],
    },
    DEPRECATED_CANDIDATE: {
        "filename": ["candidate", "deprecated", "old", "archive"],
        "text": ["deprecated", "candidate", "obsolete"],
    },
}


# ── Confidence threshold for auto-approval ────────────────────────────────

REVIEW_CONFIDENCE_THRESHOLD = 0.35


# ── Public API ────────────────────────────────────────────────────────────

def classify_document_type(
    filename: str,
    extracted_text: str = "",
) -> DocumentTypeResult:
    """Classify a single document by filename and optional extracted text.

    Parameters
    ----------
    filename: The original uploaded filename (including extension).
    extracted_text: Plain text extracted from the file, if available.

    Returns
    -------
    DocumentTypeResult with detected_type, confidence, and notes.
    """
    fname_tokens = _filename_tokens(filename)
    text_tokens = _text_tokens(extracted_text)
    notes: list[str] = []

    scores: dict[str, float] = {}
    for doc_type, patterns in _TYPE_PATTERNS.items():
        fname_score = _score_match(fname_tokens, patterns["filename"])
        text_score = _score_match(text_tokens, patterns["text"]) if extracted_text else 0.0

        if extracted_text:
            if fname_score >= 0.5:
                # Strong filename signal dominates.
                combined = (fname_score * 0.6) + (text_score * 0.4)
            else:
                # Weak filename — let text carry the classification.
                combined = (fname_score * 0.2) + (text_score * 0.8)
            # Boost confidence when both filename and text agree.
            if fname_score > 0 and text_score > 0:
                combined = min(1.0, combined + 0.15)
        else:
            # No text available — filename is the only signal.
            combined = fname_score

        scores[doc_type] = combined

    # Deprecated candidate gets a special boost if the filename starts with CANDIDATE_
    if filename.upper().startswith("CANDIDATE_"):
        scores[DEPRECATED_CANDIDATE] = max(scores.get(DEPRECATED_CANDIDATE, 0.0), 0.95)
        notes.append("Filename prefix 'CANDIDATE_' triggers deprecated flag.")

    best_type = max(scores, key=scores.get, default=UNKNOWN_REVIEW_REQUIRED)
    best_score = scores.get(best_type, 0.0)

    if best_score < REVIEW_CONFIDENCE_THRESHOLD:
        notes.append(
            f"Low confidence ({best_score:.2f}) for '{best_type}'; routing to review."
        )
        best_type = UNKNOWN_REVIEW_REQUIRED
        best_score = round(best_score, 2)
    else:
        best_score = round(min(best_score, 1.0), 2)
        notes.append(f"Pattern match confidence {best_score:.2f} for '{best_type}'.")

    return DocumentTypeResult(
        detected_type=best_type,
        confidence=best_score,
        notes=notes,
    )
