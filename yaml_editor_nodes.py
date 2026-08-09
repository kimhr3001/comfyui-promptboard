import json

try:
    from .yaml_tag_nodes import (
        DEFAULT_YAML_FILE,
        _default_yaml_text,
        _validate_yaml_text,
        _yaml_file_options,
        _yaml_validation_error,
    )
except ImportError:
    from yaml_tag_nodes import (
        DEFAULT_YAML_FILE,
        _default_yaml_text,
        _validate_yaml_text,
        _yaml_file_options,
        _yaml_validation_error,
    )


class PromptBoardYamlEditor:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "yaml_file": (_yaml_file_options(), {"default": DEFAULT_YAML_FILE}),
                "yaml_text": ("STRING", {"multiline": True, "default": _default_yaml_text()}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("yaml_file", "validation_report", "save_report")
    FUNCTION = "inspect_yaml"
    CATEGORY = "promptboard"
    DESCRIPTION = "Validate PromptBoard YAML before editing and saving."

    def inspect_yaml(self, yaml_file=DEFAULT_YAML_FILE, yaml_text=""):
        try:
            validation = _validate_yaml_text(yaml_text)
        except Exception as exc:
            validation = _yaml_validation_error(exc)
        return (str(yaml_file or DEFAULT_YAML_FILE), json.dumps(validation, ensure_ascii=False), "")


NODE_CLASS_MAPPINGS = {
    "PromptBoardYamlEditor": PromptBoardYamlEditor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptBoardYamlEditor": "PromptBoard YAML Editor",
}
