# ComfyUI PromptBoard

ComfyUI PromptBoard is a small custom node package for building prompt text from YAML-managed tag boards.

It keeps prompt fragments in editable YAML files, lets you select tags from a board-style UI, and replaces placeholders in source prompt text.

## Nodes

### Prompt Board

`Prompt Board` loads a YAML tag file and exposes a board UI inside ComfyUI.

Outputs:

- `selection_json`: structured selection data for downstream replacement
- `preview_text`: a readable preview of selected placeholders and values

Main features:

- YAML file selector
- CodeMirror-based YAML editor with syntax highlighting
- YAML save with `Cmd+S` / `Ctrl+S`
- collapsible tag groups
- group-level select/clear
- board templates for saving and loading selected states
- automatic replacement preview output

### Prompt Board Replace

`Prompt Board Replace` takes source text plus `selection_json` from `Prompt Board`, then replaces matching placeholders.

Example source text:

```text
<SUBJECT>, <STYLE>, <LIGHTING>, <CAMERA>, <COLOR>, <DETAIL>
```

If the board selects `portrait`, `cinematic`, and `soft light`, the replace node writes those values into the matching placeholders.

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

Editor colors are controlled by:

```text
web/vendor/codemirror/css/thema.css
```

The default theme is Material-style dark. To change the editor appearance, edit the CSS variables in `thema.css`.

Syntax token colors are also routed through CSS variables, so the theme file remains the single place for editor color changes.

## Development

Validate the Python files:

```bash
python -m py_compile __init__.py yaml_tag_nodes.py yaml_tag_board_split_nodes.py
```

Validate the browser extension script:

```bash
node --check web/js/yaml_tag_board_split.js
```

Validate the bundled CodeMirror module:

```bash
node --check web/vendor/codemirror/promptboard-codemirror.bundle.js
```

## Contribution Policy

This is a public personal project by `kimhr3001`.

Pull requests are welcome, but merge permission is intentionally limited to the repository owner. Please keep PRs focused and describe the workflow impact clearly.
