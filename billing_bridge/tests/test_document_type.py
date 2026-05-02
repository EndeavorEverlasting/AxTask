"""Tests for billing_bridge.classifiers.document_type.

These tests exercise filename-only, text-only, and combined heuristics to
guard against classifier drift as vendor naming conventions evolve.
"""

import pytest

from billing_bridge.classifiers.document_type import (
    AGILANT_WEEKDAY_LOGISTICS_INVOICE,
    ATTENDANCE_WORKBOOK,
    BILLING_SUMMARY_WORKBOOK,
    DEPRECATED_CANDIDATE,
    NEW_YORK_MINUTE_COURIER_INVOICE,
    PAYLOCITY_PDF,
    AAA_LOGISTICS_INVOICE,
    UNKNOWN_REVIEW_REQUIRED,
    classify_document_type,
)


# ── Filename-only fixtures ────────────────────────────────────────────────

FILENAME_CASES = [
    ("Paylocity_Payroll_2026-04.pdf", PAYLOCITY_PDF, 0.60),
    ("AAA_Disposal_Logistics_Invoice_2026-04-12_PO176759.docx", AAA_LOGISTICS_INVOICE, 0.70),
    ("NYMinute_Courier_Invoice_April2026.xlsx", NEW_YORK_MINUTE_COURIER_INVOICE, 0.70),
    ("Agilant_Weekday_Logistics_Invoice_2026-04.pdf", AGILANT_WEEKDAY_LOGISTICS_INVOICE, 0.70),
    ("Attendance_Roster_2026-04.xlsx", ATTENDANCE_WORKBOOK, 0.35),
    ("Billing_Summary_Pack_April2026.xlsx", BILLING_SUMMARY_WORKBOOK, 0.55),
    ("CANDIDATE_Old_Roster_2026-03.xlsx", DEPRECATED_CANDIDATE, 0.90),
    ("random_file_xyz.txt", UNKNOWN_REVIEW_REQUIRED, 0.0),
]


class TestFilenameOnlyClassification:
    @pytest.mark.parametrize("filename,expected_type,min_confidence", FILENAME_CASES)
    def test_filename_classification(self, filename, expected_type, min_confidence):
        result = classify_document_type(filename)
        assert result.detected_type == expected_type
        assert result.confidence >= min_confidence


# ── Text-only fixtures ──────────────────────────────────────────────────────

TEXT_ONLY_CASES = [
    (
        "payroll_export.pdf",
        "Pay Period 04/01/2026 – 04/15/2026  Net Pay  $3,200.00",
        PAYLOCITY_PDF,
    ),
    (
        "vendor_doc.docx",
        "AAA Disposal Services LLC  Invoice dated 2026-04-12  PO 176759",
        AAA_LOGISTICS_INVOICE,
    ),
    (
        "delivery_bill.pdf",
        "New York Minute Courier  Rate per delivery $12.50  Total trips 48",
        NEW_YORK_MINUTE_COURIER_INVOICE,
    ),
    (
        "logistics_april.xlsx",
        "Agilant Weekday Logistics  Services rendered  April 2026",
        AGILANT_WEEKDAY_LOGISTICS_INVOICE,
    ),
    (
        "hours_sheet.xlsx",
        "Employee Attendance  Clock In 08:00  Clock Out 17:00  Hours 9.0",
        ATTENDANCE_WORKBOOK,
    ),
    (
        "summary_doc.xlsx",
        "Billing Summary  Total allocated hours  172  Reconcile by 05-01",
        BILLING_SUMMARY_WORKBOOK,
    ),
]


class TestTextOnlyClassification:
    @pytest.mark.parametrize("filename,text,expected_type", TEXT_ONLY_CASES)
    def test_text_classification(self, filename, text, expected_type):
        result = classify_document_type(filename, text)
        assert result.detected_type == expected_type


# ── Combined (filename + text) confidence boost ──────────────────────────

COMBINED_CASES = [
    (
        "AAA_Invoice_2026-04-12.docx",
        "AAA Disposal Logistics  Invoice  PO 176759",
        AAA_LOGISTICS_INVOICE,
        0.75,
    ),
    (
        "Paylocity_Payroll_April2026.pdf",
        "Paylocity  Payroll Summary  Pay Period 2026-04  Gross Pay  $4,000",
        PAYLOCITY_PDF,
        0.70,
    ),
]


class TestCombinedClassification:
    @pytest.mark.parametrize("filename,text,expected_type,min_confidence", COMBINED_CASES)
    def test_combined_boost(self, filename, text, expected_type, min_confidence):
        result = classify_document_type(filename, text)
        assert result.detected_type == expected_type
        assert result.confidence >= min_confidence


# ── Edge cases ─────────────────────────────────────────────────────────────

class TestEdgeCases:
    def test_empty_filename_review(self):
        result = classify_document_type("")
        assert result.detected_type == UNKNOWN_REVIEW_REQUIRED
        assert result.confidence < 0.70

    def test_garbage_filename_and_text(self):
        result = classify_document_type("foo.bar", "lorem ipsum dolor sit amet")
        assert result.detected_type == UNKNOWN_REVIEW_REQUIRED

    def test_deprecated_prefix_overrides_other_signals(self):
        result = classify_document_type("CANDIDATE_Attendance_Roster_2026-04.xlsx")
        assert result.detected_type == DEPRECATED_CANDIDATE
        assert result.confidence >= 0.90

    def test_notes_populated(self):
        result = classify_document_type("random.xyz")
        assert any("Low confidence" in n for n in result.notes)
