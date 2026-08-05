# ComfyUI PromptBoard

ComfyUI PromptBoard is a small custom node package for building prompt text from YAML-managed tag boards.

It keeps prompt fragments in editable YAML files, lets you select tags from a board-style UI, and replaces placeholders in source prompt text.

It also includes a multi-LoRA loader and a shared checkpoint/LoRA model info dialog for local metadata, notes, Civitai data, and preview images.

## Nodes

### Prompt Board

`Prompt Board` loads a YAML tag file and exposes a board UI inside ComfyUI.

Outputs:

- `selection_json`: structured selection data for downstream replacement
- `preview_text`: a readable preview of selected placeholders and values

Main features:

- YAML file selector
- CodeMirror-based YAML editor with syntax highlighting
- persisted YAML editor fold state across browser refreshes
- YAML save with `Cmd+S` / `Ctrl+S`
- YAML editor regex search with match count, current-line highlight, and `Enter` / `Shift+Enter` navigation
- collapsible tag groups
- group-level select/clear
- board tag search with match count, current match highlight, automatic group expansion, and `Enter` / `Shift+Enter` navigation
- board templates for saving, loading, and automatically restoring selected states
- template save with `Cmd+S` / `Ctrl+S` from board-side controls, using the current Save mode
- automatic replacement preview output

### Prompt Board Replace

`Prompt Board Replace` takes source text plus `selection_json` from `Prompt Board`, then replaces matching placeholders.

Example source text:

```text
<SUBJECT>, <STYLE>, <LIGHTING>, <CAMERA>, <COLOR>, <DETAIL>
```

If the board selects `portrait`, `cinematic`, and `soft light`, the replace node writes those values into the matching placeholders.

### PromptBoard LoRA Loader

`PromptBoard LoRA Loader` applies multiple LoRAs to a `model` and `clip`.

The node stores its rows as JSON internally while exposing a row-based UI for:

- adding LoRA rows
- enabling or disabling each row
- searching and selecting a LoRA file
- editing model and clip strengths
- opening LoRA metadata and Civitai info
- deleting rows

Example `lora_config`:

```json
[
  {
    "enabled": true,
    "lora_name": "example.safetensors",
    "strength_model": 1.0,
    "strength_clip": 1.0
  }
]
```

Disabled rows, empty names, `None`, and rows where both strengths are `0` are skipped.

## Screenshots

### Prompt Board

The board screenshot below uses the included `default.yaml` starter tag file.

![Prompt Board using default.yaml](docs/images/promptboard-default.png)

### LoRA Info Dialog

The compact LoRA info dialog screenshot below uses `TMP/texta.safetensors`.

![LoRA info dialog for texta](docs/images/lora-modal-texta.png)

## YAML Format

YAML files live in:

```text
ComfyUI/custom_nodes/comfyui-promptboard/tags/
```

`default.yaml` is included as a starter file.

Example:

```yaml
STYLE:
  placeholder: <STYLE>
  tags:
  - cinematic
  - editorial
  - watercolor

COLOR:
  placeholder: <COLOR>
  tags:
  - warm
  - cool
  - pastel
```

### Nested Replacement

Use `replaceInsideTags: true` when a category is meant to replace placeholders inside another selected tag.

```yaml
CLOTHES:
  placeholder: <CLOTHES>
  tags:
  - <COLOR> jacket
  - <COLOR> shirt

COLOR:
  placeholder: <COLOR>
  replaceInsideTags: true
  tags:
  - black
  - white
```

## Installation

Clone the repository into your ComfyUI custom nodes folder:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/kimhr3001/comfyui-promptboard.git
```

Restart ComfyUI after installation.

## Files and User Data

Only `tags/default.yaml` is intended to be tracked by git.

Additional YAML files and saved board templates are user data and are ignored by `.gitignore`.

## Editor Theme

The board uses a bundled CodeMirror 6 editor for YAML editing.

Folded YAML sections are restored per workflow, node, and YAML file after a browser refresh. Fold state is kept in browser `localStorage` and is ignored when the YAML text changes.

Editor colors are controlled by:

```text
web/vendor/codemirror/css/thema.css
```

The default theme is Material-style dark. To change the editor appearance, edit the CSS variables in `thema.css`.

Syntax token colors are also routed through CSS variables, so the theme file remains the single place for editor color changes.

## Templates

Board templates save the selected YAML file and selected tag state.

When a workflow is reopened or the browser is refreshed, the last selected template for that node is restored automatically if the template still exists. If the template was removed, PromptBoard falls back to the workflow's saved YAML file and selection state.

The template Save button has selectable modes:

- `Save`: updates the typed template name
- `Save (New)`: saves with the typed name, adding a numeric suffix when that name already exists

Use `Cmd+S` on macOS or `Ctrl+S` on Windows/Linux while focus is in the board-side controls to run the currently selected Save mode.

## Search

PromptBoard has two regex search fields:

- YAML editor search: searches YAML lines, scrolls the editor to the current match, and highlights the current line.
- Board search: searches category names, tag labels, and tag values, expands a collapsed group when needed, scrolls to the current match, and highlights the matched group or tag.

Both search fields show match position as `current/total`. Press `Enter` for the next match and `Shift+Enter` for the previous match.

## Model Info

Right-click a supported checkpoint loader node and choose `View Checkpoint Info...` to inspect local metadata, notes, SHA256, matching Civitai model information, and preview images when available.

LoRA rows in `PromptBoard LoRA Loader` also include an `i` button that opens a LoRA-specific info dialog for the selected LoRA.

The checkpoint and LoRA dialogs share the same compact vertical UI. Preview galleries include bounded image height, previous/next navigation, a prompt overlay toggle when Civitai image metadata provides positive or negative prompts, and an icon button for storing the selected image next to the model file.

Trigger words are shown as clickable chips when available. Click a chip to copy a single trigger word, or use the copy icon in the Trigger Words header to copy all trigger words as a comma-separated prompt fragment.

The prompt overlay includes separate copy buttons for positive and negative prompt text. Notes can be edited directly from the dialog and are stored next to the model metadata.

PromptBoard stores Civitai JSON metadata next to the model as:

```text
<model>.civitai.json
```

Representative preview images are stored next to the model using the same basename and an image extension, for example:

```text
example.safetensors
example.png
```

If a representative preview already exists, the info dialog can show that local image without contacting Civitai on first open. Use `Refresh` to fetch the latest Civitai metadata.

Supported checkpoint widgets:

- `CheckpointLoader`
- `CheckpointLoaderSimple`
- `CheckpointLoader|pysssss`
- `Efficient Loader`
- `Eff. Loader SDXL`

## Development

Validate the Python files:

```bash
python -m py_compile __init__.py yaml_tag_nodes.py yaml_tag_board_split_nodes.py lora_loader_nodes.py model_info.py
```

Validate the browser extension script:

```bash
node --check web/js/yaml_tag_board_split.js
```

Validate the checkpoint info extension script:

```bash
node --check web/js/model_info.js
```

Validate the LoRA loader extension script:

```bash
node --check web/js/lora_loader.js
```

Validate the bundled CodeMirror module:

```bash
node --check web/vendor/codemirror/promptboard-codemirror.bundle.js
```

## Contribution Policy

This is a public personal project by `kimhr3001`.

Pull requests are welcome, but merge permission is intentionally limited to the repository owner. Please keep PRs focused and describe the workflow impact clearly.
