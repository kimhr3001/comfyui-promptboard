import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ATTRIBUTE_STATE_KEY,
  attributeSelectedTexts,
  emptyAttributeState,
  normalizeAttributeState,
  setAttributeSelected,
} from "../web/js/promptboard_attribute_state.mjs";
import { normalizeYamlDocument } from "../web/js/promptboard_yaml.mjs";


const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function fixtureModel() {
  const source = await readFile(
    join(projectRoot, "tests", "fixtures", "yaml_schema", "valid", "schema_v2_attribute_boards.yaml"),
    "utf8",
  );
  return normalizeYamlDocument(source);
}

test("normalizes single and multiple attributes without sharing target state", async () => {
  const model = await fixtureModel();
  const warnings = [];
  const state = {
    [ATTRIBUTE_STATE_KEY]: {
      clothing: {
        top: {
          color: ["white", "black"],
          material: ["denim", "missing", "leather"],
        },
        bottom: { color: ["black"] },
      },
    },
  };

  const normalized = normalizeAttributeState(model, state, warnings);
  assert.deepEqual(normalized.clothing.top.color, ["white"]);
  assert.deepEqual(normalized.clothing.top.material, ["leather", "denim"]);
  assert.deepEqual(normalized.clothing.bottom.color, ["black"]);
  assert.match(warnings.join("\n"), /unknown tags: missing/);
  assert.match(warnings.join("\n"), /mode is single/);

  normalized.clothing.top.color.push("changed");
  assert.deepEqual(normalized.clothing.bottom.color, ["black"]);
});

test("single replacement and multiple toggles follow the configured mode and YAML order", async () => {
  const model = await fixtureModel();
  const state = emptyAttributeState(model);

  assert.equal(setAttributeSelected(model, state, "clothing", "top", "color", "black", true), true);
  assert.equal(setAttributeSelected(model, state, "clothing", "top", "color", "white", true), true);
  assert.deepEqual(attributeSelectedTexts(state, "clothing", "top", "color"), ["white"]);

  setAttributeSelected(model, state, "clothing", "top", "material", "denim", true);
  setAttributeSelected(model, state, "clothing", "top", "material", "leather", true);
  assert.deepEqual(attributeSelectedTexts(state, "clothing", "top", "material"), ["leather", "denim"]);
  setAttributeSelected(model, state, "clothing", "top", "material", "leather", false);
  assert.deepEqual(attributeSelectedTexts(state, "clothing", "top", "material"), ["denim"]);
});

test("reset creates explicit empty arrays and JSON workflow state round-trips exactly", async () => {
  const model = await fixtureModel();
  const state = {
    상의: ["<TOP_ATTRS> sports bra"],
    ...emptyAttributeState(model),
  };

  assert.deepEqual(state[ATTRIBUTE_STATE_KEY], {
    clothing: {
      top: { color: [], material: [] },
      bottom: { color: [] },
    },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test("v1 models do not gain an attribute state key", () => {
  const model = normalizeYamlDocument("STYLE:\n  tags:\n  - cinematic\n");
  assert.deepEqual(normalizeAttributeState(model, {}), {});
  assert.deepEqual(emptyAttributeState(model), { [ATTRIBUTE_STATE_KEY]: {} });
});
