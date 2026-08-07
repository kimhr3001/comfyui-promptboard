# Clothing Attribute Placeholder Policy

## Purpose

PromptBoard should keep clothing selection simple for users while avoiding YAML tag explosion.

The current `<CDE>` detail placeholder makes many clothing tags technically composable, but it also adds a broad extra decision layer. Users must decide whether details such as `lace-up`, `frilled`, `cutout`, or `slit` are valid for each clothing item. This increases UI complexity more than it improves selection speed.

This document records the next direction:

- keep color/material/pattern composition where it is predictable
- remove broad `<CDE>` usage
- split vague extra color placeholders by actual consumer
- compose internal attributes with spaces, not commas
- keep concrete detail concepts as complete clothing tags

## Current Implementation State

The YAML files currently follow this policy:

- `colors` contains pure color values only.
- `clothingMaterials` and `clothingPatterns` are separate tag sets.
- clothing attribute composition uses a space separator.
- `<ECO>` and `<ECO2>` have been replaced by consumer-specific `<LWC>`, `<ACC>`, and `<SCC>`.
- broad `<CDE>` usage has been removed.
- `추가색상`, `추가색상2`, and `추가디테일` have been removed from the active YAML categories.

No automatic migration was added for old `<CDE>`, `<ECO>`, or `<ECO2>` template selections.

## Current Problem

Current broad structure:

```text
<TCO> <CDE> dress
<BCO> <CDE> skirt
<CDE> high_heels
```

This can produce useful prompts such as:

```text
white lace-up dress
black frilled skirt
```

But it also exposes too much choice:

- `<CDE>` applies to too many clothing categories.
- detail choices are less universal than color choices.
- invalid or awkward combinations become easy.
- UI gets another category that users must understand.
- many details already exist as complete tags, such as `lace-up_boots`, `frilled_skirt`, `slit_skirt`, and `cutout_dress`.

Decision:

```text
Color/material/pattern should be composable.
Broad clothing detail should not be composable through a global placeholder.
```

## Target Placeholder Map

Use one placeholder per consumer area.

```text
<TCO> top clothing attributes
<BCO> bottom clothing attributes
<OCO> outerwear attributes
<UCO> underwear attributes
<HCO> hair color
<LWC> legwear attributes
<ACC> accessory attributes
<SCC> sock attributes
```

Korean UI labels should be user-facing and short:

```text
상의
하의
아우터
속옷
헤어
레그웨어
악세사리
양말
```

Avoid labels such as `추가색상` and `추가색상2` because they do not explain where the value is consumed.

## Attribute Composition

Attribute values inside each placeholder should be joined with a space.

Recommended:

```yaml
compose:
  separator: " "
```

This allows color, material, and pattern to form natural phrases:

```text
gray plaid skirt
black leather jacket
white lace lingerie
white striped kneehighs
```

Avoid comma composition for internal clothing attributes:

```text
gray,plaid skirt
```

That reads as separate prompt fragments rather than a single clothing phrase.

## Attribute Order

Attribute order must be stable and intentional.

Recommended order:

```text
color -> material -> pattern -> clothing item
```

Examples:

```text
gray plaid skirt
black leather jacket
white lace lingerie
white striped kneehighs
```

Do not rely on user click order. YAML declaration order should define output order.

## Tag Set Policy

Do not put every clothing attribute into one large `colors` set.

Preferred source sets:

```yaml
tagSets:
  colors:
    label: 색상
    tags:
      - white
      - black
      - gray
      - red

  clothingMaterials:
    label: 재질
    tags:
      - leather
      - latex
      - denim
      - lace
      - satin
      - silk
      - ribbed

  clothingPatterns:
    label: 패턴
    tags:
      - plaid
      - striped
      - polka_dot
      - floral_print
      - argyle
      - checkered
```

Reason:

- users understand separate color/material/pattern groups faster
- UI can show clear sub-groups
- YAML remains reusable without turning `colors` into a mixed concept bucket

## Attribute Board Direction

Each clothing target should use the same source sets where possible, but keep selections independent by target.

Example shape:

```yaml
_promptboard:
  attributeBoards:
    clothingAttributes:
      label: 의상 속성
      uiGroup: 색상
      targets:
        top:
          label: 상의
          placeholder: <TCO>
          compose:
            separator: " "
          attributes:
            color:
              label: 색상
              source: colors
              mode: single
            material:
              label: 재질
              source: clothingMaterials
              mode: single
            pattern:
              label: 패턴
              source: clothingPatterns
              mode: single
```

The same pattern can be used for:

```text
bottom -> <BCO>
outer -> <OCO>
underwear -> <UCO>
legwear -> <LWC>
accessory -> <ACC>
sock -> <SCC>
```

`<HCO>` can stay simpler because hair currently only needs color/effect values.

## Consumer Policy

Recommended consumers:

```text
<TCO>
- top items
- dresses
- bikini tops
- one-piece swimsuits when color is useful

<BCO>
- skirts
- pants
- bikini bottoms

<OCO>
- jackets
- coats
- blazers
- cardigans
- trench coats
- capes
- parkas
- windbreakers

<UCO>
- underwear
- bras
- lingerie items

<LWC>
- generic legwear
- pantyhose
- stockings
- thighhighs when not sock-specific

<SCC>
- kneehighs
- loose_socks
- ankle_socks
- calf-high_socks

<ACC>
- necktie
- ribbons
- hair accessories if color/material selection is useful
```

## CDE Removal Policy

Remove broad `<CDE>` usage from ordinary clothing tags.

Before:

```yaml
- text: <TCO> <CDE> dress
- text: <BCO> <CDE> skirt
- text: <CDE> high_heels
```

After:

```yaml
- text: <TCO> dress
- text: <BCO> skirt
- text: high_heels
```

Keep concrete detail tags as complete tags:

```yaml
- text: lace-up_boots
- text: frilled_skirt
- text: slit_skirt, side_slit
- text: cutout_dress
- text: off_shoulder_dress
```

For product-specific tags such as `Too Sweet Poplin Mini Dress`, prefer color/material/pattern attributes only:

```yaml
- text: <TCO> too_sweet_poplin_mini_dress, poplin_mini_dress, mini_dress
```

If a product-specific detail is essential, encode it directly into the tag text rather than exposing it through a global detail selector.

## Migration Risk

Changing category keys or placeholders can break existing saved templates.

Accepted approach for the next cleanup:

```text
Do not add automatic migration unless explicitly needed.
YAML simplicity and user-facing clarity are prioritized.
```

Known consequences:

- existing templates that selected `<CDE>` values may lose those detail choices
- old `추가색상` / `추가색상2` selections may not map automatically to `<LWC>`, `<ACC>`, or `<SCC>`
- users may need to re-save templates after the policy change

## Implementation Phases

### Phase 1: Rename and Split Consumers

- Replace `추가색상` / `<ECO>` with consumer-specific placeholders.
- Introduce `<LWC>`, `<ACC>`, and `<SCC>`.
- Move existing consumers:
  - `<ECO> legwear` -> `<LWC> legwear`
  - `<ECO> necktie` -> `<ACC> necktie`
  - `<ECO2> kneehighs` and similar sock items -> `<SCC> ...`

### Phase 2: Split Attribute Sources

- Keep `colors` for pure colors.
- Move material/pattern values out of `colors`.
- Add `clothingMaterials`.
- Add `clothingPatterns`.
- Set target composition separator to a space.

### Phase 3: Remove CDE

- Remove `<CDE>` from top, bottom, skirt, pants, shoes, and product-specific tags.
- Remove or retire `추가디테일`.
- Preserve concrete detail tags as complete tags.

### Phase 4: Review UI Simplicity

- Confirm the UI no longer shows broad `추가디테일`.
- Confirm user flow is:

```text
choose target attributes -> choose clothing item
```

- Confirm generated phrases are natural:

```text
gray plaid skirt
black leather jacket
white striped kneehighs
```

## Final Policy Summary

```text
1. Color/material/pattern are composable attributes.
2. Broad detail is not a composable global attribute.
3. Placeholder names must describe their consumer.
4. Attribute composition uses spaces.
5. YAML order defines output order.
6. Concrete design details remain complete tags.
```
