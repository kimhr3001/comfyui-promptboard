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
const GALLERY_IMAGE_WIDTH = 768;

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
      color: #edf0f3;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      max-height: min(92vh, 760px);
      overflow-x: hidden;
      overflow-y: auto;
      padding: 0;
      background: #202327;
    }

    .promptboard-lora-modal {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 28px 16px;
      background: transparent;
      box-sizing: border-box;
    }

    .promptboard-lora-modal-surface {
      position: relative;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      width: min(440px, 100%);
      max-width: calc(100vw - 32px);
      max-height: calc(100vh - 56px);
      overflow: hidden;
      background: #202327;
      color: #edf0f3;
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 0;
    }

    .promptboard-lora-info-header {
      min-height: 62px;
      padding: 12px 14px 11px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      box-sizing: border-box;
    }

    .promptboard-lora-info-title {
      flex: 1 1 auto;
      min-width: 0;
    }

    .promptboard-lora-info-title-main {
      overflow: hidden;
      color: #edf0f3;
      font-size: 15px;
      font-weight: 650;
      line-height: 1.25;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .promptboard-lora-info-title-syntax {
      margin-top: 3px;
      overflow: hidden;
      color: #7f8791;
      font: 11px ui-monospace, SFMono-Regular, Menlo, monospace;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .promptboard-lora-info-header-actions {
      display: flex;
      flex: 0 0 auto;
      gap: 4px;
    }

    .promptboard-lora-info-icon-button,
    .promptboard-lora-modal-close {
      flex: 0 0 auto;
      width: 32px;
      height: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: #b3bac3;
      box-shadow: none;
      padding: 0;
      font-size: 18px;
      line-height: 1;
      cursor: pointer;
      font-size: 0;
    }

    .promptboard-lora-info-svg-icon {
      width: 16px;
      height: 16px;
      display: block;
      pointer-events: none;
    }

    .promptboard-lora-info-icon-button:hover,
    .promptboard-lora-modal-close:hover,
    .promptboard-lora-trigger-copy-all:hover,
    .promptboard-lora-info-save-preview:hover,
    .promptboard-lora-info-prompt-toggle:hover,
    .promptboard-lora-info-edit-notes:hover,
    .promptboard-lora-info-prompt-copy:hover,
    .promptboard-lora-info-nav:hover {
      background: #343a42;
      color: #edf0f3;
    }

    .promptboard-lora-info-content h2 {
      color: #edf0f3;
      font-size: 17px;
      margin: 0 0 12px;
      font-weight: 700;
    }

    .promptboard-lora-info-layout {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0;
      align-items: start;
      min-width: 0;
    }

    .promptboard-lora-info-layout > * {
      min-width: 0;
    }

    .promptboard-lora-info-preview {
      display: flex;
      flex-direction: column;
      gap: 0;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .promptboard-lora-info-preview-stage {
      position: relative;
      width: 100%;
      max-width: 100%;
      aspect-ratio: 16 / 7;
      min-height: 0;
      min-width: 0;
      max-height: none;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #17191c;
      border-block: 1px solid #373c43;
    }

    .promptboard-lora-info-preview img {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      background: #17191c;
    }

    .promptboard-lora-info-empty-preview {
      color: #7f8791;
      font-size: 13px;
      padding: 24px;
      text-align: center;
    }

    .promptboard-lora-info-empty-preview.is-loading {
      color: #b3bac3;
    }

    .promptboard-lora-info-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
      gap: 6px;
    }

    .promptboard-lora-info-actions button,
    .promptboard-lora-info-section button,
    .promptboard-lora-info-save-preview,
    .promptboard-lora-info-prompt-toggle,
    .promptboard-lora-info-nav {
      min-height: 28px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: #202327;
      color: #edf0f3;
      box-shadow: none;
      border-radius: 7px;
    }

    .promptboard-lora-info-summary {
      display: grid;
      gap: 0;
      min-width: 0;
    }

    .promptboard-lora-info-meta {
      min-height: 46px;
      padding: 0 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid #373c43;
      box-sizing: border-box;
    }

    .promptboard-lora-info-row {
      display: flex;
      align-items: center;
      gap: 7px;
      line-height: 1.35;
      min-width: 0;
      color: #b3bac3;
      font-size: 12px;
    }

    .promptboard-lora-info-row label {
      color: #b3bac3;
      font-weight: 500;
    }

    .promptboard-lora-info-row span {
      min-width: 0;
      color: #edf0f3;
      overflow-wrap: anywhere;
    }

    .promptboard-lora-info-row a {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #8aa4ff;
      text-decoration: none;
    }

    .promptboard-lora-info-section {
      min-width: 0;
      border: 0;
      border-bottom: 1px solid #373c43;
      background: #202327;
      padding: 14px 16px 15px;
      box-sizing: border-box;
    }

    .promptboard-lora-info-section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      color: #edf0f3;
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
      color: #7f8791;
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
      min-height: 0;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 7px;
      background: #2a2e34;
      color: #edf0f3;
      padding: 5px 8px;
      font-size: 12px;
      line-height: 1.25;
      overflow-wrap: anywhere;
      cursor: pointer;
    }

    .promptboard-lora-trigger-word:hover {
      background: #343a42;
    }

    .promptboard-lora-trigger-copy-all,
    .promptboard-lora-info-prompt-copy {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 0;
    }

    .promptboard-lora-trigger-copy-all {
      flex: 0 0 auto;
      width: 28px;
      min-height: 28px;
    }

    .promptboard-lora-trigger-copy-all .promptboard-lora-info-svg-icon,
    .promptboard-lora-info-prompt-copy .promptboard-lora-info-svg-icon {
      width: 14px;
      height: 14px;
    }

    .promptboard-lora-trigger-word.is-copied,
    .promptboard-lora-trigger-copy-all.is-copied {
      border-color: rgba(158, 211, 178, 0.45);
      background: rgba(158, 211, 178, 0.18);
      color: #9ed3b2;
    }

    .promptboard-lora-trigger-word.is-error,
    .promptboard-lora-trigger-copy-all.is-error {
      border-color: rgba(235, 112, 112, 0.5);
      background: rgba(235, 112, 112, 0.14);
      color: #f0a2a2;
    }

    .promptboard-lora-info-muted {
      color: #7f8791;
      font-size: 13px;
      line-height: 1.4;
    }

    .promptboard-lora-info-notes-body {
      max-height: 140px;
      overflow: auto;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      color: #b3bac3;
      font-size: 12px;
      line-height: 1.4;
    }

    .promptboard-lora-info-description-body {
      min-width: 0;
      max-width: 100%;
      max-height: 180px;
      overflow: auto;
      overflow-wrap: anywhere;
      color: #b3bac3;
      font-size: 12px;
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
      color: #edf0f3;
      font-size: 13px;
      line-height: 1.3;
    }

    .promptboard-lora-info-description-body blockquote {
      margin: 0 0 8px;
      padding: 6px 8px;
      border-left: 3px solid rgba(255, 255, 255, 0.16);
      background: rgba(255, 255, 255, 0.05);
    }

    .promptboard-lora-info-description-body code {
      padding: 1px 4px;
      background: rgba(255, 255, 255, 0.08);
      font-family: monospace;
    }

    .promptboard-lora-info-description-body pre {
      max-width: 100%;
      margin: 0 0 8px;
      padding: 8px;
      overflow: auto;
      background: rgba(255, 255, 255, 0.08);
      box-sizing: border-box;
    }

    .promptboard-lora-info-description-body pre code {
      padding: 0;
      background: transparent;
    }

    .promptboard-lora-info-description-body a {
      color: #8aa4ff;
      text-decoration: underline;
      overflow-wrap: anywhere;
    }

    .promptboard-lora-info-notes-editor {
      width: 100%;
      min-height: 92px;
      box-sizing: border-box;
      resize: vertical;
      background: #17191c;
      color: #edf0f3;
      border: 1px solid #373c43;
      font-size: 12px;
    }

    .promptboard-lora-info-nav {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      width: 30px;
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 18px;
      opacity: 0.88;
      z-index: 3;
      background: rgba(14, 16, 18, 0.58);
      border: 0;
    }

    .promptboard-lora-info-nav.prev {
      left: 0;
      border-radius: 0 7px 7px 0;
    }

    .promptboard-lora-info-nav.next {
      right: 0;
      border-radius: 7px 0 0 7px;
    }

    .promptboard-lora-info-counter {
      position: absolute;
      left: 8px;
      top: 8px;
      padding: 2px 6px;
      border-radius: 5px;
      background: rgba(13, 15, 17, 0.64);
      color: #b3bac3;
      font-size: 12px;
      z-index: 3;
    }

    .promptboard-lora-info-save-preview {
      width: 28px;
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 0;
      opacity: 0.9;
      background: rgba(14, 16, 18, 0.72);
    }

    .promptboard-lora-info-save-preview.is-busy {
      opacity: 0.72;
      cursor: wait;
    }

    .promptboard-lora-info-save-preview.is-saved {
      border-color: rgba(24, 128, 68, 0.45);
      background: #dff3e7;
      color: #17613b;
    }

    .promptboard-lora-info-save-preview.is-error {
      border-color: rgba(180, 48, 48, 0.45);
      background: #f7dddd;
      color: #7a1f1f;
    }

    .promptboard-lora-info-prompt-toggle {
      width: 28px;
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 0;
      opacity: 0.9;
      background: rgba(14, 16, 18, 0.72);
    }

    .promptboard-lora-info-prompt-toggle.is-active {
      border-color: rgba(138, 164, 255, 0.48);
      color: #d7deff;
      background: rgba(138, 164, 255, 0.18);
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
      max-height: calc(100% - 42px);
      overflow-x: hidden;
      overflow-y: auto;
      padding: 10px;
      background: rgba(0, 0, 0, 0.68);
      color: #ffffff;
      box-sizing: border-box;
      z-index: 2;
    }

    .promptboard-lora-info-prompt-row {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr) 26px;
      gap: 8px;
      min-height: 0;
      font-size: 12px;
      line-height: 1.35;
    }

    .promptboard-lora-info-prompt-row label {
      color: rgba(255, 255, 255, 0.66);
      font-weight: 700;
      text-transform: uppercase;
    }

    .promptboard-lora-info-prompt-row span {
      display: block;
      min-height: 0;
      overflow-wrap: anywhere;
    }

    .promptboard-lora-info-edit-notes {
      width: 28px;
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      font-size: 0;
    }

    .promptboard-lora-info-prompt-copy {
      align-self: start;
      --pb-copy-icon-width: 9px;
      --pb-copy-icon-height: 11px;
      --pb-copy-icon-back-left: 6px;
      --pb-copy-icon-back-top: 8px;
      --pb-copy-icon-front-left: 9px;
      --pb-copy-icon-front-top: 5px;
      width: 24px;
      min-height: 24px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 6px;
      background: rgba(14, 16, 18, 0.58);
      color: rgba(255, 255, 255, 0.76);
      padding: 0;
      font-size: 0;
      line-height: 1;
    }

    .promptboard-lora-info-prompt-copy.is-copied {
      border-color: rgba(158, 211, 178, 0.54);
      color: #9ed3b2;
      background: rgba(158, 211, 178, 0.18);
    }

    .promptboard-lora-info-prompt-copy.is-error {
      border-color: rgba(235, 112, 112, 0.54);
      color: #f0a2a2;
      background: rgba(235, 112, 112, 0.14);
    }

    .promptboard-lora-info-details {
      margin-top: 12px;
      display: grid;
      gap: 8px;
    }

    .promptboard-lora-info-details details {
      border: 1px solid #373c43;
      background: #202327;
      padding: 8px;
    }

    .promptboard-lora-info-details summary {
      cursor: pointer;
      color: #edf0f3;
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

    @media (max-width: 480px) {
      .promptboard-lora-modal {
        display: block;
        padding: 0;
        background: #202327;
      }

      .promptboard-lora-modal-surface {
        width: 100%;
        max-width: 100%;
        min-height: 100vh;
        max-height: 100vh;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }

      .promptboard-lora-info-content {
        width: 100%;
        max-width: 100%;
        max-height: 100vh;
        min-width: 0;
        padding-right: 0;
      }

      .promptboard-lora-info-preview-stage {
        aspect-ratio: 16 / 8;
      }

      .promptboard-lora-info-prompt-overlay {
        max-height: 46%;
        padding: 8px;
      }

      .promptboard-lora-info-prompt-row {
        grid-template-columns: 58px minmax(0, 1fr) 26px;
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

function galleryImageUrl(url) {
  if (!url || !url.includes("image.civitai.com/")) {
    return url || "";
  }

  return url.replace(/\/original=true\//, `/width=${GALLERY_IMAGE_WIDTH}/`);
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error("Clipboard unavailable");
  }
}

function flashCopyState(element, className = "is-copied", duration = 1200) {
  element.classList.remove("is-copied", "is-error");
  element.classList.add(className);
  window.setTimeout(() => {
    element.classList.remove(className);
  }, duration);
}

function modelSyntax(type, name) {
  if (type !== LORA_TYPE) {
    return "";
  }

  const baseName = titleFromPath(name).replace(/\.(safetensors|ckpt|pt|bin)$/i, "");
  return `<lora:${baseName}:1>`;
}

function iconSvg(name) {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("class", "promptboard-lora-info-svg-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const appendPath = (d) => {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", d);
    svg.append(path);
  };
  const appendRect = (attributes) => {
    const rect = document.createElementNS(namespace, "rect");
    for (const [key, value] of Object.entries(attributes)) {
      rect.setAttribute(key, value);
    }
    svg.append(rect);
  };

  if (name === "refresh-cw") {
    appendPath("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8");
    appendPath("M21 3v5h-5");
    appendPath("M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16");
    appendPath("M8 16H3v5");
  } else if (name === "x") {
    appendPath("M18 6 6 18");
    appendPath("m6 6 12 12");
  } else if (name === "copy") {
    appendRect({ x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" });
    appendPath("M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1");
  } else if (name === "message-square") {
    appendPath("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z");
  } else if (name === "save") {
    appendPath("M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z");
    appendPath("M17 21v-8H7v8");
    appendPath("M7 3v5h8");
  } else if (name === "pencil") {
    appendPath("M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z");
    appendPath("m15 5 4 4");
  } else if (name === "chevron-left") {
    appendPath("m15 18-6-6 6-6");
  } else if (name === "chevron-right") {
    appendPath("m9 18 6-6-6-6");
  }

  return svg;
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
    const syntax = modelSyntax(this.type, this.modelName);
    this.header = $el("header.promptboard-lora-info-header", [
      $el("div.promptboard-lora-info-title", [
        $el("div.promptboard-lora-info-title-main", { textContent: titleFromPath(this.name) }),
        syntax ? $el("div.promptboard-lora-info-title-syntax", { textContent: syntax }) : null,
      ].filter(Boolean)),
      $el("div.promptboard-lora-info-header-actions", [
        $el("button.promptboard-lora-info-icon-button.promptboard-lora-info-icon-refresh", {
          type: "button",
          title: "Refresh Civitai info",
          "aria-label": "Refresh Civitai info",
          onclick: () => this.reload(true),
        }, [iconSvg("refresh-cw")]),
        $el("button.promptboard-lora-modal-close", {
          type: "button",
          title: "Close",
          "aria-label": "Close",
          onclick: () => this.close(),
        }, [iconSvg("x")]),
      ]),
    ]);
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
      this.header,
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
    const surface = $el("div.promptboard-lora-modal-surface", [this.content]);
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

  reload(refreshCivitai = false) {
    this.close();
    new this.constructor(this.name, this.node).show(this.type, this.modelName, { refreshCivitai });
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
    return galleryImageUrl(image?.url || "");
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
    const edit = $el("button.promptboard-lora-info-edit-notes", {
      type: "button",
      title: "Edit notes",
      "aria-label": "Edit notes",
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
          edit.title = "Edit notes";
          edit.setAttribute("aria-label", "Edit notes");
          edit.replaceChildren(iconSvg("pencil"));
          return;
        }

        edit.title = "Save notes";
        edit.setAttribute("aria-label", "Save notes");
        edit.replaceChildren(iconSvg("save"));
        textarea = $el("textarea.promptboard-lora-info-notes-editor", { value: this.notes });
        notesBody.replaceWith(textarea);
        textarea.focus();
      },
    }, [iconSvg("pencil")]);
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
      $el("button.promptboard-lora-trigger-word", {
        type: "button",
        textContent: String(word),
        title: "Copy trigger word",
        onclick: async (event) => {
          const chip = event.currentTarget;
          try {
            await copyTextToClipboard(word);
            flashCopyState(chip, "is-copied");
          } catch (error) {
            flashCopyState(chip, "is-error");
          }
        },
      })
    ));
    const copy = $el("button.promptboard-lora-trigger-copy-all", {
      type: "button",
      title: "Copy all trigger words",
      "aria-label": "Copy all trigger words",
      onclick: async () => {
        try {
          await copyTextToClipboard(normalizedWords.join(", "));
          flashCopyState(copy, "is-copied");
        } catch (error) {
          flashCopyState(copy, "is-error");
        }
      },
    }, [iconSvg("copy")]);
    this.triggers.header.append(copy);
    this.triggers.body.append(chips);
  }

  addPreview(info) {
    const images = info.images?.filter((item) => item.type === "image") || [];
    if (!images.length) {
      return;
    }

    let currentImage = images[this.previewIndex];
    let promptOverlayVisible = false;
    const promptOverlay = $el("div.promptboard-lora-info-prompt-overlay", { style: { display: "none" } });
    const promptToggle = $el("button.promptboard-lora-info-prompt-toggle", {
      type: "button",
      title: "Show prompts",
      "aria-label": "Show prompts",
      onclick: () => {
        promptOverlayVisible = !promptOverlayVisible;
        promptToggle.classList.toggle("is-active", promptOverlayVisible);
        promptToggle.title = promptOverlayVisible ? "Hide prompts" : "Show prompts";
        promptToggle.setAttribute("aria-label", promptToggle.title);
        updatePromptOverlay();
      },
    }, [iconSvg("message-square")]);
    const promptCopyButton = (text, title) => $el("button.promptboard-lora-info-prompt-copy", {
      type: "button",
      title,
      "aria-label": title,
      onclick: async (event) => {
        event.stopPropagation();
        const button = event.currentTarget;
        try {
          await copyTextToClipboard(text);
          flashCopyState(button, "is-copied");
        } catch (error) {
          flashCopyState(button, "is-error");
        }
      },
    }, [iconSvg("copy")]);
    const updatePromptOverlay = () => {
      const prompts = imagePromptInfo(currentImage);
      promptOverlay.replaceChildren();

      if (!prompts.positive && !prompts.negative) {
        promptOverlay.style.display = "none";
        promptToggle.style.display = "none";
        return;
      }

      promptToggle.style.display = "";
      if (prompts.positive) {
        promptOverlay.append(
          $el("div.promptboard-lora-info-prompt-row", [
            $el("label", { textContent: "Positive" }),
            $el("span", { textContent: prompts.positive }),
            promptCopyButton(prompts.positive, "Copy positive prompt"),
          ])
        );
      }

      if (prompts.negative) {
        promptOverlay.append(
          $el("div.promptboard-lora-info-prompt-row", [
            $el("label", { textContent: "Negative" }),
            $el("span", { textContent: prompts.negative }),
            promptCopyButton(prompts.negative, "Copy negative prompt"),
          ])
        );
      }

      promptOverlay.style.display = promptOverlayVisible ? "" : "none";
    };
    const updatePreview = () => {
      currentImage = images[this.previewIndex];
      this.previewImage.removeAttribute("src");
      this.previewImage.style.display = "none";
      this.previewEmpty.textContent = "Loading...";
      this.previewEmpty.classList.add("is-loading");
      this.previewEmpty.style.display = "";
      this.previewImage.src = this.previewUrl(currentImage);
      this.previewImage.title = `${this.previewIndex + 1}/${images.length}`;
      updatePromptOverlay();
      if (this.previewCounter) {
        this.previewCounter.textContent = `${this.previewIndex + 1}/${images.length}`;
      }
    };

    this.previewImage.onload = () => {
      this.previewImage.style.display = "";
      this.previewEmpty.textContent = "No preview image";
      this.previewEmpty.classList.remove("is-loading");
      this.previewEmpty.style.display = "none";
    };

    this.previewImage.onerror = () => {
      this.previewImage.style.display = "none";
      this.previewEmpty.textContent = "Failed to load preview";
      this.previewEmpty.classList.remove("is-loading");
      this.previewEmpty.style.display = "";
    };

    updatePreview();

    this.previewStage.append(
      $el("div.promptboard-lora-info-preview-actions", [
        promptToggle,
        $el("button.promptboard-lora-info-save-preview", {
          type: "button",
          title: "Save as local preview",
          "aria-label": "Save as local preview",
          onclick: async (event) => {
            const button = event.currentTarget;
            const previewUrl = currentImage?.url || "";
            if (!previewUrl || button.disabled) {
              return;
            }

            button.disabled = true;
            button.title = "Saving preview";
            button.setAttribute("aria-label", "Saving preview");
            button.classList.remove("is-saved", "is-error");
            button.classList.add("is-busy");

            try {
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
                throw new Error(`${save.status} ${save.statusText}`);
              }
              app.refreshComboInNodes?.();
              button.title = "Saved preview";
              button.setAttribute("aria-label", "Saved preview");
              button.classList.add("is-saved");
            } catch (error) {
              button.title = "Failed to save preview";
              button.setAttribute("aria-label", "Failed to save preview");
              button.classList.add("is-error");
              window.setTimeout(() => {
                alert(`Error saving preview: ${error.message}`);
              }, 0);
            } finally {
              button.classList.remove("is-busy");
              window.setTimeout(() => {
                button.disabled = false;
                button.title = "Save as local preview";
                button.setAttribute("aria-label", "Save as local preview");
                button.classList.remove("is-saved", "is-error");
              }, 1500);
            }
          },
        }, [iconSvg("save")]),
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
          title: "Previous preview",
          onclick: () => {
            this.previewIndex = (this.previewIndex + images.length - 1) % images.length;
            updatePreview();
          },
        }, [iconSvg("chevron-left")]),
        $el("button", {
          className: "promptboard-lora-info-nav next",
          type: "button",
          title: "Next preview",
          onclick: () => {
            this.previewIndex = (this.previewIndex + 1) % images.length;
            updatePreview();
          },
        }, [iconSvg("chevron-right")]),
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
