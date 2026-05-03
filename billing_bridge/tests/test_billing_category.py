"""Tests for billing_bridge.classifiers.billing_category.

Guards against drift in the document-type -> billing-category mapping.
"""

import pytest

from billing_bridge.classifiers.billing_category import (
    BILLING_CATEGORY_BILLING_SUMMARY,
    BILLING_CATEGORY_COURIER,
    BILLING_CATEGORY_DEPRECATED,
    BILLING_CATEGORY_LOGISTICS,
    BILLING_CATEGORY_PAYROLL,
    BILLING_CATEGORY_REVIEW_REQUIRED,
    BILLING_CATEGORY_TIME_AND_ATTENDANCE,
    ALL_BILLING_CATEGORIES,
    classify_billing_category,
)
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


# ── Document type -> billing category mapping ──────────────────────────────

MAPPING_CASES = [
    (PAYLOCITY_PDF, BILLING_CATEGORY_PAYROLL),
    (AAA_LOGISTICS_INVOICE, BILLING_CATEGORY_LOGISTICS),
    (NEW_YORK_MINUTE_COURIER_INVOICE, BILLING_CATEGORY_COURIER),
    (AGILANT_WEEKDAY_LOGISTICS_INVOICE, BILLING_CATEGORY_LOGISTICS),
    (ATTENDANCE_WORKBOOK, BILLING_CATEGORY_TIME_AND_ATTENDANCE),
    (BILLING_SUMMARY_WORKBOOK, BILLING_CATEGORY_BILLING_SUMMARY),
    (DEPRECATED_CANDIDATE, BILLING_CATEGORY_DEPRECATED),
    (UNKNOWN_REVIEW_REQUIRED, BILLING_CATEGORY_REVIEW_REQUIRED),
]


class TestCategoryMapping:
    @pytest.mark.parametrize("doc_type,expected_category", MAPPING_CASES)
    def test_known_mappings(self, doc_type, expected_category):
        result = classify_billing_category(doc_type, 0.92)
        assert result.billing_category == expected_category
        assert result.confidence == 0.92
        assert any(expected_category in n for n in result.notes)

    def test_unknown_document_type_defaults_to_review(self):
        result = classify_billing_category("totally_unknown_type", 0.55)
        assert result.billing_category == BILLING_CATEGORY_REVIEW_REQUIRED
        assert any("No billing category mapped" in n for n in result.notes)


# ── Category taxonomy completeness ──────────────────────────────────────────

class TestCategoryTaxonomy:
    def test_all_categories_are_strings(self):
        for cat in ALL_BILLING_CATEGORIES:
            assert isinstance(cat, str)
            assert len(cat) > 0

    def test_no_duplicate_categories(self):
        assert len(ALL_BILLING_CATEGORIES) == len(set(ALL_BILLING_CATEGORIES))
