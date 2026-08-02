import { app } from "../../../scripts/app.js";
import { api } from "../../../scripts/api.js";
import { $el, ComfyDialog } from "../../../scripts/ui.js";

const CHECKPOINT_TYPE = "checkpoints";
const LORA_TYPE = "loras";
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

    .promptboard-lora-info-content {
      box-sizing: border-box;
      color: #242424;
      width: min(560px, 82vw);
      max-height: calc(92vh - 54px);
      overflow: auto;
      padding: 0;
    }

    .promptboard-lora-modal {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      background: transparent;
      box-sizing: border-box;
    }

    .promptboard-lora-modal-surface {
      position: relative;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-width: calc(100vw - 16px);
      max-height: calc(100vh - 16px);
      background: #f4f4f2;
      color: #242424;
      box-shadow: none;
      border: 1px solid rgba(0, 0, 0, 0.18);
      border-radius: 0;
      padding: 44px 16px 10px;
    }

    .promptboard-lora-modal-close {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 4;
      width: 28px;
      height: 28px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 0;
      background: #ffffff;
      color: #242424;
      box-shadow: none;
      padding: 0;
      font-size: 18px;
      line-height: 1;
    }

    .promptboard-lora-info-content h2 {
      color: #242424;
      font-size: 17px;
      margin: 0 0 12px;
      font-weight: 700;
    }

    .promptboard-lora-info-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
      align-items: start;
      min-width: 0;
    }

    .promptboard-lora-info-layout > * {
      min-width: 0;
    }

    .promptboard-lora-info-preview {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .promptboard-lora-info-preview-stage {
      position: relative;
      min-height: 220px;
      max-height: min(360px, 40vh);
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e8e8e5;
      border: 1px solid rgba(0, 0, 0, 0.16);
    }

    .promptboard-lora-info-preview img {
      display: block;
      width: 100%;
      max-height: min(360px, 40vh);
      object-fit: contain;
      background: #e8e8e5;
    }

    .promptboard-lora-info-empty-preview {
      color: rgba(0, 0, 0, 0.55);
      font-size: 13px;
      padding: 24px;
      text-align: center;
    }

    .promptboard-lora-info-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 6px;
    }

    .promptboard-lora-info-actions button,
    .promptboard-lora-info-section button,
    .promptboard-lora-info-save-preview,
    .promptboard-lora-info-nav {
      min-height: 28px;
      border: 1px solid rgba(0, 0, 0, 0.18);
      background: #ffffff;
      color: #242424;
      box-shadow: none;
      border-radius: 0;
    }

    .promptboard-lora-info-summary {
      display: grid;
      gap: 10px;
      min-width: 0;
    }

    .promptboard-lora-info-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .promptboard-lora-info-row {
      display: flex;
      flex-direction: column;
      gap: 3px;
      line-height: 1.35;
      min-width: 0;
      padding: 8px;
      border: 1px solid rgba(0, 0, 0, 0.12);
      background: #ffffff;
    }

    .promptboard-lora-info-row label {
      color: rgba(0, 0, 0, 0.52);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }

    .promptboard-lora-info-row span {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    .promptboard-lora-info-row a {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #245b9f;
      text-decoration: none;
    }

    .promptboard-lora-info-section {
      min-width: 0;
      border: 1px solid rgba(0, 0, 0, 0.12);
      background: #ffffff;
      padding: 10px;
      box-sizing: border-box;
    }

    .promptboard-lora-info-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      color: #242424;
      font-size: 13px;
      font-weight: 700;
    }

    details.promptboard-lora-info-section > summary.promptboard-lora-info-section-header {
      cursor: pointer;
      list-style: none;
    }

    details.promptboard-lora-info-section > summary.promptboard-lora-info-section-header::-webkit-details-marker {
      display: none;
    }

    .promptboard-lora-info-section-toggle {
      display: inline-block;
      width: 12px;
      margin-right: 4px;
      color: rgba(0, 0, 0, 0.58);
      font-size: 11px;
      line-height: 1;
    }

    details.promptboard-lora-info-section .promptboard-lora-info-section-toggle::before {
      content: ">";
    }

    details.promptboard-lora-info-section[open] .promptboard-lora-info-section-toggle::before {
      content: "v";
    }

    details.promptboard-lora-info-section:not([open]) > summary.promptboard-lora-info-section-header {
      margin-bottom: 0;
    }

    .promptboard-lora-info-section-body {
      min-width: 0;
      overflow: hidden;
    }

    .promptboard-lora-trigger-words {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .promptboard-lora-trigger-word {
      border: 1px solid rgba(0, 0, 0, 0.14);
      border-radius: 4px;
      background: #f1f1ef;
      color: #242424;
      padding: 4px 7px;
      font-size: 12px;
      overflow-wrap: anywhere;
    }

    .promptboard-lora-info-muted {
      color: rgba(0, 0, 0, 0.55);
      font-size: 13px;
      line-height: 1.4;
    }

    .promptboard-lora-info-notes-body {
      max-height: 140px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: rgba(0, 0, 0, 0.78);
      line-height: 1.4;
    }

    .promptboard-lora-info-description-body {
      min-width: 0;
      max-width: 100%;
      max-height: 180px;
      overflow: auto;
      overflow-wrap: anywhere;
      color: rgba(0, 0, 0, 0.78);
      line-height: 1.45;
      box-sizing: border-box;
    }

    .promptboard-lora-info-description-body p {
      margin: 0 0 8px;
    }

    .promptboard-lora-info-description-body p:last-child,
    .promptboard-lora-info-description-body ul:last-child,
    .promptboard-lora-info-description-body ol:last-child,
    .promptboard-lora-info-description-body blockquote:last-child,
    .promptboard-lora-info-description-body pre:last-child {
      margin-bottom: 0;
    }

    .promptboard-lora-info-description-body ul,
    .promptboard-lora-info-description-body ol {
      margin: 0 0 8px;
      padding-left: 20px;
    }

    .promptboard-lora-info-description-body li {
      margin: 2px 0;
    }

    .promptboard-lora-info-description-body h1,
    .promptboard-lora-info-description-body h2,
    .promptboard-lora-info-description-body h3,
    .promptboard-lora-info-description-body h4 {
      margin: 10px 0 6px;
      color: #242424;
      font-size: 14px;
      line-height: 1.3;
    }

    .promptboard-lora-info-description-body blockquote {
      margin: 0 0 8px;
      padding: 6px 8px;
      border-left: 3px solid rgba(0, 0, 0, 0.18);
      background: rgba(0, 0, 0, 0.04);
    }

    .promptboard-lora-info-description-body code {
      padding: 1px 4px;
      background: rgba(0, 0, 0, 0.07);
      font-family: monospace;
    }

    .promptboard-lora-info-description-body pre {
      max-width: 100%;
      margin: 0 0 8px;
      padding: 8px;
      overflow: auto;
      background: rgba(0, 0, 0, 0.07);
      box-sizing: border-box;
    }

    .promptboard-lora-info-description-body pre code {
      padding: 0;
      background: transparent;
    }

    .promptboard-lora-info-description-body a {
      color: #245b9f;
      text-decoration: underline;
      overflow-wrap: anywhere;
    }

    .promptboard-lora-info-notes-editor {
      width: 100%;
      min-height: 92px;
      box-sizing: border-box;
      resize: vertical;
      background: #ffffff;
      color: #242424;
      border: 1px solid rgba(0, 0, 0, 0.18);
    }

    .promptboard-lora-info-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 30px;
      min-height: 44px;
      padding: 0;
      font-size: 18px;
      opacity: 0.82;
      z-index: 3;
    }

    .promptboard-lora-info-nav.prev {
      left: 8px;
    }

    .promptboard-lora-info-nav.next {
      right: 8px;
    }

    .promptboard-lora-info-counter {
      position: absolute;
      right: 8px;
      bottom: 8px;
      padding: 2px 6px;
      background: rgba(255, 255, 255, 0.82);
      color: rgba(0, 0, 0, 0.74);
      font-size: 12px;
      z-index: 3;
    }

    .promptboard-lora-info-save-preview {
      min-height: 24px;
      padding: 2px 8px;
      font-size: 12px;
      opacity: 0.9;
    }

    .promptboard-lora-info-preview-actions {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 4px;
      z-index: 3;
    }

    .promptboard-lora-info-prompt-overlay {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      display: grid;
      gap: 6px;
      max-height: 42%;
      overflow: auto;
      padding: 10px;
      background: rgba(0, 0, 0, 0.68);
      color: #ffffff;
      box-sizing: border-box;
      z-index: 2;
    }

    .promptboard-lora-info-prompt-row {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      gap: 8px;
      font-size: 12px;
      line-height: 1.35;
    }

    .promptboard-lora-info-prompt-row label {
      color: rgba(255, 255, 255, 0.66);
      font-weight: 700;
      text-transform: uppercase;
    }

    .promptboard-lora-info-prompt-row span {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      overflow-wrap: anywhere;
    }

    .promptboard-lora-info-details {
      margin-top: 12px;
      display: grid;
      gap: 8px;
    }

    .promptboard-lora-info-details details {
      border: 1px solid rgba(0, 0, 0, 0.12);
      background: #ffffff;
      padding: 8px;
    }

    .promptboard-lora-info-details summary {
      cursor: pointer;
      color: #242424;
      font-weight: 700;
    }

    .promptboard-lora-info-details pre,
    .promptboard-lora-info-detail-body {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 220px;
      overflow: auto;
      margin: 8px 0 0;
    }

    @media (max-width: 720px) {
      .promptboard-lora-modal {
        padding: 4px;
        align-items: flex-start;
      }

      .promptboard-lora-modal-surface {
        width: 100%;
        max-width: calc(100vw - 8px);
        max-height: calc(100vh - 8px);
        padding: 40px 8px 6px;
      }

      .promptboard-lora-info-content {
        width: 100%;
        max-width: 100%;
        max-height: calc(100vh - 58px);
        min-width: 0;
        padding-right: 0;
      }

      .promptboard-lora-modal-close {
        top: 6px;
        right: 6px;
      }

      .promptboard-lora-info-preview img {
        max-height: 32vh;
      }

      .promptboard-lora-info-preview-stage {
        min-height: 160px;
        max-height: 32vh;
      }

      .promptboard-lora-info-prompt-overlay {
        max-height: 46%;
        padding: 8px;
      }

      .promptboard-lora-info-prompt-row {
        grid-template-columns: 58px minmax(0, 1fr);
      }

      .promptboard-lora-info-meta {
        grid-template-columns: 1fr;
      }
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

const DESCRIPTION_ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "i",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "ul",
]);

function isAllowedUrl(value) {
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function sanitizeDescriptionNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || "");
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return document.createDocumentFragment();
  }

  const tag = node.tagName.toLowerCase();
  const children = Array.from(node.childNodes).map(sanitizeDescriptionNode);
  if (!DESCRIPTION_ALLOWED_TAGS.has(tag)) {
    const fragment = document.createDocumentFragment();
    fragment.append(...children);
    return fragment;
  }

  const element = document.createElement(tag);
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    if (isAllowedUrl(href)) {
      element.href = href;
      element.target = "_blank";
      element.rel = "noopener noreferrer";
    }
  }
  if (tag !== "br") {
    element.append(...children);
  }
  return element;
}

function sanitizeDescriptionHtml(value) {
  const html = textOrJson(value).trim();
  if (!html) {
    return null;
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = document.createDocumentFragment();
  fragment.append(...Array.from(template.content.childNodes).map(sanitizeDescriptionNode));

  const probe = document.createElement("div");
  probe.append(fragment.cloneNode(true));
  return probe.textContent.trim() ? fragment : null;
}

function firstMetadataText(metadata, keys) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (value != null && value !== "") {
      return String(value);
    }
  }
  return "";
}

function imagePromptInfo(image) {
  const metadata = image?.meta || {};
  return {
    positive: firstMetadataText(metadata, ["prompt", "Prompt", "positive", "Positive"]),
    negative: firstMetadataText(metadata, [
      "negativePrompt",
      "negative_prompt",
      "Negative prompt",
      "Negative Prompt",
      "negative",
      "Negative",
    ]),
  };
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

class ModelInfoDialog extends ComfyDialog {
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
        if (this.rawDetails) {
          this.rawDetails.open = true;
          this.rawDetails.scrollIntoView({ block: "nearest" });
        }
      },
    });
    buttons.unshift(this.rawButton);
    return buttons;
  }

  contentClassName() {
    return "promptboard-model-info-content";
  }

  titleText() {
    return this.name;
  }

  errorText(error) {
    return `Error loading model info: ${error.message}`;
  }

  createContent() {
    this.info = $el("div");
    this.previewImage = $el("img", { style: { display: "none" } });
    this.preview = $el("div.promptboard-model-info-preview", [this.previewImage]);
    this.main = $el("div.promptboard-model-info-main", [this.info, this.preview]);
    this.content = $el(`div.${this.contentClassName().split(/\s+/).join(".")}`, [
      $el("h2", { textContent: this.titleText() }),
      this.main,
    ]);
    return this.content;
  }

  async show(type, value, options = {}) {
    this.type = type;
    this.modelName = value;
    this.refreshCivitai = Boolean(options.refreshCivitai);

    this.createContent();
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
      loading.textContent = this.errorText(error);
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

class LoraInfoDialog extends ModelInfoDialog {
  constructor(name, node) {
    super(name, node);
    this.customModal = null;
    this.escapeHandler = null;
  }

  contentClassName() {
    return "promptboard-model-info-content promptboard-lora-info-content";
  }

  titleText() {
    return `LoRA: ${titleFromPath(this.name)}`;
  }

  errorText(error) {
    return `Error loading LoRA info: ${error.message}`;
  }

  createButtons() {
    return [];
  }

  createContent() {
    this.previewImage = $el("img", { style: { display: "none" } });
    this.previewEmpty = $el("div.promptboard-lora-info-empty-preview", { textContent: "No preview image" });
    this.previewStage = $el("div.promptboard-lora-info-preview-stage", [this.previewEmpty, this.previewImage]);
    this.preview = $el("div.promptboard-lora-info-preview", [this.previewStage]);
    this.actions = $el("div.promptboard-lora-info-actions");
    this.preview.append(this.actions);
    this.info = $el("div.promptboard-lora-info-summary");
    this.meta = $el("div.promptboard-lora-info-meta");
    this.triggers = this.createSection("Trigger Words", null, { collapsible: true });
    this.descriptionSection = this.createSection("Model Description", null, { collapsible: true });
    this.notesSection = this.createSection("Notes");
    this.details = $el("div.promptboard-lora-info-details");
    this.info.append(this.meta, this.descriptionSection.container, this.triggers.container, this.notesSection.container);
    this.content = $el("div.promptboard-model-info-content.promptboard-lora-info-content", [
      $el("div.promptboard-lora-info-layout", [
        this.preview,
        $el("div", [this.info, this.details]),
      ]),
    ]);
    return this.content;
  }

  async show(type, value, options = {}) {
    this.type = type;
    this.modelName = value;
    this.refreshCivitai = Boolean(options.refreshCivitai);

    this.createContent();
    const loading = $el("div.promptboard-lora-info-muted", { textContent: "Loading...", parent: this.info });
    const closeButton = $el("button.promptboard-lora-modal-close", {
      type: "button",
      textContent: "X",
      title: "Close",
      onclick: () => this.close(),
    });
    const surface = $el("div.promptboard-lora-modal-surface", [closeButton, this.content]);
    this.customModal = $el("div.promptboard-lora-modal", {
      onclick: (event) => {
        if (event.target === this.customModal) {
          this.close();
        }
      },
    }, [surface]);

    this.escapeHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.close();
      }
    };
    window.addEventListener("keydown", this.escapeHandler, { capture: true });
    document.body.append(this.customModal);

    try {
      const response = await api.fetchApi(`/promptboard/model-info/metadata/${encodePath(type, value)}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `${response.status} ${response.statusText}`);
      }
      this.metadata = await response.json();
      loading.remove();
      await this.addInfo();
    } catch (error) {
      loading.textContent = this.errorText(error);
    }
  }

  close() {
    if (this.escapeHandler) {
      window.removeEventListener("keydown", this.escapeHandler, { capture: true });
      this.escapeHandler = null;
    }
    this.customModal?.remove();
    this.customModal = null;
  }

  createSection(title, action = null, options = {}) {
    const titleEl = options.collapsible
      ? $el("span", [
        $el("span.promptboard-lora-info-section-toggle", { "aria-hidden": "true" }),
        $el("span", { textContent: title }),
      ])
      : $el("span", { textContent: title });
    const headerChildren = action ? [titleEl, action] : [titleEl];
    const headerTag = options.collapsible ? "summary" : "div";
    const header = $el(`${headerTag}.promptboard-lora-info-section-header`, headerChildren);
    const body = $el("div.promptboard-lora-info-section-body");
    const container = options.collapsible
      ? $el("details.promptboard-lora-info-section", [header, body])
      : $el("div.promptboard-lora-info-section", [header, body]);
    if (options.open) {
      container.open = true;
    }
    return { container, header, body };
  }

  previewUrl(image) {
    if (image?.promptboardRepresentativePreview) {
      return api.apiURL(`/promptboard/model-info/local-preview/${encodePath(this.type, this.modelName)}`);
    }
    return image?.url || "";
  }

  addInfoEntry(name, value) {
    return $el(
      "div.promptboard-lora-info-row",
      {
        parent: this.meta,
      },
      [
        $el("label", { textContent: name }),
        typeof value === "string" ? $el("span", { textContent: value }) : value,
      ]
    );
  }

  addDetails(title, content, open = false) {
    const body = typeof content === "string"
      ? $el("div.promptboard-lora-info-detail-body", { textContent: content })
      : content;
    body.classList?.add("promptboard-lora-info-detail-body");
    return $el(
      "details",
      {
        parent: this.details,
        open,
      },
      [
        $el("summary", { textContent: title }),
        body,
      ]
    );
  }

  addModelDescription(description) {
    const fragment = sanitizeDescriptionHtml(description);
    const body = $el("div.promptboard-lora-info-description-body");
    if (fragment) {
      body.append(fragment);
    }
    this.descriptionSection.body.replaceChildren(
      fragment
        ? body
        : $el("div.promptboard-lora-info-muted", { textContent: "No description" })
    );
  }

  addNotes() {
    let textarea = null;
    const notesBody = $el("div.promptboard-lora-info-notes-body", { textContent: this.notes || "No notes" });
    const edit = $el("button", {
      type: "button",
      textContent: "Edit Notes",
      onclick: async () => {
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
          textarea.replaceWith(notesBody);
          notesBody.textContent = this.notes || "No notes";
          textarea = null;
          edit.textContent = "Edit Notes";
          return;
        }

        edit.textContent = "Save Notes";
        textarea = $el("textarea.promptboard-lora-info-notes-editor", { value: this.notes });
        notesBody.replaceWith(textarea);
        textarea.focus();
      },
    });
    this.notesSection.header.append(edit);
    this.notesSection.body.replaceChildren(notesBody);
  }

  addTriggerWords(words) {
    this.triggers.body.replaceChildren();

    if (!Array.isArray(words) || !words.length) {
      this.triggers.body.append($el("div.promptboard-lora-info-muted", { textContent: "No trigger words found" }));
      return;
    }

    const normalizedWords = words.map((word) => String(word));
    const chips = $el("div.promptboard-lora-trigger-words", normalizedWords.map((word) =>
      $el("span.promptboard-lora-trigger-word", { textContent: String(word) })
    ));
    const copy = $el("button", {
      type: "button",
      textContent: "Copy All",
      onclick: async () => {
        try {
          await navigator.clipboard?.writeText(normalizedWords.join(", "));
          copy.textContent = "Copied";
        } catch (error) {
          copy.textContent = "Copy Failed";
        }
        window.setTimeout(() => {
          copy.textContent = "Copy All";
        }, 1500);
      },
    });
    this.triggers.header.append(copy);
    this.triggers.body.append(chips);
  }

  addPreview(info) {
    const images = info.images?.filter((item) => item.type === "image") || [];
    if (!images.length) {
      return;
    }

    let currentImage = images[this.previewIndex];
    const promptOverlay = $el("div.promptboard-lora-info-prompt-overlay", { style: { display: "none" } });
    const updatePromptOverlay = () => {
      const prompts = imagePromptInfo(currentImage);
      promptOverlay.replaceChildren();

      if (!prompts.positive && !prompts.negative) {
        promptOverlay.style.display = "none";
        return;
      }

      if (prompts.positive) {
        promptOverlay.append(
          $el("div.promptboard-lora-info-prompt-row", [
            $el("label", { textContent: "Positive" }),
            $el("span", { textContent: prompts.positive }),
          ])
        );
      }

      if (prompts.negative) {
        promptOverlay.append(
          $el("div.promptboard-lora-info-prompt-row", [
            $el("label", { textContent: "Negative" }),
            $el("span", { textContent: prompts.negative }),
          ])
        );
      }

      promptOverlay.style.display = "";
    };
    const updatePreview = () => {
      currentImage = images[this.previewIndex];
      this.previewImage.src = this.previewUrl(currentImage);
      this.previewImage.style.display = "";
      this.previewImage.title = `${this.previewIndex + 1}/${images.length}`;
      this.previewEmpty.style.display = "none";
      updatePromptOverlay();
      if (this.previewCounter) {
        this.previewCounter.textContent = `${this.previewIndex + 1}/${images.length}`;
      }
    };

    updatePreview();

    this.previewStage.append(
      $el("div.promptboard-lora-info-preview-actions", [
      $el("button.promptboard-lora-info-save-preview", {
        type: "button",
        textContent: "Save",
        title: "Save as local preview",
        onclick: async () => {
          const previewUrl = currentImage?.url || "";
          if (!previewUrl) {
            return;
          }

          const save = await api.fetchApi(`/promptboard/model-info/preview/${encodePath(this.type, this.modelName)}`, {
            method: "POST",
            body: JSON.stringify({
              url: previewUrl,
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
      $el("button.promptboard-lora-info-save-preview", {
        type: "button",
        textContent: "Refresh",
        title: "Refresh Civitai info",
        onclick: () => {
          this.close();
          new this.constructor(this.name, this.node).show(this.type, this.modelName, { refreshCivitai: true });
        },
      }),
      ]),
      promptOverlay,
    );

    if (images.length > 1) {
      this.previewCounter = $el("div.promptboard-lora-info-counter", {
        textContent: `${this.previewIndex + 1}/${images.length}`,
      });
      this.previewStage.append(
        $el("button", {
          className: "promptboard-lora-info-nav prev",
          type: "button",
          textContent: "<",
          title: "Previous preview",
          onclick: () => {
            this.previewIndex = (this.previewIndex + images.length - 1) % images.length;
            updatePreview();
          },
        }),
        $el("button", {
          className: "promptboard-lora-info-nav next",
          type: "button",
          textContent: ">",
          title: "Next preview",
          onclick: () => {
            this.previewIndex = (this.previewIndex + 1) % images.length;
            updatePreview();
          },
        }),
        this.previewCounter,
      );
    }
  }

  async addCivitaiInfo() {
    if (!this.hash) {
      this.addInfoEntry("Civitai", "No hash available");
      this.addInfoEntry("Base", "Unknown");
      this.addTriggerWords([]);
      this.addModelDescription("");
      return null;
    }

    const loading = this.addInfoEntry("Civitai", "Loading...");
    try {
      const refresh = this.refreshCivitai ? "?refresh=1" : "";
      const response = await api.fetchApi(`/promptboard/model-info/civitai/${encodePath(this.type, this.modelName)}${refresh}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `${response.status} ${response.statusText}`);
      }

      const info = await response.json();
      loading.remove();
      this.addInfoEntry("Civitai", info.modelId
        ? $el("a", {
          href: `https://civitai.com/models/${info.modelId}`,
          textContent: info.model?.name || "Open model",
          target: "_blank",
        })
        : info.promptboardCivitaiDeferred ? "Local preview" : info.promptboardCivitaiError || "Unavailable");
      this.addInfoEntry("Base", info.baseModel || "Unknown");
      this.addPreview(info);
      this.addTriggerWords(info.trainedWords);
      this.addModelDescription(info.description);
      return info;
    } catch (error) {
      loading.remove();
      this.addInfoEntry("Civitai", error.message);
      this.addInfoEntry("Base", "Unknown");
      this.addTriggerWords([]);
      this.addModelDescription("");
      return null;
    }
  }

  async addInfo() {
    this.addNotes();
    await this.addCivitaiInfo();
  }
}

class CheckpointInfoDialog extends LoraInfoDialog {
  titleText() {
    return titleFromPath(this.name);
  }

  errorText(error) {
    return `Error loading checkpoint info: ${error.message}`;
  }

  createContent() {
    super.createContent();
    this.triggers.container.remove();
    return this.content;
  }

  async addCivitaiInfo() {
    if (!this.hash) {
      this.addInfoEntry("Civitai", "No hash available");
      this.addInfoEntry("Base", "Unknown");
      this.addModelDescription("");
      return null;
    }

    const loading = this.addInfoEntry("Civitai", "Loading...");
    try {
      const refresh = this.refreshCivitai ? "?refresh=1" : "";
      const response = await api.fetchApi(`/promptboard/model-info/civitai/${encodePath(this.type, this.modelName)}${refresh}`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `${response.status} ${response.statusText}`);
      }

      const info = await response.json();
      loading.remove();
      this.addInfoEntry("Civitai", info.modelId
        ? $el("a", {
          href: `https://civitai.com/models/${info.modelId}`,
          textContent: info.model?.name || "Open model",
          target: "_blank",
        })
        : info.promptboardCivitaiDeferred ? "Local preview" : info.promptboardCivitaiError || "Unavailable");
      this.addInfoEntry("Base", info.baseModel || "Unknown");
      this.addPreview(info);
      this.addModelDescription(info.description);
      return info;
    } catch (error) {
      loading.remove();
      this.addInfoEntry("Civitai", error.message);
      this.addInfoEntry("Base", "Unknown");
      this.addModelDescription("");
      return null;
    }
  }

  async addInfo() {
    const usageHint = metadataValue(this.metadata, "modelspec.usage_hint");
    if (usageHint) {
      this.addInfoEntry("Usage Hint", usageHint);
    }

    this.addNotes();
    await this.addCivitaiInfo();
    this.addDetails("Raw Metadata", textOrJson(this.metadata));
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

function showModelInfo(type, value, node = null) {
  if (!type || !value || value === "None") {
    return;
  }
  const Dialog = type === LORA_TYPE ? LoraInfoDialog : CheckpointInfoDialog;
  new Dialog(value, node).show(type, value);
}

globalThis.promptboardModelInfo = {
  show: showModelInfo,
};

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
