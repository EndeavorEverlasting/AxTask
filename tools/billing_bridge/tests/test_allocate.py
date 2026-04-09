import pandas as pd

from billing_bridge.allocate import map_outward_assignments, allocate_hours


def test_single_supported_category_allocates_full_day():
    day_summary = pd.DataFrame(
        [
            {
                "work_date": "2026-03-24",
                "canonical_name": "Cyen Heyliger",
                "attendance_hours": 8.0,
                "clock_in": "08:00",
                "clock_out": "16:00",
                "distinct_categories": ["Neuron Deployment"],
                "exception_reason": None,
            }
        ]
    )
    outward_map = pd.DataFrame(
        [
            {
                "internal_task_category": "Neuron Deployment",
                "outward_project": "Northwell - Neurons",
                "outward_assignment": "Neuron Installation",
            }
        ]
    )

    mapped = map_outward_assignments(day_summary, outward_map)
    allocations, exceptions = allocate_hours(mapped)

    assert len(allocations) == 1
    assert allocations.iloc[0]["allocated_hours"] == 8.0
    assert len(exceptions) == 0
