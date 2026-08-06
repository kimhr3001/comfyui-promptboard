import importlib
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


def install_runtime_stubs():
    folder_paths = types.SimpleNamespace(
        get_directory_by_type=lambda _kind: "",
        get_filename_list=lambda _kind: [],
        get_full_path=lambda _kind, name: name,
    )
    routes = types.SimpleNamespace(
        get=lambda *_args, **_kwargs: lambda fn: fn,
        post=lambda *_args, **_kwargs: lambda fn: fn,
        delete=lambda *_args, **_kwargs: lambda fn: fn,
    )
    server = types.SimpleNamespace(PromptServer=types.SimpleNamespace(instance=types.SimpleNamespace(routes=routes)))
    comfy = types.ModuleType("comfy")
    comfy_sd = types.ModuleType("comfy.sd")
    comfy_utils = types.ModuleType("comfy.utils")
    comfy_sd.load_lora_for_models = lambda model, clip, *_args: (model, clip)
    comfy_utils.load_torch_file = lambda _path, safe_load=True: {}
    comfy.sd = comfy_sd
    comfy.utils = comfy_utils

    sys.modules.setdefault("folder_paths", folder_paths)
    sys.modules.setdefault("server", server)
    sys.modules.setdefault("comfy", comfy)
    sys.modules.setdefault("comfy.sd", comfy_sd)
    sys.modules.setdefault("comfy.utils", comfy_utils)


install_runtime_stubs()
model_info = importlib.import_module("model_info")
lora_loader_nodes = importlib.import_module("lora_loader_nodes")


class PromptBoardCacheTests(unittest.TestCase):
    def test_sha256_cache_is_invalidated_when_model_file_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            model_path = Path(directory) / "model.safetensors"
            model_path.write_bytes(b"old")

            old_hash = model_info._sha256(str(model_path))
            model_path.write_bytes(b"new")
            new_hash = model_info._sha256(str(model_path))

        self.assertNotEqual(old_hash, new_hash)

    def test_civitai_cache_is_tied_to_current_model_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            model_path = Path(directory) / "model.safetensors"
            model_path.write_bytes(b"old")
            stale_hash = model_info._sha256(str(model_path))
            cache_path = Path(model_info._civitai_cache_path(str(model_path)))
            cache_path.write_text(
                '{"promptboard.sha256": "%s", "images": [], "trainedWords": ["old"]}' % stale_hash,
                encoding="utf-8",
            )

            model_path.write_bytes(b"new")
            with patch("model_info._fetch_civitai_info", return_value={"images": [], "trainedWords": ["new"]}) as fetch:
                info = model_info._civitai_response("loras", str(model_path))

        self.assertEqual(info["trainedWords"], ["new"])
        self.assertEqual(fetch.call_count, 1)

    def test_lora_loader_reloads_when_file_signature_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            lora_path = Path(directory) / "example.safetensors"
            lora_path.write_bytes(b"old")
            loaded = []

            def fake_load(path, safe_load=True):
                loaded.append(Path(path).read_bytes())
                return {"path": path, "safe_load": safe_load, "index": len(loaded)}

            with (
                patch("lora_loader_nodes.folder_paths.get_full_path", return_value=str(lora_path)),
                patch("lora_loader_nodes.comfy.utils.load_torch_file", side_effect=fake_load),
                patch(
                    "lora_loader_nodes.comfy.sd.load_lora_for_models",
                    side_effect=lambda model, clip, *_args: (model, clip),
                ),
            ):
                loader = lora_loader_nodes.PromptBoardLoraLoader()
                config = '[{"lora_name": "example.safetensors"}]'
                loader.load_loras("model", "clip", config)
                loader.load_loras("model", "clip", config)
                lora_path.write_bytes(b"new")
                loader.load_loras("model", "clip", config)

        self.assertEqual(loaded, [b"old", b"new"])


if __name__ == "__main__":
    unittest.main()
