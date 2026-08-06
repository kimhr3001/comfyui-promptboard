import json
import os

import comfy.sd
import comfy.utils
import folder_paths


DEFAULT_LORA_CONFIG = "[]"


def _bool_value(value, default=True):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "on", "enabled"}:
        return True
    if text in {"0", "false", "no", "off", "disabled"}:
        return False
    return default


def _float_value(value, default):
    if value is None or value == "":
        return default
    return float(value)


def _normalize_lora_entry(entry, index):
    if not isinstance(entry, dict):
        raise ValueError(f"LoRA entry #{index + 1} must be an object.")

    if not _bool_value(entry.get("enabled"), True):
        return None

    lora_name = str(entry.get("lora_name") or entry.get("name") or "").strip()
    if not lora_name or lora_name == "None":
        return None

    strength_model = _float_value(entry.get("strength_model"), 1.0)
    strength_clip = _float_value(entry.get("strength_clip"), 1.0)
    if strength_model == 0 and strength_clip == 0:
        return None

    return {
        "lora_name": lora_name,
        "strength_model": strength_model,
        "strength_clip": strength_clip,
    }


def _parse_lora_config(lora_config):
    text = str(lora_config or "").strip()
    if not text:
        return []

    data = json.loads(text)
    if isinstance(data, dict):
        data = data.get("loras", [])
    if not isinstance(data, list):
        raise ValueError("LoRA config must be a JSON array or an object with a loras array.")

    entries = []
    for index, entry in enumerate(data):
        normalized = _normalize_lora_entry(entry, index)
        if normalized is not None:
            entries.append(normalized)
    return entries


def _file_signature(path):
    stat = os.stat(path)
    return (stat.st_size, stat.st_mtime_ns)


class PromptBoardLoraLoader:
    def __init__(self):
        self.loaded_loras = {}

    @classmethod
    def INPUT_TYPES(cls):
        loras = ["None"] + folder_paths.get_filename_list("loras")
        return {
            "required": {
                "model": ("MODEL",),
                "clip": ("CLIP",),
                "lora_config": (
                    "PROMPTBOARD_LORA_CONFIG",
                    {"default": DEFAULT_LORA_CONFIG, "loras": loras},
                ),
            },
        }

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("model", "clip")
    FUNCTION = "load_loras"
    CATEGORY = "promptboard"
    DESCRIPTION = "Apply multiple LoRAs from a JSON configuration."

    def load_loras(self, model, clip, lora_config=DEFAULT_LORA_CONFIG):
        current_model = model
        current_clip = clip

        for entry in _parse_lora_config(lora_config):
            lora_name = entry["lora_name"]
            lora_path = folder_paths.get_full_path("loras", lora_name)
            if not lora_path:
                raise FileNotFoundError(f"LoRA not found: {lora_name}")

            signature = _file_signature(lora_path)
            cached = self.loaded_loras.get(lora_path)
            lora = cached.get("lora") if isinstance(cached, dict) and cached.get("signature") == signature else None
            if lora is None:
                lora = comfy.utils.load_torch_file(lora_path, safe_load=True)
                self.loaded_loras[lora_path] = {"signature": signature, "lora": lora}

            current_model, current_clip = comfy.sd.load_lora_for_models(
                current_model,
                current_clip,
                lora,
                entry["strength_model"],
                entry["strength_clip"],
            )

        return (current_model, current_clip)


NODE_CLASS_MAPPINGS = {
    "PromptBoardLoraLoader": PromptBoardLoraLoader,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptBoardLoraLoader": "PromptBoard LoRA Loader",
}
