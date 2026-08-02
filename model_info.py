import hashlib
import json
import os

import folder_paths
from aiohttp import web
from folder_paths import get_directory_by_type
from server import PromptServer


def _split_model_name(name):
    text = str(name or "")
    model_type, separator, model_name = text.partition("/")
    if not separator or not model_type or not model_name:
        raise ValueError("Model path must be formatted as type/name.")
    return model_type, model_name


def _model_path(model_type, model_name):
    path = folder_paths.get_full_path(model_type, model_name)
    if not path:
        raise FileNotFoundError(f"Model not found: {model_type}/{model_name}")
    return path


def _read_safetensors_metadata(path):
    with open(path, "rb") as file:
        header_size = int.from_bytes(file.read(8), "little", signed=False)
        if header_size <= 0:
            raise BufferError("Invalid safetensors header size.")

        header = file.read(header_size)
        if not header:
            raise BufferError("Invalid safetensors header.")

    data = json.loads(header)
    metadata = data.get("__metadata__")
    return metadata if isinstance(metadata, dict) else {}


def _sha256(path):
    base, _ext = os.path.splitext(path)
    hash_file = base + ".sha256"
    if os.path.isfile(hash_file):
        with open(hash_file, "rt", encoding="utf-8") as file:
            return file.read().strip()

    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)

    value = digest.hexdigest()
    with open(hash_file, "wt", encoding="utf-8") as file:
        file.write(value)
    return value


def _metadata_response(model_type, model_name):
    path = _model_path(model_type, model_name)

    try:
        metadata = _read_safetensors_metadata(path)
    except Exception:
        metadata = {}

    base, _ext = os.path.splitext(path)
    notes_file = base + ".txt"
    if os.path.isfile(notes_file):
        with open(notes_file, "rt", encoding="utf-8") as file:
            metadata["promptboard.notes"] = file.read()

    metadata["promptboard.sha256"] = _sha256(path)
    metadata["promptboard.filename"] = os.path.basename(path)
    return metadata


def register_model_info_routes():
    if getattr(PromptServer.instance, "_promptboard_model_info_routes_registered", False):
        return
    PromptServer.instance._promptboard_model_info_routes_registered = True

    @PromptServer.instance.routes.get("/promptboard/model-info/metadata/{name:.+}")
    async def load_metadata(request):
        try:
            model_type, model_name = _split_model_name(request.match_info["name"])
            return web.json_response(_metadata_response(model_type, model_name))
        except FileNotFoundError as exc:
            return web.json_response({"error": str(exc)}, status=404)
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @PromptServer.instance.routes.post("/promptboard/model-info/notes/{name:.+}")
    async def save_notes(request):
        try:
            model_type, model_name = _split_model_name(request.match_info["name"])
            path = _model_path(model_type, model_name)
            base, _ext = os.path.splitext(path)
            with open(base + ".txt", "wt", encoding="utf-8") as file:
                file.write(await request.text())
            return web.json_response({"ok": True})
        except FileNotFoundError as exc:
            return web.json_response({"error": str(exc)}, status=404)
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @PromptServer.instance.routes.post("/promptboard/model-info/preview/{name:.+}")
    async def save_preview(request):
        try:
            model_type, model_name = _split_model_name(request.match_info["name"])
            path = _model_path(model_type, model_name)
            data = await request.json()

            source_root = os.path.abspath(get_directory_by_type(data.get("type", "output")))
            subfolder = os.path.normpath(str(data.get("subfolder", "")))
            filename = str(data.get("filename", ""))
            source_path = os.path.abspath(os.path.join(source_root, subfolder, filename))

            if os.path.commonpath((source_root, source_path)) != source_root:
                return web.json_response({"error": "Invalid preview path."}, status=400)
            if not os.path.isfile(source_path):
                return web.json_response({"error": "Preview source not found."}, status=404)

            _base, preview_ext = os.path.splitext(source_path)
            if preview_ext.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
                return web.json_response({"error": "Unsupported preview image type."}, status=400)

            model_base, _model_ext = os.path.splitext(path)
            preview_path = model_base + preview_ext
            with open(source_path, "rb") as src, open(preview_path, "wb") as dst:
                dst.write(src.read())

            return web.json_response({
                "image": f"{model_type}/{os.path.basename(preview_path)}",
            })
        except FileNotFoundError as exc:
            return web.json_response({"error": str(exc)}, status=404)
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)
