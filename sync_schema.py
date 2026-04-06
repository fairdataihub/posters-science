#!/usr/bin/env python3
"""
Sync poster_schema.json versions from the canonical poster-json-schema repository
into public/schema/ for Nuxt static hosting at posters.science/schema/...

Usage:
    python sync_schema.py              # fetch all known versions
    python sync_schema.py v0.2         # fetch specific version only
"""

import json
import sys
import urllib.request
from pathlib import Path

CANONICAL_BASE = "https://raw.githubusercontent.com/fairdataihub/poster-json-schema/main"
PUBLIC_DIR = Path("public/schema")

KNOWN_VERSIONS = ["v0.1", "v0.2"]


def fetch_version(version: str) -> None:
    url = f"{CANONICAL_BASE}/schemas/{version}/poster_schema.json"
    dest = PUBLIC_DIR / version / "poster_schema.json"
    dest.parent.mkdir(parents=True, exist_ok=True)

    print(f"Fetching {url}")
    with urllib.request.urlopen(url) as resp:
        schema = json.loads(resp.read().decode())

    with open(dest, "w", encoding="utf-8") as f:
        json.dump(schema, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"  -> {dest} ($id: {schema.get('$id', 'unknown')})")


if __name__ == "__main__":
    versions = [sys.argv[1]] if len(sys.argv) > 1 else KNOWN_VERSIONS
    for v in versions:
        fetch_version(v)
    print("Done.")
