import json
import re
import unittest
from pathlib import Path

import yaml


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = PROJECT_ROOT / "tests" / "fixtures" / "yaml_schema"
VALID_ROOT = FIXTURE_ROOT / "valid"
INVALID_ROOT = FIXTURE_ROOT / "invalid"
EXPECTED_ROOT = FIXTURE_ROOT / "expected"


def load_yaml(path):
    data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise AssertionError(f"Fixture root must be a mapping: {path}")
    return data


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def normalize_v1_tag(entry):
    if isinstance(entry, str):
        text = entry.strip()
        if not text:
            return None
        return {"text": text, "label": text, "description": "", "default": False}

    if not isinstance(entry, dict):
        return None
    text = str(entry.get("text", entry.get("value", ""))).strip()
    if not text:
        return None
    label = str(entry.get("label", text)).strip() or text
    return {
        "text": text,
        "label": label,
        "description": str(entry.get("description", "")).strip(),
        "default": normalize_bool(entry.get("default", False)),
    }


def normalize_v1_contract(source):
    categories = {}
    for key, value in source.items():
        if not isinstance(value, dict):
            continue
        category = str(key).strip()
        if not category:
            continue
        categories[category] = {
            "placeholder": str(value.get("placeholder", f"<{category}>")).strip(),
            "uiGroup": str(value.get("uiGroup", "")).strip(),
            "replaceInsideTags": normalize_bool(value.get("replaceInsideTags", False)),
            "tagSet": None,
            "tags": [
                tag
                for tag in (normalize_v1_tag(entry) for entry in value.get("tags", []) or [])
                if tag is not None
            ],
        }
    return {
        "schemaVersion": 1,
        "tagSets": {},
        "attributeBoards": {},
        "categories": categories,
    }


class YamlSchemaContractFixtureTests(unittest.TestCase):
    def test_all_source_fixtures_are_valid_yaml_mappings(self):
        fixture_paths = sorted(VALID_ROOT.glob("*.yaml")) + sorted(INVALID_ROOT.glob("*.yaml"))
        self.assertGreater(len(fixture_paths), 0)
        for path in fixture_paths:
            with self.subTest(path=path.name):
                self.assertIsInstance(load_yaml(path), dict)

    def test_valid_fixtures_have_normalized_snapshots(self):
        for source_path in sorted(VALID_ROOT.glob("*.yaml")):
            expected_path = EXPECTED_ROOT / f"{source_path.stem}.normalized.json"
            with self.subTest(path=source_path.name):
                self.assertTrue(expected_path.is_file())
                normalized = load_json(expected_path)
                self.assertEqual(
                    list(normalized),
                    ["schemaVersion", "tagSets", "attributeBoards", "categories"],
                )
                self.assertIn(normalized["schemaVersion"], {1, 2})
                self.assertIsInstance(normalized["tagSets"], dict)
                self.assertIsInstance(normalized["attributeBoards"], dict)
                self.assertIsInstance(normalized["categories"], dict)

    def test_v1_snapshots_match_existing_normalization(self):
        cases = (
            (VALID_ROOT / "legacy_v1.yaml", EXPECTED_ROOT / "legacy_v1.normalized.json"),
            (PROJECT_ROOT / "tags" / "default.yaml", EXPECTED_ROOT / "default_v1.normalized.json"),
        )
        for source_path, expected_path in cases:
            with self.subTest(path=source_path.name):
                self.assertEqual(normalize_v1_contract(load_yaml(source_path)), load_json(expected_path))

    def test_v2_snapshot_ids_follow_contract(self):
        identifier = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")
        for expected_path in sorted(EXPECTED_ROOT.glob("schema_v2_*.normalized.json")):
            normalized = load_json(expected_path)
            with self.subTest(path=expected_path.name):
                self.assertEqual(normalized["schemaVersion"], 2)
                for tag_set_id in normalized["tagSets"]:
                    self.assertRegex(tag_set_id, identifier)
                for board_id, board in normalized["attributeBoards"].items():
                    self.assertRegex(board_id, identifier)
                    for target_id, target in board["targets"].items():
                        self.assertRegex(target_id, identifier)
                        for attribute_id in target["attributes"]:
                            self.assertRegex(attribute_id, identifier)

    def test_invalid_fixture_manifest_is_complete(self):
        manifest = load_json(FIXTURE_ROOT / "expected_errors.json")
        manifested = [item["fixture"] for item in manifest]
        actual = [path.name for path in sorted(INVALID_ROOT.glob("*.yaml"))]
        self.assertCountEqual(manifested, actual)
        self.assertEqual(len(manifested), len(set(manifested)))

    def test_contract_errors_have_stable_shape(self):
        manifest = load_json(FIXTURE_ROOT / "expected_errors.json")
        for item in manifest:
            with self.subTest(path=item["fixture"]):
                self.assertEqual(set(item), {"fixture", "code", "path", "message"})
                self.assertTrue(item["code"])
                self.assertTrue(item["path"])
                self.assertTrue(item["message"])


if __name__ == "__main__":
    unittest.main()
