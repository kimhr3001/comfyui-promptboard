import re

import yaml
from yaml.constructor import ConstructorError


IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]*$")
PLACEHOLDER_PATTERN = re.compile(r"^<[A-Za-z0-9_:-]+>$")
RESERVED_CATEGORY_NAMES = {"_promptboard", "$attributes"}
RESERVED_IDENTIFIERS = {"_promptboard", "$attributes"}
ATTRIBUTE_ENTRY_PREFIX = "$attribute:"


class PromptBoardYamlError(ValueError):
    def __init__(self, code, path, message):
        super().__init__(message)
        self.code = code
        self.path = path


class UniqueKeySafeLoader(yaml.SafeLoader):
    pass


UniqueKeySafeLoader.yaml_implicit_resolvers = {
    key: [
        (tag, pattern)
        for tag, pattern in resolvers
        if tag not in {"tag:yaml.org,2002:bool", "tag:yaml.org,2002:timestamp"}
    ]
    for key, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
UniqueKeySafeLoader.add_implicit_resolver(
    "tag:yaml.org,2002:bool",
    re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"),
    list("tTfF"),
)


def _construct_unique_mapping(loader, node, deep=False):
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        try:
            duplicate = key in mapping
        except TypeError as exc:
            raise ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                "found an unhashable key",
                key_node.start_mark,
            ) from exc
        if duplicate:
            raise ConstructorError(
                "while constructing a mapping",
                node.start_mark,
                f"found duplicate key ({key})",
                key_node.start_mark,
            )
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


UniqueKeySafeLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG,
    _construct_unique_mapping,
)


def _fail(code, path, message):
    raise PromptBoardYamlError(code, path, message)


def _is_mapping(value):
    return isinstance(value, dict)


def _text_value(value, fallback=""):
    return str(fallback if value is None else value).strip()


def _normalize_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _assert_mapping(value, path):
    if not _is_mapping(value):
        _fail("invalid_schema_type", path, f"Expected a mapping at {path}")
    return value


def _assert_known_fields(value, fields, path):
    for raw_key in value:
        key = str(raw_key)
        if key not in fields:
            _fail("unknown_schema_field", f"{path}.{key}", f"Unknown schema field: {path}.{key}")


def _assert_identifier(value, path):
    identifier = _text_value(value)
    if identifier in RESERVED_IDENTIFIERS or identifier.startswith(ATTRIBUTE_ENTRY_PREFIX):
        _fail("reserved_identifier", path, f"Reserved identifier: {identifier}")
    if not IDENTIFIER_PATTERN.fullmatch(identifier):
        _fail("invalid_identifier", path, f"Invalid identifier: {identifier or '<empty>'}")
    return identifier


def _assert_placeholder(value, path):
    placeholder = _text_value(value)
    if not PLACEHOLDER_PATTERN.fullmatch(placeholder):
        _fail("invalid_placeholder", path, f"Invalid placeholder: {placeholder or '<empty>'}")
    return placeholder


def parse_yaml_source(yaml_text):
    try:
        parsed = yaml.load(str(yaml_text or ""), Loader=UniqueKeySafeLoader)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        location = f"line {mark.line + 1}, column {mark.column + 1}: " if mark else ""
        reason = str(getattr(exc, "problem", "") or exc).strip() or "Invalid YAML"
        _fail("yaml_parse_error", "$", f"{location}{reason}")

    if parsed is None:
        return {}
    if not _is_mapping(parsed):
        _fail("invalid_yaml_root", "$", "YAML root must be a mapping")
    return parsed


def _source_version(root):
    settings_value = root.get("_promptboard")
    if settings_value is None:
        return 1, {}

    settings = _assert_mapping(settings_value, "_promptboard")
    has_v2_fields = "tagSets" in settings or "attributeBoards" in settings
    if "schemaVersion" not in settings:
        if has_v2_fields:
            _fail(
                "schema_version_required",
                "_promptboard.schemaVersion",
                "schemaVersion: 2 is required for tagSets or attributeBoards",
            )
        return 1, settings

    if settings["schemaVersion"] != 2 or isinstance(settings["schemaVersion"], bool):
        _fail(
            "unsupported_schema_version",
            "_promptboard.schemaVersion",
            f"Unsupported schema version: {_text_value(settings['schemaVersion'])}",
        )
    return 2, settings


def _normalize_tag(entry, path, strict):
    if isinstance(entry, str):
        text = entry.strip()
        if strict and not text:
            _fail("invalid_tag", path, f"Tag text must not be empty: {path}")
        return {"text": text, "label": text, "description": "", "default": False} if text else None
    if not _is_mapping(entry):
        if strict:
            _fail("invalid_tag", path, f"Tag must be a string or mapping: {path}")
        return None
    if strict:
        _assert_known_fields(entry, {"text", "value", "label", "description", "default"}, path)

    source = entry["text"] if "text" in entry else entry.get("value", "")
    text = _text_value(source)
    if not text:
        if strict:
            _fail("invalid_tag", path, f"Tag text must not be empty: {path}")
        return None
    label = _text_value(entry.get("label"), text) or text
    return {
        "text": text,
        "label": label,
        "description": _text_value(entry.get("description")),
        "default": _normalize_bool(entry.get("default", False)),
    }


def _normalize_tags(value, path, strict):
    if value is None:
        return []
    if not isinstance(value, list):
        if strict:
            _fail("invalid_schema_type", path, f"Expected a sequence at {path}")
        return []
    tags = []
    for index, entry in enumerate(value):
        tag = _normalize_tag(entry, f"{path}[{index}]", strict)
        if tag is not None:
            tags.append(tag)
    return tags


def _normalize_tag_sets(settings, schema_version):
    if schema_version != 2 or "tagSets" not in settings:
        return {}
    source = _assert_mapping(settings["tagSets"], "_promptboard.tagSets")
    tag_sets = {}
    for raw_id, raw_value in source.items():
        tag_set_id = _assert_identifier(raw_id, f"_promptboard.tagSets.{raw_id}")
        path = f"_promptboard.tagSets.{tag_set_id}"
        value = _assert_mapping(raw_value, path)
        _assert_known_fields(value, {"label", "tags"}, path)
        tags = _normalize_tags(value.get("tags"), f"{path}.tags", True)
        if not tags:
            _fail(
                "empty_tag_set",
                f"{path}.tags",
                f"Tag set must contain at least one tag: {tag_set_id}",
            )
        tag_sets[tag_set_id] = {
            "label": _text_value(value.get("label"), tag_set_id) or tag_set_id,
            "tags": tags,
        }
    return tag_sets


def _normalize_category(category, raw_value, schema_version, tag_sets):
    path = category
    value = _assert_mapping(raw_value, path)
    strict = schema_version == 2
    if strict:
        _assert_known_fields(
            value,
            {"placeholder", "uiGroup", "replaceInsideTags", "tags", "tagSet"},
            path,
        )

    has_tags = "tags" in value
    has_tag_set = "tagSet" in value
    if has_tags and has_tag_set:
        _fail(
            "ambiguous_category_source",
            path,
            f"Category must declare either tags or tagSet, not both: {category}",
        )

    tag_set = None
    if has_tag_set:
        tag_set = _assert_identifier(value["tagSet"], f"{path}.tagSet")
        if tag_set not in tag_sets:
            _fail("unknown_tag_set", f"{path}.tagSet", f"Unknown tag set: {tag_set}")

    fallback_placeholder = f"<{category}>"
    placeholder = _text_value(value.get("placeholder"), fallback_placeholder)
    if strict:
        _assert_placeholder(placeholder, f"{path}.placeholder")
    return {
        "placeholder": placeholder,
        "uiGroup": _text_value(value.get("uiGroup")),
        "replaceInsideTags": _normalize_bool(value.get("replaceInsideTags", False)),
        "tagSet": tag_set,
        "tags": (
            _normalize_tags(value.get("tags"), f"{path}.tags", strict)
            if has_tags
            else [dict(tag) for tag in tag_sets[tag_set]["tags"]] if tag_set else []
        ),
    }


def _normalize_categories(root, schema_version, tag_sets):
    categories = {}
    for raw_category, raw_value in root.items():
        if raw_category == "_promptboard":
            continue
        category = _text_value(raw_category)
        if not category:
            continue
        if category in RESERVED_CATEGORY_NAMES or category.startswith(ATTRIBUTE_ENTRY_PREFIX):
            _fail("reserved_category_name", category, f"Reserved category name: {category}")
        if not _is_mapping(raw_value):
            if schema_version == 2:
                _fail("invalid_schema_type", category, f"Expected a mapping at {category}")
            continue
        categories[category] = _normalize_category(category, raw_value, schema_version, tag_sets)
    return categories


def _normalize_attribute(value, path, attribute_id, tag_sets):
    attribute = _assert_mapping(value, path)
    _assert_known_fields(attribute, {"label", "source", "mode", "migrateFrom"}, path)
    if "source" not in attribute:
        _fail("missing_required_field", f"{path}.source", f"Missing required field: {path}.source")
    source = _assert_identifier(attribute["source"], f"{path}.source")
    if source not in tag_sets:
        _fail("unknown_tag_set", f"{path}.source", f"Unknown tag set: {source}")
    mode = _text_value(attribute.get("mode"), "single") or "single"
    if mode not in {"single", "multiple"}:
        _fail("invalid_attribute_mode", f"{path}.mode", f"Unsupported attribute mode: {mode}")
    migrate_from = _text_value(attribute.get("migrateFrom"))
    return {
        "label": _text_value(attribute.get("label"), attribute_id) or attribute_id,
        "source": source,
        "mode": mode,
        "migrateFrom": migrate_from or None,
    }


def _normalize_target(value, path, target_id, tag_sets):
    target = _assert_mapping(value, path)
    _assert_known_fields(target, {"label", "placeholder", "compose", "attributes"}, path)
    if "placeholder" not in target:
        _fail("missing_required_field", f"{path}.placeholder", f"Missing required field: {path}.placeholder")
    placeholder = _assert_placeholder(target["placeholder"], f"{path}.placeholder")

    compose_value = target.get("compose")
    compose = {} if compose_value is None else _assert_mapping(compose_value, f"{path}.compose")
    _assert_known_fields(compose, {"separator"}, f"{path}.compose")
    attributes_value = target.get("attributes")
    raw_attributes = (
        {} if attributes_value is None else _assert_mapping(attributes_value, f"{path}.attributes")
    )
    attributes = {}
    migration_sources = set()
    for raw_attribute_id, raw_attribute in raw_attributes.items():
        attribute_id = _assert_identifier(raw_attribute_id, f"{path}.attributes.{raw_attribute_id}")
        attribute_path = f"{path}.attributes.{attribute_id}"
        attribute = _normalize_attribute(
            raw_attribute,
            attribute_path,
            attribute_id,
            tag_sets,
        )
        if attribute["migrateFrom"] and attribute["migrateFrom"] in migration_sources:
            _fail(
                "duplicate_migration_source",
                f"{attribute_path}.migrateFrom",
                f"Duplicate migrateFrom in target: {attribute['migrateFrom']}",
            )
        if attribute["migrateFrom"]:
            migration_sources.add(attribute["migrateFrom"])
        attributes[attribute_id] = attribute

    separator = str(compose.get("separator") if compose.get("separator") is not None else "")
    if "separator" not in compose:
        separator = " "
    return {
        "label": _text_value(target.get("label"), target_id) or target_id,
        "placeholder": placeholder,
        "compose": {"separator": separator},
        "attributes": attributes,
    }


def _normalize_attribute_boards(settings, schema_version, tag_sets, categories):
    if schema_version != 2 or "attributeBoards" not in settings:
        return {}
    source = _assert_mapping(settings["attributeBoards"], "_promptboard.attributeBoards")
    attribute_boards = {}
    category_placeholders = {item["placeholder"] for item in categories.values()}
    target_placeholders = set()

    for raw_board_id, raw_board in source.items():
        board_id = _assert_identifier(raw_board_id, f"_promptboard.attributeBoards.{raw_board_id}")
        board_path = f"_promptboard.attributeBoards.{board_id}"
        board = _assert_mapping(raw_board, board_path)
        _assert_known_fields(board, {"label", "uiGroup", "targets"}, board_path)
        targets_value = board.get("targets")
        raw_targets = {} if targets_value is None else _assert_mapping(targets_value, f"{board_path}.targets")
        targets = {}

        for raw_target_id, raw_target in raw_targets.items():
            target_id = _assert_identifier(raw_target_id, f"{board_path}.targets.{raw_target_id}")
            target_path = f"{board_path}.targets.{target_id}"
            target = _normalize_target(raw_target, target_path, target_id, tag_sets)
            if target["placeholder"] in category_placeholders or target["placeholder"] in target_placeholders:
                detail = (
                    "category placeholder"
                    if target["placeholder"] in category_placeholders
                    else "another attribute target"
                )
                _fail(
                    "placeholder_collision",
                    f"{target_path}.placeholder",
                    f"Attribute target placeholder conflicts with {detail}: {target['placeholder']}",
                )
            target_placeholders.add(target["placeholder"])
            targets[target_id] = target

        attribute_boards[board_id] = {
            "label": _text_value(board.get("label"), board_id) or board_id,
            "uiGroup": _text_value(board.get("uiGroup")),
            "targets": targets,
        }
    return attribute_boards


def normalize_yaml_document(yaml_text):
    root = parse_yaml_source(yaml_text)
    schema_version, settings = _source_version(root)
    if "_promptboard" in root and root["_promptboard"] is not None:
        _assert_known_fields(settings, {"schemaVersion", "tagSets", "attributeBoards"}, "_promptboard")

    tag_sets = _normalize_tag_sets(settings, schema_version)
    categories = _normalize_categories(root, schema_version, tag_sets)
    attribute_boards = _normalize_attribute_boards(settings, schema_version, tag_sets, categories)
    return {
        "schemaVersion": schema_version,
        "tagSets": tag_sets,
        "attributeBoards": attribute_boards,
        "categories": categories,
    }
