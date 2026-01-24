#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path

import yaml
from jsonschema import Draft7Validator, RefResolver


def load_yaml(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def build_resolver(schema_path: Path, schema_obj: dict) -> RefResolver:
    """
    Enables $ref like './ommiquiz.flashcard.schema.yaml' to resolve correctly.
    """
    base_uri = schema_path.resolve().as_uri()
    return RefResolver(base_uri=base_uri, referrer=schema_obj)


def format_error(err) -> str:
    loc = "$"
    if err.absolute_path:
        loc += "." + ".".join(str(p) for p in err.absolute_path)
    msg = err.message
    return f"{loc}: {msg}"


def validate_deck(deck_path: Path, schema_path: Path) -> int:
    deck = load_yaml(deck_path)
    schema = load_yaml(schema_path)

    resolver = build_resolver(schema_path, schema)
    validator = Draft7Validator(schema, resolver=resolver)

    errors = sorted(validator.iter_errors(deck), key=lambda e: list(e.absolute_path))
    if not errors:
        print(f"✅ OK: {deck_path}")
        return 0

    print(f"❌ INVALID: {deck_path}")
    for e in errors[:50]:
        print(" - " + format_error(e))
    if len(errors) > 50:
        print(f" ... {len(errors) - 50} weitere Fehler (gekürzt)")
    return 1


def main():
    p = argparse.ArgumentParser(description="Validate OMMIQuiz YAML decks against JSON-Schema (Draft-07).")
    p.add_argument("--schema", required=True, help="Path to ommiquiz.root.schema.yaml")
    p.add_argument("paths", nargs="+", help="YAML deck files or directories (searched recursively)")
    args = p.parse_args()

    schema_path = Path(args.schema)
    if not schema_path.exists():
        print(f"Schema not found: {schema_path}", file=sys.stderr)
        return 2

    deck_files = []
    for raw in args.paths:
        path = Path(raw)
        if path.is_dir():
            deck_files.extend(path.rglob("*.yaml"))
            deck_files.extend(path.rglob("*.yml"))
        else:
            deck_files.append(path)

    if not deck_files:
        print("No deck files found.", file=sys.stderr)
        return 2

    exit_code = 0
    for f in sorted(set(deck_files)):
        if f.name.endswith(".schema.yaml") or f.name.endswith(".schema.yml"):
            continue
        try:
            exit_code |= validate_deck(f, schema_path)
        except Exception as ex:
            print(f"💥 ERROR validating {f}: {ex}", file=sys.stderr)
            exit_code = 2

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
