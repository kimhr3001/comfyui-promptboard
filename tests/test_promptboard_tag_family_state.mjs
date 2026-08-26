import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FAMILY_STATE_KEY,
  composeTagFamilyText,
  emptyTagFamilyState,
  normalizeTagFamilyState,
  setTagFamilySelected,
  tagFamilyAllowedCombinations,
  tagFamilyCombinationLabel,
  tagFamilySelectedTexts,
} from "../web/js/promptboard_tag_family_state.mjs";
import { normalizeYamlDocument } from "../web/js/promptboard_yaml.mjs";


const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function fixtureModel() {
  const source = await readFile(
    join(projectRoot, "tests", "fixtures", "yaml_schema", "valid", "schema_v2_tag_families.yaml"),
    "utf8",
  );
  return normalizeYamlDocument(source);
}

test("normalizes tag family selections with allowed combinations only", async () => {
  const model = await fixtureModel();
  const warnings = [];
  const state = {
    [FAMILY_STATE_KEY]: {
      removed: [{ owner: "own", target: "breast" }],
      grabbing: {
        girl: [
          { owner: "own", target: "hair" },
          { owner: "own", target: "breast" },
          { owner: "own", target: "breast" },
        ],
        partner: [
          { owner: "another's", target: "hair" },
        ],
      },
    },
  };

  const normalized = normalizeTagFamilyState(model, state, warnings);

  assert.deepEqual(normalized.grabbing.girl, [{ owner: "own", target: "breast" }]);
  assert.deepEqual(normalized.grabbing.partner, [{ owner: "another's", target: "hair" }]);
  assert.deepEqual(normalized.looking.default, []);
  assert.match(warnings.join("\n"), /\$families\.removed no longer exists/);
  assert.match(warnings.join("\n"), /removed disallowed combination: grabbing_own_hair/);
});

test("toggles family combinations and composes display text", async () => {
  const model = await fixtureModel();
  const state = emptyTagFamilyState(model);
  const combination = { owner: "another's", target: "hair" };

  assert.deepEqual(tagFamilyAllowedCombinations(model, "grabbing"), [
    { owner: "own", target: "breast" },
    { owner: "another's", target: "hair" },
  ]);
  assert.equal(tagFamilyCombinationLabel(model, "grabbing", combination), "상대 / 머리카락");
  assert.equal(composeTagFamilyText(model.tagFamilies.grabbing, combination), "grabbing_another's_hair");

  assert.equal(setTagFamilySelected(model, state, "grabbing", "partner", combination, true), true);
  assert.deepEqual(tagFamilySelectedTexts(model, state, "grabbing", "partner"), ["grabbing_another's_hair"]);
  assert.deepEqual(tagFamilySelectedTexts(model, state, "grabbing", "girl"), []);

  assert.equal(setTagFamilySelected(model, state, "grabbing", "partner", combination, false), true);
  assert.deepEqual(tagFamilySelectedTexts(model, state, "grabbing", "partner"), []);
});

test("migrates legacy family arrays to the first target", async () => {
  const model = await fixtureModel();
  const normalized = normalizeTagFamilyState(model, {
    [FAMILY_STATE_KEY]: {
      grabbing: [
        { owner: "own", target: "breast" },
      ],
    },
  });

  assert.deepEqual(normalized.grabbing.girl, [{ owner: "own", target: "breast" }]);
  assert.deepEqual(normalized.grabbing.partner, []);
});
