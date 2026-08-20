#!/usr/bin/env python3
"""Fail-closed stdin/stdout adapter for the pinned OpenAI tiktoken backend."""

from __future__ import annotations

import importlib.metadata
import json
import sys
from typing import Any


def fail(message: str) -> None:
    print(json.dumps({"ok": False, "error": message}), file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    try:
        import tiktoken
    except Exception:
        fail("tiktoken is unavailable; install scripts/ai-harness/tokenizer-requirements.txt")

    try:
        payload: dict[str, Any] = json.load(sys.stdin)
    except Exception:
        fail("invalid JSON request")

    text = payload.get("text")
    encoding_name = payload.get("encoding")
    expected_version = payload.get("expectedVersion")
    if not isinstance(text, str):
        fail("request.text must be a string")
    if not isinstance(encoding_name, str) or not encoding_name:
        fail("request.encoding must be a non-empty string")

    version = importlib.metadata.version("tiktoken")
    if expected_version and version != expected_version:
        fail("installed tiktoken version does not match the registry pin")

    try:
        encoding = tiktoken.get_encoding(encoding_name)
        # Repository text can contain strings that look like special-token sentinels.
        # Count them as ordinary input text rather than granting special-token semantics.
        token_count = len(encoding.encode(text, disallowed_special=()))
    except Exception:
        fail("tiktoken could not encode the requested text with the configured encoding")

    print(json.dumps({
        "ok": True,
        "tokens": token_count,
        "encoding": encoding_name,
        "backend": "openai/tiktoken",
        "version": version,
    }))


if __name__ == "__main__":
    main()
