#!/usr/bin/env python3
"""Validate a beta tag against every release-bearing project manifest."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BETA_TAG = re.compile(r"^v(?P<version>\d+\.\d+\.\d+-beta\.\d+)$")


def regex_version(path: str, pattern: str) -> str:
    content = (ROOT / path).read_text(encoding="utf-8")
    match = re.search(pattern, content, flags=re.MULTILINE)
    if not match:
        raise ValueError(f"could not find a release version in {path}")
    return match.group(1)


def main() -> int:
    if len(sys.argv) != 2:
        print(f"Usage: {Path(sys.argv[0]).name} v<major>.<minor>.<patch>-beta.<number>", file=sys.stderr)
        return 2

    tag = sys.argv[1]
    tag_match = BETA_TAG.fullmatch(tag)
    if not tag_match:
        print(f"Invalid beta tag: {tag}", file=sys.stderr)
        return 1

    expected = tag_match.group("version")
    versions = {
        "frontend/package.json": json.loads(
            (ROOT / "frontend/package.json").read_text(encoding="utf-8")
        )["version"],
        "src-tauri/tauri.conf.json": json.loads(
            (ROOT / "src-tauri/tauri.conf.json").read_text(encoding="utf-8")
        )["version"],
        "src-tauri/Cargo.toml": regex_version(
            "src-tauri/Cargo.toml", r"^\s*version\s*=\s*\"([^\"]+)\""
        ),
        "backend/Cargo.toml": regex_version(
            "backend/Cargo.toml", r"^\s*version\s*=\s*\"([^\"]+)\""
        ),
        "backend/Cargo.lock (drop-den-backend)": regex_version(
            "backend/Cargo.lock",
            r'\[\[package\]\]\nname = "drop-den-backend"\nversion = "([^"]+)"',
        ),
        "src-tauri/Cargo.lock (drop-den-desktop)": regex_version(
            "src-tauri/Cargo.lock",
            r'\[\[package\]\]\nname = "drop-den-desktop"\nversion = "([^"]+)"',
        ),
        "android-wrapper/app/build.gradle.kts": regex_version(
            "android-wrapper/app/build.gradle.kts",
            r"^\s*versionName\s*=\s*\"([^\"]+)\"",
        ),
    }

    mismatches = {path: version for path, version in versions.items() if version != expected}
    if mismatches:
        print(f"Tag version {expected} does not match:", file=sys.stderr)
        for path, version in mismatches.items():
            print(f"  {path}: {version}", file=sys.stderr)
        return 1

    print(expected)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
