try:
    from .yaml_tag_nodes import (
        DEFAULT_YAML_FILE,
        _default_yaml_text,
        _yaml_file_options,
    )
except ImportError:
    from yaml_tag_nodes import (
        DEFAULT_YAML_FILE,
        _default_yaml_text,
        _yaml_file_options,
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

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("yaml_file",)
    FUNCTION = "inspect_yaml"
    CATEGORY = "promptboard"
    DESCRIPTION = "Validate PromptBoard YAML before editing and saving."

    def inspect_yaml(self, yaml_file=DEFAULT_YAML_FILE, yaml_text=""):
        return (str(yaml_file or DEFAULT_YAML_FILE),)


NODE_CLASS_MAPPINGS = {
    "PromptBoardYamlEditor": PromptBoardYamlEditor,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "PromptBoardYamlEditor": "PromptBoard YAML Editor",
}
