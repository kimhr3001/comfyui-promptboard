import json
import unittest
from pathlib import Path

from promptboard_yaml import PromptBoardYamlError, normalize_yaml_document
from yaml_tag_nodes import _select_tags_outputs


PROJECT_ROOT = Path(__file__).resolve().parents[1]
FIXTURE_ROOT = PROJECT_ROOT / "tests" / "fixtures" / "yaml_schema"


def read_text(path):
    return path.read_text(encoding="utf-8")


def read_json(path):
    return json.loads(read_text(path))


class PromptBoardYamlBackendTests(unittest.TestCase):
    def test_normalizes_every_valid_fixture_to_the_shared_snapshot(self):
        valid_root = FIXTURE_ROOT / "valid"
        expected_root = FIXTURE_ROOT / "expected"
        for source_path in sorted(valid_root.glob("*.yaml")):
            expected_path = expected_root / f"{source_path.stem}.normalized.json"
            with self.subTest(path=source_path.name):
                self.assertEqual(normalize_yaml_document(read_text(source_path)), read_json(expected_path))

    def test_keeps_default_yaml_on_the_v1_snapshot(self):
        source = read_text(PROJECT_ROOT / "tags" / "default.yaml")
        expected = read_json(FIXTURE_ROOT / "expected" / "default_v1.normalized.json")
        self.assertEqual(normalize_yaml_document(source), expected)

    def test_reports_shared_semantic_errors(self):
        manifest = read_json(FIXTURE_ROOT / "expected_errors.json")
        for expected in manifest:
            source = read_text(FIXTURE_ROOT / "invalid" / expected["fixture"])
            with self.subTest(path=expected["fixture"]):
                with self.assertRaises(PromptBoardYamlError) as raised:
                    normalize_yaml_document(source)
                self.assertEqual(raised.exception.code, expected["code"])
                self.assertEqual(raised.exception.path, expected["path"])
                self.assertEqual(str(raised.exception), expected["message"])

    def test_reports_line_and_column_for_syntax_errors(self):
        with self.assertRaises(PromptBoardYamlError) as raised:
            normalize_yaml_document('STYLE:\n  tags:\n  - text: "unterminated\n')
        self.assertEqual(raised.exception.code, "yaml_parse_error")
        self.assertEqual(raised.exception.path, "$")
        self.assertRegex(str(raised.exception), r"line \d+, column \d+:")

    def test_rejects_duplicate_mapping_keys(self):
        with self.assertRaises(PromptBoardYamlError) as raised:
            normalize_yaml_document("STYLE:\n  tags: []\nSTYLE:\n  tags: []\n")
        self.assertEqual(raised.exception.code, "yaml_parse_error")
        self.assertIn("duplicate key", str(raised.exception))

    def test_preserves_existing_selection_payload_and_preview(self):
        source = read_text(FIXTURE_ROOT / "valid" / "legacy_v1.yaml")
        state = json.dumps(
            {
                "STYLE": ["cinematic", "soft light"],
                "MATERIAL": ["glass"],
                "DETAIL": ["crisp focus"],
            },
            ensure_ascii=False,
        )
        selection_json, preview, selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=state,
        )
        self.assertEqual(
            json.loads(selection_json),
            {
                "STYLE": {
                    "placeholder": "<STYLE>",
                    "uiGroup": "Look",
                    "delimiter": ",",
                    "replaceInsideTags": False,
                    "selected": ["cinematic", "soft light"],
                },
                "MATERIAL": {
                    "placeholder": "<MATERIAL>",
                    "uiGroup": "",
                    "delimiter": ",",
                    "replaceInsideTags": True,
                    "selected": ["glass"],
                },
                "DETAIL": {
                    "placeholder": "<DETAIL>",
                    "uiGroup": "",
                    "delimiter": ",",
                    "replaceInsideTags": False,
                    "selected": ["crisp focus"],
                },
            },
        )
        self.assertEqual(
            preview,
            "<STYLE>: cinematic,soft light\n<MATERIAL>: glass\n<DETAIL>: crisp focus",
        )
        self.assertEqual(selected_text, "cinematic,soft light,glass,crisp focus")


if __name__ == "__main__":
    unittest.main()
