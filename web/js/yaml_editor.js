import { app } from "../../../scripts/app.js";
import {
  CATEGORY_BOTTOM,
  getYamlEditorCategories,
  insertYamlEditorItem,
} from "./yaml_editor_mutation.mjs";

const NODE_NAME = "PromptBoardYamlEditor";
const EDITOR_WIDGET = "yaml_editor_layout";
const DEFAULT_YAML_FILE = "default.yaml";
const HIDDEN_MARK = "__promptboardYamlEditorHiddenWidget";
const MIN_NODE_WIDTH = 520;
const MIN_NODE_HEIGHT = 420;
const MIN_EDITOR_HEIGHT = 280;
const PANEL_GUTTER = 18;
const NODE_BOTTOM_PADDING = 18;
const SEARCH_DEBOUNCE_MS = 150;
const CODEMIRROR_MODULE = "../vendor/codemirror/promptboard-codemirror.bundle.js";
const CODEMIRROR_THEME_CSS = new URL("../vendor/codemirror/css/thema.css", import.meta.url).href;

let codeMirrorModulePromise = null;

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

function loadCodeMirrorModule() {
  if (!codeMirrorModulePromise) {
    codeMirrorModulePromise = import(CODEMIRROR_MODULE);
  }
  return codeMirrorModulePromise;
}

function ensureCodeMirrorThemeCss() {
  if (document.getElementById("promptboard-codemirror-theme")) {
    return;
  }

  const link = document.createElement("link");
  link.id = "promptboard-codemirror-theme";
  link.rel = "stylesheet";
  link.href = CODEMIRROR_THEME_CSS;
  document.head.appendChild(link);
}

function materialHighlightStyle(cm) {
  const t = cm.tags;
  return cm.HighlightStyle.define([
    { tag: t.keyword, color: "var(--pb-cm-keyword)" },
    { tag: t.operator, color: "var(--pb-cm-operator)" },
    {
      tag: [t.variableName, t.standard(t.variableName), t.definition(t.variableName)],
      color: "var(--pb-cm-variable)",
    },
    { tag: t.local(t.variableName), color: "var(--pb-cm-variable-2)" },
    { tag: [t.typeName, t.className], color: "var(--pb-cm-type)" },
    { tag: t.atom, color: "var(--pb-cm-atom)" },
    { tag: [t.number, t.integer, t.float], color: "var(--pb-cm-number)" },
    { tag: [t.string, t.special(t.string)], color: "var(--pb-cm-string)" },
    { tag: t.escape, color: "var(--pb-cm-string-2)" },
    { tag: t.comment, color: "var(--pb-cm-comment)" },
    { tag: t.meta, color: "var(--pb-cm-meta)" },
    { tag: t.attributeName, color: "var(--pb-cm-attribute)" },
    { tag: t.propertyName, color: "var(--pb-cm-property)" },
    { tag: t.tagName, color: "var(--pb-cm-tag)" },
    { tag: t.heading, color: "var(--pb-cm-heading)", fontWeight: "700" },
    { tag: t.bool, color: "var(--pb-cm-bool)" },
    { tag: t.null, color: "var(--pb-cm-null)" },
    {
      tag: t.invalid,
      color: "var(--pb-cm-error-fg)",
      backgroundColor: "var(--pb-cm-error-bg)",
    },
  ]);
}

function activeLineDecorations(cm, lineDecoration, state) {
  if (state.selection.ranges.some((range) => !range.empty)) {
    return cm.Decoration.none;
  }
  const line = state.doc.lineAt(state.selection.main.head);
  return cm.Decoration.set([lineDecoration.range(line.from)]);
}

function promptboardActiveLine(cm) {
  const lineDecoration = cm.Decoration.line({ class: "cm-activeLine" });
  return cm.StateField.define({
    create: (state) => activeLineDecorations(cm, lineDecoration, state),
    update: (decorations, transaction) => {
      if (!transaction.docChanged && !transaction.selection) {
        return decorations;
      }
      return activeLineDecorations(cm, lineDecoration, transaction.state);
    },
    provide: (field) => cm.EditorView.decorations.from(field),
  });
}

function lineStartOffset(lines, lineIndex) {
  let offset = 0;
  for (let index = 0; index < lineIndex; index += 1) {
    offset += String(lines[index] ?? "").length + 1;
  }
  return offset;
}

function scrollTextareaToOffset(textarea, text, offset) {
  textarea.setSelectionRange(offset, offset);

  const lineIndex = String(text.slice(0, offset)).split("\n").length - 1;
  const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 14;
  textarea.scrollTop = Math.max(0, lineIndex * lineHeight - textarea.clientHeight / 2);
}

function stopCanvasEvents(element) {
  for (const eventName of ["pointerdown", "mousedown", "dblclick", "wheel", "contextmenu", "keydown", "keyup"]) {
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

function clampSize(node) {
  const width = Math.max(MIN_NODE_WIDTH, Number(node.size?.[0]) || MIN_NODE_WIDTH);
  const height = Math.max(MIN_NODE_HEIGHT, Number(node.size?.[1]) || MIN_NODE_HEIGHT);
  node.size = [width, height];
}

function editorTop(node) {
  const item = widget(node, EDITOR_WIDGET);
  const top = Number(item?.y ?? item?.last_y);
  if (Number.isFinite(top) && top > 0) {
    return top;
  }
  return 78;
}

function editorHeight(node) {
  return Math.max(
    MIN_EDITOR_HEIGHT,
    Math.floor(Number(node.size?.[1] ?? MIN_NODE_HEIGHT) - editorTop(node) - NODE_BOTTOM_PADDING),
  );
}

function syncEditorSize(node) {
  const element = node.promptboardYamlEditorElement;
  if (!element) {
    return;
  }
  element.style.width = `${Math.max(320, Number(node.size?.[0] ?? MIN_NODE_WIDTH) - PANEL_GUTTER)}px`;
  element.style.height = `${editorHeight(node)}px`;
  node.promptboardYamlEditorCodeMirror?.requestMeasure?.();
}

function scheduleEditorSizeSync(node) {
  if (!node.promptboardYamlEditorElement || typeof requestAnimationFrame !== "function") {
    syncEditorSize(node);
    return;
  }

  const previousFrames = node.promptboardYamlEditorLayoutFrames;
  if (Array.isArray(previousFrames)) {
    for (const frame of previousFrames) {
      cancelAnimationFrame(frame);
    }
  }

  const frames = [];
  node.promptboardYamlEditorLayoutFrames = frames;
  frames.push(requestAnimationFrame(() => {
    frames.push(requestAnimationFrame(() => {
      if (node.promptboardYamlEditorLayoutFrames !== frames) {
        return;
      }
      node.promptboardYamlEditorLayoutFrames = null;
      syncEditorSize(node);
      app.canvas?.setDirty(true, true);
    }));
  }));
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
      grid-template-rows: auto auto minmax(0, 1fr) auto;
      gap: 6px;
      width: 100%;
      height: 100%;
      min-width: 0;
      color: var(--fg-color, #ddd);
      font-family: Arial, sans-serif;
      font-size: 12px;
    }

    .promptboard-yaml-editor-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-width: 0;
    }

    .promptboard-yaml-editor-search-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 42px;
      min-width: 0;
    }

    .promptboard-yaml-editor-select,
    .promptboard-yaml-editor-button,
    .promptboard-yaml-editor-search-input,
    .promptboard-yaml-editor-textarea {
      box-sizing: border-box;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: #171717;
      color: rgba(255, 255, 255, 0.88);
      font-size: 12px;
    }

    .promptboard-yaml-editor-search-input {
      height: 24px;
      min-width: 0;
      padding: 0 8px;
      border-right: 0;
    }

    .promptboard-yaml-editor-search-input.is-invalid {
      border-color: rgba(220, 88, 88, 0.82);
      color: #ffd1d1;
    }

    .promptboard-yaml-editor-search-count {
      box-sizing: border-box;
      height: 24px;
      padding: 5px 4px 0;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-left: 0;
      background: #171717;
      color: rgba(255, 255, 255, 0.72);
      font-size: 10px;
      text-align: center;
      white-space: nowrap;
    }

    .promptboard-yaml-editor-select,
    .promptboard-yaml-editor-button {
      height: 28px;
      min-width: 0;
    }

    .promptboard-yaml-editor-select {
      flex: 1 1 150px;
    }

    .promptboard-yaml-editor-button {
      padding: 0 10px;
      cursor: pointer;
    }

    .promptboard-yaml-editor-button:hover {
      background: #242424;
    }

    .promptboard-yaml-editor-editor {
      box-sizing: border-box;
      min-width: 0;
      min-height: 0;
      height: 100%;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: #171717;
    }

    .promptboard-yaml-editor-codemirror {
      box-sizing: border-box;
      display: none;
      width: 100%;
      min-width: 0;
      height: 100%;
      min-height: 0;
    }

    .promptboard-yaml-editor-textarea {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      border: 0;
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

    .promptboard-yaml-editor-modal {
      position: fixed;
      inset: 0;
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.35);
    }

    .promptboard-yaml-editor-modal-surface {
      box-sizing: border-box;
      width: min(420px, 100%);
      max-height: calc(100vh - 32px);
      overflow: auto;
      display: grid;
      gap: 10px;
      padding: 14px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #202327;
      color: rgba(255, 255, 255, 0.88);
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.42);
      font-family: Arial, sans-serif;
      font-size: 12px;
    }

    .promptboard-yaml-editor-modal-title {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
    }

    .promptboard-yaml-editor-field {
      display: grid;
      gap: 4px;
    }

    .promptboard-yaml-editor-field label {
      color: rgba(255, 255, 255, 0.68);
    }

    .promptboard-yaml-editor-field input,
    .promptboard-yaml-editor-field select,
    .promptboard-yaml-editor-field textarea {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      border: 1px solid rgba(255, 255, 255, 0.16);
      background: #171717;
      color: rgba(255, 255, 255, 0.88);
      font-size: 12px;
      padding: 7px 8px;
    }

    .promptboard-yaml-editor-field textarea {
      min-height: 72px;
      resize: vertical;
    }

    .promptboard-yaml-editor-checkbox {
      display: flex;
      align-items: center;
      gap: 7px;
    }

    .promptboard-yaml-editor-checkbox input {
      width: auto;
    }

    .promptboard-yaml-editor-modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 6px;
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

function setSaveReport(node, message) {
  setStatus(node, message);
}

function setYamlEditorSearchInvalid(node, invalid) {
  node.promptboardYamlEditorSearchInput?.classList.toggle("is-invalid", invalid);
}

function setYamlEditorSearchCount(node, current, total) {
  const count = node.promptboardYamlEditorSearchCount;
  if (!count) {
    return;
  }
  count.textContent = total > 0 ? `${current}/${total}` : total === 0 ? "0/0" : "";
}

function setYamlEditorSearchHighlight(node, match) {
  const view = node.promptboardYamlEditorCodeMirror;
  const effect = node.promptboardYamlEditorSearchLineEffect;
  if (!view || !effect) {
    return;
  }
  view.dispatch({
    effects: effect.of(match ? match.offset : null),
  });
}

function findYamlEditorSearchMatches(text, pattern) {
  const matcher = new RegExp(pattern);
  const lines = String(text ?? "").split("\n");
  const matches = [];
  for (let index = 0; index < lines.length; index += 1) {
    matcher.lastIndex = 0;
    if (matcher.test(lines[index])) {
      matches.push({
        lineIndex: index,
        offset: lineStartOffset(lines, index),
      });
    }
  }
  return matches;
}

function yamlEditorSearchState(node, pattern, text) {
  const signature = String(text ?? "");
  const current = node.promptboardYamlEditorSearchState;
  if (current?.pattern === pattern && current?.signature === signature) {
    return current;
  }

  const next = {
    pattern,
    signature,
    index: -1,
    matches: findYamlEditorSearchMatches(text, pattern),
  };
  node.promptboardYamlEditorSearchState = next;
  return next;
}

function scrollYamlEditorToMatch(node, match) {
  if (!match) {
    return;
  }

  const view = node.promptboardYamlEditorCodeMirror;
  if (view) {
    view.dispatch({
      selection: { anchor: match.offset },
      scrollIntoView: true,
    });
    return;
  }

  const textarea = node.promptboardYamlEditorTextarea;
  if (textarea) {
    scrollTextareaToOffset(textarea, widgetValue(node, "yaml_text", ""), match.offset);
  }
}

function runYamlEditorSearch(node, direction = 0) {
  const input = node.promptboardYamlEditorSearchInput;
  const pattern = String(input?.value ?? "").trim();
  if (!pattern) {
    setYamlEditorSearchInvalid(node, false);
    node.promptboardYamlEditorSearchState = null;
    setYamlEditorSearchCount(node, -1, -1);
    setYamlEditorSearchHighlight(node, null);
    return;
  }

  const text = widgetValue(node, "yaml_text", "");
  let state = null;
  try {
    state = yamlEditorSearchState(node, pattern, text);
  } catch (error) {
    setYamlEditorSearchInvalid(node, true);
    setYamlEditorSearchCount(node, -1, -1);
    setYamlEditorSearchHighlight(node, null);
    setStatus(node, `Search regex error: ${error.message}`);
    return;
  }

  setYamlEditorSearchInvalid(node, false);
  if (!state.matches.length) {
    setYamlEditorSearchCount(node, 0, 0);
    setYamlEditorSearchHighlight(node, null);
    setStatus(node, "Search: no match");
    return;
  }

  if (direction < 0) {
    state.index = state.index <= 0 ? state.matches.length - 1 : state.index - 1;
  } else if (direction > 0) {
    state.index = state.index >= state.matches.length - 1 ? 0 : state.index + 1;
  } else if (state.index < 0) {
    state.index = 0;
  }
  const match = state.matches[state.index];
  setYamlEditorSearchCount(node, state.index + 1, state.matches.length);
  setYamlEditorSearchHighlight(node, match);
  scrollYamlEditorToMatch(node, match);
  setStatus(node, "");
}

function scheduleYamlEditorSearch(node) {
  if (node.promptboardYamlEditorSearchTimer) {
    clearTimeout(node.promptboardYamlEditorSearchTimer);
  }
  node.promptboardYamlEditorSearchTimer = setTimeout(() => {
    node.promptboardYamlEditorSearchTimer = null;
    runYamlEditorSearch(node);
  }, SEARCH_DEBOUNCE_MS);
}

function invalidateYamlEditorSearch(node) {
  node.promptboardYamlEditorSearchState = null;
  if (node.promptboardYamlEditorSearchInput?.value?.trim()) {
    scheduleYamlEditorSearch(node);
  }
}

function syncCodeMirrorFromWidget(node) {
  const view = node.promptboardYamlEditorCodeMirror;
  if (!view) {
    return;
  }

  const value = widgetValue(node, "yaml_text", "");
  const current = view.state.doc.toString();
  if (current === value) {
    return;
  }

  node.promptboardYamlEditorIgnoreCodeMirrorUpdate = true;
  try {
    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: value,
      },
    });
  } finally {
    node.promptboardYamlEditorIgnoreCodeMirrorUpdate = false;
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
  syncCodeMirrorFromWidget(node);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || data?.error) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
}

async function refreshYamlFileOptions(node) {
  const select = node.promptboardYamlEditorSelect;
  if (!select) {
    return;
  }

  try {
    const values = await fetchJson("/promptboard/yaml/files");
    if (!Array.isArray(values)) {
      throw new Error("Invalid YAML file list response.");
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
    const data = await fetchJson(`/promptboard/yaml/file?name=${encodeURIComponent(yamlFile)}`);
    const text = String(data.text ?? "");
    setYamlText(node, text, `Loaded: ${yamlFile}`);
  } catch (error) {
    setSaveReport(node, `Load error: ${error.message}`);
  }
}

async function validateYaml(node) {
  const text = widgetValue(node, "yaml_text", "");
  const report = await fetchJson("/promptboard/yaml/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!report.ok) {
    throw new Error(report.error || report.message || "YAML validation failed.");
  }
  setStatus(
    node,
    `Valid: ${report.categoryCount} categories, ${report.tagCount} tags`,
  );
  return report;
}

async function saveYaml(node) {
  const yamlFile = widgetValue(node, "yaml_file", DEFAULT_YAML_FILE);
  const text = widgetValue(node, "yaml_text", "");
  if (!yamlFile) {
    setSaveReport(node, "Save error: select a YAML file.");
    return;
  }

  try {
    await validateYaml(node);
    const backup = await fetchJson("/promptboard/yaml/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: yamlFile }),
    });
    await fetchJson("/promptboard/yaml/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: yamlFile, text }),
    });
    setSaveReport(node, `Saved: ${yamlFile} (backup: ${backup.backup_file})`);
    app.canvas?.setDirty(true, true);
  } catch (error) {
    setSaveReport(node, `Save error: ${error.message}`);
  }
}

function field(labelText, control) {
  const container = document.createElement("div");
  const label = document.createElement("label");
  container.className = "promptboard-yaml-editor-field";
  label.textContent = labelText;
  container.append(label, control);
  return container;
}

function button(text) {
  const control = document.createElement("button");
  control.type = "button";
  control.className = "promptboard-yaml-editor-button";
  control.textContent = text;
  return control;
}

function option(value, text) {
  const control = document.createElement("option");
  control.value = value;
  control.textContent = text;
  return control;
}

function setYamlText(node, text, status) {
  setWidgetValue(node, "yaml_text", text);
  if (node.promptboardYamlEditorTextarea) {
    node.promptboardYamlEditorTextarea.value = text;
  }
  syncCodeMirrorFromWidget(node);
  invalidateYamlEditorSearch(node);
  setSaveReport(node, status);
  app.canvas?.setDirty(true, true);
}

function handleYamlSaveShortcut(event, node) {
  if (!(event.metaKey || event.ctrlKey) || event.key?.toLowerCase() !== "s") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  saveYaml(node);
  return true;
}

function handleYamlSearchShortcut(event, node) {
  if (!(event.metaKey || event.ctrlKey) || event.key?.toLowerCase() !== "f") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  node.promptboardYamlEditorSearchInput?.focus();
  node.promptboardYamlEditorSearchInput?.select();
  return true;
}

async function createCodeMirrorEditor(node, host, textarea) {
  try {
    ensureCodeMirrorThemeCss();
    const cm = await loadCodeMirrorModule();
    const materialSyntax = materialHighlightStyle(cm);
    const setSearchLineEffect = cm.StateEffect.define();
    const searchLineField = cm.StateField.define({
      create: () => cm.Decoration.none,
      update: (value, transaction) => {
        let next = value.map(transaction.changes);
        for (const effect of transaction.effects) {
          if (!effect.is(setSearchLineEffect)) {
            continue;
          }
          const position = effect.value;
          if (typeof position !== "number" || position < 0 || position > transaction.state.doc.length) {
            next = cm.Decoration.none;
            continue;
          }
          const line = transaction.state.doc.lineAt(position);
          next = cm.Decoration.set([
            cm.Decoration.line({ class: "cm-promptboard-search-line" }).range(line.from),
          ]);
        }
        return next;
      },
      provide: (field) => cm.EditorView.decorations.from(field),
    });

    node.promptboardYamlEditorCodeMirror?.destroy?.();
    const theme = cm.EditorView.theme(
      {
        "&": {
          height: "100%",
          fontSize: "12px",
        },
        ".cm-scroller": {
          overflowX: "hidden",
          overflowY: "auto",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          lineHeight: "1.4",
        },
        ".cm-content": {
          padding: "8px 0",
        },
        ".cm-line": {
          padding: "0 8px",
        },
        ".cm-foldGutter": {
          width: "14px",
        },
        ".cm-line.cm-promptboard-search-line": {
          backgroundColor: "rgba(76, 126, 176, 0.34)",
          outline: "1px solid rgba(116, 166, 216, 0.45)",
        },
      },
      { dark: true },
    );

    const saveKeymap = cm.keymap.of([
      {
        key: "Mod-s",
        run: () => {
          saveYaml(node);
          return true;
        },
      },
      cm.indentWithTab,
      ...cm.foldKeymap,
      ...cm.historyKeymap,
      ...cm.defaultKeymap,
    ]);

    const view = new cm.EditorView({
      state: cm.EditorState.create({
        doc: widgetValue(node, "yaml_text", ""),
        extensions: [
          cm.lineNumbers(),
          cm.highlightActiveLineGutter(),
          cm.highlightSpecialChars(),
          cm.history(),
          cm.foldGutter(),
          cm.drawSelection(),
          cm.indentOnInput(),
          cm.bracketMatching(),
          cm.yaml(),
          cm.syntaxHighlighting(materialSyntax),
          promptboardActiveLine(cm),
          searchLineField,
          cm.EditorView.lineWrapping,
          cm.EditorView.updateListener.of((update) => {
            if (!update.docChanged || node.promptboardYamlEditorIgnoreCodeMirrorUpdate) {
              return;
            }
            const text = update.state.doc.toString();
            if (textarea.value !== text) {
              textarea.value = text;
            }
            setWidgetValue(node, "yaml_text", text);
            invalidateYamlEditorSearch(node);
            setSaveReport(node, "Edited");
            app.canvas?.setDirty(true, true);
          }),
          theme,
          saveKeymap,
        ],
      }),
      parent: host,
    });

    stopCanvasEvents(view.dom);
    view.dom.addEventListener("keydown", (event) => {
      handleYamlSaveShortcut(event, node) || handleYamlSearchShortcut(event, node);
    }, { capture: true });
    node.promptboardYamlEditorCodeMirror = view;
    node.promptboardYamlEditorSearchLineEffect = setSearchLineEffect;
    textarea.style.display = "none";
    host.style.display = "block";
    syncCodeMirrorFromWidget(node);
    runYamlEditorSearch(node);
    syncEditorSize(node);
  } catch (error) {
    console.warn("PromptBoard YAML Editor CodeMirror load failed; falling back to textarea.", error);
    host.style.display = "none";
    textarea.style.display = "block";
  }
}

function openInsertDialog(node, type) {
  let categories = [];
  try {
    categories = getYamlEditorCategories(widgetValue(node, "yaml_text", ""));
  } catch (error) {
    setStatus(node, `Insert error: ${error.message}`);
    return;
  }
  if (categories.length === 0) {
    setStatus(node, "Insert error: no category found.");
    return;
  }

  const modal = document.createElement("div");
  const surface = document.createElement("form");
  const title = document.createElement("h2");
  const categorySelect = document.createElement("select");
  const positionSelect = document.createElement("select");
  const sectionInput = document.createElement("input");
  const textInput = document.createElement("input");
  const labelInput = document.createElement("input");
  const descriptionInput = document.createElement("textarea");
  const defaultInput = document.createElement("input");
  const actions = document.createElement("div");
  const cancelButton = button("Cancel");
  const addButton = button("Add");
  addButton.type = "submit";

  modal.className = "promptboard-yaml-editor-modal";
  surface.className = "promptboard-yaml-editor-modal-surface";
  title.className = "promptboard-yaml-editor-modal-title";
  actions.className = "promptboard-yaml-editor-modal-actions";
  title.textContent = type === "section" ? "Add Section" : "Add Tag";
  defaultInput.type = "checkbox";

  for (const category of categories) {
    categorySelect.append(option(category.id, `${category.label} (${category.id})`));
  }

  function refreshPositions() {
    const category = categories.find((item) => item.id === categorySelect.value) ?? categories[0];
    positionSelect.replaceChildren(option(CATEGORY_BOTTOM, "Category bottom"));
    for (const section of category.sections) {
      positionSelect.append(option(section, `After section: ${section}`));
    }
  }

  categorySelect.addEventListener("change", refreshPositions);
  refreshPositions();

  actions.append(cancelButton, addButton);
  surface.append(
    title,
    field("Category", categorySelect),
    field("Position", positionSelect),
  );

  if (type === "section") {
    surface.append(field("Section label", sectionInput));
  } else {
    surface.append(
      field("Text", textInput),
      field("Label", labelInput),
      field("Description", descriptionInput),
    );
    const defaultField = document.createElement("label");
    defaultField.className = "promptboard-yaml-editor-checkbox";
    defaultField.append(defaultInput, document.createTextNode("Default"));
    surface.append(defaultField);
  }
  surface.append(actions);
  modal.append(surface);

  stopCanvasEvents(modal);
  stopCanvasEvents(surface);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.remove();
    }
  });
  cancelButton.addEventListener("click", () => modal.remove());
  surface.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const result = insertYamlEditorItem(widgetValue(node, "yaml_text", ""), {
        type,
        category: categorySelect.value,
        afterSection: positionSelect.value,
        section: sectionInput.value,
        text: textInput.value,
        label: labelInput.value,
        description: descriptionInput.value,
        default: defaultInput.checked,
      });
      const sharedSuffix = result.sharedSource ? ` via tagSet ${result.sharedSource}` : "";
      const warningSuffix = result.warning ? ` Warning: ${result.warning}` : "";
      setYamlText(node, result.text, `Inserted ${type}${sharedSuffix}.${warningSuffix}`);
      modal.remove();
    } catch (error) {
      setStatus(node, `Insert error: ${error.message}`);
    }
  });

  document.body.append(modal);
  const firstInput = type === "section" ? sectionInput : textInput;
  firstInput.focus();
}

function createEditorElement(node) {
  ensureStyles();

  const root = document.createElement("div");
  const toolbar = document.createElement("div");
  const select = document.createElement("select");
  const loadButton = document.createElement("button");
  const validateButton = document.createElement("button");
  const saveButton = document.createElement("button");
  const sectionButton = document.createElement("button");
  const tagButton = document.createElement("button");
  const searchRow = document.createElement("div");
  const searchInput = document.createElement("input");
  const searchCount = document.createElement("div");
  const editor = document.createElement("div");
  const editorHost = document.createElement("div");
  const textarea = document.createElement("textarea");
  const status = document.createElement("div");

  root.className = "promptboard-yaml-editor";
  toolbar.className = "promptboard-yaml-editor-toolbar";
  select.className = "promptboard-yaml-editor-select";
  loadButton.className = "promptboard-yaml-editor-button";
  validateButton.className = "promptboard-yaml-editor-button";
  saveButton.className = "promptboard-yaml-editor-button";
  sectionButton.className = "promptboard-yaml-editor-button";
  tagButton.className = "promptboard-yaml-editor-button";
  searchRow.className = "promptboard-yaml-editor-search-row";
  searchInput.className = "promptboard-yaml-editor-search-input";
  searchCount.className = "promptboard-yaml-editor-search-count";
  editor.className = "promptboard-yaml-editor-editor";
  editorHost.className = "promptboard-yaml-editor-codemirror promptboard-codemirror";
  textarea.className = "promptboard-yaml-editor-textarea";
  status.className = "promptboard-yaml-editor-status";

  loadButton.type = "button";
  loadButton.textContent = "Load YAML";
  validateButton.type = "button";
  validateButton.textContent = "Validate";
  saveButton.type = "button";
  saveButton.textContent = "Save YAML";
  sectionButton.type = "button";
  sectionButton.textContent = "+ Section";
  tagButton.type = "button";
  tagButton.textContent = "+ Tag";
  searchInput.type = "text";
  searchInput.placeholder = "search";
  searchInput.autocomplete = "off";
  searchInput.spellcheck = false;
  searchCount.textContent = "";
  textarea.spellcheck = false;
  textarea.value = widgetValue(node, "yaml_text", "");
  status.textContent = node.promptboardYamlEditorStatus ?? "";

  stopCanvasEvents(root);
  stopCanvasEvents(select);
  stopCanvasEvents(loadButton);
  stopCanvasEvents(validateButton);
  stopCanvasEvents(saveButton);
  stopCanvasEvents(sectionButton);
  stopCanvasEvents(tagButton);
  stopCanvasEvents(searchInput);
  stopCanvasEvents(editor);
  stopCanvasEvents(editorHost);
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
  validateButton.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await validateYaml(node);
    } catch (error) {
      setStatus(node, `Validation error: ${error.message}`);
    }
  });
  saveButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    saveYaml(node);
  });
  sectionButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openInsertDialog(node, "section");
  });
  tagButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openInsertDialog(node, "tag");
  });
  searchInput.addEventListener("input", () => {
    node.promptboardYamlEditorSearchState = null;
    scheduleYamlEditorSearch(node);
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    runYamlEditorSearch(node, event.shiftKey ? -1 : 1);
  });
  textarea.addEventListener("input", () => {
    setWidgetValue(node, "yaml_text", textarea.value);
    syncCodeMirrorFromWidget(node);
    invalidateYamlEditorSearch(node);
    setSaveReport(node, "Edited");
    app.canvas?.setDirty(true, true);
  });
  textarea.addEventListener("keydown", (event) => {
    handleYamlSaveShortcut(event, node) || handleYamlSearchShortcut(event, node);
  });

  toolbar.append(select, loadButton, validateButton, saveButton, sectionButton, tagButton);
  searchRow.append(searchInput, searchCount);
  editor.append(editorHost, textarea);
  root.append(toolbar, searchRow, editor, status);

  node.promptboardYamlEditorElement = root;
  node.promptboardYamlEditorSelect = select;
  node.promptboardYamlEditorSearchInput = searchInput;
  node.promptboardYamlEditorSearchCount = searchCount;
  node.promptboardYamlEditorEditorHost = editorHost;
  node.promptboardYamlEditorTextarea = textarea;
  node.promptboardYamlEditorStatusElement = status;

  syncEditorFromWidgets(node);
  createCodeMirrorEditor(node, editorHost, textarea);
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
  editorWidget.computeSize = (width) => [width ?? Number(node.size?.[0] ?? MIN_NODE_WIDTH), MIN_EDITOR_HEIGHT];
  editorWidget.computeLayoutSize = () => ({
    minHeight: MIN_EDITOR_HEIGHT,
    minWidth: MIN_NODE_WIDTH - PANEL_GUTTER,
  });
  return editorWidget;
}

function finalizeNode(node, info = null, isNewNode = false) {
  if (isNewNode) {
    node.size = [MIN_NODE_WIDTH, MIN_NODE_HEIGHT];
  }
  clampSize(node);
  node.resizable = true;
  hideSourceWidgets(node);
  ensureEditorWidget(node);
  syncEditorSize(node);
  scheduleEditorSizeSync(node);
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

    const onResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function () {
      const result = onResize?.apply(this, arguments);
      clampSize(this);
      syncEditorSize(this);
      app.canvas?.setDirty(true, true);
      return result;
    };
  },
});
