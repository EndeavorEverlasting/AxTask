"""Billing-category classifier for Billing Bridge.

Maps a detected document type to a billing category used downstream for
allocation and reconciliation.  Keeps the naming layer separate from the
billing layer so category labels can change without touching document patterns.
"""

from __future__ import annotations

from dataclasses import dataclass

from billing_bridge.classifiers.document_type import (
    AGILANT_WEEKDAY_LOGISTICS_INVOICE,
    ATTENDANCE_WORKBOOK,
    BILLING_SUMMARY_WORKBOOK,
    DEPRECATED_CANDIDATE,
    NEW_YORK_MINUTE_COURIER_INVOICE,
    PAYLOCITY_PDF,
    AAA_LOGISTICS_INVOICE,
    UNKNOWN_REVIEW_REQUIRED,
)


# ── Supported billing categories ──────────────────────────────────────────

BILLING_CATEGORY_PAYROLL = "payroll"
BILLING_CATEGORY_LOGISTICS = "logistics"
BILLING_CATEGORY_COURIER = "courier"
BILLING_CATEGORY_TIME_AND_ATTENDANCE = "time_and_attendance"
BILLING_CATEGORY_BILLING_SUMMARY = "billing_summary"
BILLING_CATEGORY_DEPRECATED = "deprecated"
BILLING_CATEGORY_REVIEW_REQUIRED = "review_required"

ALL_BILLING_CATEGORIES: tuple[str, ...] = (
    BILLING_CATEGORY_PAYROLL,
    BILLING_CATEGORY_LOGISTICS,
    BILLING_CATEGORY_COURIER,
    BILLING_CATEGORY_TIME_AND_ATTENDANCE,
    BILLING_CATEGORY_BILLING_SUMMARY,
    BILLING_CATEGORY_DEPRECATED,
    BILLING_CATEGORY_REVIEW_REQUIRED,
)


# ── Mapping from document type -> billing category ─────────────────────────

_DOC_TYPE_TO_BILLING_CATEGORY: dict[str, str] = {
    PAYLOCITY_PDF: BILLING_CATEGORY_PAYROLL,
    AAA_LOGISTICS_INVOICE: BILLING_CATEGORY_LOGISTICS,
    NEW_YORK_MINUTE_COURIER_INVOICE: BILLING_CATEGORY_COURIER,
    AGILANT_WEEKDAY_LOGISTICS_INVOICE: BILLING_CATEGORY_LOGISTICS,
    ATTENDANCE_WORKBOOK: BILLING_CATEGORY_TIME_AND_ATTENDANCE,
    BILLING_SUMMARY_WORKBOOK: BILLING_CATEGORY_BILLING_SUMMARY,
    DEPRECATED_CANDIDATE: BILLING_CATEGORY_DEPRECATED,
    UNKNOWN_REVIEW_REQUIRED: BILLING_CATEGORY_REVIEW_REQUIRED,
}


# ── Result container ───────────────────────────────────────────────────────

@dataclass(slots=True, frozen=True)
class BillingCategoryResult:
    billing_category: str
    confidence: float
    notes: list[str]


# ── Public API ────────────────────────────────────────────────────────────

def classify_billing_category(
    document_type: str,
    document_confidence: float,
) -> BillingCategoryResult:
    """Map a document type to its billing category.

    Parameters
    ----------
    document_type: The detected document type (from document_type classifier).
    document_confidence: Confidence score from the document-type classifier.

    Returns
    -------
    BillingCategoryResult with billing_category, inherited confidence, and notes.
    """
    category = _DOC_TYPE_TO_BILLING_CATEGORY.get(
        document_type, BILLING_CATEGORY_REVIEW_REQUIRED
    )
    notes: list[str] = []

    if category == BILLING_CATEGORY_REVIEW_REQUIRED:
        notes.append(f"No billing category mapped for '{document_type}'; review required.")
    else:
        notes.append(f"Mapped '{document_type}' -> '{category}'.")

    return BillingCategoryResult(
        billing_category=category,
        confidence=document_confidence,
        notes=notes,
    )
