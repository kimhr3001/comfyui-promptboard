import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  PromptBoardYamlError,
  normalizeYamlDocument,
  parseYamlCategories,
} from "../web/js/promptboard_yaml.mjs";


const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(projectRoot, "tests", "fixtures", "yaml_schema");

async function readText(path) {
  return readFile(path, "utf8");
}

async function readJson(path) {
  return JSON.parse(await readText(path));
}

test("normalizes every valid YAML fixture to the shared snapshot", async () => {
  const validRoot = join(fixtureRoot, "valid");
  const expectedRoot = join(fixtureRoot, "expected");
  const names = (await readdir(validRoot)).filter((name) => name.endsWith(".yaml")).sort();

  for (const name of names) {
    const source = await readText(join(validRoot, name));
    const expected = await readJson(join(expectedRoot, name.replace(/\.yaml$/, ".normalized.json")));
    assert.deepEqual(normalizeYamlDocument(source), expected, name);
  }
});

test("keeps the current default YAML on the v1 normalization snapshot", async () => {
  const source = await readText(join(projectRoot, "tags", "default.yaml"));
  const expected = await readJson(join(fixtureRoot, "expected", "default_v1.normalized.json"));
  assert.deepEqual(normalizeYamlDocument(source), expected);
});

test("expands a shared tag set into independent category tag objects", async () => {
  const source = await readText(join(fixtureRoot, "valid", "schema_v2_tagsets.yaml"));
  const model = normalizeYamlDocument(source);
  const topTags = model.categories["상의색상"].tags;
  const bottomTags = model.categories["하의색상"].tags;

  assert.deepEqual(topTags, model.tagSets.colors.tags);
  assert.deepEqual(bottomTags, model.tagSets.colors.tags);
  assert.notStrictEqual(topTags, bottomTags);
  assert.notStrictEqual(topTags[0], bottomTags[0]);
  assert.notStrictEqual(topTags[0], model.tagSets.colors.tags[0]);

  topTags[0].label = "변경됨";
  assert.equal(bottomTags[0].label, "검정");
  assert.equal(model.tagSets.colors.tags[0].label, "검정");
});

test("keeps category keys stable while accepting display labels", () => {
  const model = normalizeYamlDocument(`
_promptboard:
  schemaVersion: 2
세트의상_오피스:
  label: 오피스
  placeholder: <CLOTHES>
  uiGroup: 의상
  tags:
  - office lady
`);
  assert.equal(model.categories["세트의상_오피스"].label, "오피스");
  assert.equal(model.categories["세트의상_오피스"].placeholder, "<CLOTHES>");
  assert.deepEqual(Object.keys(model.categories), ["세트의상_오피스"]);
});

test("keeps section markers as layout items while flattening selectable tags", () => {
  const model = normalizeYamlDocument(`
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
`);

  assert.deepEqual(
    model.categories.POSE.tags.map((tag) => tag.text),
    ["standing", "legs_up"],
  );
  assert.deepEqual(model.categories.POSE.tagItems, [
    { kind: "section", label: "Basic" },
    {
      kind: "tag",
      tag: { text: "standing", label: "Stand", description: "", default: false },
    },
    { kind: "section", label: "Legs" },
    {
      kind: "tag",
      tag: { text: "legs_up", label: "Legs Up", description: "", default: false },
    },
  ]);
});

test("expands tag-set categories to the same effective tags as direct categories", async () => {
  const sharedSource = await readText(join(fixtureRoot, "valid", "schema_v2_tagsets.yaml"));
  const directSource = await readText(join(fixtureRoot, "valid", "schema_v2_tagsets_direct.yaml"));
  const sharedCategories = normalizeYamlDocument(sharedSource).categories;
  const directCategories = normalizeYamlDocument(directSource).categories;

  for (const category of Object.keys(directCategories)) {
    assert.deepEqual(sharedCategories[category].tags, directCategories[category].tags);
  }
});

test("reports every semantic error with the shared code, path, and message", async () => {
  const manifest = await readJson(join(fixtureRoot, "expected_errors.json"));
  for (const expected of manifest) {
    const source = await readText(join(fixtureRoot, "invalid", expected.fixture));
    assert.throws(
      () => normalizeYamlDocument(source),
      (error) => {
        assert.ok(error instanceof PromptBoardYamlError);
        assert.equal(error.code, expected.code, expected.fixture);
        assert.equal(error.path, expected.path, expected.fixture);
        assert.equal(error.message, expected.message, expected.fixture);
        return true;
      },
    );
  }
});

test("includes parser line and column in YAML syntax errors", () => {
  assert.throws(
    () => normalizeYamlDocument('STYLE:\n  tags:\n  - text: "unterminated\n'),
    (error) => {
      assert.equal(error.code, "yaml_parse_error");
      assert.equal(error.path, "$");
      assert.match(error.message, /line \d+, column \d+:/);
      return true;
    },
  );
});

test("rejects duplicate mapping keys", () => {
  assert.throws(
    () => normalizeYamlDocument("STYLE:\n  tags: []\nSTYLE:\n  tags: []\n"),
    (error) => {
      assert.equal(error.code, "yaml_parse_error");
      assert.match(error.message, /duplicat(?:e|ed) mapping key/i);
      return true;
    },
  );
});

test("preserves structured quoted values that the line parser could not safely read", () => {
  const categories = parseYamlCategories(`
DETAIL:
  placeholder: <DETAIL>
  tags:
  - text: "tag: value # literal"
    label: "Label: exact"
    description: "Comma, colon: and # stay inside the value"
`);
  assert.deepEqual(categories.DETAIL.tags[0], {
    text: "tag: value # literal",
    label: "Label: exact",
    description: "Comma, colon: and # stay inside the value",
    default: false,
  });
});

test("does not silently ignore unknown reserved configuration", () => {
  assert.throws(
    () => normalizeYamlDocument("_promptboard:\n  typoField: true\n"),
    (error) => {
      assert.equal(error.code, "unknown_schema_field");
      assert.equal(error.path, "_promptboard.typoField");
      return true;
    },
  );
});
