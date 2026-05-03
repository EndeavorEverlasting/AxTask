from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from typing import Optional


@dataclass(slots=True)
class AttendanceRow:
    work_date: date
    canonical_name: str
    clock_in: Optional[time]
    clock_out: Optional[time]
    attendance_hours: float
    attendance_source: str
    source_row_id: str


@dataclass(slots=True)
class TaskEvidenceRow:
    work_date: date
    canonical_name: str
    site: Optional[str]
    room_area: Optional[str]
    workstream: Optional[str]
    task_category: str
    notes: Optional[str]
    quantity: Optional[float]
    unit_type: Optional[str]
    evidence_source: str
    source_row_id: str
    confidence: str = "review"


@dataclass(slots=True)
class AllocationDecision:
    work_date: date
    canonical_name: str
    outward_project: str
    outward_assignment: str
    allocated_hours: float
    attendance_hours: float
    allocation_rule: str
    evidence_count: int
    exception_flag: bool = False
    exception_reason: Optional[str] = None


@dataclass(slots=True)
class ExceptionRow:
    work_date: Optional[date]
    canonical_name: Optional[str]
    issue_type: str
    details: str
    status: str = "open"
    resolution_note: Optional[str] = None
