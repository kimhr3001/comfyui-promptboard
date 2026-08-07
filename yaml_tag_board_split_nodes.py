from .yaml_tag_nodes import (
    DEFAULT_YAML_FILE,
    _default_yaml_text,
    _select_tags_with_prompt_preview,
    _yaml_file_options,
)


class PromptBoard:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "yaml_file": (_yaml_file_options(), {"default": DEFAULT_YAML_FILE}),
                "yaml_text": ("STRING", {"multiline": True, "default": _default_yaml_text()}),
                "selected_state": ("STRING", {"multiline": True, "default": "{}"}),
            },
            "optional": {
                "source_text": ("STRING", {"forceInput": True, "default": ""}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("selection_json", "preview_text", "prompt_preview", "replace_report")
    FUNCTION = "select_tags"
    CATEGORY = "promptboard"
    DESCRIPTION = "Build prompt tag selections from YAML-managed boards."

    def select_tags(self, yaml_file=DEFAULT_YAML_FILE, yaml_text="", selected_state="{}", source_text=""):
        selection_json, preview_text, _selected_text, prompt_preview, replace_report = _select_tags_with_prompt_preview(
            yaml_file,
            yaml_text,
            selected_state,
            source_text,
        )
        return (selection_json, preview_text, prompt_preview, replace_report)


NODE_CLASS_MAPPINGS = {
    "PromptBoard": PromptBoard,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptBoard": "Prompt Board",
}
