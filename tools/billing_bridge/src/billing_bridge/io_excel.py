from __future__ import annotations

from pathlib import Path
from typing import Iterable

import pandas as pd


def load_workbook_sheets(path: str | Path) -> dict[str, pd.DataFrame]:
    """Load every sheet in a workbook as a DataFrame."""
    workbook_path = Path(path)
    xls = pd.ExcelFile(workbook_path)
    return {sheet: xls.parse(sheet) for sheet in xls.sheet_names}


def add_lineage(df: pd.DataFrame, workbook_name: str, sheet_name: str) -> pd.DataFrame:
    out = df.copy()
    out["__workbook__"] = workbook_name
    out["__sheet__"] = sheet_name
    out["__source_row__"] = range(2, len(out) + 2)
    return out


def write_csv_bundle(out_dir: str | Path, frames: dict[str, pd.DataFrame]) -> None:
    out_path = Path(out_dir)
    out_path.mkdir(parents=True, exist_ok=True)
    for name, frame in frames.items():
        safe = name.lower().replace(" ", "_").replace("/", "_")
        frame.to_csv(out_path / f"{safe}.csv", index=False)


def write_excel(path: str | Path, frames: dict[str, pd.DataFrame]) -> None:
    out_path = Path(path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        for sheet_name, frame in frames.items():
            frame.to_excel(writer, index=False, sheet_name=sheet_name[:31])
