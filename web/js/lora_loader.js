import { app } from "../../../scripts/app.js";

const WIDGET_TYPE = "PROMPTBOARD_LORA_CONFIG";
const DEFAULT_VALUE = "[]";
const LORA_MODEL_TYPE = "loras";
const MIN_WIDGET_HEIGHT = 72;
const MAX_WIDGET_HEIGHT = 260;
const TOOLBAR_HEIGHT = 34;
const EMPTY_ROWS_HEIGHT = 34;
const ROW_HEIGHT = 32;

function parseRows(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value || DEFAULT_VALUE) : value;
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.loras) ? parsed.loras : [];
    return rows.map((row) => ({
      enabled: row?.enabled !== false,
      lora_name: String(row?.lora_name ?? row?.name ?? "None"),
      strength_model: Number.isFinite(Number(row?.strength_model)) ? Number(row.strength_model) : 1,
      strength_clip: Number.isFinite(Number(row?.strength_clip)) ? Number(row.strength_clip) : 1,
    }));
  } catch {
    return [];
  }
}

function serializeRows(rows) {
  return JSON.stringify(
    rows.map((row) => ({
      enabled: row.enabled !== false,
      lora_name: row.lora_name || "None",
      strength_model: Number(row.strength_model) || 0,
      strength_clip: Number(row.strength_clip) || 0,
    })),
  );
}

function stopCanvasEvents(element) {
  for (const eventName of ["pointerdown", "mousedown", "dblclick", "wheel", "contextmenu"]) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }
}

function createLoraSearchSelect(row, loras, onChange) {
  const container = document.createElement("div");
  container.className = "promptboard-lora-combo";

  const input = document.createElement("input");
  input.type = "text";
  input.value = row.lora_name || "None";
  input.placeholder = "Search LoRA";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.className = "promptboard-lora-combo-input";

  const menu = document.createElement("div");
  menu.className = "promptboard-lora-combo-menu";
  menu.style.display = "none";

  const rowLoras = row.lora_name && !loras.includes(row.lora_name) ? [...loras, row.lora_name] : loras;
  let activeIndex = 0;
  let filtered = [];

  function showMenu() {
    const rect = input.getBoundingClientRect();
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.bottom + 2}px`;
    menu.style.width = `${rect.width}px`;
    menu.style.maxHeight = `${Math.max(80, Math.min(168, window.innerHeight - rect.bottom - 8))}px`;
    menu.style.display = "";
    if (!menu.parentElement) {
      document.body.append(menu);
    }
  }

  function hideMenu() {
    menu.style.display = "none";
    menu.remove();
  }

  function commit(nextValue) {
    const value = rowLoras.includes(nextValue) ? nextValue : "None";
    row.lora_name = value;
    input.value = value;
    hideMenu();
    onChange(value);
  }

  function renderMenu() {
    const query = input.value.trim().toLowerCase();
    filtered = rowLoras
      .filter((name) => !query || name.toLowerCase().includes(query))
      .slice(0, 80);
    activeIndex = Math.min(activeIndex, Math.max(0, filtered.length - 1));

    menu.replaceChildren();
    if (!filtered.length) {
      menu.append(Object.assign(document.createElement("div"), {
        className: "promptboard-lora-combo-empty",
        textContent: "No matches",
      }));
      showMenu();
      return;
    }

    filtered.forEach((name, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "promptboard-lora-combo-option";
      option.classList.toggle("is-active", index === activeIndex);
      option.textContent = name;
      option.title = name;
      option.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      option.addEventListener("click", () => commit(name));
      menu.append(option);
    });
    showMenu();
  }

  function normalizeInput() {
    if (!input.value.trim()) {
      commit("None");
      return;
    }

    const exact = rowLoras.find((name) => name.toLowerCase() === input.value.trim().toLowerCase());
    if (exact) {
      commit(exact);
      return;
    }

    input.value = row.lora_name || "None";
    hideMenu();
  }

  input.addEventListener("focus", () => {
    input.select();
    activeIndex = 0;
    renderMenu();
  });
  input.addEventListener("input", () => {
    activeIndex = 0;
    renderMenu();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, Math.max(0, filtered.length - 1));
      renderMenu();
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      renderMenu();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (filtered[activeIndex]) {
        commit(filtered[activeIndex]);
      } else {
        normalizeInput();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      input.value = row.lora_name || "None";
      hideMenu();
    }
  });
  input.addEventListener("blur", () => {
    window.setTimeout(normalizeInput, 120);
  });

  stopCanvasEvents(container);
  stopCanvasEvents(input);
  stopCanvasEvents(menu);
  container.append(input);
  return container;
}

function createButton(label, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.className = className;
  stopCanvasEvents(button);
  return button;
}

function isRealLoraName(value) {
  return Boolean(value && value !== "None");
}

async function showLoraInfo(loraName) {
  if (!isRealLoraName(loraName)) {
    return;
  }

  if (!globalThis.promptboardModelInfo?.show) {
    await import("./model_info.js");
  }

  if (globalThis.promptboardModelInfo?.show) {
    globalThis.promptboardModelInfo.show(LORA_MODEL_TYPE, loraName);
  } else {
    alert("Model info dialog is not available.");
  }
}

function ensureStyles() {
  if (document.getElementById("promptboard-lora-loader-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "promptboard-lora-loader-style";
  style.textContent = `
    .promptboard-lora-widget {
      box-sizing: border-box;
      width: 100%;
      color: var(--fg-color, #ddd);
      font-family: Arial, sans-serif;
      font-size: 12px;
    }

    .promptboard-lora-toolbar {
      display: flex;
      gap: 6px;
      margin-bottom: 6px;
    }

    .promptboard-lora-button {
      height: 24px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: #151515;
      color: rgba(255, 255, 255, 0.86);
      cursor: pointer;
      flex: 1;
      border-radius: 0;
    }

    .promptboard-lora-rows {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 4px;
      overflow: auto;
      padding-right: 4px;
    }

    .promptboard-lora-row {
      display: grid;
      grid-template-columns: 18px minmax(120px, 1fr) 48px 48px 24px 22px;
      gap: 4px;
      align-items: center;
      width: 100%;
      min-width: 302px;
      min-height: 28px;
      padding: 3px 5px;
      box-sizing: border-box;
      background: #111;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 4px;
    }

    .promptboard-lora-row.is-disabled {
      opacity: 0.58;
    }

    .promptboard-lora-combo-input,
    .promptboard-lora-row input {
      box-sizing: border-box;
      width: 100%;
      height: 22px;
      min-width: 0;
      border: 1px solid transparent;
      background: transparent;
      color: rgba(255, 255, 255, 0.88);
      font-size: 11px;
      border-radius: 0;
      outline: none;
    }

    .promptboard-lora-combo-input:hover,
    .promptboard-lora-row input:hover,
    .promptboard-lora-combo-input:focus,
    .promptboard-lora-row input:focus {
      border-color: rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.045);
    }

    .promptboard-lora-combo {
      position: relative;
      min-width: 0;
    }

    .promptboard-lora-combo-input {
      padding-left: 4px;
    }

    .promptboard-lora-combo-menu {
      position: fixed;
      z-index: 10000;
      overflow: auto;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: #151515;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
    }

    .promptboard-lora-combo-option,
    .promptboard-lora-combo-empty {
      box-sizing: border-box;
      display: block;
      width: 100%;
      min-height: 22px;
      padding: 4px 6px;
      border: 0;
      background: transparent;
      color: rgba(255, 255, 255, 0.82);
      font-size: 11px;
      line-height: 1.25;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .promptboard-lora-combo-option {
      cursor: pointer;
    }

    .promptboard-lora-combo-option:hover,
    .promptboard-lora-combo-option.is-active {
      background: rgba(130, 166, 220, 0.22);
      color: #ffffff;
    }

    .promptboard-lora-combo-empty {
      color: rgba(255, 255, 255, 0.46);
    }

    .promptboard-lora-row input[type="number"] {
      text-align: center;
      color: rgba(255, 255, 255, 0.82);
    }

    .promptboard-lora-row input[type="checkbox"] {
      appearance: none;
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      justify-self: center;
      border: 1px solid rgba(255, 255, 255, 0.46);
      border-radius: 999px;
      background: transparent;
      cursor: pointer;
      padding: 0;
    }

    .promptboard-lora-row input[type="checkbox"]:checked {
      border-color: rgba(130, 166, 220, 0.9);
      background: radial-gradient(circle at center, #82a6dc 0 42%, transparent 48%);
    }

    .promptboard-lora-row input[type="checkbox"]:focus {
      border-color: rgba(180, 205, 245, 0.95);
      background-color: transparent;
    }

    .promptboard-lora-delete {
      height: 20px;
      min-width: 20px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.055);
      color: rgba(255, 255, 255, 0.62);
      cursor: pointer;
      border-radius: 999px;
      font-size: 14px;
      line-height: 1;
      padding: 0 6px;
    }

    .promptboard-lora-delete:hover {
      color: #ffb9b9;
      background: rgba(140, 35, 40, 0.28);
      border-color: rgba(255, 120, 120, 0.26);
    }

    .promptboard-lora-info {
      height: 20px;
      min-width: 20px;
      border: 1px solid rgba(125, 165, 220, 0.18);
      background: rgba(125, 165, 220, 0.08);
      color: rgba(210, 225, 245, 0.72);
      cursor: pointer;
      border-radius: 999px;
      font-size: 14px;
      line-height: 1;
      padding: 0 6px;
    }

    .promptboard-lora-info:not(:disabled):hover {
      color: #dceaff;
      background: rgba(85, 125, 180, 0.22);
      border-color: rgba(125, 165, 220, 0.26);
    }

    .promptboard-lora-info:disabled {
      opacity: 0.34;
      cursor: default;
    }

    .promptboard-lora-empty {
      color: rgba(255, 255, 255, 0.52);
      padding: 8px 2px;
    }
  `;
  document.head.appendChild(style);
}

function createLoraWidget(node, inputName, inputData) {
  ensureStyles();

  const options = inputData?.[1] ?? {};
  const loras = Array.isArray(options.loras) && options.loras.length ? options.loras : ["None"];
  const root = document.createElement("div");
  root.className = "promptboard-lora-widget";

  const toolbar = document.createElement("div");
  toolbar.className = "promptboard-lora-toolbar";
  const addButton = createButton("Add LoRA", "promptboard-lora-button");
  toolbar.append(addButton);

  const rowsHost = document.createElement("div");
  rowsHost.className = "promptboard-lora-rows";
  root.append(toolbar, rowsHost);

  let rows = [];
  let value = DEFAULT_VALUE;
  let widget = null;

  function widgetHeight() {
    const rowsHeight = rows.length ? rows.length * ROW_HEIGHT : EMPTY_ROWS_HEIGHT;
    return Math.max(MIN_WIDGET_HEIGHT, Math.min(MAX_WIDGET_HEIGHT, TOOLBAR_HEIGHT + rowsHeight));
  }

  function syncWidgetHeight() {
    const height = widgetHeight();
    root.style.height = `${height}px`;
    rowsHost.style.maxHeight = `${Math.max(EMPTY_ROWS_HEIGHT, height - TOOLBAR_HEIGHT)}px`;

    if (widget) {
      widget.computeSize = (width) => [width ?? Number(node.size?.[0] ?? 320), height];
    }

    return height;
  }

  function syncNodeHeight(allowShrink = false) {
    const height = syncWidgetHeight();
    node.promptboardLoraWidgetHeight = height;

    if (!node.graph) {
      return;
    }

    const computed = typeof node.computeSize === "function" ? node.computeSize() : null;
    const targetHeight = Math.ceil(Number(computed?.[1] ?? 0));
    if (!targetHeight) {
      return;
    }

    const currentHeight = Number(node.size?.[1] ?? 0);
    if (!allowShrink && targetHeight <= currentHeight) {
      return;
    }
    if (allowShrink && Math.abs(targetHeight - currentHeight) < 1) {
      return;
    }

    node.size = [Number(node.size?.[0] ?? computed?.[0] ?? 320), targetHeight];
    node.onResize?.(node.size);
  }

  function syncValue(markDirty = true) {
    value = serializeRows(rows);
    if (!markDirty) {
      return;
    }
    node.setDirtyCanvas?.(true, true);
    app.canvas?.setDirty(true, true);
  }

  function render({ allowShrink = false } = {}) {
    rowsHost.replaceChildren();
    if (!rows.length) {
      rowsHost.append(Object.assign(document.createElement("div"), {
        className: "promptboard-lora-empty",
        textContent: "No LoRA rows",
      }));
      syncNodeHeight(allowShrink);
      return;
    }

    rows.forEach((row, index) => {
      const rowEl = document.createElement("div");
      rowEl.className = "promptboard-lora-row";
      rowEl.classList.toggle("is-disabled", row.enabled === false);

      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = row.enabled !== false;
      enabled.title = "enabled";
      stopCanvasEvents(enabled);
      enabled.addEventListener("change", () => {
        row.enabled = enabled.checked;
        rowEl.classList.toggle("is-disabled", !enabled.checked);
        syncValue();
      });

      let info = null;
      const select = createLoraSearchSelect(row, loras, () => {
        if (info) {
          info.disabled = !isRealLoraName(row.lora_name);
        }
        syncValue();
      });

      const modelStrength = document.createElement("input");
      modelStrength.type = "number";
      modelStrength.step = "0.01";
      modelStrength.value = row.strength_model;
      modelStrength.title = "model strength";
      stopCanvasEvents(modelStrength);
      modelStrength.addEventListener("change", () => {
        row.strength_model = Number(modelStrength.value) || 0;
        syncValue();
      });

      const clipStrength = document.createElement("input");
      clipStrength.type = "number";
      clipStrength.step = "0.01";
      clipStrength.value = row.strength_clip;
      clipStrength.title = "clip strength";
      stopCanvasEvents(clipStrength);
      clipStrength.addEventListener("change", () => {
        row.strength_clip = Number(clipStrength.value) || 0;
        syncValue();
      });

      const remove = createButton("x", "promptboard-lora-delete");
      remove.title = "delete";
      remove.addEventListener("click", () => {
        rows.splice(index, 1);
        syncValue();
        render({ allowShrink: true });
      });

      info = createButton("i", "promptboard-lora-info");
      info.title = "info";
      info.disabled = !isRealLoraName(row.lora_name);
      info.addEventListener("click", () => {
        showLoraInfo(row.lora_name);
      });

      rowEl.append(enabled, select, modelStrength, clipStrength, info, remove);
      rowsHost.append(rowEl);
    });
    syncNodeHeight(allowShrink);
  }

  addButton.addEventListener("click", () => {
    rows.push({
      enabled: true,
      lora_name: "None",
      strength_model: 1,
      strength_clip: 1,
    });
    syncValue();
    render();
  });

  widget = node.addDOMWidget(inputName, WIDGET_TYPE, root, {
    serialize: true,
    hideOnZoom: true,
    getMinHeight: () => widgetHeight(),
    getMaxHeight: () => widgetHeight(),
    getValue: () => value,
    setValue: (nextValue) => {
      value = typeof nextValue === "object" ? JSON.stringify(nextValue) : String(nextValue || DEFAULT_VALUE);
      rows = parseRows(value);
      value = serializeRows(rows);
      render();
    },
  });
  widget.inputSpec = options;

  rows = parseRows(options.default ?? DEFAULT_VALUE);
  syncValue(false);
  render();

  return { widget };
}

app.registerExtension({
  name: "PromptBoard.LoRALoader",
  getCustomWidgets() {
    return {
      [WIDGET_TYPE]: createLoraWidget,
    };
  },
});
