# PromptBoard YAML schema v2 normalization contract

Status: current contract

This document defines the source YAML, normalized model, reserved names, and
validation errors that the browser and Python implementations must share.

## Source versions

- A YAML document without `_promptboard.schemaVersion` is schema v1.
- Schema v1 consists of the existing top-level category mappings.
- Schema v2 must declare `_promptboard.schemaVersion: 2`.
- `tagSets` and `attributeBoards` are valid only in schema v2.
- Declaring either v2 field without `schemaVersion: 2` is an error instead of
  silently treating the document as v1.
- Unsupported explicit versions are errors. They do not fall back to v1.
- Existing schema v1 category behavior remains unchanged.

## Reserved names

The following source and state names are reserved:

- `_promptboard`: top-level schema v2 configuration
- `$attributes`: attribute selections inside `selected_state`
- `$attribute:`: prefix for synthetic attribute-target entries in
  `selection_json`

Category names may contain Korean text and spaces, but they must not equal
`_promptboard` or `$attributes`, and must not begin with `$attribute:`.

Machine identifiers for tag sets, attribute boards, targets, and attributes
must match:

```text
^[A-Za-z][A-Za-z0-9_-]*$
```

Localized user-facing names belong in `label`.

## Placeholder rules

- A placeholder must match `<[A-Za-z0-9_:-]+>`.
- A schema v1 category without `placeholder` defaults to `<CATEGORY_NAME>`,
  preserving current behavior.
- Multiple legacy categories may share a placeholder; their selected values
  continue to be appended in YAML order.
- Every attribute target placeholder must be unique.
- An attribute target placeholder must not equal any legacy category
  placeholder.

## Normalized root

Every valid source document normalizes to this root shape:

```json
{
  "schemaVersion": 1,
  "tagSets": {},
  "attributeBoards": {},
  "categories": {}
}
```

Mapping order is significant for categories, tag sets, boards, targets, and
attributes. Implementations must preserve YAML declaration order.

## Normalized tag

Plain string and object tags normalize to one shape:

```json
{
  "text": "black",
  "label": "black",
  "description": "",
  "default": false
}
```

Rules:

- `text` is required after trimming.
- `value` remains an accepted alias for `text` in legacy and v2 tags.
- `label` defaults to `text`.
- `description` defaults to an empty string.
- `default` defaults to `false` and uses existing boolean normalization.

## Normalized category

Direct category tags:

```json
{
  "placeholder": "<STYLE>",
  "uiGroup": "Look",
  "replaceInsideTags": false,
  "tagSet": null,
  "tags": []
}
```

Tag-set category reference:

```json
{
  "placeholder": "<TCO>",
  "uiGroup": "색상",
  "replaceInsideTags": true,
  "tagSet": "colors",
  "tags": [
    {
      "text": "black",
      "label": "검정",
      "description": "검은색",
      "default": false
    }
  ]
}
```

Rules:

- A category may declare `tags` or `tagSet`, but not both.
- A `tagSet` reference expands into an independent copy of the tag list for
  each category while preserving the source `tagSet` identifier.
- Category selection state remains keyed by category, so categories sharing a
  tag set do not share selections.

## Normalized tag set

```json
{
  "label": "색상",
  "tags": []
}
```

- `label` defaults to the tag-set identifier.
- Tag objects use the same normalization contract as category tags.
- Tag sets are data sources and never render as legacy category cards by
  themselves.

## Normalized attribute board

```json
{
  "label": "의상 속성",
  "uiGroup": "의상",
  "targets": {
    "top": {
      "label": "상의",
      "placeholder": "<TOP_ATTRS>",
      "compose": {
        "separator": " "
      },
      "attributes": {
        "color": {
          "label": "색상",
          "source": "colors",
          "mode": "single",
          "migrateFrom": "상의색상"
        }
      }
    }
  }
}
```

Defaults:

- Board, target, and attribute `label` default to their machine identifier.
- Board `uiGroup` defaults to an empty string.
- Target `compose.separator` defaults to one ASCII space.
- Attribute `mode` defaults to `single`.
- Attribute `migrateFrom` defaults to `null`.

Supported modes are `single` and `multiple`. Source resolution, attribute
selection, migration, and composition are part of the current PromptBoard
runtime behavior.

## Error shape

Semantic validation errors use this stable shape:

```json
{
  "code": "unknown_tag_set",
  "path": "_promptboard.attributeBoards.clothing.targets.top.attributes.color.source",
  "message": "Unknown tag set: missingColors"
}
```

- `code` is stable and suitable for tests.
- `path` identifies the source YAML field using dot notation.
- `message` is concise user-facing text.
- YAML syntax failures use `yaml_parse_error` with path `$` and include parser
  line and column information when available.
- Implementations report the first deterministic schema error for the current
  save or render attempt.

## Contract error codes

| Code | Path rule | Meaning |
| --- | --- | --- |
| `unsupported_schema_version` | `_promptboard.schemaVersion` | Explicit version is not supported |
| `schema_version_required` | `_promptboard.schemaVersion` | A v2 field exists without `schemaVersion: 2` |
| `invalid_yaml_root` | `$` | Parsed YAML root is not a mapping |
| `reserved_category_name` | category key | Category uses a reserved name or prefix |
| `reserved_identifier` | offending ID path | Machine identifier uses a reserved name or prefix |
| `invalid_identifier` | offending ID path | Machine identifier does not match the ID pattern |
| `unknown_schema_field` | offending field path | Schema v2 configuration contains an unsupported field |
| `invalid_schema_type` | offending field path | A mapping or sequence field has the wrong type |
| `missing_required_field` | missing field path | A required schema v2 field is absent |
| `unknown_tag_set` | `tagSet` or attribute `source` | Referenced tag set does not exist |
| `ambiguous_category_source` | category path | Category declares both `tags` and `tagSet` |
| `empty_tag_set` | tag-set `tags` path | Tag set does not contain a usable tag |
| `invalid_tag` | tag entry path | Tag is malformed or has empty text |
| `invalid_attribute_mode` | attribute `mode` | Mode is not `single` or `multiple` |
| `duplicate_migration_source` | second attribute `migrateFrom` | Target maps more than one attribute from the same legacy category |
| `invalid_placeholder` | placeholder path | Placeholder syntax is invalid |
| `placeholder_collision` | target placeholder path | Target placeholder conflicts with another output slot |

Unknown fields under `_promptboard`, `tagSets`, or `attributeBoards` use
`unknown_schema_field`. Unknown legacy category fields continue to be ignored
for schema v1 compatibility.

## Fixture layout

```text
tests/fixtures/yaml_schema/
  valid/
    legacy_v1.yaml
    schema_v2_tagsets.yaml
    schema_v2_attribute_boards.yaml
  expected/
    legacy_v1.normalized.json
    schema_v2_tagsets.normalized.json
    schema_v2_attribute_boards.normalized.json
    default_v1.normalized.json
  invalid/
    *.yaml
  expected_errors.json
```

The browser parser and Python normalizer must consume these same fixtures
without separate implementation-specific expectations.

The bundled browser parser is js-yaml 5.2.3, loaded from the local extension
files with its default YAML 1.2 core schema. Normalization converts supported
legacy boolean strings such as `yes` and `on` after parsing so v1 behavior is
preserved.
