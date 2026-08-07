import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from promptboard_yaml import PromptBoardYamlError, normalize_yaml_document
from yaml_tag_nodes import (
    PromptBoardReplace,
    _compose_attribute_targets,
    _get_board_template,
    _save_board_template,
    _select_tags_outputs,
    _select_tags_with_prompt_preview,
)


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

    def test_expands_a_shared_tag_set_into_independent_category_tag_objects(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_tagsets.yaml")
        model = normalize_yaml_document(source)
        top_tags = model["categories"]["상의색상"]["tags"]
        bottom_tags = model["categories"]["하의색상"]["tags"]

        self.assertEqual(top_tags, model["tagSets"]["colors"]["tags"])
        self.assertEqual(bottom_tags, model["tagSets"]["colors"]["tags"])
        self.assertIsNot(top_tags, bottom_tags)
        self.assertIsNot(top_tags[0], bottom_tags[0])
        self.assertIsNot(top_tags[0], model["tagSets"]["colors"]["tags"][0])

        top_tags[0]["label"] = "변경됨"
        self.assertEqual(bottom_tags[0]["label"], "검정")
        self.assertEqual(model["tagSets"]["colors"]["tags"][0]["label"], "검정")

    def test_keeps_category_keys_stable_while_accepting_display_labels(self):
        model = normalize_yaml_document(
            """
_promptboard:
  schemaVersion: 2
세트의상_오피스:
  label: 오피스
  placeholder: <CLOTHES>
  uiGroup: 의상
  tags:
  - office lady
"""
        )

        self.assertEqual(model["categories"]["세트의상_오피스"]["label"], "오피스")
        self.assertEqual(model["categories"]["세트의상_오피스"]["placeholder"], "<CLOTHES>")
        self.assertEqual(list(model["categories"].keys()), ["세트의상_오피스"])

    def test_keeps_section_markers_as_layout_items_while_flattening_selectable_tags(self):
        model = normalize_yaml_document(
            """
_promptboard:
  schemaVersion: 2
POSE:
  placeholder: <POSE>
  tags:
  - section: Basic
  - text: standing
    label: Stand
  - section: Legs
  - text: legs_up
    label: Legs Up
"""
        )

        self.assertEqual(
            [tag["text"] for tag in model["categories"]["POSE"]["tags"]],
            ["standing", "legs_up"],
        )
        self.assertEqual(
            model["categories"]["POSE"]["tagItems"],
            [
                {"kind": "section", "label": "Basic"},
                {
                    "kind": "tag",
                    "tag": {"text": "standing", "label": "Stand", "description": "", "default": False},
                },
                {"kind": "section", "label": "Legs"},
                {
                    "kind": "tag",
                    "tag": {"text": "legs_up", "label": "Legs Up", "description": "", "default": False},
                },
            ],
        )

    def test_keeps_selections_independent_for_categories_using_the_same_tag_set(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_tagsets.yaml")
        state = json.dumps({"상의색상": ["black"], "하의색상": ["white"]}, ensure_ascii=False)
        selection_json, preview, selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=state,
        )
        payload = json.loads(selection_json)

        self.assertEqual(payload["상의색상"]["selected"], ["black"])
        self.assertEqual(payload["하의색상"]["selected"], ["white"])
        self.assertEqual(preview, "<TCO>: black\n<BCO>: white")
        self.assertEqual(selected_text, "black,white")

    def test_tag_set_and_direct_tags_produce_identical_outputs(self):
        state = json.dumps({"상의색상": ["black"], "하의색상": ["white"]}, ensure_ascii=False)
        shared_source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_tagsets.yaml")
        direct_source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_tagsets_direct.yaml")

        shared_outputs = _select_tags_outputs(yaml_text=shared_source, selected_state=state)
        direct_outputs = _select_tags_outputs(yaml_text=direct_source, selected_state=state)
        self.assertEqual(shared_outputs, direct_outputs)

        replacer = PromptBoardReplace()
        source_text = "top: <TCO>; bottom: <BCO>"
        shared_replaced = replacer.replace_tags(source_text, shared_outputs[0])
        direct_replaced = replacer.replace_tags(source_text, direct_outputs[0])
        self.assertEqual(shared_replaced, direct_replaced)
        self.assertEqual(shared_replaced[0], "top: black; bottom: white")

    def test_template_round_trips_attribute_state_and_emits_attribute_payload(self):
        selected_state = {
            "상의": ["<TOP_ATTRS> sports bra"],
            "$attributes": {
                "clothing": {
                    "top": {"color": ["black"], "material": ["leather", "denim"]},
                    "bottom": {"color": ["white"]},
                }
            },
        }
        with tempfile.TemporaryDirectory() as directory:
            template_file = Path(directory) / "tag_board_templates.json"
            with patch("yaml_tag_nodes.TEMPLATE_FILE", template_file):
                saved = _save_board_template("attribute-state", "default.yaml", selected_state)
                loaded = _get_board_template("attribute-state")

        self.assertEqual(saved["selected_state"], selected_state)
        self.assertEqual(loaded["selected_state"], selected_state)

        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_attribute_boards.yaml")
        selection_json, _preview, _selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=json.dumps(selected_state, ensure_ascii=False),
        )
        payload = json.loads(selection_json)
        self.assertNotIn("$attributes", payload)
        self.assertEqual(
            payload["$attribute:clothing.top"],
            {
                "placeholder": "<TOP_ATTRS>",
                "uiGroup": "",
                "delimiter": ",",
                "replaceInsideTags": True,
                "selected": ["black leather denim"],
            },
        )
        self.assertEqual(
            payload["$attribute:clothing.bottom"],
            {
                "placeholder": "<BOTTOM_ATTRS>",
                "uiGroup": "",
                "delimiter": ",",
                "replaceInsideTags": True,
                "selected": ["white"],
            },
        )

    def test_refuses_to_overwrite_corrupt_template_file(self):
        with tempfile.TemporaryDirectory() as directory:
            template_file = Path(directory) / "tag_board_templates.json"
            template_file.write_text("{broken", encoding="utf-8")

            with patch("yaml_tag_nodes.TEMPLATE_FILE", template_file):
                with self.assertRaisesRegex(ValueError, "invalid JSON"):
                    _save_board_template("new-template", "default.yaml", {"STYLE": ["cinematic"]})

            self.assertEqual(template_file.read_text(encoding="utf-8"), "{broken")

    def test_attribute_payload_uses_existing_replace_path(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_attribute_boards.yaml")
        selected_state = {
            "상의": ["<TOP_ATTRS> sports bra"],
            "하의": ["<BOTTOM_ATTRS> skirt"],
            "$attributes": {
                "clothing": {
                    "top": {
                        "color": ["black"],
                        "material": ["denim", "leather"],
                    },
                    "bottom": {"color": ["white"]},
                }
            },
        }
        selection_json, _preview, selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=json.dumps(selected_state, ensure_ascii=False),
        )

        replaced, report = PromptBoardReplace().replace_tags("outfit: <CLOTHES>", selection_json)
        self.assertEqual(replaced, "outfit: black leather denim sports bra,white skirt")
        self.assertEqual(report, "")
        self.assertEqual(
            _preview,
            "\n".join(
                [
                    "<CLOTHES>: black leather denim sports bra,white skirt",
                    "<TOP_ATTRS>: black leather denim",
                    "<BOTTOM_ATTRS>: white",
                ]
            ),
        )
        self.assertEqual(
            selected_text,
            "<TOP_ATTRS> sports bra,<BOTTOM_ATTRS> skirt,black leather denim,white",
        )

    def test_prompt_preview_matches_replace_node_output(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_attribute_boards.yaml")
        selected_state = {
            "상의": ["<TOP_ATTRS> sports bra"],
            "$attributes": {
                "clothing": {
                    "top": {
                        "color": ["black"],
                        "material": ["denim", "leather"],
                    },
                }
            },
        }

        selection_json, _preview, _selected_text, prompt_preview, replace_report = _select_tags_with_prompt_preview(
            yaml_text=source,
            selected_state=json.dumps(selected_state, ensure_ascii=False),
            source_text="outfit: <CLOTHES>",
        )
        replaced, report = PromptBoardReplace().replace_tags("outfit: <CLOTHES>", selection_json)

        self.assertEqual(prompt_preview, replaced)
        self.assertEqual(replace_report, report)
        self.assertEqual(prompt_preview, "outfit: black leather denim sports bra")
        self.assertEqual(replace_report, "")

    def test_prompt_preview_is_empty_without_source_text(self):
        source = read_text(FIXTURE_ROOT / "valid" / "legacy_v1.yaml")
        outputs = _select_tags_with_prompt_preview(
            yaml_text=source,
            selected_state=json.dumps({"STYLE": ["cinematic"]}, ensure_ascii=False),
        )

        self.assertEqual(outputs[3], "")
        self.assertEqual(outputs[4], "")

    def test_attribute_preview_reports_state_warnings_with_paths(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_attribute_boards.yaml")
        selected_state = {
            "상의색상": ["white"],
            "$attributes": {
                "clothing": {
                    "top": {
                        "color": "black",
                        "unused": ["white"],
                    },
                    "removed": {"color": ["black"]},
                },
                "deleted": {"top": {"color": ["white"]}},
            }
        }

        _selection_json, preview, _selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=json.dumps(selected_state, ensure_ascii=False),
        )

        self.assertIn("warning: $attributes.deleted no longer exists and was removed.", preview)
        self.assertIn("warning: $attributes.clothing.removed no longer exists and was removed.", preview)
        self.assertIn("warning: $attributes.clothing.top.unused no longer exists and was removed.", preview)
        self.assertIn("warning: $attributes.clothing.top.color must be an array", preview)

    def test_preview_reports_migration_source_for_legacy_templates(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_attribute_boards.yaml")
        selected_state = {
            "상의": ["<TOP_ATTRS> sports bra"],
            "상의색상": ["white"],
        }

        selection_json, preview, _selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=json.dumps(selected_state, ensure_ascii=False),
        )

        self.assertEqual(json.loads(selection_json)["$attribute:clothing.top"]["selected"], ["white"])
        self.assertIn("<CLOTHES>: white sports bra", preview)
        self.assertIn("warning: $attributes.clothing.top.color migrated from 상의색상.", preview)

    def test_preview_matches_replace_cleanup_when_attribute_value_is_empty(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_attribute_boards.yaml")
        selected_state = {"상의": ["<TOP_ATTRS> sports bra"]}

        selection_json, preview, _selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=json.dumps(selected_state, ensure_ascii=False),
        )
        replaced, report = PromptBoardReplace().replace_tags("<CLOTHES>", selection_json)

        self.assertEqual(preview, "<CLOTHES>: sports bra")
        self.assertEqual(replaced, "sports bra")
        self.assertEqual(report, "")

    def test_migrates_legacy_placeholder_pattern_values(self):
        source = """
_promptboard:
  schemaVersion: 2
  tagSets:
    colors:
      tags:
      - plaid
  attributeBoards:
    clothing:
      targets:
        top:
          placeholder: <TCO>
          attributes:
            color:
              source: colors
              migrateFrom: 상의색상
상의:
  placeholder: <CLOTHES>
  tags:
  - <TCO> shirt
"""
        selected_state = {
            "상의": ["<TCO> shirt"],
            "상의색상": ["<TCO> plaid"],
        }

        selection_json, preview, _selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=json.dumps(selected_state, ensure_ascii=False),
        )
        replaced, report = PromptBoardReplace().replace_tags("<CLOTHES>", selection_json)

        self.assertEqual(json.loads(selection_json)["$attribute:clothing.top"]["selected"], ["plaid"])
        self.assertEqual(preview.splitlines()[0], "<CLOTHES>: plaid shirt")
        self.assertEqual(replaced, "plaid shirt")
        self.assertEqual(report, "")

    def test_attribute_preview_reports_cycles_from_existing_replace_resolver(self):
        source = """
_promptboard:
  schemaVersion: 2
  tagSets:
    loopTags:
      tags:
      - <TOP_ATTRS> loop
  attributeBoards:
    clothing:
      targets:
        top:
          placeholder: <TOP_ATTRS>
          attributes:
            color:
              source: loopTags
상의:
  placeholder: <CLOTHES>
  tags:
  - <TOP_ATTRS> sports bra
"""
        selected_state = {
            "상의": ["<TOP_ATTRS> sports bra"],
            "$attributes": {"clothing": {"top": {"color": ["<TOP_ATTRS> loop"]}}},
        }

        selection_json, preview, _selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=json.dumps(selected_state, ensure_ascii=False),
        )
        _replaced, report = PromptBoardReplace().replace_tags("<CLOTHES>", selection_json)

        self.assertIn("cycle: 상의 -> $attribute:clothing.top -> $attribute:clothing.top", preview)
        self.assertEqual(report, "cycle: 상의 -> $attribute:clothing.top -> $attribute:clothing.top")

    def test_category_only_outputs_remain_unchanged_when_no_attribute_boards_exist(self):
        source = read_text(FIXTURE_ROOT / "valid" / "legacy_v1.yaml")
        state = json.dumps({"STYLE": ["cinematic"], "MATERIAL": ["glass"]}, ensure_ascii=False)

        selection_json, preview, selected_text = _select_tags_outputs(
            yaml_text=source,
            selected_state=state,
        )

        self.assertEqual(sorted(json.loads(selection_json)), ["DETAIL", "MATERIAL", "STYLE"])
        self.assertEqual(preview, "<STYLE>: cinematic\n<MATERIAL>: glass")
        self.assertEqual(selected_text, "cinematic,glass")

    def test_composes_attribute_targets_deterministically(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_attribute_boards.yaml")
        model = normalize_yaml_document(source)
        state = {
            "$attributes": {
                "clothing": {
                    "top": {
                        "material": ["denim", "leather"],
                        "color": ["black"],
                    },
                    "bottom": {"color": ["white"]},
                }
            }
        }
        warnings = []

        self.assertEqual(
            _compose_attribute_targets(model, state, warnings),
            {
                "clothing.top": {
                    "boardId": "clothing",
                    "targetId": "top",
                    "placeholder": "<TOP_ATTRS>",
                    "selected": ["black", "leather", "denim"],
                    "text": "black leather denim",
                },
                "clothing.bottom": {
                    "boardId": "clothing",
                    "targetId": "bottom",
                    "placeholder": "<BOTTOM_ATTRS>",
                    "selected": ["white"],
                    "text": "white",
                },
            },
        )
        self.assertEqual(warnings, [])

    def test_migrates_legacy_category_selection_when_attribute_state_is_missing(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_attribute_boards.yaml")
        model = normalize_yaml_document(source)
        warnings = []

        self.assertEqual(
            _compose_attribute_targets(model, {"상의색상": ["white", "missing"]}, warnings)["clothing.top"],
            {
                "boardId": "clothing",
                "targetId": "top",
                "placeholder": "<TOP_ATTRS>",
                "selected": ["white"],
                "text": "white",
            },
        )
        self.assertIn("$attributes.clothing.top.color migrated from 상의색상.", warnings)
        self.assertIn("$attributes.clothing.top.color removed unknown tags: missing", warnings)

        new_state = {
            "상의색상": ["white"],
            "$attributes": {
                "clothing": {
                    "top": {
                        "color": ["black"],
                    }
                }
            },
        }
        self.assertEqual(_compose_attribute_targets(model, new_state)["clothing.top"]["text"], "black")

    def test_attribute_composition_skips_empty_values_and_honors_custom_separators(self):
        source = read_text(FIXTURE_ROOT / "valid" / "schema_v2_attribute_boards.yaml")
        model = normalize_yaml_document(source)
        model["attributeBoards"]["clothing"]["targets"]["top"]["compose"]["separator"] = ", "
        state = {
            "$attributes": {
                "clothing": {
                    "top": {
                        "color": [],
                        "material": ["denim"],
                    }
                }
            }
        }

        self.assertEqual(
            _compose_attribute_targets(model, state)["clothing.top"],
            {
                "boardId": "clothing",
                "targetId": "top",
                "placeholder": "<TOP_ATTRS>",
                "selected": ["denim"],
                "text": "denim",
            },
        )

        state["$attributes"]["clothing"]["top"]["color"] = ["black"]
        self.assertEqual(_compose_attribute_targets(model, state)["clothing.top"]["text"], "black, denim")

        model["attributeBoards"]["clothing"]["targets"]["top"]["compose"]["separator"] = ""
        self.assertEqual(_compose_attribute_targets(model, state)["clothing.top"]["text"], "blackdenim")

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

    def test_select_tags_output_reports_yaml_error_code_and_path(self):
        selection_json, preview, selected_text = _select_tags_outputs(
            yaml_text="""
_promptboard:
  schemaVersion: 2
  tagSets:
    colors:
      tags:
      - black
  attributeBoards:
    clothing:
      targets:
        top:
          placeholder: <TOP_ATTRS>
          attributes:
            color:
              source: missing
"""
        )

        self.assertEqual(selection_json, "{}")
        self.assertEqual(selected_text, "")
        self.assertIn(
            "Prompt Board error: [unknown_tag_set] at "
            "_promptboard.attributeBoards.clothing.targets.top.attributes.color.source",
            preview,
        )

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
