import json
import re
from pathlib import Path

try:
    from .promptboard_yaml import normalize_yaml_document
except ImportError:
    from promptboard_yaml import normalize_yaml_document


FALLBACK_YAML = """GIRL_POS:
  placeholder: "<GIRL_POS>"
  tags:
    - standing
    - sit
    - bent over

CLOTHES:
  placeholder: "<CLOTHES>"
  tags:
    - <UCO> bra
    - crop_top
    - open_clothes
    - miniskirt

UCO:
  placeholder: "<UCO>"
  replaceInsideTags: true
  tags:
    - black
    - white
"""

DEFAULT_YAML_FILE = "default.yaml"
INLINE_YAML_OPTION = "inline"
FIXED_DELIMITER = ","
NODE_ROOT = Path(__file__).resolve().parent
YAML_FILE_ROOTS = (("tags", NODE_ROOT / "tags"),)
TEMPLATE_FILE = NODE_ROOT / "templates" / "tag_board_templates.json"
ATTRIBUTE_STATE_KEY = "$attributes"


def _yaml_file_options():
    options = []
    for _root_name, root in YAML_FILE_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.rglob("*")):
            if path.suffix.lower() not in {".yaml", ".yml"} or not path.is_file():
                continue
            try:
                rel = path.relative_to(root).as_posix()
            except ValueError:
                continue
            options.append(rel)
    if DEFAULT_YAML_FILE in options:
        options.remove(DEFAULT_YAML_FILE)
        options.insert(0, DEFAULT_YAML_FILE)
    return options


def _safe_yaml_path(yaml_file):
    name = str(yaml_file or "").replace("\\", "/").lstrip("/")
    if not name or name == INLINE_YAML_OPTION:
        return None

    root_key, separator, rel = name.partition("/")
    if not separator:
        root_key, rel = "tags", root_key
    elif root_key == "workflows":
        root_key = "tags"

    roots = {root_name: root for root_name, root in YAML_FILE_ROOTS}
    root = roots.get(root_key)
    if root is None or not rel:
        raise ValueError(f"Unknown YAML file: {yaml_file}")

    candidate = (root / rel).resolve()
    root_resolved = root.resolve()
    try:
        candidate.relative_to(root_resolved)
    except ValueError as exc:
        raise ValueError("Invalid YAML file path.") from exc

    if candidate.suffix.lower() not in {".yaml", ".yml"}:
        raise ValueError("YAML file must end with .yaml or .yml.")
    if not candidate.is_file():
        raise ValueError(f"YAML file not found: {yaml_file}")
    return candidate


def _read_yaml_file(yaml_file):
    target = DEFAULT_YAML_FILE if not yaml_file or yaml_file == INLINE_YAML_OPTION else yaml_file
    path = _safe_yaml_path(target)
    if path is None:
        return None
    return path.read_text(encoding="utf-8")


def _default_yaml_text():
    try:
        return _read_yaml_file(DEFAULT_YAML_FILE) or FALLBACK_YAML
    except Exception:
        return FALLBACK_YAML


def _write_yaml_file(yaml_file, text):
    path = _safe_yaml_path(yaml_file)
    if path is None:
        raise ValueError("Select a YAML file before saving.")
    normalize_yaml_document(text)
    path.write_text(str(text or ""), encoding="utf-8")


def _template_name(name):
    text = str(name or "").strip()
    if not text:
        raise ValueError("Template name is required.")
    if len(text) > 80:
        raise ValueError("Template name must be 80 characters or fewer.")
    return text


def _read_board_templates():
    if not TEMPLATE_FILE.is_file():
        return []
    try:
        data = json.loads(TEMPLATE_FILE.read_text(encoding="utf-8") or "[]")
    except Exception:
        return []
    return data if isinstance(data, list) else []


def _write_board_templates(templates):
    TEMPLATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    TEMPLATE_FILE.write_text(
        json.dumps(templates, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _board_template_summaries():
    return [{"name": item["name"]} for item in _read_board_templates() if isinstance(item, dict) and item.get("name")]


def _get_board_template(name):
    target = _template_name(name)
    for item in _read_board_templates():
        if isinstance(item, dict) and item.get("name") == target:
            yaml_file = str(item.get("yaml_file") or DEFAULT_YAML_FILE)
            selected_state = item.get("selected_state")
            return {
                "name": target,
                "yaml_file": yaml_file,
                "selected_state": selected_state if isinstance(selected_state, dict) else {},
            }
    raise ValueError(f"Template not found: {target}")


def _save_board_template(name, yaml_file, selected_state):
    target = _template_name(name)
    yaml_name = str(yaml_file or DEFAULT_YAML_FILE)
    _safe_yaml_path(yaml_name)
    if not isinstance(selected_state, dict):
        raise ValueError("selected_state must be an object.")

    templates = [item for item in _read_board_templates() if isinstance(item, dict) and item.get("name") != target]
    templates.append({
        "name": target,
        "yaml_file": yaml_name,
        "selected_state": selected_state,
    })
    templates.sort(key=lambda item: str(item.get("name", "")).lower())
    _write_board_templates(templates)
    return _get_board_template(target)


def _delete_board_template(name):
    target = _template_name(name)
    templates = _read_board_templates()
    next_templates = [
        item
        for item in templates
        if not (isinstance(item, dict) and item.get("name") == target)
    ]
    if len(next_templates) == len(templates):
        raise ValueError(f"Template not found: {target}")
    _write_board_templates(next_templates)
    return {"name": target, "deleted": True}


def _register_api_routes():
    try:
        from aiohttp import web
        from server import PromptServer
    except Exception:
        return

    if getattr(PromptServer.instance, "_promptboard_routes_registered", False):
        return
    PromptServer.instance._promptboard_routes_registered = True

    @PromptServer.instance.routes.get("/promptboard/yaml/files")
    async def list_yaml_files(_request):
        return web.json_response(_yaml_file_options())

    @PromptServer.instance.routes.get("/promptboard/yaml/file")
    async def read_yaml_file(request):
        try:
            yaml_file = request.query.get("name", "")
            text = _read_yaml_file(yaml_file)
            if text is None:
                text = FALLBACK_YAML
            return web.json_response({"text": text})
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @PromptServer.instance.routes.post("/promptboard/yaml/file")
    async def write_yaml_file(request):
        try:
            data = await request.json()
            yaml_file = data.get("name", "")
            text = data.get("text", "")
            _write_yaml_file(yaml_file, text)
            return web.json_response({"ok": True})
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @PromptServer.instance.routes.get("/promptboard/templates")
    async def list_board_templates(_request):
        return web.json_response(_board_template_summaries())

    @PromptServer.instance.routes.get("/promptboard/template")
    async def read_board_template(request):
        try:
            return web.json_response(_get_board_template(request.query.get("name", "")))
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @PromptServer.instance.routes.post("/promptboard/template")
    async def write_board_template(request):
        try:
            data = await request.json()
            template = _save_board_template(
                data.get("name", ""),
                data.get("yaml_file", DEFAULT_YAML_FILE),
                data.get("selected_state", {}),
            )
            return web.json_response(template)
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @PromptServer.instance.routes.delete("/promptboard/template")
    async def delete_board_template(request):
        try:
            return web.json_response(_delete_board_template(request.query.get("name", "")))
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)


def _normalize_config(yaml_text):
    model = normalize_yaml_document(yaml_text)
    config = {}
    for category, item in model["categories"].items():
        config[category] = {
            "placeholder": item["placeholder"],
            "uiGroup": item["uiGroup"],
            "delimiter": FIXED_DELIMITER,
            "replaceInsideTags": item["replaceInsideTags"],
            "tags": item["tags"],
        }
    return config


def _load_selected_state(selected_state):
    try:
        parsed = json.loads(selected_state or "{}")
    except Exception:
        return {}

    return parsed if isinstance(parsed, dict) else {}


def _selected_for_category(category, tags, selected_state):
    if category in selected_state:
        state = selected_state[category]
        if isinstance(state, dict):
            state = state.get("selected", [])
        if isinstance(state, list):
            selected = {str(item) for item in state}
            return [tag["text"] for tag in tags if tag["text"] in selected]

    return [tag["text"] for tag in tags if tag.get("default")]


def _normalize_attribute_values(tags, raw_values, mode, use_defaults, path, warnings):
    available = {tag["text"] for tag in tags}
    source_values = (
        [tag["text"] for tag in tags if tag.get("default")]
        if use_defaults
        else raw_values
    )

    if not use_defaults and not isinstance(raw_values, list):
        warnings.append(f"{path} must be an array; the saved value was cleared.")
        return []

    requested = [str(value) for value in source_values] if isinstance(source_values, list) else []
    invalid = [value for value in requested if value not in available]
    if invalid:
        warnings.append(f"{path} removed unknown tags: {', '.join(dict.fromkeys(invalid))}")

    valid_requested = [value for value in requested if value in available]
    if mode == "single":
        if len(valid_requested) > 1:
            warnings.append(f"{path} kept only one tag because its mode is single.")
        return valid_requested[:1]

    selected = set(valid_requested)
    return [tag["text"] for tag in tags if tag["text"] in selected]


def _warn_unknown_attribute_paths(model, saved_root, warnings):
    if not isinstance(saved_root, dict):
        return
    for board_id, saved_board in saved_root.items():
        board = (model.get("attributeBoards") or {}).get(board_id)
        if not board:
            warnings.append(f"{ATTRIBUTE_STATE_KEY}.{board_id} no longer exists and was removed.")
            continue
        if not isinstance(saved_board, dict):
            continue
        for target_id, saved_target in saved_board.items():
            target = (board.get("targets") or {}).get(target_id)
            if not target:
                warnings.append(f"{ATTRIBUTE_STATE_KEY}.{board_id}.{target_id} no longer exists and was removed.")
                continue
            if not isinstance(saved_target, dict):
                continue
            for attribute_id in saved_target:
                if attribute_id not in (target.get("attributes") or {}):
                    warnings.append(
                        f"{ATTRIBUTE_STATE_KEY}.{board_id}.{target_id}.{attribute_id} "
                        "no longer exists and was removed."
                    )


def _normalize_attribute_state(model, selected_state=None, warnings=None):
    selected_state = selected_state if isinstance(selected_state, dict) else {}
    warnings = warnings if isinstance(warnings, list) else []
    saved_root = selected_state.get(ATTRIBUTE_STATE_KEY)
    saved_root = saved_root if isinstance(saved_root, dict) else {}
    next_root = {}

    _warn_unknown_attribute_paths(model, saved_root, warnings)
    for board_id, board in (model.get("attributeBoards") or {}).items():
        next_board = {}
        for target_id, target in (board.get("targets") or {}).items():
            next_target = {}
            saved_target = (
                saved_root.get(board_id, {}).get(target_id, {})
                if isinstance(saved_root.get(board_id), dict)
                else {}
            )
            saved_target = saved_target if isinstance(saved_target, dict) else {}
            for attribute_id, attribute in (target.get("attributes") or {}).items():
                tag_set = (model.get("tagSets") or {}).get(attribute.get("source")) or {}
                path = f"{ATTRIBUTE_STATE_KEY}.{board_id}.{target_id}.{attribute_id}"
                has_saved_value = attribute_id in saved_target
                next_target[attribute_id] = _normalize_attribute_values(
                    tag_set.get("tags") or [],
                    saved_target.get(attribute_id, []),
                    attribute.get("mode", "single"),
                    not has_saved_value,
                    path,
                    warnings,
                )
            next_board[target_id] = next_target
        next_root[board_id] = next_board
    return next_root


def _attribute_selected_texts(state, board_id, target_id, attribute_id):
    selected = (
        state.get(ATTRIBUTE_STATE_KEY, {})
        .get(board_id, {})
        .get(target_id, {})
        .get(attribute_id, [])
    )
    return selected if isinstance(selected, list) else []


def _compose_attribute_targets(model, selected_state=None, warnings=None):
    warnings = warnings if isinstance(warnings, list) else []
    attribute_state = _normalize_attribute_state(model, selected_state, warnings)
    state = {ATTRIBUTE_STATE_KEY: attribute_state}
    targets = {}

    for board_id, board in (model.get("attributeBoards") or {}).items():
        for target_id, target in (board.get("targets") or {}).items():
            values = []
            for attribute_id in (target.get("attributes") or {}):
                values.extend(_attribute_selected_texts(state, board_id, target_id, attribute_id))

            separator = str((target.get("compose") or {}).get("separator", " "))
            key = f"{board_id}.{target_id}"
            targets[key] = {
                "boardId": board_id,
                "targetId": target_id,
                "placeholder": target.get("placeholder", ""),
                "selected": values,
                "text": separator.join(values),
            }
    return targets


def _build_selection_payload(config, selected_state):
    payload = {}
    selected_values = []

    for category, item in config.items():
        selected = _selected_for_category(category, item["tags"], selected_state)
        payload[category] = {
            "placeholder": item["placeholder"],
            "uiGroup": item.get("uiGroup", ""),
            "delimiter": FIXED_DELIMITER,
            "replaceInsideTags": item.get("replaceInsideTags", False),
            "selected": selected,
        }
        selected_values.extend(selected)

    return payload, selected_values


def _preview_text(payload, replacements=None):
    lines = []
    replacements = replacements or {}
    seen = set()

    for item in payload.values():
        selected = item.get("selected", [])
        placeholder = item.get("placeholder", "")
        if placeholder in seen:
            continue
        seen.add(placeholder)
        value = replacements.get(placeholder, FIXED_DELIMITER.join(selected))
        if selected or value:
            lines.append(f"{placeholder}: {value}")

    return "\n".join(lines)


def _cleanup_replaced_text(text):
    text = re.sub(r"[ \t]+,", ",", text)
    text = re.sub(r",\s*,+", ", ", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip(" \t,")


def _find_placeholders(text):
    return re.findall(r"<[A-Za-z0-9_:-]+>", str(text or ""))


def _resolve_selection_replacements(selections):
    inner_placeholder_to_category = {}
    for category, item in selections.items():
        if not isinstance(item, dict):
            continue
        placeholder = str(item.get("placeholder", f"<{category}>"))
        if item.get("replaceInsideTags"):
            inner_placeholder_to_category[placeholder] = category

    resolved = {}
    resolving = []
    report = []
    inner_used = set()

    def resolve_category(category):
        if category in resolved:
            return resolved[category]
        if category in resolving:
            cycle = " -> ".join([*resolving, category])
            report.append(f"cycle: {cycle}")
            return ""

        item = selections.get(category, {})
        if not isinstance(item, dict):
            resolved[category] = ""
            return ""

        resolving.append(category)
        selected = item.get("selected", [])
        if not isinstance(selected, list):
            selected = []

        values = []
        for value in selected:
            text = str(value)
            for placeholder in _find_placeholders(text):
                inner_category = inner_placeholder_to_category.get(placeholder)
                if inner_category is not None:
                    inner_used.add(placeholder)
                    text = text.replace(placeholder, resolve_category(inner_category))
            if text:
                values.append(text)

        resolving.pop()
        replacement = FIXED_DELIMITER.join(values)
        resolved[category] = replacement
        return replacement

    replacements = {}
    placeholders = []
    placeholder_values = {}
    for category, item in selections.items():
        if not isinstance(item, dict):
            continue

        placeholder = str(item.get("placeholder", f"<{category}>"))
        if placeholder not in placeholders:
            placeholders.append(placeholder)
        value = resolve_category(category)
        if value:
            placeholder_values.setdefault(placeholder, []).append(value)

    for placeholder in placeholders:
        values = placeholder_values.get(placeholder, [])
        replacements[placeholder] = FIXED_DELIMITER.join(values)

    return replacements, report, inner_used


def _replace_source_placeholders(source_text, replacements, empty_behavior):
    text = str(source_text or "")
    used = set()

    for placeholder, replacement in replacements.items():
        if placeholder not in text:
            continue
        used.add(placeholder)
        value = replacement if replacement else (placeholder if empty_behavior == "keep placeholder" else "")
        text = text.replace(placeholder, value)

    return text, used


def _select_tags_outputs(yaml_file=DEFAULT_YAML_FILE, yaml_text="", selected_state="{}"):
    try:
        source_yaml = yaml_text
        if not str(source_yaml or "").strip():
            loaded_yaml = _read_yaml_file(yaml_file)
            source_yaml = loaded_yaml if loaded_yaml is not None else FALLBACK_YAML
        config = _normalize_config(source_yaml)
        state = _load_selected_state(selected_state)
        payload, selected_values = _build_selection_payload(config, state)
        replacements, report, _ = _resolve_selection_replacements(payload)
        selection_json = json.dumps(payload, ensure_ascii=False)
        preview = _preview_text(payload, replacements)
        if report:
            preview = f"{preview}\n" if preview else ""
            preview += "\n".join(report)
        selected_text = FIXED_DELIMITER.join(selected_values)
        return (selection_json, preview, selected_text)
    except Exception as exc:
        message = f"Prompt Board error: {exc}"
        return ("{}", message, "")


class PromptBoardReplace:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "source_text": ("STRING", {"multiline": True, "default": "", "forceInput": True}),
                "selection_json": ("STRING", {"multiline": True, "default": "", "forceInput": True}),
                "empty_behavior": (["remove placeholder", "keep placeholder"], {"default": "remove placeholder"}),
                "cleanup": ("BOOLEAN", {"default": True}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("text", "report")
    FUNCTION = "replace_tags"
    CATEGORY = "promptboard"
    DESCRIPTION = "Replace placeholders in source text using Prompt Board output."

    def replace_tags(self, source_text, selection_json, empty_behavior="remove placeholder", cleanup=True):
        text = str(source_text or "")
        report = []

        try:
            selections = json.loads(selection_json or "{}")
        except Exception as exc:
            return (text, f"Prompt Board Replace error: invalid selection_json: {exc}")

        if not isinstance(selections, dict):
            return (text, "Prompt Board Replace error: selection_json must be an object.")

        replacements, resolve_report, inner_used = _resolve_selection_replacements(selections)
        report.extend(resolve_report)
        text, used = _replace_source_placeholders(text, replacements, empty_behavior)
        used.update(inner_used)

        reported_unused = set()
        for category, item in selections.items():
            if not isinstance(item, dict):
                continue
            placeholder = str(item.get("placeholder", f"<{category}>"))
            selected = item.get("selected", [])
            if selected and placeholder not in used and placeholder not in reported_unused:
                report.append(f"unused: {placeholder}")
                reported_unused.add(placeholder)

        missing = sorted(set(_find_placeholders(text)))
        if missing:
            report.append("missing: " + ", ".join(missing))

        if cleanup:
            text = _cleanup_replaced_text(text)

        return (text, "\n".join(report))


NODE_CLASS_MAPPINGS = {
    "PromptBoardReplace": PromptBoardReplace,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptBoardReplace": "Prompt Board Replace",
}


_register_api_routes()
