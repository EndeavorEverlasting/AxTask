#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path.cwd()
EXCLUDED_DIRS = {".git", "node_modules", "dist", "build", "coverage", "docs", "venv", ".venv", "__pycache__"}
SCAN_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"}
AXIOS_USAGE = re.compile(r"(from\s+['\"]axios['\"]|require\(\s*['\"]axios['\"]\s*\)|\baxios\.)", re.IGNORECASE)


def iter_files(root: Path):
    for path in root.rglob("*"):
        if path.is_dir():
            continue
        if any(part in EXCLUDED_DIRS for part in path.parts):
            continue
        if path.suffix.lower() in SCAN_EXTENSIONS:
            yield path


def main() -> int:
    offenders: list[str] = []

    for file_path in iter_files(ROOT):
        try:
            content = file_path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        if AXIOS_USAGE.search(content):
            offenders.append(str(file_path.relative_to(ROOT)))

    package_json = ROOT / "package.json"
    if package_json.exists():
        try:
            pkg = json.loads(package_json.read_text(encoding="utf-8"))
            for key in ("dependencies", "devDependencies", "optionalDependencies"):
                deps = pkg.get(key, {})
                if isinstance(deps, dict) and "axios" in deps:
                    offenders.append("package.json (direct dependency: axios)")
                    break
        except Exception:
            offenders.append("package.json (unable to parse for axios policy check)")

    if offenders:
        print("Security policy violation: axios usage/dependency detected.", file=sys.stderr)
        for offender in offenders:
            print(f" - {offender}", file=sys.stderr)
        print("Do not introduce axios in this repository.", file=sys.stderr)
        return 1

    print("Axios guard passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
