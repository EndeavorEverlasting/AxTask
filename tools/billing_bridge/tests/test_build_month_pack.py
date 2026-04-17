"""Unit tests for billing_bridge.build_month_pack — rollups and small helpers."""
from datetime import time

import pandas as pd
import pytest

from billing_bridge.build_month_pack import (
    aggregate_hours_by_project,
    canon,
    hours_between,
    month_labels,
)


class TestAggregateHoursByProject:
    def test_two_rows_same_project_one_tech(self):
        billing_df = pd.DataFrame(
            {
                "Staff Name": ["A", "A"],
                "Worked Project": ["P1", "P1"],
                "Hours": [4.0, 4.0],
                "Billing Bucket": ["Neurons", "Neurons"],
            }
        )
        out = aggregate_hours_by_project(billing_df)
        assert len(out) == 1
        assert out.iloc[0]["Worked Project"] == "P1"
        assert out.iloc[0]["Tech Count"] == 1
        assert out.iloc[0]["Worked Rows"] == 2
        assert out.iloc[0]["Billable Hours"] == 8.0

    def test_two_techs_same_project(self):
        billing_df = pd.DataFrame(
            {
                "Staff Name": ["A", "B", "B"],
                "Worked Project": ["North", "North", "North"],
                "Hours": [8.0, 4.0, 4.0],
                "Billing Bucket": ["Neurons", "Neurons", "Neurons"],
            }
        )
        out = aggregate_hours_by_project(billing_df)
        assert len(out) == 1
        assert out.iloc[0]["Tech Count"] == 2
        assert out.iloc[0]["Worked Rows"] == 3
        assert out.iloc[0]["Billable Hours"] == 16.0

    def test_multiple_projects_sorted_by_hours_desc(self):
        billing_df = pd.DataFrame(
            {
                "Staff Name": ["A", "B", "C"],
                "Worked Project": ["Small", "Big", "Big"],
                "Hours": [1.0, 5.0, 10.0],
                "Billing Bucket": ["Neurons", "Neurons", "Neurons"],
            }
        )
        out = aggregate_hours_by_project(billing_df)
        assert list(out["Worked Project"]) == ["Big", "Small"]
        assert out.iloc[0]["Billable Hours"] == 15.0
        assert out.iloc[1]["Billable Hours"] == 1.0

    def test_empty_frame(self):
        billing_df = pd.DataFrame(
            columns=["Staff Name", "Worked Project", "Hours", "Billing Bucket"]
        )
        out = aggregate_hours_by_project(billing_df)
        assert out.empty
        assert list(out.columns) == ["Worked Project", "Tech Count", "Worked Rows", "Billable Hours"]

    def test_missing_column_raises(self):
        billing_df = pd.DataFrame({"Staff Name": ["A"]})
        with pytest.raises(ValueError, match="missing columns"):
            aggregate_hours_by_project(billing_df)

    def test_nan_project_grouped(self):
        billing_df = pd.DataFrame(
            {
                "Staff Name": ["A", "B"],
                "Worked Project": [pd.NA, pd.NA],
                "Hours": [2.0, 3.0],
                "Billing Bucket": ["Neurons", "Neurons"],
            }
        )
        out = aggregate_hours_by_project(billing_df)
        assert len(out) == 1
        assert pd.isna(out.iloc[0]["Worked Project"])


class TestHoursBetween:
    def test_same_day_shift(self):
        assert hours_between(time(8, 0), time(16, 0)) == 8.0

    def test_cross_midnight(self):
        assert hours_between(time(22, 0), time(6, 0)) == 8.0

    def test_non_time_returns_none(self):
        assert hours_between("PTO", time(9, 0)) is None


class TestMonthLabels:
    def test_march_2026(self):
        assert month_labels(2026, 3) == ("March", "Mar 26")


class TestCanon:
    def test_alias(self):
        assert canon("Richard Perez") == "Rich Perez"

    def test_passthrough(self):
        assert canon("Taylor Example") == "Taylor Example"
