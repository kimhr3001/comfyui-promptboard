import { app } from "../../../scripts/app.js";

const NODE_NAME = "PromptBoardYamlEditor";
const EDITOR_WIDGET = "yaml_editor_layout";
const DEFAULT_YAML_FILE = "default.yaml";
const HIDDEN_MARK = "__promptboardYamlEditorHiddenWidget";
const MIN_NODE_WIDTH = 520;
const MIN_NODE_HEIGHT = 420;
const EDITOR_HEIGHT = 360;

function widget(node, name) {
  return node.widgets?.find((item) => item.name === name);
}

function widgetValue(node, name, fallback = "") {
  return widget(node, name)?.value ?? fallback;
}

function setWidgetValue(node, name, value) {
  const item = widget(node, name);
  if (item) {
    item.value = value;
  }
}

function stopCanvasEvents(element) {
  for (const eventName of ["pointerdown", "mousedown", "dblclick", "wheel", "contextmenu"]) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }
}

function hideWidget(item, hidden) {
  if (!item) {
    return;
  }
  if (!item[HIDDEN_MARK]) {
    item[HIDDEN_MARK] = {
      computeSize: item.computeSize,
      draw: item.draw,
    };
  }
  if (hidden) {
    item.computeSize = () => [0, -4];
    item.draw = () => {};
    if (item.inputEl?.style) {
      item.inputEl.style.display = "none";
    }
    return;
  }
  item.computeSize = item[HIDDEN_MARK].computeSize;
  item.draw = item[HIDDEN_MARK].draw;
  if (item.inputEl?.style) {
    item.inputEl.style.display = "";
  }
}

function hideSourceWidgets(node) {
  hideWidget(widget(node, "yaml_file"), true);
  hideWidget(widget(node, "yaml_text"), true);
}

function ensureStyles() {
  if (document.getElementById("promptboard-yaml-editor-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "promptboard-yaml-editor-style";
  style.textContent = `
    .promptboard-yaml-editor {
      box-sizing: border-box;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto;
      gap: 6px;
      width: 100%;
      height: 100%;
      min-width: 0;
      color: var(--fg-color, #ddd);
      font-family: Arial, sans-serif;
      font-size: 12px;
    }

    .promptboard-yaml-editor-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(82px, auto);
      gap: 6px;
      min-width: 0;
    }

    .promptboard-yaml-editor-select,
    .promptboard-yaml-editor-button,
    .promptboard-yaml-editor-textarea {
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: #171717;
      color: rgba(255, 255, 255, 0.88);
      font-size: 12px;
    }

    .promptboard-yaml-editor-select,
    .promptboard-yaml-editor-button {
      height: 28px;
      min-width: 0;
    }

    .promptboard-yaml-editor-button {
      padding: 0 10px;
      cursor: pointer;
    }

    .promptboard-yaml-editor-button:hover {
      background: #242424;
    }

    .promptboard-yaml-editor-textarea {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      padding: 8px;
      resize: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height: 1.4;
      white-space: pre;
      overflow: auto;
    }

    .promptboard-yaml-editor-status {
      min-height: 16px;
      color: rgba(255, 255, 255, 0.62);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
  document.head.append(style);
}

function setStatus(node, message) {
  node.promptboardYamlEditorStatus = message;
  if (node.promptboardYamlEditorStatusElement) {
    node.promptboardYamlEditorStatusElement.textContent = message || "";
  }
}

function syncEditorFromWidgets(node) {
  if (node.promptboardYamlEditorSelect) {
    const yamlFile = widgetValue(node, "yaml_file", DEFAULT_YAML_FILE);
    node.promptboardYamlEditorSelect.value = yamlFile;
  }
  if (node.promptboardYamlEditorTextarea) {
    const yamlText = widgetValue(node, "yaml_text", "");
    if (node.promptboardYamlEditorTextarea.value !== yamlText) {
      node.promptboardYamlEditorTextarea.value = yamlText;
    }
  }
}

async function refreshYamlFileOptions(node) {
  const select = node.promptboardYamlEditorSelect;
  if (!select) {
    return;
  }

  try {
    const response = await fetch("/promptboard/yaml/files");
    const values = await response.json();
    if (!response.ok || !Array.isArray(values)) {
      throw new Error(values?.error || `HTTP ${response.status}`);
    }

    const current = widgetValue(node, "yaml_file", DEFAULT_YAML_FILE);
    select.replaceChildren();
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
    select.value = values.includes(current) ? current : values[0] ?? DEFAULT_YAML_FILE;
    setWidgetValue(node, "yaml_file", select.value);
  } catch (error) {
    setStatus(node, `YAML list error: ${error.message}`);
  }
}

async function loadSelectedYaml(node) {
  const yamlFile = widgetValue(node, "yaml_file", DEFAULT_YAML_FILE);
  if (!yamlFile) {
    setStatus(node, "Select a YAML file.");
    return;
  }

  try {
    const response = await fetch(`/promptboard/yaml/file?name=${encodeURIComponent(yamlFile)}`);
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    const text = String(data.text ?? "");
    setWidgetValue(node, "yaml_text", text);
    if (node.promptboardYamlEditorTextarea) {
      node.promptboardYamlEditorTextarea.value = text;
    }
    setStatus(node, `Loaded: ${yamlFile}`);
    app.canvas?.setDirty(true, true);
  } catch (error) {
    setStatus(node, `Load error: ${error.message}`);
  }
}

function createEditorElement(node) {
  ensureStyles();

  const root = document.createElement("div");
  const toolbar = document.createElement("div");
  const select = document.createElement("select");
  const loadButton = document.createElement("button");
  const textarea = document.createElement("textarea");
  const status = document.createElement("div");

  root.className = "promptboard-yaml-editor";
  toolbar.className = "promptboard-yaml-editor-toolbar";
  select.className = "promptboard-yaml-editor-select";
  loadButton.className = "promptboard-yaml-editor-button";
  textarea.className = "promptboard-yaml-editor-textarea";
  status.className = "promptboard-yaml-editor-status";

  loadButton.type = "button";
  loadButton.textContent = "Load YAML";
  textarea.spellcheck = false;
  textarea.value = widgetValue(node, "yaml_text", "");
  status.textContent = node.promptboardYamlEditorStatus ?? "";

  stopCanvasEvents(root);
  stopCanvasEvents(select);
  stopCanvasEvents(loadButton);
  stopCanvasEvents(textarea);

  select.addEventListener("change", () => {
    setWidgetValue(node, "yaml_file", select.value);
    loadSelectedYaml(node);
  });
  loadButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    loadSelectedYaml(node);
  });
  textarea.addEventListener("input", () => {
    setWidgetValue(node, "yaml_text", textarea.value);
    setStatus(node, "Edited");
    app.canvas?.setDirty(true, true);
  });

  toolbar.append(select, loadButton);
  root.append(toolbar, textarea, status);

  node.promptboardYamlEditorElement = root;
  node.promptboardYamlEditorSelect = select;
  node.promptboardYamlEditorTextarea = textarea;
  node.promptboardYamlEditorStatusElement = status;

  syncEditorFromWidgets(node);
  refreshYamlFileOptions(node);

  return root;
}

function ensureEditorWidget(node) {
  let editorWidget = widget(node, EDITOR_WIDGET);
  if (editorWidget) {
    return editorWidget;
  }

  const element = createEditorElement(node);
  editorWidget = node.addDOMWidget(EDITOR_WIDGET, "custom", element, {
    serialize: false,
    hideOnZoom: true,
  });
  editorWidget.serialize = false;
  editorWidget.computeSize = (width) => [width ?? Number(node.size?.[0] ?? MIN_NODE_WIDTH), EDITOR_HEIGHT];
  return editorWidget;
}

function finalizeNode(node, info = null, isNewNode = false) {
  if (isNewNode) {
    node.size = [MIN_NODE_WIDTH, MIN_NODE_HEIGHT];
  }
  node.resizable = true;
  hideSourceWidgets(node);
  ensureEditorWidget(node);
  syncEditorFromWidgets(node);
  if (info) {
    refreshYamlFileOptions(node);
  }
}

app.registerExtension({
  name: "PromptBoard.YamlEditor",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) {
      return;
    }

    nodeType.prototype.resizable = true;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      finalizeNode(this, null, true);
      return result;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      const result = onConfigure?.apply(this, arguments);
      finalizeNode(this, info);
      return result;
    };
  },
});
