import { CORE_SCHEMA, dump, load } from "../vendor/js-yaml/js-yaml.esm.min.mjs";
import { normalizeYamlDocument } from "./promptboard_yaml.mjs";

const CATEGORY_BOTTOM = "__category_bottom__";

function isMapping(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textValue(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function parseYamlRoot(yamlText) {
  const parsed = load(String(yamlText ?? ""), { schema: CORE_SCHEMA });
  if (parsed == null) {
    return {};
  }
  if (!isMapping(parsed)) {
    throw new Error("YAML root must be a mapping.");
  }
  return parsed;
}

function dumpYamlRoot(root) {
  return dump(root, {
    schema: CORE_SCHEMA,
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });
}

function sectionLabel(item) {
  return isMapping(item) && Object.prototype.hasOwnProperty.call(item, "section")
    ? textValue(item.section)
    : "";
}

function tagText(item) {
  if (typeof item === "string") {
    return textValue(item);
  }
  if (!isMapping(item)) {
    return "";
  }
  return textValue(Object.prototype.hasOwnProperty.call(item, "text") ? item.text : item.value);
}

function tagLabel(item) {
  if (typeof item === "string") {
    return textValue(item);
  }
  if (!isMapping(item)) {
    return "";
  }
  return textValue(item.label, tagText(item));
}

function resolveTagItems(root, categoryId) {
  const category = root[categoryId];
  if (!isMapping(category)) {
    throw new Error(`Unknown category: ${categoryId}`);
  }
  if (Array.isArray(category.tags)) {
    return { items: category.tags, sharedSource: "" };
  }
  if (category.tags == null && !category.tagSet) {
    category.tags = [];
    return { items: category.tags, sharedSource: "" };
  }

  const tagSetId = textValue(category.tagSet);
  const tagSet = root._promptboard?.tagSets?.[tagSetId];
  if (!tagSetId || !isMapping(tagSet) || !Array.isArray(tagSet.tags)) {
    throw new Error(`Category cannot receive tags directly: ${categoryId}`);
  }
  return { items: tagSet.tags, sharedSource: tagSetId };
}

function insertionIndex(items, afterSection = CATEGORY_BOTTOM) {
  if (!afterSection || afterSection === CATEGORY_BOTTOM) {
    return items.length;
  }

  const sectionIndex = items.findIndex((item) => sectionLabel(item) === afterSection);
  if (sectionIndex < 0) {
    throw new Error(`Unknown section: ${afterSection}`);
  }

  let index = sectionIndex + 1;
  while (index < items.length && !sectionLabel(items[index])) {
    index += 1;
  }
  return index;
}

function itemSummary(items) {
  return {
    texts: new Set(items.map(tagText).filter(Boolean)),
    labels: new Set(items.map(tagLabel).filter(Boolean)),
  };
}

export function getYamlEditorCategories(yamlText) {
  const model = normalizeYamlDocument(yamlText);
  return Object.entries(model.categories).map(([id, category]) => ({
    id,
    label: category.label || id,
    sections: (category.tagItems ?? [])
      .filter((item) => item.kind === "section")
      .map((item) => item.label)
      .filter(Boolean),
  }));
}

export function insertYamlEditorItem(yamlText, request) {
  const type = textValue(request?.type);
  const categoryId = textValue(request?.category);
  const afterSection = textValue(request?.afterSection, CATEGORY_BOTTOM) || CATEGORY_BOTTOM;

  if (!["section", "tag"].includes(type)) {
    throw new Error("Insert type must be section or tag.");
  }
  if (!categoryId) {
    throw new Error("Category is required.");
  }

  const root = parseYamlRoot(yamlText);
  normalizeYamlDocument(yamlText);
  const { items, sharedSource } = resolveTagItems(root, categoryId);
  const index = insertionIndex(items, afterSection);
  const summary = itemSummary(items);
  const warnings = [];

  if (type === "section") {
    const label = textValue(request?.section);
    if (!label) {
      throw new Error("Section label is required.");
    }
    items.splice(index, 0, { section: label });
  } else {
    const text = textValue(request?.text);
    const label = textValue(request?.label, text) || text;
    const description = textValue(request?.description);
    const useDefault = Boolean(request?.default);

    if (!text) {
      throw new Error("Tag text is required.");
    }
    if (summary.texts.has(text)) {
      throw new Error(`Duplicate tag text: ${text}`);
    }
    if (summary.labels.has(label)) {
      warnings.push(`Duplicate label in category: ${label}`);
    }

    const tag = { text, label };
    if (description) {
      tag.description = description;
    }
    if (useDefault) {
      tag.default = true;
    }
    items.splice(index, 0, tag);
  }

  const text = dumpYamlRoot(root);
  normalizeYamlDocument(text);
  return {
    text,
    warning: warnings.join(" "),
    sharedSource,
  };
}

export { CATEGORY_BOTTOM };
