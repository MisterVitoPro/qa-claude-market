"""Validate every Jupiter schema against its valid and invalid example fixtures.

Exit 0 on success. Exit 1 if any valid example fails or any invalid example passes.
"""

import json
import sys
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parent.parent
SCHEMAS_DIR = ROOT / "schemas"
EXAMPLES_DIR = SCHEMAS_DIR / "examples"

CASES = [
    ("catalog.schema.json", "catalog-valid.json", "catalog-invalid.json"),
    ("surface.schema.json", "surface-valid.json", "surface-invalid.json"),
    ("index.schema.json", "index-valid.json", "index-invalid.json"),
    (
        "consolidated-index.schema.json",
        "consolidated-index-valid.json",
        "consolidated-index-invalid.json",
    ),
]


def load(p: Path):
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    failures = []
    for schema_name, valid_name, invalid_name in CASES:
        schema_path = SCHEMAS_DIR / schema_name
        valid_path = EXAMPLES_DIR / valid_name
        invalid_path = EXAMPLES_DIR / invalid_name
        if not schema_path.exists():
            print(f"SKIP: {schema_name} not yet written")
            continue
        schema = load(schema_path)
        try:
            jsonschema.validate(load(valid_path), schema)
            print(f"PASS: {valid_name} validates against {schema_name}")
        except jsonschema.ValidationError as e:
            failures.append(f"FAIL: {valid_name} should validate: {e.message}")
        try:
            jsonschema.validate(load(invalid_path), schema)
            failures.append(f"FAIL: {invalid_name} should NOT validate")
        except jsonschema.ValidationError:
            print(f"PASS: {invalid_name} correctly rejected by {schema_name}")
    if failures:
        for f in failures:
            print(f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
