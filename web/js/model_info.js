import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { $el, ComfyDialog } from "../../../scripts/ui.js";

const CHECKPOINT_TYPE = "checkpoints";
const CHECKPOINT_WIDGETS = {
  CheckpointLoader: ["ckpt_name"],
  CheckpointLoaderSimple: ["ckpt_name"],
  "CheckpointLoader|pysssss": ["ckpt_name", ""],
  "Efficient Loader": [""],
  "Eff. Loader SDXL": [""],
};

function ensureStyles() {
  if (document.getElementById("promptboard-model-info-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "promptboard-model-info-style";
  style.textContent = `
    .promptboard-model-info .comfy-modal-content {
      max-width: min(920px, 92vw);
    }

    .promptboard-model-info-content {
      color: var(--fg-color, #ddd);
      min-width: min(760px, 86vw);
    }

    .promptboard-model-info-content h2 {
      font-size: 18px;
      margin: 0 0 12px;
    }

    .promptboard-model-info-main {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) minmax(180px, 280px);
      gap: 16px;
      align-items: start;
    }

    .promptboard-model-info-main p {
      margin: 0 0 8px;
      line-height: 1.35;
    }

    .promptboard-model-info-main label {
      color: #f2f2f2;
      font-weight: 700;
      margin-right: 6px;
    }

    .promptboard-model-info-notes {
      display: block;
      max-height: 140px;
      overflow: auto;
      white-space: pre-wrap;
      opacity: 0.9;
    }

    .promptboard-model-info-description {
      max-height: 260px;
      overflow: auto;
      margin-top: 12px;
      padding-right: 8px;
    }

    .promptboard-model-info-preview {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: stretch;
    }

    .promptboard-model-info-preview img {
      display: block;
      max-width: 100%;
      max-height: 360px;
      object-fit: contain;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: #111;
    }

    .promptboard-model-info-raw {
      color: var(--fg-color, #ddd);
      max-width: min(860px, 90vw);
      max-height: min(680px, 82vh);
      overflow: auto;
    }

    .promptboard-model-info-raw div {
      display: grid;
      grid-template-columns: minmax(160px, 240px) minmax(240px, 1fr);
      gap: 10px;
      padding: 5px 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .promptboard-model-info-raw label {
      font-weight: 700;
      color: #f2f2f2;
      overflow-wrap: anywhere;
    }

    .promptboard-model-info-raw span {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    @media (max-width: 720px) {
      .promptboard-model-info-content {
        min-width: 0;
      }

      .promptboard-model-info-main {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function encodePath(type, name) {
  return encodeURIComponent(`${type}/${name}`);
}

function metadataValue(metadata, key, fallback = "") {
  const value = metadata?.[key];
  return value == null || value === "" ? fallback : String(value);
}

function getNodeType(node) {
  return node?.comfyClass || node?.type;
}

function getWidgetValue(node, widgetName) {
  if (!node?.widgets?.length) {
    return "";
  }
  const widget = widgetName
    ? node.widgets.find((item) => item.name === widgetName)
    : node.widgets[0];
  let value = widget?.value;
  if (value?.content) {
    value = value.content;
  }
  return value && value !== "None" ? String(value) : "";
}

function titleFromPath(value) {
  const parts = String(value).split(/[\\/]/);
  return parts[parts.length - 1] || value;
}

function textOrJson(value) {
  if (value == null) {
    return "";
  }
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

class RawMetadataDialog extends ComfyDialog {
  constructor() {
    super();
    ensureStyles();
    this.element.classList.add("promptboard-model-info");
  }

  show(metadata) {
    const rows = Object.keys(metadata || {})
      .sort()
      .map((key) =>
        $el("div", [
          $el("label", { textContent: key }),
          $el("span", { textContent: textOrJson(metadata[key]) }),
        ])
      );
    super.show($el("div.promptboard-model-info-raw", rows));
  }
}

class CheckpointInfoDialog extends ComfyDialog {
  constructor(name, node) {
    super();
    ensureStyles();
    this.name = name;
    this.node = node;
    this.metadata = null;
    this.previewIndex = 0;
    this.element.classList.add("promptboard-model-info");
  }

  get hash() {
    return metadataValue(this.metadata, "promptboard.sha256");
  }

  get notes() {
    return metadataValue(this.metadata, "promptboard.notes");
  }

  set notes(value) {
    if (this.metadata) {
      this.metadata["promptboard.notes"] = value;
    }
  }

  createButtons() {
    const buttons = super.createButtons();
    this.rawButton = $el("button", {
      type: "button",
      textContent: "View raw metadata",
      disabled: "disabled",
      style: {
        opacity: 0.5,
        cursor: "not-allowed",
      },
      onclick: () => {
        if (this.metadata) {
          new RawMetadataDialog().show(this.metadata);
        }
      },
    });
    buttons.unshift(this.rawButton);
    return buttons;
  }

  async show(type, value) {
    this.type = type;
    this.modelName = value;

    this.info = $el("div");
    this.previewImage = $el("img", { style: { display: "none" } });
    this.preview = $el("div.promptboard-model-info-preview", [this.previewImage]);
    this.main = $el("div.promptboard-model-info-main", [this.info, this.preview]);
    this.content = $el("div.promptboard-model-info-content", [
      $el("h2", { textContent: this.name }),
      this.main,
    ]);
    const loading = $el("p", { textContent: "Loading...", parent: this.info });

    super.show(this.content);

    try {
      const response = await api.fetchApi(`/promptboard/model-info/metadata/${encodePath(type, value)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `${response.status} ${response.statusText}`);
      }
      this.metadata = await response.json();
      this.rawButton.style.cursor = this.rawButton.style.opacity = "";
      this.rawButton.removeAttribute("disabled");
      loading.remove();
      await this.addInfo();
    } catch (error) {
      loading.textContent = `Error loading checkpoint info: ${error.message}`;
    }
  }

  addInfoEntry(name, value) {
    return $el(
      "p",
      {
        parent: this.info,
      },
      [
        $el("label", { textContent: `${name}: ` }),
        typeof value === "string" ? $el("span", { textContent: value }) : value,
      ]
    );
  }

  addNotes() {
    let textarea = null;
    const notesContainer = $el("span.promptboard-model-info-notes", { textContent: this.notes || "No notes" });
    const edit = $el("a", {
      href: "#",
      textContent: "Edit",
      style: {
        float: "right",
        color: "#b6e880",
        textDecoration: "none",
      },
      onclick: async (event) => {
        event.preventDefault();
        if (textarea) {
          this.notes = textarea.value;
          const response = await api.fetchApi(`/promptboard/model-info/notes/${encodePath(this.type, this.modelName)}`, {
            method: "POST",
            body: this.notes,
          });
          if (!response.ok) {
            alert(`Error saving notes: ${response.status} ${response.statusText}`);
            return;
          }
          textarea.remove();
          textarea = null;
          edit.textContent = "Edit";
          notesContainer.textContent = this.notes || "No notes";
          return;
        }

        edit.textContent = "Save";
        textarea = $el("textarea", {
          value: this.notes,
          style: {
            width: "100%",
            minHeight: "80px",
            boxSizing: "border-box",
          },
        });
        notesContainer.textContent = "";
        notesContainer.append(textarea);
        textarea.focus();
      },
    });

    this.addInfoEntry("Notes", $el("span", [edit, notesContainer]));
  }

  async addCivitaiInfo() {
    const content = $el("span", { textContent: this.hash ? "Loading..." : "No hash available" });
    this.addInfoEntry("Civitai", content);

    if (!this.hash) {
      return null;
    }

    try {
      const response = await fetch(`https://civitai.com/api/v1/model-versions/by-hash/${this.hash}`);
      if (response.status === 404) {
        throw new Error("Model not found");
      }
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const info = await response.json();
      content.replaceChildren(
        $el("a", {
          href: `https://civitai.com/models/${info.modelId}`,
          textContent: `View ${info.model?.name || "model"}`,
          target: "_blank",
        })
      );
      this.addInfoEntry("Base Model", info.baseModel || "Unknown");
      this.addPreview(info);
      if (info.description) {
        this.content.append(
          $el("div.promptboard-model-info-description", {
            textContent: info.description,
          })
        );
      }
      return info;
    } catch (error) {
      content.textContent = error.message;
      return null;
    }
  }

  addPreview(info) {
    const images = info.images?.filter((item) => item.type === "image") || [];
    if (!images.length) {
      return;
    }

    let currentImage = images[this.previewIndex];
    const updatePreview = () => {
      currentImage = images[this.previewIndex];
      this.previewImage.src = currentImage.url;
      this.previewImage.style.display = "";
      this.previewImage.title = `${this.previewIndex + 1}/${images.length}`;
    };

    updatePreview();

    this.preview.append(
      $el("button", {
        textContent: "Use as preview",
        onclick: async () => {
          const previewUrl = currentImage?.url;
          if (!previewUrl) {
            return;
          }

          const blob = await (await fetch(previewUrl)).blob();
          const ext = new URL(previewUrl).pathname.split(".").pop() || "jpg";
          const filename = `promptboard_preview.${ext}`;
          const body = new FormData();
          body.append("image", new File([blob], filename));
          body.append("overwrite", "true");
          body.append("type", "temp");

          const upload = await api.fetchApi("/upload/image", {
            method: "POST",
            body,
          });
          if (!upload.ok) {
            alert(`Error uploading preview: ${upload.status} ${upload.statusText}`);
            return;
          }

          const save = await api.fetchApi(`/promptboard/model-info/preview/${encodePath(this.type, this.modelName)}`, {
            method: "POST",
            body: JSON.stringify({
              filename,
              type: "temp",
            }),
            headers: {
              "content-type": "application/json",
            },
          });
          if (!save.ok) {
            alert(`Error saving preview: ${save.status} ${save.statusText}`);
            return;
          }
          app.refreshComboInNodes?.();
        },
      }),
      $el("button", {
        textContent: "Show preview metadata",
        onclick: () => {
          if (currentImage?.meta && Object.keys(currentImage.meta).length) {
            new RawMetadataDialog().show(currentImage.meta);
          } else {
            alert("No image metadata found");
          }
        },
      })
    );

    if (images.length > 1) {
      const controls = $el("div", [
        $el("button", {
          textContent: "Prev",
          onclick: () => {
            this.previewIndex = (this.previewIndex + images.length - 1) % images.length;
            updatePreview();
          },
        }),
        $el("button", {
          textContent: "Next",
          onclick: () => {
            this.previewIndex = (this.previewIndex + 1) % images.length;
            updatePreview();
          },
        }),
      ]);
      this.preview.append(controls);
    }
  }

  async addInfo() {
    this.addInfoEntry("File", metadataValue(this.metadata, "promptboard.filename", titleFromPath(this.modelName)));
    this.addInfoEntry("SHA256", this.hash || "Unknown");

    const usageHint = metadataValue(this.metadata, "modelspec.usage_hint");
    if (usageHint) {
      this.addInfoEntry("Usage Hint", usageHint);
    }

    this.addNotes();
    await this.addCivitaiInfo();
  }
}

function addInfoOption(node, options) {
  const nodeType = getNodeType(node);
  const widgetNames = CHECKPOINT_WIDGETS[nodeType];
  if (!widgetNames) {
    return;
  }

  const entries = [];
  for (const widgetName of widgetNames) {
    const value = getWidgetValue(node, widgetName);
    if (!value) {
      continue;
    }
    entries.push({
      content: titleFromPath(value),
      callback: () => {
        new CheckpointInfoDialog(value, node).show(CHECKPOINT_TYPE, value);
      },
    });
  }

  if (!entries.length) {
    return;
  }

  if (entries.length === 1) {
    entries[0].content = "View Checkpoint Info...";
    options.unshift(entries[0]);
    return;
  }

  options.unshift({
    title: "View Checkpoint Info...",
    has_submenu: true,
    submenu: { options: entries },
  });
}

app.registerExtension({
  name: "PromptBoard.ModelInfo",
  beforeRegisterNodeDef(nodeType) {
    const getExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (_, options) {
      if (this.widgets) {
        addInfoOption(this, options);
      }
      return getExtraMenuOptions?.apply(this, arguments);
    };
  },
});
