# PromptBoard Tag Families Development Plan

Status: planning

## Purpose

PromptBoard already supports reusable `tagSets` for shared option lists and
attribute/modifier composition for simple prefix-like combinations.

The next step is to support structured Danbooru-style tag families such as:

```text
grabbing_own_breast
grabbing_another's_hair
arms_up
arms_behind_back
looking_at_viewer
```

These are not simple color/material prefixes. They are generated from a small
tag grammar and should be emitted into the current positive prompt structure
without changing the larger workflow yet.

## Current Positive Prompt Structure

The current `2608_default.json` positive prompt flow is:

```text
PrimitiveStringMultiline "BasePrompt"
  -> PromptBoard source_text
  -> PromptBoard prompt_preview
  -> DPRandomGenerator "BasePrompt"
  -> CLIPTextEncodeWithTokens "Pos 프롬프트 (Token)"
  -> KSampler positive
```

The current base prompt template is:

```text
masterpiece, best quality, amazing quality, realistic, detailed, newest, <INTER>, <POSE_SET>,

BREAK
<VIEW>

BREAK
## GIRL START ##
[1girl, <GIRL_POS>, <HAIR>]
[<GIRL_FACE>]
[<GIRL_BODY>, <CLOTHES>,]
## GIRL END ##

BREAK
## PARTNER_START ###
[<PARTNER>]
[(<PARTNER_PENIS>:0.9)]
## PARTNER_END ##

BREAK
[<HARD>, <ETC>]

BREAK
<LOCATION>,
```

Tag family output should target these existing placeholders first. The future
main-character/sub-character system is out of scope for this phase.

## Scope

### In Scope

- Add schema support for `_promptboard.tagFamilies`.
- Reuse existing `tagSets` as slot option sources.
- Generate one final tag text from a pattern and selected slot values.
- Restrict invalid combinations with an explicit allow-list.
- Emit generated family tags into existing placeholders such as `<GIRL_POS>`,
  `<GIRL_FACE>`, `<PARTNER>`, `<HARD>`, or `<VIEW>`.
- Render tag family selectors in PromptBoard UI.
- Store selected family state in `selected_state`.
- Include generated tags in `selection_json`, `preview_text`, and
  `prompt_preview`.

### Out of Scope

- Add-on YAML composition.
- Main character plus multiple sub-character prompt generation.
- New BREAK layout generation.
- Automatic validation against external Danbooru tag databases.
- Generating every cartesian combination by default.

## Proposed YAML Shape

```yaml
_promptboard:
  schemaVersion: 2
  tagSets:
    grabOwners:
      label: 잡기 주체
      tags:
        - text: own
          label: 자기
        - text: another's
          label: 상대

    grabTargets:
      label: 잡기 대상
      tags:
        - text: breast
          label: 가슴
        - text: ass
          label: 엉덩이
        - text: hair
          label: 머리카락

  tagFamilies:
    grabbing:
      label: 잡기
      placeholder: <GIRL_POS>
      pattern: "grabbing_{owner}_{target}"
      slots:
        owner:
          label: 주체
          source: grabOwners
        target:
          label: 대상
          source: grabTargets
      allowed:
        - owner: own
          target: breast
        - owner: own
          target: ass
        - owner: another's
          target: hair
        - owner: another's
          target: ass
```

## Schema Rules

- `tagFamilies` is valid only with `schemaVersion: 2`.
- Family identifiers use the same identifier rule as tag sets:
  `^[A-Za-z][A-Za-z0-9_-]*$`.
- `label` defaults to the family identifier.
- `placeholder` is required and must match the existing placeholder pattern.
- `pattern` is required and must contain named slots in `{slotId}` form.
- `slots` is required.
- Every slot id referenced by `pattern` must exist in `slots`.
- Every slot must declare a `source` that references an existing `tagSet`.
- `allowed` is optional, but recommended.
- When `allowed` is present, only those exact slot combinations are selectable.
- When `allowed` is omitted, the runtime may generate all combinations, but
  this should be used only for small, low-risk families.

## Normalized Model Shape

```json
{
  "tagFamilies": {
    "grabbing": {
      "label": "잡기",
      "placeholder": "<GIRL_POS>",
      "pattern": "grabbing_{owner}_{target}",
      "slots": {
        "owner": {
          "label": "주체",
          "source": "grabOwners"
        },
        "target": {
          "label": "대상",
          "source": "grabTargets"
        }
      },
      "allowed": [
        { "owner": "own", "target": "breast" }
      ]
    }
  }
}
```

## Selected State Shape

Store family state separately from legacy category and attribute state.

```json
{
  "$families": {
    "grabbing": [
      {
        "owner": "own",
        "target": "breast"
      },
      {
        "owner": "another's",
        "target": "hair"
      }
    ]
  }
}
```

Generated output:

```text
grabbing_own_breast
grabbing_another's_hair
```

## UI Proposal

Tag families should appear as category-like panels under their target context.

For example, a family targeting `<GIRL_POS>` can appear near `캐릭터 > 포즈`
or `캐릭터 > 손`, depending on the family label and optional UI grouping.

Minimal UI:

```text
잡기
[자기] [상대]
[머리카락] [가슴] [엉덩이]

허용 조합
[자기 + 가슴] [자기 + 엉덩이] [상대 + 머리카락]
```

Recommended UI for phase 1:

- Show family as a selectable list of generated allowed combinations.
- Display labels from slot tag labels.
- Show generated tag text in tooltip.
- Avoid a complex multi-step slot picker until the model proves useful.

Example button label:

```text
자기 / 가슴
```

Tooltip:

```text
grabbing_own_breast
```

## Runtime Composition

Family selections should be converted into synthetic selection entries keyed by
placeholder.

Example:

```json
{
  "$family:grabbing": {
    "placeholder": "<GIRL_POS>",
    "selected": [
      "grabbing_own_breast",
      "grabbing_another's_hair"
    ]
  }
}
```

The existing placeholder replacement path can then append these values in YAML
order alongside normal category values.

## Suggested Phase Plan

### Phase 1: Schema And Backend Composition

- Add parser support for `_promptboard.tagFamilies` in Python and browser YAML
  parsers.
- Add contract tests for valid and invalid family definitions.
- Add selected-state normalization for `$families`.
- Add backend composition from selected family state to generated tag strings.
- Emit family selections through the existing selection payload path.

Completion criteria:

- Valid YAML normalizes with `tagFamilies`.
- Unknown tag set sources, missing pattern slots, and invalid allowed values
  fail with stable errors.
- Backend preview can produce a generated tag in the correct placeholder.

### Phase 2: Minimal UI

- Render tag family groups in the navigator.
- For phase 2, render only allowed generated combinations as buttons.
- Store selected combinations in `$families`.
- Show selected family tags in the selected summary.
- Clicking a family selection should toggle the generated tag.

Completion criteria:

- User can select `grabbing_own_breast` from the UI.
- Selection appears in preview and final prompt.
- Existing categories, attributes, and modifiers still work.

### Phase 3: First YAML Families

Start with a small set that fits the current prompt placeholders:

- Character hand/body actions:
  - `grabbing_own_{target}` -> `<GIRL_POS>` or `<GIRL_BODY>`
  - `spreading_own_{target}` -> `<GIRL_POS>`
- Partner actions:
  - `grabbing_another's_{target}` -> `<PARTNER>`
  - `foot_on_another's_{target}` -> `<PARTNER>`
- Eye direction:
  - `looking_{direction}` -> `<GIRL_FACE>`
- Arms:
  - `arms_{position}` -> `<GIRL_POS>`

Completion criteria:

- Add only a few high-confidence allowed combinations.
- No large cartesian expansion.
- Existing explicit tags are not removed in this phase.

### Phase 4: Cleanup Candidates

After families are proven usable:

- Identify explicit category tags now duplicated by family outputs.
- Move or remove duplicates only after comparing generated output with old
  selection behavior.
- Keep high-value standalone Danbooru tags when family grammar would make them
  harder to discover.

Completion criteria:

- No prompt output regression for existing templates.
- Removed tags have a documented generated replacement.

## Risks

- Over-generating invalid Danbooru-looking tags.
- Making the UI more complex than the current tag button model.
- Losing discoverability if explicit tags disappear too early.
- Mixing character-owned actions and partner actions into the wrong BREAK
  section.

## Recommended Direction

Build tag families as a constrained generator, not as a general cartesian
product system.

Use the current positive prompt placeholders as output boundaries. This keeps
the feature useful now while preserving a path toward future character-slot
prompt generation.
