import hashlib
import json
import mimetypes
import os
import urllib.error
import urllib.parse
import urllib.request

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


def _civitai_cache_path(path):
    base, _ext = os.path.splitext(path)
    return base + ".civitai.json"


def _load_civitai_cache(path):
    cache_path = _civitai_cache_path(path)
    if not os.path.isfile(cache_path):
        return None
    with open(cache_path, "rt", encoding="utf-8") as file:
        return json.load(file)


def _preview_extension(url, content_type):
    parsed_ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
    if parsed_ext in {".png", ".jpg", ".jpeg", ".webp"}:
        return parsed_ext

    guessed_ext = mimetypes.guess_extension((content_type or "").split(";")[0].strip())
    return guessed_ext if guessed_ext in {".png", ".jpg", ".jpeg", ".webp"} else ".jpg"


def _representative_preview_path(path):
    base, _ext = os.path.splitext(path)
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        preview_path = base + ext
        if os.path.isfile(preview_path):
            return preview_path
    return None


def _download_representative_preview(path, url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Preview URL must be http or https.")

    model_base, _model_ext = os.path.splitext(path)
    request = urllib.request.Request(url, headers={"User-Agent": "ComfyUI-PromptBoard/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        ext = _preview_extension(url, response.headers.get("content-type", ""))
        target = model_base + ext
        temp_target = target + ".tmp"
        total = 0

        with open(temp_target, "wb") as file:
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > 25 * 1024 * 1024:
                    raise ValueError("Preview image is too large.")
                file.write(chunk)

        os.replace(temp_target, target)
        for old_ext in (".png", ".jpg", ".jpeg", ".webp"):
            old_path = model_base + old_ext
            if old_path != target and os.path.isfile(old_path):
                os.remove(old_path)
        return target


def _prepare_civitai_preview_info(path, info):
    images = info.get("images")
    if not isinstance(images, list):
        if _representative_preview_path(path):
            info["images"] = [{"type": "image", "promptboardRepresentativePreview": True}]
        return info

    image_items = [image for image in images if isinstance(image, dict) and image.get("type") == "image"]
    for image in image_items:
        image.pop("promptboardLocalFile", None)
        image.pop("promptboardLocalError", None)
        image.pop("promptboardRepresentativePreview", None)
        image.pop("promptboardRepresentativeError", None)

    representative = _representative_preview_path(path)
    if representative and image_items:
        image_items[0]["promptboardRepresentativePreview"] = True
        return info
    if representative and not image_items:
        images.insert(0, {"type": "image", "promptboardRepresentativePreview": True})
        return info

    if image_items:
        first_image = image_items[0]
        url = str(first_image.get("url") or "")
        if url:
            first_image.pop("promptboardRepresentativeError", None)
            try:
                _download_representative_preview(path, url)
                first_image["promptboardRepresentativePreview"] = True
            except Exception as exc:
                first_image["promptboardRepresentativeError"] = str(exc)
    return info


def _save_representative_preview(path, data):
    source_url = str(data.get("url") or "")
    if source_url:
        return _download_representative_preview(path, source_url)

    source_root = os.path.abspath(get_directory_by_type(data.get("type", "output")))
    subfolder = os.path.normpath(str(data.get("subfolder", "")))
    filename = str(data.get("filename", ""))
    source_path = os.path.abspath(os.path.join(source_root, subfolder, filename))

    if os.path.commonpath((source_root, source_path)) != source_root:
        raise ValueError("Invalid preview path.")
    if not os.path.isfile(source_path):
        raise FileNotFoundError("Preview source not found.")

    _base, preview_ext = os.path.splitext(source_path)
    if preview_ext.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        raise ValueError("Unsupported preview image type.")

    model_base, _model_ext = os.path.splitext(path)
    preview_path = model_base + preview_ext
    with open(source_path, "rb") as src, open(preview_path, "wb") as dst:
        dst.write(src.read())

    for old_ext in (".png", ".jpg", ".jpeg", ".webp"):
        old_path = model_base + old_ext
        if old_path != preview_path and os.path.isfile(old_path):
            os.remove(old_path)
    return preview_path


def _fetch_civitai_info(hash_value):
    request = urllib.request.Request(
        f"https://civitai.com/api/v1/model-versions/by-hash/{hash_value}",
        headers={"User-Agent": "ComfyUI-PromptBoard/1.0"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def _civitai_response(model_type, model_name, refresh=False):
    path = _model_path(model_type, model_name)
    if not refresh:
        cached = _load_civitai_cache(path)
        if cached is not None:
            info = _prepare_civitai_preview_info(path, cached)
            with open(_civitai_cache_path(path), "wt", encoding="utf-8") as file:
                json.dump(info, file, ensure_ascii=False, indent=2)
            return info
        if _representative_preview_path(path):
            return _prepare_civitai_preview_info(path, {
                "images": [],
                "trainedWords": [],
                "promptboardCivitaiDeferred": True,
            })

    try:
        info = _fetch_civitai_info(_sha256(path))
    except Exception as exc:
        cached = _load_civitai_cache(path)
        if cached is not None:
            info = cached
        elif _representative_preview_path(path):
            info = {"images": [], "trainedWords": []}
        else:
            raise
        info["promptboardCivitaiError"] = str(exc)

    info = _prepare_civitai_preview_info(path, info)
    with open(_civitai_cache_path(path), "wt", encoding="utf-8") as file:
        json.dump(info, file, ensure_ascii=False, indent=2)
    return info


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

    @PromptServer.instance.routes.get("/promptboard/model-info/civitai/{name:.+}")
    async def load_civitai(request):
        try:
            model_type, model_name = _split_model_name(request.match_info["name"])
            refresh = request.query.get("refresh") == "1"
            return web.json_response(_civitai_response(model_type, model_name, refresh))
        except FileNotFoundError as exc:
            return web.json_response({"error": str(exc)}, status=404)
        except urllib.error.HTTPError as exc:
            return web.json_response({"error": f"{exc.code} {exc.reason}"}, status=exc.code)
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @PromptServer.instance.routes.get("/promptboard/model-info/local-preview/{name:.+}")
    async def load_local_preview(request):
        try:
            model_type, model_name = _split_model_name(request.match_info["name"])
            path = _model_path(model_type, model_name)
            preview_path = _representative_preview_path(path)

            if not preview_path:
                return web.json_response({"error": "Local preview not found."}, status=404)

            return web.FileResponse(preview_path)
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
            preview_path = _save_representative_preview(path, data)

            return web.json_response({
                "image": f"{model_type}/{os.path.basename(preview_path)}",
            })
        except FileNotFoundError as exc:
            return web.json_response({"error": str(exc)}, status=404)
        except Exception as exc:
            return web.json_response({"error": str(exc)}, status=400)
