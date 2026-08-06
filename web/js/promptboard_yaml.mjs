import { CORE_SCHEMA, load } from "../vendor/js-yaml/js-yaml.esm.min.mjs";

const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const PLACEHOLDER_PATTERN = /^<[A-Za-z0-9_:-]+>$/;
const RESERVED_CATEGORY_NAMES = new Set(["_promptboard", "$attributes"]);
const RESERVED_IDENTIFIERS = new Set(["_promptboard", "$attributes"]);
const ATTRIBUTE_ENTRY_PREFIX = "$attribute:";

export class PromptBoardYamlError extends Error {
  constructor(code, path, message, options = {}) {
    super(message, options);
    this.name = "PromptBoardYamlError";
    this.code = code;
    this.path = path;
  }
}

function fail(code, path, message, cause) {
  throw new PromptBoardYamlError(code, path, message, cause ? { cause } : undefined);
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isMapping(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textValue(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeBool(value) {
  if (typeof value === "boolean") {
    return value;
  }
  return ["1", "true", "yes", "on"].includes(textValue(value).toLowerCase());
}

function assertMapping(value, path) {
  if (!isMapping(value)) {
    fail("invalid_schema_type", path, `Expected a mapping at ${path}`);
  }
  return value;
}

function assertKnownFields(value, fields, path) {
  for (const key of Object.keys(value)) {
    if (!fields.has(key)) {
      fail("unknown_schema_field", `${path}.${key}`, `Unknown schema field: ${path}.${key}`);
    }
  }
}

function assertIdentifier(value, path) {
  const identifier = textValue(value);
  if (RESERVED_IDENTIFIERS.has(identifier) || identifier.startsWith(ATTRIBUTE_ENTRY_PREFIX)) {
    fail("reserved_identifier", path, `Reserved identifier: ${identifier}`);
  }
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    fail("invalid_identifier", path, `Invalid identifier: ${identifier || "<empty>"}`);
  }
  return identifier;
}

function assertPlaceholder(value, path) {
  const placeholder = textValue(value);
  if (!PLACEHOLDER_PATTERN.test(placeholder)) {
    fail("invalid_placeholder", path, `Invalid placeholder: ${placeholder || "<empty>"}`);
  }
  return placeholder;
}

function parseYamlSource(yamlText) {
  try {
    const parsed = load(String(yamlText ?? ""), { schema: CORE_SCHEMA });
    if (parsed == null) {
      return {};
    }
    if (!isMapping(parsed)) {
      fail("invalid_yaml_root", "$", "YAML root must be a mapping");
    }
    return parsed;
  } catch (error) {
    if (error instanceof PromptBoardYamlError) {
      throw error;
    }
    const mark = error?.mark;
    const location = mark
      ? `line ${Number(mark.line) + 1}, column ${Number(mark.column) + 1}: `
      : "";
    const reason = textValue(error?.reason || error?.message, "Invalid YAML");
    fail("yaml_parse_error", "$", `${location}${reason}`, error);
  }
}

function sourceVersion(root) {
  const settingsValue = root._promptboard;
  if (settingsValue == null) {
    return { schemaVersion: 1, settings: {} };
  }

  const settings = assertMapping(settingsValue, "_promptboard");
  const hasV2Fields = hasOwn(settings, "tagSets") || hasOwn(settings, "attributeBoards");
  if (!hasOwn(settings, "schemaVersion")) {
    if (hasV2Fields) {
      fail(
        "schema_version_required",
        "_promptboard.schemaVersion",
        "schemaVersion: 2 is required for tagSets or attributeBoards",
      );
    }
    return { schemaVersion: 1, settings };
  }

  if (settings.schemaVersion !== 2) {
    fail(
      "unsupported_schema_version",
      "_promptboard.schemaVersion",
      `Unsupported schema version: ${textValue(settings.schemaVersion)}`,
    );
  }
  return { schemaVersion: 2, settings };
}

function normalizeTag(entry, path, strict) {
  if (typeof entry === "string") {
    const text = entry.trim();
    if (strict && !text) {
      fail("invalid_tag", path, `Tag text must not be empty: ${path}`);
    }
    return text ? { text, label: text, description: "", default: false } : null;
  }
  if (!isMapping(entry)) {
    if (strict) {
      fail("invalid_tag", path, `Tag must be a string or mapping: ${path}`);
    }
    return null;
  }
  if (strict) {
    assertKnownFields(entry, new Set(["text", "value", "label", "description", "default"]), path);
  }

  const text = textValue(hasOwn(entry, "text") ? entry.text : entry.value);
  if (!text) {
    if (strict) {
      fail("invalid_tag", path, `Tag text must not be empty: ${path}`);
    }
    return null;
  }
  const label = textValue(entry.label, text) || text;
  return {
    text,
    label,
    description: textValue(entry.description),
    default: normalizeBool(entry.default),
  };
}

function normalizeTags(value, path, strict) {
  if (value == null) {
    return [];
  }
  if (!Array.isArray(value)) {
    if (strict) {
      fail("invalid_schema_type", path, `Expected a sequence at ${path}`);
    }
    return [];
  }
  return value
    .map((entry, index) => normalizeTag(entry, `${path}[${index}]`, strict))
    .filter(Boolean);
}

function normalizeTagSets(settings, schemaVersion) {
  if (schemaVersion !== 2 || !hasOwn(settings, "tagSets")) {
    return {};
  }
  const source = assertMapping(settings.tagSets, "_promptboard.tagSets");
  const tagSets = {};

  for (const [rawId, rawValue] of Object.entries(source)) {
    const id = assertIdentifier(rawId, `_promptboard.tagSets.${rawId}`);
    const path = `_promptboard.tagSets.${id}`;
    const value = assertMapping(rawValue, path);
    assertKnownFields(value, new Set(["label", "tags"]), path);
    const tags = normalizeTags(value.tags, `${path}.tags`, true);
    if (tags.length === 0) {
      fail("empty_tag_set", `${path}.tags`, `Tag set must contain at least one tag: ${id}`);
    }
    tagSets[id] = {
      label: textValue(value.label, id) || id,
      tags,
    };
  }
  return tagSets;
}

function normalizeCategory(category, rawValue, schemaVersion, tagSets) {
  const path = category;
  const value = assertMapping(rawValue, path);
  const strict = schemaVersion === 2;
  if (strict) {
    assertKnownFields(
      value,
      new Set(["placeholder", "uiGroup", "replaceInsideTags", "tags", "tagSet"]),
      path,
    );
  }

  const hasTags = hasOwn(value, "tags");
  const hasTagSet = hasOwn(value, "tagSet");
  if (hasTags && hasTagSet) {
    fail(
      "ambiguous_category_source",
      path,
      `Category must declare either tags or tagSet, not both: ${category}`,
    );
  }

  let tagSet = null;
  if (hasTagSet) {
    tagSet = assertIdentifier(value.tagSet, `${path}.tagSet`);
    if (!hasOwn(tagSets, tagSet)) {
      fail("unknown_tag_set", `${path}.tagSet`, `Unknown tag set: ${tagSet}`);
    }
  }

  const fallbackPlaceholder = `<${category}>`;
  const placeholder = textValue(value.placeholder, fallbackPlaceholder);
  if (strict) {
    assertPlaceholder(placeholder, `${path}.placeholder`);
  }
  return {
    placeholder,
    uiGroup: textValue(value.uiGroup),
    replaceInsideTags: normalizeBool(value.replaceInsideTags),
    tagSet,
    tags: hasTags
      ? normalizeTags(value.tags, `${path}.tags`, strict)
      : (tagSet ? tagSets[tagSet].tags.map((tag) => ({ ...tag })) : []),
  };
}

function normalizeCategories(root, schemaVersion, tagSets) {
  const categories = {};
  for (const [rawCategory, rawValue] of Object.entries(root)) {
    if (rawCategory === "_promptboard") {
      continue;
    }
    const category = textValue(rawCategory);
    if (!category) {
      continue;
    }
    if (RESERVED_CATEGORY_NAMES.has(category) || category.startsWith(ATTRIBUTE_ENTRY_PREFIX)) {
      fail("reserved_category_name", category, `Reserved category name: ${category}`);
    }
    if (!isMapping(rawValue)) {
      if (schemaVersion === 2) {
        fail("invalid_schema_type", category, `Expected a mapping at ${category}`);
      }
      continue;
    }
    categories[category] = normalizeCategory(category, rawValue, schemaVersion, tagSets);
  }
  return categories;
}

function normalizeAttribute(value, path, id, tagSets) {
  const attribute = assertMapping(value, path);
  assertKnownFields(attribute, new Set(["label", "source", "mode", "migrateFrom"]), path);
  if (!hasOwn(attribute, "source")) {
    fail("missing_required_field", `${path}.source`, `Missing required field: ${path}.source`);
  }
  const source = assertIdentifier(attribute.source, `${path}.source`);
  if (!hasOwn(tagSets, source)) {
    fail("unknown_tag_set", `${path}.source`, `Unknown tag set: ${source}`);
  }
  const mode = textValue(attribute.mode, "single") || "single";
  if (mode !== "single" && mode !== "multiple") {
    fail("invalid_attribute_mode", `${path}.mode`, `Unsupported attribute mode: ${mode}`);
  }
  const migrateFrom = textValue(attribute.migrateFrom);
  return {
    label: textValue(attribute.label, id) || id,
    source,
    mode,
    migrateFrom: migrateFrom || null,
  };
}

function normalizeTarget(value, path, id, tagSets) {
  const target = assertMapping(value, path);
  assertKnownFields(target, new Set(["label", "placeholder", "compose", "attributes"]), path);
  if (!hasOwn(target, "placeholder")) {
    fail("missing_required_field", `${path}.placeholder`, `Missing required field: ${path}.placeholder`);
  }
  const placeholder = assertPlaceholder(target.placeholder, `${path}.placeholder`);

  const compose = target.compose == null ? {} : assertMapping(target.compose, `${path}.compose`);
  assertKnownFields(compose, new Set(["separator"]), `${path}.compose`);
  const rawAttributes = target.attributes == null
    ? {}
    : assertMapping(target.attributes, `${path}.attributes`);
  const attributes = {};
  const migrationSources = new Set();
  for (const [rawAttributeId, rawAttribute] of Object.entries(rawAttributes)) {
    const attributeId = assertIdentifier(rawAttributeId, `${path}.attributes.${rawAttributeId}`);
    const attributePath = `${path}.attributes.${attributeId}`;
    const attribute = normalizeAttribute(rawAttribute, attributePath, attributeId, tagSets);
    if (attribute.migrateFrom && migrationSources.has(attribute.migrateFrom)) {
      fail(
        "duplicate_migration_source",
        `${attributePath}.migrateFrom`,
        `Duplicate migrateFrom in target: ${attribute.migrateFrom}`,
      );
    }
    if (attribute.migrateFrom) {
      migrationSources.add(attribute.migrateFrom);
    }
    attributes[attributeId] = attribute;
  }

  return {
    label: textValue(target.label, id) || id,
    placeholder,
    compose: { separator: hasOwn(compose, "separator") ? String(compose.separator ?? "") : " " },
    attributes,
  };
}

function normalizeAttributeBoards(settings, schemaVersion, tagSets, categories) {
  if (schemaVersion !== 2 || !hasOwn(settings, "attributeBoards")) {
    return {};
  }
  const source = assertMapping(settings.attributeBoards, "_promptboard.attributeBoards");
  const attributeBoards = {};
  const categoryPlaceholders = new Set(Object.values(categories).map((item) => item.placeholder));
  const targetPlaceholders = new Set();

  for (const [rawBoardId, rawBoard] of Object.entries(source)) {
    const boardId = assertIdentifier(rawBoardId, `_promptboard.attributeBoards.${rawBoardId}`);
    const boardPath = `_promptboard.attributeBoards.${boardId}`;
    const board = assertMapping(rawBoard, boardPath);
    assertKnownFields(board, new Set(["label", "uiGroup", "targets"]), boardPath);
    const rawTargets = board.targets == null ? {} : assertMapping(board.targets, `${boardPath}.targets`);
    const targets = {};

    for (const [rawTargetId, rawTarget] of Object.entries(rawTargets)) {
      const targetId = assertIdentifier(rawTargetId, `${boardPath}.targets.${rawTargetId}`);
      const targetPath = `${boardPath}.targets.${targetId}`;
      const target = normalizeTarget(rawTarget, targetPath, targetId, tagSets);
      if (categoryPlaceholders.has(target.placeholder) || targetPlaceholders.has(target.placeholder)) {
        const detail = categoryPlaceholders.has(target.placeholder)
          ? "category placeholder"
          : "another attribute target";
        fail(
          "placeholder_collision",
          `${targetPath}.placeholder`,
          `Attribute target placeholder conflicts with ${detail}: ${target.placeholder}`,
        );
      }
      targetPlaceholders.add(target.placeholder);
      targets[targetId] = target;
    }

    attributeBoards[boardId] = {
      label: textValue(board.label, boardId) || boardId,
      uiGroup: textValue(board.uiGroup),
      targets,
    };
  }
  return attributeBoards;
}

export function normalizeYamlDocument(yamlText) {
  const root = parseYamlSource(yamlText);
  const { schemaVersion, settings } = sourceVersion(root);
  if (hasOwn(root, "_promptboard") && root._promptboard != null) {
    assertKnownFields(settings, new Set(["schemaVersion", "tagSets", "attributeBoards"]), "_promptboard");
  }

  const tagSets = normalizeTagSets(settings, schemaVersion);
  const categories = normalizeCategories(root, schemaVersion, tagSets);
  const attributeBoards = normalizeAttributeBoards(settings, schemaVersion, tagSets, categories);
  return { schemaVersion, tagSets, attributeBoards, categories };
}

export function parseYamlCategories(yamlText) {
  return normalizeYamlDocument(yamlText).categories;
}
