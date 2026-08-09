import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeYamlDocument } from "../web/js/promptboard_yaml.mjs";
import {
  getYamlEditorCategories,
  insertYamlEditorItem,
} from "../web/js/yaml_editor_mutation.mjs";

const SIMPLE_SOURCE = `
STYLE:
  label: 스타일
  tags:
    - section: Basic
    - text: cinematic
      label: 시네마틱
    - section: Detail
    - text: sharp focus
      label: 선명함
`;

test("lists categories and section positions for the editor dialog", () => {
  assert.deepEqual(getYamlEditorCategories(SIMPLE_SOURCE), [
    {
      id: "STYLE",
      label: "스타일",
      sections: ["Basic", "Detail"],
    },
  ]);
});

test("inserts a section at the category bottom", () => {
  const result = insertYamlEditorItem(SIMPLE_SOURCE, {
    type: "section",
    category: "STYLE",
    section: "Mood",
  });

  const tagItems = normalizeYamlDocument(result.text).categories.STYLE.tagItems;
  assert.equal(tagItems.at(-1).kind, "section");
  assert.equal(tagItems.at(-1).label, "Mood");
});

test("inserts a tag at the bottom of the selected section", () => {
  const result = insertYamlEditorItem(SIMPLE_SOURCE, {
    type: "tag",
    category: "STYLE",
    afterSection: "Basic",
    text: "soft light",
    label: "부드러운 빛",
    description: "부드러운 조명입니다.",
    default: true,
  });

  const items = normalizeYamlDocument(result.text).categories.STYLE.tagItems;
  assert.deepEqual(
    items.map((item) => item.kind === "section" ? item.label : item.tag.text),
    ["Basic", "cinematic", "soft light", "Detail", "sharp focus"],
  );
  assert.equal(items[2].tag.default, true);
});

test("blocks duplicate tag text", () => {
  assert.throws(
    () => insertYamlEditorItem(SIMPLE_SOURCE, {
      type: "tag",
      category: "STYLE",
      text: "cinematic",
      label: "다른 라벨",
    }),
    /Duplicate tag text: cinematic/,
  );
});

test("allows duplicate labels with a warning", () => {
  const result = insertYamlEditorItem(SIMPLE_SOURCE, {
    type: "tag",
    category: "STYLE",
    text: "movie still",
    label: "시네마틱",
  });

  assert.match(result.warning, /Duplicate label in category: 시네마틱/);
  assert.ok(normalizeYamlDocument(result.text).categories.STYLE.tags.some((tag) => tag.text === "movie still"));
});

test("inserts into a referenced tag set and reports the shared source", () => {
  const source = `
_promptboard:
  schemaVersion: 2
  tagSets:
    moods:
      label: 분위기
      tags:
        - section: Basic
        - text: calm
          label: 차분함
STYLE:
  tagSet: moods
`;

  const result = insertYamlEditorItem(source, {
    type: "tag",
    category: "STYLE",
    afterSection: "Basic",
    text: "dramatic",
    label: "드라마틱",
  });

  const model = normalizeYamlDocument(result.text);
  assert.equal(result.sharedSource, "moods");
  assert.ok(model.tagSets.moods.tags.some((tag) => tag.text === "dramatic"));
  assert.ok(model.categories.STYLE.tags.some((tag) => tag.text === "dramatic"));
});
