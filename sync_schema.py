#!/usr/bin/env python3
"""
Sync poster_schema.json versions from the canonical poster-json-schema repository
into public/schema/ for Nuxt static hosting at posters.science/schema/..., and keep
the app's controlled-vocabulary data files in step with the schema's enums.

The app does not validate against the schema itself: app/utils/poster_schema.ts
builds its zod enums from app/assets/data/*.json. A term added to the schema is
therefore rejected at runtime, and missing from the UI dropdowns, until it also
lands in those files.

Usage:
    python sync_schema.py              # fetch all known versions, then sync data files
    python sync_schema.py v0.2         # fetch one version, then sync data files
    python sync_schema.py --data-only  # skip the fetch; sync data files from the local schema
    python sync_schema.py --check      # no writes; exit 1 if the data files have drifted
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

CANONICAL_BASE = "https://raw.githubusercontent.com/fairdataihub/poster-json-schema/main"
PUBLIC_DIR = Path("public/schema")
DATA_DIR = Path("app/assets/data")

KNOWN_VERSIONS = ["v0.1", "v0.2"]

# The schema version whose vocabularies the app validates against.
VOCAB_VERSION = "v0.2"


def humanize(value: str) -> str:
    """CamelCase to spaced words: 'BookChapter' -> 'Book Chapter'."""
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", value)


# One entry per data file the app reads. `schema_owned` fields are refreshed from
# the schema on every sync; every other field is hand-authored and preserved.
# `review` names the fields a human has to fill in for newly added terms.
VOCABULARIES = [
    {
        "filename": "resource-types.json",
        "definition": "resourceType",
        "key": "value",
        "new_entry": lambda const, description: {
            "label": humanize(const),
            "value": const,
        },
        "schema_owned": [],
        "review": [],
    },
    {
        "filename": "identifier-types.json",
        "definition": "identifierType",
        "key": "value",
        # Identifier labels and placeholders are editorial ("ARK (Archival Resource
        # Key)", "e.g., ark:/12345/67890") and cannot be derived from the term.
        "new_entry": lambda const, description: {
            "value": const,
            "label": const,
            "placeholder": "",
            "description": description,
        },
        "schema_owned": ["description"],
        "review": ["label", "placeholder"],
    },
    {
        "filename": "relation-types.json",
        "definition": "relationType",
        "key": "const",
        "new_entry": lambda const, description: {
            "const": const,
            "label": humanize(const),
            "description": description,
        },
        "schema_owned": ["description"],
        "review": [],
    },
]


def fetch_version(version: str) -> None:
    url = f"{CANONICAL_BASE}/schemas/{version}/poster_schema.json"
    dest = PUBLIC_DIR / version / "poster_schema.json"
    dest.parent.mkdir(parents=True, exist_ok=True)

    print(f"Fetching {url}")
    with urllib.request.urlopen(url) as resp:
        schema = json.loads(resp.read().decode())

    write_json(dest, schema)
    print(f"  -> {dest} ($id: {schema.get('$id', 'unknown')})")


def write_json(path: Path, payload) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def schema_terms(definition: dict) -> list:
    """(term, description) pairs from either an `enum` or a `oneOf` of consts."""
    if "enum" in definition:
        return [(value, "") for value in definition["enum"]]
    return [
        (member["const"], member.get("description", ""))
        for member in definition.get("oneOf", [])
    ]


def sync_vocabulary(spec: dict, definitions: dict, check_only: bool) -> bool:
    """Merge one data file with its schema definition. Returns True if it drifted."""
    path = DATA_DIR / spec["filename"]
    key = spec["key"]
    terms = schema_terms(definitions[spec["definition"]])

    with open(path, encoding="utf-8") as f:
        existing = {entry[key]: entry for entry in json.load(f)}

    merged, added, refreshed = [], [], []
    for term, description in terms:
        entry = existing.get(term)
        if entry is None:
            entry = spec["new_entry"](term, description)
            added.append(term)
        else:
            entry = dict(entry)
            for field in spec["schema_owned"]:
                if description and entry.get(field) != description:
                    entry[field] = description
                    refreshed.append(term)
        merged.append(entry)

    # Terms the file carries but the schema does not. Kept rather than dropped, so
    # the sync never silently deletes hand-added values, but reported as drift:
    # the app would offer a value the schema rejects.
    orphans = [term for term in existing if term not in {t for t, _ in terms}]
    merged.extend(existing[term] for term in orphans)

    if not (added or refreshed or orphans):
        print(f"  {spec['filename']}: up to date ({len(merged)} terms)")
        return False

    if added:
        print(f"  {spec['filename']}: +{len(added)} missing ({', '.join(added)})")
        if spec["review"]:
            fields = " and ".join(spec["review"])
            print(f"      set {fields} by hand for: {', '.join(added)}")
    if refreshed:
        terms_list = ", ".join(sorted(set(refreshed)))
        print(f"  {spec['filename']}: description refreshed for {terms_list}")
    if orphans:
        print(f"  {spec['filename']}: WARNING not in schema: {', '.join(orphans)}")

    if not check_only:
        write_json(path, merged)

    return True


def sync_data_files(check_only: bool) -> bool:
    schema_path = PUBLIC_DIR / VOCAB_VERSION / "poster_schema.json"
    with open(schema_path, encoding="utf-8") as f:
        definitions = json.load(f)["definitions"]

    verb = "Checking" if check_only else "Syncing"
    print(f"{verb} {DATA_DIR} against {schema_path}")

    drifted = False
    for spec in VOCABULARIES:
        drifted |= sync_vocabulary(spec, definitions, check_only)
    return drifted


if __name__ == "__main__":
    args = sys.argv[1:]
    check_only = "--check" in args
    data_only = "--data-only" in args
    versions = [a for a in args if not a.startswith("-")] or KNOWN_VERSIONS

    if not (check_only or data_only):
        for v in versions:
            fetch_version(v)

    drifted = sync_data_files(check_only)

    if check_only and drifted:
        print("\nData files are out of step with the schema.")
        print("Run: python sync_schema.py --data-only")
        sys.exit(1)

    print("Done.")
