"""Shared output schemas for Billing Bridge document classification."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(slots=True, frozen=True)
class DocumentClassification:
    """Classification result for a single uploaded document.

    Fields
    ------
    file_id: UUID or internal identifier for the uploaded file.
    filename: Original uploaded filename.
    detected_type: One of the supported document-type constants.
    billing_month: YYYY-MM string parsed from the document or filename, or None.
    vendor: Human-readable vendor / source name, or None.
    po_number: Purchase-order number extracted from filename or text, or None.
    confidence: 0.0 – 1.0 score produced by the classifier heuristic.
    review_required: True when confidence falls below the threshold or flags exist.
    notes: Human-readable classifier observations (e.g. pattern matches, warnings).
    """

    file_id: str
    filename: str
    detected_type: str
    billing_month: str | None
    vendor: str | None
    po_number: str | None
    confidence: float
    review_required: bool
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "file_id": self.file_id,
            "filename": self.filename,
            "detected_type": self.detected_type,
            "billing_month": self.billing_month,
            "vendor": self.vendor,
            "po_number": self.po_number,
            "confidence": self.confidence,
            "review_required": self.review_required,
            "notes": list(self.notes),
        }
