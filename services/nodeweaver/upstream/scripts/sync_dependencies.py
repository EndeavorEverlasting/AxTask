#!/usr/bin/env python3
"""
Synchronize local dependencies for NodeWeaver.

This script is designed to be called from git hooks (post-merge) or manually.
It prefers uv when available and falls back to pip editable installs.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> int:
    print(f"[deps-sync] Running: {' '.join(cmd)}")
    proc = subprocess.run(cmd, cwd=str(cwd))
    return int(proc.returncode)


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync NodeWeaver dependencies.")
    parser.add_argument(
        "--with-dev",
        action="store_true",
        help="Install development dependencies (e.g. pytest).",
    )
    parser.add_argument(
        "--auto",
        action="store_true",
        help="Hook mode: prints concise status lines for git hooks.",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    use_uv = shutil.which("uv") is not None
    python_exe = sys.executable

    if use_uv:
        cmd = ["uv", "sync", "--frozen"] if (repo_root / "uv.lock").exists() else ["uv", "sync"]
        if args.with_dev:
            cmd.extend(["--extra", "dev"])
        return run(cmd, repo_root)

    target = ".[dev]" if args.with_dev else "."
    return run([python_exe, "-m", "pip", "install", "-e", target], repo_root)


if __name__ == "__main__":
    raise SystemExit(main())
