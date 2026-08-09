/**
 * Prompt Board node UI.
 */
import { app } from "../../../scripts/app.js";
import {
  ATTRIBUTE_STATE_KEY,
  attributeSelectedTexts,
  emptyAttributeState,
  normalizeAttributeState,
  setAttributeSelected,
} from "./promptboard_attribute_state.mjs";
import { normalizeYamlDocument } from "./promptboard_yaml.mjs";

const NODE_NAME = "PromptBoard";
const LAYOUT_WIDGET = "split_layout";
const RESET_BUTTON = "선택 초기화";
const SAVE_TEMPLATE_BUTTON = "Save";
const SAVE_TEMPLATE_NEW_BUTTON = "Save (New)";
const DELETE_TEMPLATE_BUTTON = "Delete";
const TEMPLATE_SAVE_MODE_SAVE = "save";
const TEMPLATE_SAVE_MODE_NEW = "new";
const DEFAULT_YAML_FILE = "default.yaml";
const INLINE_YAML_OPTION = "inline";
const HIDDEN_MARK = "__promptboardHiddenWidget";
const MIN_NODE_WIDTH = 600;
const MIN_NODE_HEIGHT = 360;
const MIN_LAYOUT_HEIGHT = 260;
const EDITOR_PANEL_WIDTH = 320;
const PANEL_GUTTER = 18;
const NODE_BOTTOM_PADDING = 20;
const SCROLL_BOTTOM_PADDING = 8;
const CODEMIRROR_MODULE = "../vendor/codemirror/promptboard-codemirror.bundle.js";
const CODEMIRROR_THEME_CSS = new URL("../vendor/codemirror/css/thema.css", import.meta.url).href;
const EDITOR_STORAGE_PREFIX = "promptboard:editor:v1";
const TEMPLATE_STORAGE_PREFIX = "promptboard:template:v1";
const SEARCH_DEBOUNCE_MS = 150;
const GROUP_ALL = "전체";
const DEFAULT_UI_GROUP = "기타";
const UI_GROUP_ACCENTS = {
  [GROUP_ALL]: "#8c98a4",
  "구도": "#5a8fd8",
  "포즈": "#8da66a",
  "몸": "#6aa66a",
  "얼굴": "#6aa66a",
  "헤어": "#6aa66a",
  "캐릭터": "#6aa66a",
  "파트너": "#7d9f79",
  "화면": "#5a8fd8",
  "장소": "#38a6b9",
  "화면/장소": "#38a6b9",
  "조명": "#d6b84a",
  "의상": "#9b7ad0",
  "세트의상": "#ad78a7",
  "색상": "#d6a94a",
  "기타": "#8c98a4",
  "상황": "#c77b7b",
};
const NAVIGATOR_LABEL_ACCENTS = {
  "화면": "#5a8fd8",
  "장소": "#38a6b9",
  "조명": "#d6b84a",
};
const FALLBACK_ACCENTS = ["#5a8fd8", "#38a6b9", "#6aa66a", "#9b7ad0", "#d6a94a", "#c77b7b", "#8c98a4"];
const PLACEHOLDER_UI_GROUPS = {
  "<PHOTOSHOT>": "구도",
  "<INTER>": "구도",
  "<GIRL_POS>": "포즈",
  "<GIRL_POSE>": "포즈",
  "<GIRL_BODY>": "몸",
  "<GIRL_FACE>": "얼굴",
  "<HAIR>": "헤어",
  "<CLOTHES>": "의상",
  "<LOCATION>": "장소",
  "<VIEW>": "화면",
  "<UCO>": "색상",
  "<TCO>": "색상",
  "<BCO>": "색상",
  "<OCO>": "색상",
  "<ECO>": "색상",
  "<HCO>": "색상",
  "<SHC>": "색상",
};

let codeMirrorModulePromise = null;

function isSplitNode(node) {
  return node?.comfyClass === NODE_NAME;
}

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

function promptboardActiveLine(cm) {
  const lineDecoration = cm.Decoration.line({ class: "cm-activeLine" });
  const activeLineField = cm.StateField.define({
    create: (state) => activeLineDecorations(cm, lineDecoration, state),
    update: (decorations, transaction) => {
      if (!transaction.docChanged && !transaction.selection) {
        return decorations;
      }
      return activeLineDecorations(cm, lineDecoration, transaction.state);
    },
    provide: (field) => cm.EditorView.decorations.from(field),
  });
  return activeLineField;
}

function activeLineDecorations(cm, lineDecoration, state) {
  if (state.selection.ranges.some((range) => !range.empty)) {
    return cm.Decoration.none;
  }
  const line = state.doc.lineAt(state.selection.main.head);
  return cm.Decoration.set([lineDecoration.range(line.from)]);
}

function currentWorkflowStorageKey() {
  const location = globalThis.location;
  if (!location) {
    return "unknown";
  }
  return `${location.pathname || "/"}${location.hash || ""}`;
}

function textSignature(text) {
  const source = String(text ?? "");
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${source.length}:${hash >>> 0}`;
}

function editorFoldStorageKey(node) {
  const nodeId = node?.id ?? "new";
  const yamlFile = widgetValue(node, "yaml_file", DEFAULT_YAML_FILE);
  return `${EDITOR_STORAGE_PREFIX}:${currentWorkflowStorageKey()}:${nodeId}:${yamlFile}:fold`;
}

function templateStorageKey(node) {
  const nodeId = node?.id ?? "new";
  return `${TEMPLATE_STORAGE_PREFIX}:${currentWorkflowStorageKey()}:${nodeId}:state`;
}

function readStoredEditorFold(node, text) {
  try {
    const raw = globalThis.localStorage?.getItem(editorFoldStorageKey(node));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed?.signature !== textSignature(text) || !Array.isArray(parsed?.fold)) {
      return null;
    }
    return parsed.fold;
  } catch {
    return null;
  }
}

function writeStoredEditorFold(node, cm, state) {
  try {
    const text = state.doc.toString();
    const json = state.toJSON({ fold: cm.foldState });
    globalThis.localStorage?.setItem(
      editorFoldStorageKey(node),
      JSON.stringify({
        signature: textSignature(text),
        fold: Array.isArray(json.fold) ? json.fold : [],
      }),
    );
  } catch {
    // UI state persistence should never block editing.
  }
}

function createEditorState(cm, node, text, extensions) {
  const fold = readStoredEditorFold(node, text);
  if (!fold) {
    return cm.EditorState.create({ doc: text, extensions });
  }

  try {
    return cm.EditorState.fromJSON(
      {
        doc: text,
        selection: { ranges: [{ anchor: 0, head: 0 }], main: 0 },
        fold,
      },
      { extensions },
      { fold: cm.foldState },
    );
  } catch {
    return cm.EditorState.create({ doc: text, extensions });
  }
}

function readStoredTemplateState(node) {
  try {
    const raw = globalThis.localStorage?.getItem(templateStorageKey(node));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return {
      selectedTemplate: typeof parsed?.selectedTemplate === "string" ? parsed.selectedTemplate : "",
      templateName: typeof parsed?.templateName === "string" ? parsed.templateName : "",
    };
  } catch {
    return null;
  }
}

function writeStoredTemplateState(node) {
  try {
    globalThis.localStorage?.setItem(
      templateStorageKey(node),
      JSON.stringify({
        selectedTemplate: node.promptboardSelectedTemplate ?? "",
        templateName: node.promptboardTemplateName ?? "",
      }),
    );
  } catch {
    // Template UI state is only a convenience cache.
  }
}

function restoreTemplateState(node) {
  const stored = readStoredTemplateState(node);
  if (!stored) {
    return;
  }
  node.promptboardSelectedTemplate = stored.selectedTemplate;
  node.promptboardTemplateName = stored.templateName || stored.selectedTemplate;
}

function updateYamlTextFromEditor(node, text) {
  setWidgetValue(node, "yaml_text", text);
  renderFromYaml(node);
  app.canvas?.setDirty(true, true);
}

function setYamlEditorText(node, text) {
  const value = String(text ?? "");
  setWidgetValue(node, "yaml_text", value);

  if (node.promptboardTextarea && node.promptboardTextarea.value !== value) {
    node.promptboardTextarea.value = value;
  }

  const view = node.promptboardCodeMirror;
  if (!view) {
    return;
  }

  const current = view.state.doc.toString();
  if (current === value) {
    return;
  }

  node.promptboardIgnoreCodeMirrorUpdate = true;
  try {
    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: value,
      },
    });
  } finally {
    node.promptboardIgnoreCodeMirrorUpdate = false;
  }
}

function lineStartOffset(text, lineIndex) {
  let offset = 0;
  for (let index = 0; index < lineIndex; index += 1) {
    offset += String(text[index] ?? "").length + 1;
  }
  return offset;
}

function scrollTextareaToOffset(textarea, text, offset) {
  textarea.setSelectionRange(offset, offset);

  const lineIndex = String(text.slice(0, offset)).split("\n").length - 1;
  const lineHeight = Number.parseFloat(getComputedStyle(textarea).lineHeight) || 14;
  const targetTop = Math.max(0, lineIndex * lineHeight - textarea.clientHeight / 2);
  textarea.scrollTop = targetTop;
}

function setYamlSearchInvalid(node, invalid) {
  node.promptboardYamlSearchInput?.classList.toggle("is-invalid", invalid);
}

function setYamlSearchCount(node, current, total) {
  const count = node.promptboardYamlSearchCount;
  if (!count) {
    return;
  }
  count.textContent = total > 0 ? `${current}/${total}` : total === 0 ? "0/0" : "";
}

function setYamlSearchHighlight(node, match) {
  const view = node.promptboardCodeMirror;
  const effect = node.promptboardSearchLineEffect;
  if (!view || !effect) {
    return;
  }
  view.dispatch({
    effects: effect.of(match ? match.offset : null),
  });
}

function findYamlSearchMatches(text, pattern) {
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

function yamlSearchState(node, pattern, text) {
  const signature = textSignature(text);
  const current = node.promptboardYamlSearchState;
  if (current?.pattern === pattern && current?.signature === signature) {
    return current;
  }

  const next = {
    pattern,
    signature,
    index: -1,
    matches: findYamlSearchMatches(text, pattern),
  };
  node.promptboardYamlSearchState = next;
  return next;
}

function scrollYamlEditorToMatch(node, match) {
  if (!match) {
    return;
  }

  const view = node.promptboardCodeMirror;
  if (view) {
    view.dispatch({
      selection: { anchor: match.offset },
      scrollIntoView: true,
    });
    return;
  }

  const textarea = node.promptboardTextarea;
  if (textarea) {
    scrollTextareaToOffset(textarea, widgetValue(node, "yaml_text", ""), match.offset);
  }
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findTopLevelYamlBlock(lines, key) {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(?:#.*)?$`);
  let start = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (pattern.test(lines[index])) {
      start = index;
      break;
    }
  }
  if (start < 0) {
    return null;
  }

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[^\s#][^:]*:\s*(?:#.*)?$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { start, end, indent: 0 };
}

function findNestedYamlBlock(lines, parentBlock, key) {
  if (!parentBlock) {
    return null;
  }
  const indent = Number(parentBlock.indent ?? 0) + 2;
  const pattern = new RegExp(`^\\s{${indent}}${escapeRegExp(key)}:\\s*(?:#.*)?$`);
  let start = -1;
  for (let index = parentBlock.start + 1; index < parentBlock.end; index += 1) {
    if (pattern.test(lines[index])) {
      start = index;
      break;
    }
  }
  if (start < 0) {
    return null;
  }

  let end = parentBlock.end;
  const siblingPattern = new RegExp(`^\\s{${indent}}[^\\s#][^:]*:\\s*(?:#.*)?$`);
  for (let index = start + 1; index < parentBlock.end; index += 1) {
    if (siblingPattern.test(lines[index])) {
      end = index;
      break;
    }
  }
  return { start, end, indent };
}

function yamlLineMatch(lines, lineIndex) {
  return {
    lineIndex,
    offset: lineStartOffset(lines, lineIndex),
  };
}

function findYamlCategoryMatch(text, category) {
  const lines = String(text ?? "").split("\n");
  const block = findTopLevelYamlBlock(lines, category);
  return block ? yamlLineMatch(lines, block.start) : null;
}

function findYamlTagMatch(text, category, tagText) {
  const lines = String(text ?? "").split("\n");
  const block = findTopLevelYamlBlock(lines, category);
  if (!block) {
    return null;
  }
  const needle = String(tagText ?? "");
  for (let index = block.start + 1; index < block.end; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("-") && lines[index].includes(needle)) {
      return yamlLineMatch(lines, index);
    }
  }
  return yamlLineMatch(lines, block.start);
}

function findYamlTagSetMatch(text, tagSetId, tagText) {
  const lines = String(text ?? "").split("\n");
  const rootBlock = findTopLevelYamlBlock(lines, "_promptboard");
  const tagSetsBlock = findNestedYamlBlock(lines, rootBlock, "tagSets");
  const tagSetBlock = findNestedYamlBlock(lines, tagSetsBlock, tagSetId);
  if (!tagSetBlock) {
    return null;
  }
  const needle = String(tagText ?? "");
  if (!needle) {
    return yamlLineMatch(lines, tagSetBlock.start);
  }
  for (let index = tagSetBlock.start + 1; index < tagSetBlock.end; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("-") && lines[index].includes(needle)) {
      return yamlLineMatch(lines, index);
    }
  }
  return yamlLineMatch(lines, tagSetBlock.start);
}

function focusYamlSourceMatch(node, match) {
  if (!isYamlPanelOpen(node) || !match) {
    return;
  }
  setYamlSearchHighlight(node, match);
  scrollYamlEditorToMatch(node, match);
}

function focusYamlCategory(node, category) {
  focusYamlSourceMatch(node, findYamlCategoryMatch(widgetValue(node, "yaml_text", ""), category));
}

function focusYamlCategoryTag(node, category, tagText) {
  focusYamlSourceMatch(node, findYamlTagMatch(widgetValue(node, "yaml_text", ""), category, tagText));
}

function focusYamlAttributeTag(node, boardId, targetId, attributeId, tagText) {
  const source = node.promptboardYamlModel
    ?.attributeBoards?.[boardId]
    ?.targets?.[targetId]
    ?.attributes?.[attributeId]
    ?.source;
  if (!source) {
    return;
  }
  focusYamlSourceMatch(node, findYamlTagSetMatch(widgetValue(node, "yaml_text", ""), source, tagText));
}

function focusYamlNavigatorItem(node, item) {
  if (item?.kind === "attribute") {
    focusYamlAttributeTag(node, item.boardId, item.targetId, item.attributeId, "");
    return;
  }
  if (item?.kind === "attributeTarget") {
    const attributeId = Object.keys(item.attributes ?? {})[0] ?? "";
    focusYamlAttributeTag(node, item.boardId, item.targetId, attributeId, "");
    return;
  }
  if (item?.kind === "category") {
    focusYamlCategory(node, item.category);
  }
}

function focusYamlBoardSearchMatch(node, match) {
  if (!match) {
    return;
  }
  if (match.kind === "attribute") {
    focusYamlAttributeTag(node, match.boardId, match.targetId, match.attributeId, match.tagText);
  } else if (match.tagText) {
    focusYamlCategoryTag(node, match.category, match.tagText);
  } else {
    focusYamlCategory(node, match.category);
  }
}

function runYamlSearch(node, direction = 0) {
  const input = node.promptboardYamlSearchInput;
  const pattern = String(input?.value ?? "").trim();
  if (!pattern) {
    setYamlSearchInvalid(node, false);
    node.promptboardYamlSearchState = null;
    setYamlSearchCount(node, -1, -1);
    setYamlSearchHighlight(node, null);
    return;
  }

  const text = widgetValue(node, "yaml_text", "");
  let state = null;
  try {
    state = yamlSearchState(node, pattern, text);
  } catch (error) {
    setYamlSearchInvalid(node, true);
    setYamlSearchCount(node, -1, -1);
    setYamlSearchHighlight(node, null);
    setStatus(node, `Search regex error: ${error.message}`);
    return;
  }

  setYamlSearchInvalid(node, false);
  if (!state.matches.length) {
    setYamlSearchCount(node, 0, 0);
    setYamlSearchHighlight(node, null);
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
  setYamlSearchCount(node, state.index + 1, state.matches.length);
  setYamlSearchHighlight(node, match);
  scrollYamlEditorToMatch(node, match);
  setStatus(node, "");
}

function scheduleYamlSearch(node) {
  if (node.promptboardYamlSearchTimer) {
    clearTimeout(node.promptboardYamlSearchTimer);
  }
  node.promptboardYamlSearchTimer = setTimeout(() => {
    node.promptboardYamlSearchTimer = null;
    runYamlSearch(node);
  }, SEARCH_DEBOUNCE_MS);
}

function handleYamlSaveShortcut(event, node) {
  if (!(event.metaKey || event.ctrlKey) || event.key?.toLowerCase() !== "s") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  saveSelectedYaml(node);
  return true;
}

function handleTemplateSaveShortcut(event, node) {
  if (!(event.metaKey || event.ctrlKey) || event.key?.toLowerCase() !== "s") {
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  saveBoardTemplateWithSelectedMode(node, node.promptboardTemplateInput?.value ?? node.promptboardTemplateName ?? "");
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

    node.promptboardCodeMirror?.destroy?.();
    const theme = cm.EditorView.theme(
      {
        "&": {
          height: "100%",
          fontSize: "11px",
        },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily: "Menlo, Consolas, monospace",
          lineHeight: "1.35",
        },
        ".cm-content": {
          padding: "6px 0",
        },
        ".cm-line": {
          padding: "0 6px",
        },
        ".cm-foldGutter": {
          width: "12px",
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
          saveSelectedYaml(node);
          return true;
        },
      },
      cm.indentWithTab,
      ...cm.foldKeymap,
      ...cm.historyKeymap,
      ...cm.defaultKeymap,
    ]);

    const view = new cm.EditorView({
      state: createEditorState(
        cm,
        node,
        widgetValue(node, "yaml_text", ""),
        [
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
          cm.EditorView.updateListener.of((update) => {
            if (!update.docChanged || node.promptboardIgnoreCodeMirrorUpdate) {
              return;
            }
            const text = update.state.doc.toString();
            if (textarea.value !== text) {
              textarea.value = text;
            }
            updateYamlTextFromEditor(node, text);
          }),
          cm.EditorView.updateListener.of((update) => {
            if (node.promptboardIgnoreCodeMirrorUpdate) {
              return;
            }
            const previousFold = update.startState.field(cm.foldState, false);
            const currentFold = update.state.field(cm.foldState, false);
            if (update.docChanged || previousFold !== currentFold) {
              writeStoredEditorFold(node, cm, update.state);
            }
          }),
          theme,
          saveKeymap,
        ],
      ),
      parent: host,
    });

    stopCanvasEvents(view.dom);
    view.dom.addEventListener("keydown", (event) => {
      handleYamlSaveShortcut(event, node);
    }, { capture: true });
    node.promptboardCodeMirror = view;
    node.promptboardSearchLineEffect = setSearchLineEffect;
    textarea.style.display = "none";
    host.style.display = "block";
    syncLayoutSize(node);
  } catch (error) {
    console.warn("PromptBoard CodeMirror load failed; falling back to textarea.", error);
    host.style.display = "none";
    textarea.style.display = "block";
  }
}

function normalizeUiGroup(value) {
  return String(value ?? "").trim();
}

function hashText(value) {
  const text = String(value ?? "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash, 31) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function accentForLabel(label) {
  const normalized = normalizeUiGroup(label) || DEFAULT_UI_GROUP;
  if (UI_GROUP_ACCENTS[normalized]) {
    return UI_GROUP_ACCENTS[normalized];
  }
  return FALLBACK_ACCENTS[hashText(normalized) % FALLBACK_ACCENTS.length];
}

function setAccent(element, accent) {
  element?.style?.setProperty("--promptboard-accent", accent || accentForLabel(DEFAULT_UI_GROUP));
}

function inferUiGroup(item) {
  const placeholder = String(item?.placeholder ?? "").trim();
  return PLACEHOLDER_UI_GROUPS[placeholder] || DEFAULT_UI_GROUP;
}

function categoryUiGroup(item) {
  return normalizeUiGroup(item?.uiGroup) || inferUiGroup(item);
}

function categoryLabel(category, item) {
  const label = String(item?.label || "").trim();
  if (label) {
    return label;
  }
  const [prefix, ...suffix] = String(category ?? "").split("_");
  return prefix && suffix.length ? suffix.join("/") : String(category ?? "");
}

function attributeBoardUiGroup(board) {
  return normalizeUiGroup(board?.uiGroup) || DEFAULT_UI_GROUP;
}

function navigatorItemAccent(item) {
  if (!item) {
    return accentForLabel(DEFAULT_UI_GROUP);
  }
  const labelAccent = NAVIGATOR_LABEL_ACCENTS[item.label];
  if (labelAccent) {
    return labelAccent;
  }
  return accentForLabel(item.uiGroup || item.context);
}

function availableUiGroups(config, attributeBoards = {}) {
  const groups = new Set();
  for (const item of Object.values(config ?? {})) {
    groups.add(categoryUiGroup(item));
  }
  for (const board of Object.values(attributeBoards ?? {})) {
    groups.add(attributeBoardUiGroup(board));
  }
  return [...groups];
}

function activeUiGroup(node, config = node.promptboardConfig ?? {}) {
  const groups = availableUiGroups(config, node.promptboardYamlModel?.attributeBoards);
  const active = normalizeUiGroup(node.promptboardActiveUiGroup) || GROUP_ALL;
  if (active === GROUP_ALL || groups.includes(active)) {
    return active;
  }
  node.promptboardActiveUiGroup = GROUP_ALL;
  return GROUP_ALL;
}

function categoryMatchesActiveUiGroup(node, item) {
  const active = activeUiGroup(node);
  return active === GROUP_ALL || categoryUiGroup(item) === active;
}

function visibleCategoryEntries(node) {
  const config = node.promptboardConfig ?? {};
  return Object.entries(config).filter(([, item]) => categoryMatchesActiveUiGroup(node, item));
}

function visibleAttributeBoardEntries(node) {
  const active = activeUiGroup(node);
  return Object.entries(node.promptboardYamlModel?.attributeBoards ?? {}).filter(([, board]) =>
    active === GROUP_ALL || attributeBoardUiGroup(board) === active,
  );
}

function navigatorItemId(item) {
  if (!item) {
    return "";
  }
  if (item.kind === "attribute" || item.kind === "attributeTarget") {
    return `attributeTarget\u0000${item.boardId}\u0000${item.targetId}`;
  }
  return `category\u0000${item.category}`;
}

function navigatorItemFromMatch(match) {
  if (!match) {
    return "";
  }
  return match.kind === "attribute"
    ? navigatorItemId({ kind: "attributeTarget", boardId: match.boardId, targetId: match.targetId })
    : navigatorItemId({ kind: "category", category: match.category });
}

function tagDisplayLabel(tag) {
  const sourceLabel = String(tag?.label || tag?.text || "");
  const tagText = String(tag?.text ?? "");
  return sourceLabel && sourceLabel !== tagText ? `[${sourceLabel}] ${tagText}` : tagText;
}

function tagButtonDisplayLabel(tag) {
  return String(tag?.label || tag?.text || "");
}

function tagButtonTitle(tag, displayLabel) {
  const description = String(tag?.description ?? "").trim();
  const tagText = String(tag?.text ?? "").trim();
  if (description && tagText) {
    return `${description}\n태그: ${tagText}`;
  }
  return description || tagText || displayLabel;
}

function tagItemsForTags(tags = [], tagItems = null) {
  return Array.isArray(tagItems) && tagItems.length
    ? tagItems
    : tags.map((tag) => ({ kind: "tag", tag }));
}

function tagItemsForCategory(item) {
  return tagItemsForTags(item?.tags ?? [], item?.tagItems);
}

function tagItemsForTagSet(tagSet) {
  return tagItemsForTags(tagSet?.tags ?? [], tagSet?.tagItems);
}

function navigatorItems(node) {
  const items = [];
  for (const [category, item] of visibleCategoryEntries(node)) {
    const uiGroup = categoryUiGroup(item);
    items.push({
      kind: "category",
      category,
      label: categoryLabel(category, item),
      context: uiGroup,
      uiGroup,
      tags: item.tags ?? [],
      tagItems: tagItemsForCategory(item),
    });
  }
  for (const [boardId, board] of visibleAttributeBoardEntries(node)) {
    const uiGroup = attributeBoardUiGroup(board);
    for (const [targetId, target] of Object.entries(board.targets ?? {})) {
      items.push({
        kind: "attributeTarget",
        boardId,
        targetId,
        label: target.label || targetId,
        context: board.label || boardId,
        uiGroup,
        attributes: target.attributes ?? {},
      });
    }
  }
  return items;
}

function navigatorItemCount(node, item) {
  const state = node.promptboardState ?? {};
  if (item?.kind === "attribute") {
    return attributeSelectedTexts(state, item.boardId, item.targetId, item.attributeId).length;
  }
  if (item?.kind === "attributeTarget") {
    const target = node.promptboardYamlModel?.attributeBoards?.[item.boardId]?.targets?.[item.targetId];
    return attributeCountForTarget(state, item.boardId, item.targetId, target);
  }
  return selectedCount(state, item?.category, item?.tags ?? []);
}

function activeNavigatorItem(node, items = navigatorItems(node)) {
  if (!items.length) {
    node.promptboardNavigatorItemId = "";
    return null;
  }
  const activeId = node.promptboardNavigatorItemId || "";
  const active = items.find((item) => navigatorItemId(item) === activeId);
  if (active) {
    return active;
  }
  const selected = items.find((item) => navigatorItemCount(node, item) > 0);
  const next = selected || items[0];
  node.promptboardNavigatorItemId = navigatorItemId(next);
  return next;
}

function setActiveNavigatorItem(node, id) {
  node.promptboardNavigatorItemId = id;
}

function parseSelectedState(node) {
  try {
    const parsed = JSON.parse(widgetValue(node, "selected_state", "{}") || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function selectedTextsForCategory(category, tags, selectedState) {
  if (Object.prototype.hasOwnProperty.call(selectedState, category)) {
    let selected = selectedState[category];
    if (selected && typeof selected === "object" && !Array.isArray(selected)) {
      selected = selected.selected;
    }
    if (Array.isArray(selected)) {
      const selectedSet = new Set(selected.map((item) => String(item)));
      return tags.map((tag) => tag.text).filter((text) => selectedSet.has(text));
    }
  }

  return tags.filter((tag) => tag.default).map((tag) => tag.text);
}

function pruneSelectedState(model, selectedState, warnings = []) {
  const config = model.categories ?? {};
  const nextState = {};
  for (const [category, item] of Object.entries(config)) {
    const tagTexts = new Set(item.tags.map((tag) => tag.text));
    nextState[category] = selectedTextsForCategory(category, item.tags, selectedState).filter((text) =>
      tagTexts.has(text),
    );
  }
  if (Object.keys(model.attributeBoards ?? {}).length) {
    nextState[ATTRIBUTE_STATE_KEY] = normalizeAttributeState(model, selectedState, warnings);
  }
  return nextState;
}

function selectedCount(state, category, tags) {
  const selected = new Set(Array.isArray(state[category]) ? state[category].map((item) => String(item)) : []);
  return tags.filter((tag) => selected.has(tag.text)).length;
}

function selectedCountsByUiGroup(config, attributeBoards, state) {
  const counts = { [GROUP_ALL]: 0 };
  for (const [category, item] of Object.entries(config ?? {})) {
    const count = selectedCount(state, category, item.tags ?? []);
    const group = categoryUiGroup(item);
    counts[GROUP_ALL] += count;
    counts[group] = (counts[group] ?? 0) + count;
  }
  for (const [boardId, board] of Object.entries(attributeBoards ?? {})) {
    const count = Object.entries(board.targets ?? {}).reduce(
      (boardTotal, [targetId, target]) =>
        boardTotal + attributeCountForTarget(state, boardId, targetId, target),
      0,
    );
    const group = attributeBoardUiGroup(board);
    counts[GROUP_ALL] += count;
    counts[group] = (counts[group] ?? 0) + count;
  }
  return counts;
}

function setSelected(state, category, tagText, enabled) {
  const selected = new Set(Array.isArray(state[category]) ? state[category].map((item) => String(item)) : []);
  if (enabled) {
    selected.add(tagText);
  } else {
    selected.delete(tagText);
  }
  state[category] = [...selected];
}

function syncState(node, state) {
  setWidgetValue(node, "selected_state", JSON.stringify(state));
  node.promptboardState = state;
  app.canvas?.setDirty(true, true);
}

function resetSelection(node) {
  const config = node.promptboardConfig ?? {};
  const state = {};

  for (const category of Object.keys(config)) {
    state[category] = [];
  }
  if (Object.keys(node.promptboardYamlModel?.attributeBoards ?? {}).length) {
    Object.assign(state, emptyAttributeState(node.promptboardYamlModel));
  }

  syncState(node, state);
  renderCards(node);
  if (node.promptboardScroll) {
    node.promptboardScroll.scrollTop = 0;
  }
}

function compileSearchRegex(input) {
  const query = String(input ?? "").trim();
  if (!query) {
    return null;
  }
  return new RegExp(query, "i");
}

function collectBoardSearchMatches(node, regex) {
  const matches = [];
  for (const [category, item] of visibleCategoryEntries(node)) {
    const uiGroup = categoryUiGroup(item);
    const label = categoryLabel(category, item);
    if (regex.test(category) || regex.test(label)) {
      matches.push({ kind: "category", category, tagText: "", label, description: "", uiGroup });
    }
    for (const tag of item.tags ?? []) {
      const label = tag.label || tag.text;
      const description = tag.description || "";
      if (regex.test(label) || regex.test(tag.text) || regex.test(description)) {
        matches.push({
          kind: "category",
          category,
          tagText: tag.text,
          label: String(label),
          description: String(description),
          uiGroup,
        });
      }
    }
  }
  for (const [boardId, board] of visibleAttributeBoardEntries(node)) {
    const uiGroup = attributeBoardUiGroup(board);
    for (const [targetId, target] of Object.entries(board.targets ?? {})) {
      for (const [attributeId, attribute] of Object.entries(target.attributes ?? {})) {
        const tagSet = node.promptboardYamlModel?.tagSets?.[attribute.source];
        for (const tag of tagSet?.tags ?? []) {
          const label = tag.label || tag.text;
          const description = tag.description || "";
          if (regex.test(label) || regex.test(tag.text) || regex.test(description)) {
            matches.push({
              kind: "attribute",
              boardId,
              targetId,
              attributeId,
              tagText: tag.text,
              label: String(label),
              description: String(description),
              uiGroup,
              context: `${board.label || boardId} / ${target.label || targetId} / ${attribute.label || attributeId}`,
            });
          }
        }
      }
    }
  }
  return matches;
}

function boardSearchMatchKey(match) {
  return match?.kind === "attribute"
    ? `attribute\u0000${match.boardId}\u0000${match.targetId}\u0000${match.attributeId}\u0000${match.tagText}`
    : `category\u0000${match?.category}\u0000${match?.tagText}`;
}

function currentBoardSearchMatch(node) {
  const state = node.promptboardBoardSearchState;
  if (!state || state.index < 0 || !Array.isArray(state.matches)) {
    return null;
  }
  return state.matches[state.index] ?? null;
}

function isCurrentBoardSearchMatch(node, category, tagText = "") {
  const match = currentBoardSearchMatch(node);
  return !!match && boardSearchMatchKey(match) === boardSearchMatchKey({ kind: "category", category, tagText });
}

function isCurrentAttributeSearchMatch(node, boardId, targetId, attributeId, tagText) {
  const match = currentBoardSearchMatch(node);
  return !!match && boardSearchMatchKey(match) === boardSearchMatchKey({
    kind: "attribute",
    boardId,
    targetId,
    attributeId,
    tagText,
  });
}

function setBoardSearchCount(node, current, total) {
  const count = node.promptboardBoardSearchCount;
  if (!count) {
    return;
  }
  count.textContent = total > 0 ? `${current}/${total}` : total === 0 ? "0/0" : "";
}

function hideBoardSearchMenu(node) {
  const menu = node.promptboardBoardSearchMenu;
  if (menu) {
    menu.remove();
  }
  node.promptboardBoardSearchInput?.setAttribute("aria-expanded", "false");
}

function showBoardSearchMenu(node) {
  const input = node.promptboardBoardSearchInput;
  const row = node.promptboardBoardSearchRow;
  const menu = node.promptboardBoardSearchMenu;
  if (!input || !row || !menu || document.activeElement !== input) {
    hideBoardSearchMenu(node);
    return;
  }

  const rect = row.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 2}px`;
  menu.style.width = `${rect.width}px`;
  menu.style.maxHeight = `${Math.max(96, Math.min(280, window.innerHeight - rect.bottom - 8))}px`;
  if (!menu.parentElement) {
    document.body.append(menu);
  }
  input.setAttribute("aria-expanded", "true");
}

function boardSearchMatchSelected(node, match) {
  if (!match?.tagText) {
    return false;
  }
  if (match.kind === "attribute") {
    return attributeSelectedTexts(
      node.promptboardState,
      match.boardId,
      match.targetId,
      match.attributeId,
    ).includes(match.tagText);
  }
  const selected = node.promptboardState?.[match.category];
  return Array.isArray(selected) && selected.includes(match.tagText);
}

function renderBoardSearchMenu(node) {
  const input = node.promptboardBoardSearchInput;
  const menu = node.promptboardBoardSearchMenu;
  const state = node.promptboardBoardSearchState;
  if (!input || !menu || !String(input.value ?? "").trim()) {
    hideBoardSearchMenu(node);
    return;
  }

  menu.replaceChildren();
  const matches = Array.isArray(state?.matches) ? state.matches : [];
  if (node.promptboardBoardSearchError) {
    const empty = document.createElement("div");
    empty.className = "promptboard-search-menu-empty";
    empty.textContent = node.promptboardBoardSearchError;
    menu.append(empty);
    showBoardSearchMenu(node);
    return;
  }
  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "promptboard-search-menu-empty";
    empty.textContent = "No matches";
    menu.append(empty);
    showBoardSearchMenu(node);
    return;
  }

  matches.forEach((match, index) => {
    const option = document.createElement("button");
    const heading = document.createElement("span");
    const label = document.createElement("span");
    const selected = document.createElement("span");
    const tagText = document.createElement("span");
    const context = document.createElement("span");
    const isActive = index === state.index;
    const isSelected = boardSearchMatchSelected(node, match);

    option.type = "button";
    option.className = `promptboard-search-menu-option${isActive ? " is-active" : ""}`;
    option.dataset.index = String(index);
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(isActive));
    option.title = match.description || match.tagText || match.category || match.context;
    heading.className = "promptboard-search-menu-heading";
    label.className = "promptboard-search-menu-label";
    label.textContent = match.label || match.tagText || match.category || match.context;
    selected.className = "promptboard-search-menu-selected";
    selected.textContent = isSelected ? "선택됨" : "";
    heading.append(label, selected);
    option.append(heading);

    if (match.tagText && match.tagText !== match.label) {
      tagText.className = "promptboard-search-menu-tag";
      tagText.textContent = match.tagText;
      option.append(tagText);
    }
    context.className = "promptboard-search-menu-context";
    context.textContent = `${match.context || match.category} · ${match.uiGroup}`;
    option.append(context);
    option.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    option.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigateToBoardSearchMatch(node, index);
    });
    menu.append(option);
  });

  showBoardSearchMenu(node);
  menu.querySelector(".promptboard-search-menu-option.is-active")?.scrollIntoView({ block: "nearest" });
}

function setBoardSearchMenuIndex(node, index) {
  const state = node.promptboardBoardSearchState;
  if (!state?.matches?.length) {
    return;
  }
  state.index = (index + state.matches.length) % state.matches.length;
  setBoardSearchCount(node, state.index + 1, state.matches.length);
  renderBoardSearchMenu(node);
}

function findBoardSearchElement(node, match) {
  const scroll = node.promptboardScroll;
  if (!scroll || !match) {
    return null;
  }
  const roots = [scroll, node.promptboardNavigatorRailHost].filter(Boolean);

  if (match.kind === "attribute") {
    for (const element of scroll.querySelectorAll(".promptboard-tag")) {
      if (
        element.dataset.boardId === match.boardId &&
        element.dataset.targetId === match.targetId &&
        element.dataset.attributeId === match.attributeId &&
        element.dataset.tagText === match.tagText
      ) {
        return element;
      }
    }
    return null;
  }

  const selector = match.tagText ? ".promptboard-tag" : ".promptboard-navigator-category";
  for (const root of roots) {
    for (const element of root.querySelectorAll(selector)) {
      if (element.dataset.category !== match.category) {
        continue;
      }
      if (!match.tagText || element.dataset.tagText === match.tagText) {
        return element;
      }
    }
  }
  return null;
}

function scrollBoardElementIntoView(node, element) {
  const scroll = node.promptboardScroll;
  if (!scroll || !element) {
    return;
  }

  const scrollTarget = element.closest(".promptboard-navigator-category-rail") || scroll;
  const scrollRect = scrollTarget.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  scrollTarget.scrollTop += elementRect.top - scrollRect.top - 6;
}

function navigateToBoardSearchMatch(node, index) {
  const state = node.promptboardBoardSearchState;
  if (!state?.matches?.length) {
    return;
  }

  state.index = (index + state.matches.length) % state.matches.length;
  const match = state.matches[state.index];
  setActiveNavigatorItem(node, navigatorItemFromMatch(match));
  setBoardSearchCount(node, state.index + 1, state.matches.length);
  renderCards(node);
  hideBoardSearchMenu(node);
  focusYamlBoardSearchMatch(node, match);
  requestAnimationFrame(() => {
    scrollBoardElementIntoView(node, findBoardSearchElement(node, match));
  });
}

function runBoardSearch(node, direction = 0) {
  const input = node.promptboardBoardSearchInput;
  if (!input) {
    return;
  }

  input.classList.remove("is-invalid");
  node.promptboardBoardSearchError = "";
  const query = String(input.value ?? "").trim();
  let regex = null;
  try {
    regex = compileSearchRegex(query);
  } catch {
    node.promptboardBoardSearchState = null;
    node.promptboardBoardSearchError = "Invalid search pattern";
    setBoardSearchCount(node, -1, -1);
    input.classList.add("is-invalid");
    renderCards(node);
    renderBoardSearchMenu(node);
    return;
  }

  if (!regex) {
    node.promptboardBoardSearchState = null;
    setBoardSearchCount(node, -1, -1);
    renderCards(node);
    hideBoardSearchMenu(node);
    return;
  }

  const matches = collectBoardSearchMatches(node, regex);
  if (!matches.length) {
    node.promptboardBoardSearchState = { query, matches, index: -1 };
    setBoardSearchCount(node, 0, 0);
    renderCards(node);
    renderBoardSearchMenu(node);
    return;
  }

  const previous = node.promptboardBoardSearchState;
  let index = 0;
  if (previous?.query === query && previous.index >= 0) {
    const previousMatch = previous.matches?.[previous.index];
    const previousKey = previousMatch ? boardSearchMatchKey(previousMatch) : "";
    const previousIndex = matches.findIndex((match) => boardSearchMatchKey(match) === previousKey);
    index = previousIndex >= 0 ? previousIndex : 0;
    if (direction) {
      index = (index + direction + matches.length) % matches.length;
    }
  } else if (direction < 0) {
    index = matches.length - 1;
  }

  node.promptboardBoardSearchState = { query, matches, index };
  setBoardSearchCount(node, index + 1, matches.length);
  if (direction) {
    navigateToBoardSearchMatch(node, index);
  } else {
    renderCards(node);
    renderBoardSearchMenu(node);
  }
}

function scheduleBoardSearch(node) {
  if (node.promptboardBoardSearchTimer) {
    clearTimeout(node.promptboardBoardSearchTimer);
  }
  node.promptboardBoardSearchTimer = setTimeout(() => {
    node.promptboardBoardSearchTimer = null;
    runBoardSearch(node);
  }, SEARCH_DEBOUNCE_MS);
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
  hideWidget(widget(node, "selected_state"), true);
}

function clampSize(node) {
  const width = Math.max(MIN_NODE_WIDTH, Number(node.size?.[0]) || MIN_NODE_WIDTH);
  const height = Math.max(MIN_NODE_HEIGHT, Number(node.size?.[1]) || MIN_NODE_HEIGHT);
  node.size = [width, height];
}

function layoutTopInfo(node) {
  const item = widget(node, LAYOUT_WIDGET);
  const top = Number(item?.y ?? item?.last_y);
  if (Number.isFinite(top) && top > 0) {
    return { top, stable: true };
  }
  return { top: 78, stable: false };
}

function layoutHeight(node) {
  const topInfo = layoutTopInfo(node);
  if (!topInfo.stable && !node.promptboardLayoutReady) {
    return MIN_LAYOUT_HEIGHT;
  }
  return Math.max(
    MIN_LAYOUT_HEIGHT,
    Math.floor(Number(node.size?.[1] ?? MIN_NODE_HEIGHT) - topInfo.top - NODE_BOTTOM_PADDING),
  );
}

function ensureStyles() {
  if (document.getElementById("promptboard-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "promptboard-styles";
  style.textContent = `
	    .promptboard {
	      --promptboard-accent: #8c98a4;
	      box-sizing: border-box;
	      display: grid;
		      grid-template-columns: minmax(0, 1fr) 22px minmax(0, var(--promptboard-yaml-width, 0px));
	      column-gap: 0;
	      width: 100%;
	      height: 100%;
      padding: 0;
      color: #e0e0e0;
      font: 11px Arial, sans-serif;
    }

	    .promptboard-panel {
	      box-sizing: border-box;
	      min-width: 0;
      min-height: 0;
      display: grid;
      grid-template-rows: auto auto 1fr auto auto;
      gap: 6px;
      border: 1px solid rgba(95, 95, 95, 0.8);
      background: rgba(35, 35, 35, 0.96);
      padding: 6px;
	      overflow: hidden;
	    }

		    .promptboard-yaml-panel {
		      grid-template-rows: minmax(0, 1fr);
		      width: var(--promptboard-yaml-width, 0px);
		      max-width: 100%;
		      transition: width 120ms ease;
		    }

	    .promptboard-yaml-panel.is-collapsed {
	      border-width: 0;
	      padding: 0;
	    }

	    .promptboard-yaml-toggle {
	      box-sizing: border-box;
	      align-self: stretch;
	      justify-self: stretch;
	      width: 18px;
	      min-width: 18px;
	      height: 100%;
	      margin: 0 2px;
	      padding: 0;
	      border: 1px solid rgba(90, 90, 90, 0.82);
	      border-radius: 3px;
	      background: rgba(28, 28, 28, 0.72);
	      color: #cfcfcf;
	      display: flex;
	      align-items: center;
	      justify-content: center;
	      font: 18px Arial, sans-serif;
	      line-height: 1;
	      cursor: pointer;
	      white-space: nowrap;
	    }

	    .promptboard-yaml-toggle:hover {
	      border-color: rgba(120, 170, 220, 0.95);
	      background: rgba(46, 72, 96, 0.86);
	      color: #ffffff;
	    }

	    .promptboard-yaml-content {
	      display: grid;
	      grid-template-rows: auto auto 1fr auto auto;
	      gap: 6px;
	      min-width: 0;
	      min-height: 0;
	    }

	    .promptboard-yaml-panel.is-collapsed .promptboard-yaml-content {
	      display: none;
	    }

	    .promptboard-right {
	      grid-template-rows: auto auto auto auto minmax(0, 1fr);
	    }

    .promptboard-toolbar {
      display: grid;
      grid-template-rows: auto auto;
      gap: 4px;
      min-width: 0;
    }

    .promptboard-toolbar-template-row {
      display: grid;
      grid-template-columns: minmax(104px, 0.95fr) minmax(118px, 1.35fr) minmax(70px, 88px) minmax(58px, 76px);
      gap: 4px;
      min-width: 0;
    }

    .promptboard-toolbar-search-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(96px, 128px);
      gap: 4px;
      min-width: 0;
    }

    .promptboard-select,
    .promptboard-input,
    .promptboard-textarea,
    .promptboard-button {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid rgba(120, 120, 120, 0.78);
      border-radius: 3px;
      background: rgba(28, 28, 28, 0.96);
      color: #e0e0e0;
      font: 11px Arial, sans-serif;
    }

    .promptboard-select,
    .promptboard-input,
    .promptboard-button {
      height: 22px;
    }

    .promptboard-input {
      padding: 0 6px;
    }

    .promptboard-search-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 42px;
      min-width: 0;
    }

    .promptboard-search-row .promptboard-input {
      border-right: 0;
      border-radius: 3px 0 0 3px;
    }

    .promptboard-search-count {
      box-sizing: border-box;
      height: 22px;
      padding: 4px 4px 0;
      border: 1px solid rgba(120, 120, 120, 0.78);
      border-left: 0;
      border-radius: 0 3px 3px 0;
      background: rgba(28, 28, 28, 0.96);
      color: #cfcfcf;
      font: 10px Arial, sans-serif;
      text-align: center;
      white-space: nowrap;
    }

    .promptboard-search-menu {
      position: fixed;
      z-index: 10000;
      overflow-x: hidden;
      overflow-y: auto;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: #151515;
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.35);
      scrollbar-width: thin;
    }

    .promptboard-search-menu-option,
    .promptboard-search-menu-empty {
      box-sizing: border-box;
      display: block;
      width: 100%;
      border: 0;
      background: transparent;
      color: rgba(255, 255, 255, 0.82);
      font: 11px Arial, sans-serif;
      text-align: left;
    }

    .promptboard-search-menu-option {
      min-height: 44px;
      padding: 5px 7px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      cursor: pointer;
    }

    .promptboard-search-menu-option:last-child {
      border-bottom: 0;
    }

    .promptboard-search-menu-option:hover,
    .promptboard-search-menu-option.is-active {
      background: rgba(130, 166, 220, 0.22);
      color: #fff;
    }

    .promptboard-search-menu-heading {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .promptboard-search-menu-label,
    .promptboard-search-menu-tag,
    .promptboard-search-menu-context {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .promptboard-search-menu-label {
      min-width: 0;
      color: #f0f0f0;
      font-weight: 700;
    }

    .promptboard-search-menu-selected {
      flex: 0 0 auto;
      margin-left: auto;
      color: #8ec5ff;
      font-size: 9px;
    }

    .promptboard-search-menu-tag {
      margin-top: 2px;
      color: #c9c9c9;
      font: 10px Menlo, Consolas, monospace;
    }

    .promptboard-search-menu-context {
      margin-top: 2px;
      color: #929292;
      font-size: 9px;
    }

    .promptboard-search-menu-empty {
      padding: 7px;
      color: rgba(255, 255, 255, 0.5);
    }

    .promptboard-group-filter {
      grid-column: 1 / -1;
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      min-width: 0;
      max-height: 48px;
      overflow: auto;
      scrollbar-width: thin;
    }

    .promptboard-group-button {
      box-sizing: border-box;
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex: 0 0 auto;
      height: 20px;
      padding: 0 7px;
      border: 1px solid rgba(120, 120, 120, 0.72);
      border-radius: 3px;
      background: rgba(32, 32, 32, 0.92);
      color: #d4d4d4;
      font: 10px Arial, sans-serif;
      cursor: pointer;
      white-space: nowrap;
    }

    .promptboard-group-button::before {
      content: "";
      flex: 0 0 auto;
      width: 3px;
      height: 12px;
      border-radius: 2px;
      background: color-mix(in srgb, var(--promptboard-accent) 72%, #202020);
      opacity: 0.68;
    }

    .promptboard-group-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .promptboard-group-count {
      box-sizing: border-box;
      min-width: 14px;
      height: 14px;
      padding: 1px 4px 0;
      border-radius: 7px;
      background: rgba(105, 105, 105, 0.62);
      color: #f0f0f0;
      font-size: 9px;
      line-height: 12px;
      text-align: center;
    }

    .promptboard-group-button:hover {
      border-color: color-mix(in srgb, var(--promptboard-accent) 52%, #888);
      background: color-mix(in srgb, var(--promptboard-accent) 14%, rgba(48, 48, 48, 0.96));
    }

    .promptboard-group-button.is-active {
      border-color: color-mix(in srgb, var(--promptboard-accent) 78%, #d7ecff);
      background: color-mix(in srgb, var(--promptboard-accent) 42%, rgba(32, 32, 32, 0.96));
      color: #f5fbff;
    }

    .promptboard-group-button.is-active::before {
      background: color-mix(in srgb, var(--promptboard-accent) 88%, #ffffff);
      opacity: 1;
    }

	    .promptboard-group-button.is-active .promptboard-group-count {
	      background: color-mix(in srgb, var(--promptboard-accent) 36%, rgba(154, 196, 236, 0.32));
	      color: #ffffff;
	    }

    .promptboard-button {
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .promptboard-button:hover {
      border-color: #888;
      background: rgba(48, 48, 48, 0.96);
    }

    .promptboard-clear-selection {
      border-color: rgba(138, 102, 102, 0.9);
      background: rgba(58, 41, 41, 0.92);
      color: #f0d8d8;
      font-weight: 700;
    }

    .promptboard-clear-selection:hover {
      border-color: rgba(190, 128, 128, 0.95);
      background: rgba(78, 48, 48, 0.96);
      color: #fff1f1;
    }

    .promptboard-button.is-done {
      border-color: rgba(92, 173, 112, 0.95);
      background: rgba(45, 112, 65, 0.92);
      color: #f2fff4;
    }

    .promptboard-button.is-delete-done {
      border-color: rgba(202, 92, 92, 0.95);
      background: rgba(122, 44, 44, 0.92);
      color: #fff2f2;
    }

    .promptboard-input.is-invalid {
      border-color: rgba(210, 92, 92, 0.95);
      background: rgba(62, 32, 32, 0.96);
    }

    .promptboard-template-status {
      min-height: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #cfcfcf;
      font-size: 10px;
    }

    .promptboard-save-combo {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 24px;
      min-width: 0;
    }

    .promptboard-save-combo::after {
      content: "▾";
      position: absolute;
      right: 7px;
      top: 50%;
      transform: translateY(-54%);
      color: #d8d8d8;
      font: 11px Arial, sans-serif;
      line-height: 1;
      pointer-events: none;
    }

    .promptboard-save-combo .promptboard-button {
      border-radius: 3px 0 0 3px;
      border-right: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .promptboard-save-mode {
      appearance: none;
      -webkit-appearance: none;
      box-sizing: border-box;
      width: 24px;
      height: 22px;
      padding: 0;
      border: 1px solid rgba(120, 120, 120, 0.78);
      border-radius: 0 3px 3px 0;
      background: rgba(28, 28, 28, 0.96);
      color: transparent;
      font: 11px Arial, sans-serif;
      cursor: pointer;
    }

    .promptboard-save-mode:hover {
      border-color: #888;
      background: rgba(48, 48, 48, 0.96);
    }

	    .promptboard-editor {
	      box-sizing: border-box;
	      min-width: 0;
	      min-height: 0;
	      height: 100%;
	      overflow: hidden;
      border: 1px solid rgba(120, 120, 120, 0.78);
      border-radius: 3px;
      background: rgba(22, 22, 22, 0.98);
    }

	    .promptboard-codemirror {
	      box-sizing: border-box;
	      display: none;
	      width: 100%;
	      min-width: 0;
	      height: 100%;
	      min-height: 0;
	    }

    .promptboard-textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 0;
      height: 100%;
      border: 0;
      border-radius: 0;
      resize: none;
      padding: 6px;
      line-height: 1.35;
      white-space: pre;
      overflow: auto;
      font-family: Menlo, Consolas, monospace;
    }

    .promptboard-status {
      min-height: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #cfcfcf;
      font-size: 10px;
    }

	    .promptboard-scroll {
	      box-sizing: border-box;
	      min-height: 0;
      overflow-x: hidden;
      overflow-y: auto;
      scrollbar-width: thin;
	      padding: 0 2px ${SCROLL_BOTTOM_PADDING}px 0;
	    }

	    .promptboard-navigator-rail-host {
	      box-sizing: border-box;
	      display: grid;
	      grid-template-columns: 52px minmax(0, 1fr);
	      align-items: start;
	      gap: 5px;
	      min-width: 0;
	      max-height: 56px;
	      overflow: hidden;
	    }

	    .promptboard-navigator-rail-host.is-empty {
	      display: none;
	    }

	    .promptboard-navigator {
	      box-sizing: border-box;
	      display: grid;
	      grid-template-rows: minmax(0, 1fr) auto;
	      gap: 8px;
	      min-height: 0;
	      width: 100%;
	    }

	    .promptboard-navigator-main,
	    .promptboard-selected-summary {
	      box-sizing: border-box;
	      min-width: 0;
	      border: 1px solid color-mix(in srgb, var(--promptboard-accent) 42%, rgba(111, 137, 154, 0.46));
	      border-radius: 4px;
	      background: color-mix(in srgb, var(--promptboard-accent) 8%, rgba(38, 43, 47, 0.72));
	      padding: 6px;
	    }

	    .promptboard-navigator-main {
	      display: flex;
	      flex-direction: column;
	      gap: 8px;
	      box-shadow: inset 3px 0 0 color-mix(in srgb, var(--promptboard-accent) 64%, rgba(255, 255, 255, 0.08));
	    }

	    .promptboard-navigator-content {
	      min-width: 0;
	    }

	    .promptboard-navigator-category-rail {
	      display: flex;
	      flex-wrap: wrap;
	      gap: 4px;
	      min-width: 0;
	      max-height: 56px;
	      overflow: auto;
	      scrollbar-width: thin;
	    }

	    .promptboard-navigator-category {
	      box-sizing: border-box;
	      position: relative;
	      display: inline-flex;
	      align-items: center;
	      gap: 5px;
	      width: auto;
	      min-width: 0;
	      max-width: 180px;
	      height: 24px;
	      padding: 0 7px;
	      border: 1px solid rgba(120, 120, 120, 0.72);
	      border-radius: 4px;
	      background: rgba(32, 32, 32, 0.92);
	      color: #d4d4d4;
	      font: 11px Arial, sans-serif;
	      cursor: pointer;
	    }

	    .promptboard-navigator-category::before {
	      content: "";
	      flex: 0 0 auto;
	      width: 3px;
	      height: 13px;
	      border-radius: 2px;
	      background: color-mix(in srgb, var(--promptboard-accent) 72%, #202020);
	      opacity: 0.66;
	    }

	    .promptboard-navigator-category:hover {
	      border-color: color-mix(in srgb, var(--promptboard-accent) 56%, #888);
	      background: color-mix(in srgb, var(--promptboard-accent) 14%, rgba(48, 48, 48, 0.96));
	    }

	    .promptboard-navigator-category.is-active {
	      border-color: color-mix(in srgb, var(--promptboard-accent) 78%, #d7ecff);
	      background: color-mix(in srgb, var(--promptboard-accent) 42%, rgba(32, 32, 32, 0.96));
	      color: #f5fbff;
	    }

	    .promptboard-navigator-category.is-active::before {
	      background: color-mix(in srgb, var(--promptboard-accent) 88%, #ffffff);
	      opacity: 1;
	    }

	    .promptboard-navigator-category-label {
	      min-width: 0;
	      overflow: hidden;
	      text-overflow: ellipsis;
	      white-space: nowrap;
	    }

	    .promptboard-navigator-category-count {
	      box-sizing: border-box;
	      flex: 0 0 auto;
	      min-width: 14px;
	      height: 14px;
	      padding: 1px 4px 0;
	      border-radius: 7px;
	      background: rgba(105, 105, 105, 0.62);
	      color: #f0f0f0;
	      font-size: 9px;
	      line-height: 12px;
	      text-align: center;
	    }

	    .promptboard-navigator-category.is-active .promptboard-navigator-category-count {
	      background: color-mix(in srgb, var(--promptboard-accent) 36%, rgba(154, 196, 236, 0.32));
	      color: #ffffff;
	    }

	    .promptboard-navigator-action-row {
	      display: flex;
	      justify-content: flex-start;
	      min-width: 0;
	      margin: 0;
	    }

	    .promptboard-navigator-clear {
	      box-sizing: border-box;
	      width: 52px;
	      height: 24px;
	      border: 1px solid rgba(120, 120, 120, 0.72);
	      border-radius: 3px;
	      background: rgba(48, 36, 36, 0.92);
	      color: #decaca;
	      font: 10px Arial, sans-serif;
	      cursor: pointer;
	    }

	    .promptboard-navigator-clear:not(:disabled):hover {
	      border-color: rgba(176, 108, 108, 0.95);
	      background: rgba(76, 42, 42, 0.96);
	      color: #fff0f0;
	    }

	    .promptboard-navigator-clear:disabled {
	      cursor: default;
	      opacity: 0.45;
	    }

	    .promptboard-navigator-path {
	      min-width: 0;
	      overflow: hidden;
	      text-overflow: ellipsis;
	      white-space: nowrap;
	      color: #d8e7f4;
	      font-size: 10px;
	      font-weight: 700;
	    }

	    .promptboard-navigator-tags {
	      display: grid;
	      grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr));
	      gap: 5px;
	      min-width: 0;
	    }

		    .promptboard-navigator-tags .promptboard-tag {
		      min-height: 24px;
		      height: auto;
		      margin-top: 0;
		      padding-top: 3px;
	      padding-bottom: 3px;
	      font-size: 12px;
	    }

		    .promptboard-navigator-tags .promptboard-tag-label {
		      overflow: hidden;
		      text-overflow: ellipsis;
		      white-space: nowrap;
		    }

	    .promptboard-selected-summary {
	      display: grid;
	      grid-template-rows: auto minmax(0, 1fr);
	      max-height: 90px;
	    }

	    .promptboard-selected-summary-title {
	      margin-bottom: 5px;
	      color: #e8e8e8;
	      font-size: 10px;
	      font-weight: 700;
	    }

	    .promptboard-selected-chips {
	      display: flex;
	      flex-wrap: wrap;
	      gap: 4px;
	      min-height: 0;
	      overflow: auto;
	      scrollbar-width: thin;
	    }

	    .promptboard-selected-chip {
	      box-sizing: border-box;
	      display: flex;
	      align-items: center;
	      gap: 5px;
	      width: auto;
	      max-width: 270px;
	      min-height: 20px;
	      padding: 2px 5px;
	      border: 1px solid rgba(120, 120, 120, 0.72);
	      border-radius: 4px;
	      background: rgba(35, 53, 68, 0.82);
	      color: #e4e4e4;
	      font: 10px Arial, sans-serif;
	      text-align: left;
	      cursor: pointer;
	    }

	    .promptboard-selected-chip::before {
	      content: "";
	      flex: 0 0 auto;
	      align-self: stretch;
	      width: 4px;
	      min-height: 16px;
	      border-radius: 3px;
	      background: color-mix(in srgb, var(--promptboard-accent) 82%, #ffffff);
	    }

	    .promptboard-selected-chip:hover {
	      border-color: color-mix(in srgb, var(--promptboard-accent) 58%, #888);
	      background: color-mix(in srgb, var(--promptboard-accent) 16%, rgba(47, 68, 84, 0.9));
	    }

	    .promptboard-selected-chip-label {
	      min-width: 0;
	      overflow: hidden;
	      text-overflow: ellipsis;
	      white-space: nowrap;
	      flex: 1 1 auto;
	    }

	    .promptboard-selected-chip-remove {
	      flex: 0 0 auto;
	      color: #bfcfe0;
	      font-size: 9px;
	    }

	    .promptboard-selected-empty {
	      color: #a9a9a9;
	      font-size: 10px;
	    }

	    .promptboard-tag {
	      box-sizing: border-box;
	      display: flex;
	      align-items: center;
	      gap: 7px;
	      width: 100%;
	      height: 22px;
	      margin-top: 4px;
	      padding: 0 7px;
	      border: 1px solid #656565;
      border-radius: 4px;
      background: rgba(52, 61, 66, 0.78);
      color: #d4d4d4;
	      font: 11px Arial, sans-serif;
      text-align: left;
      cursor: pointer;
    }

    .promptboard-tag:hover {
      border-color: color-mix(in srgb, var(--promptboard-accent) 34%, #777);
      background: color-mix(in srgb, var(--promptboard-accent) 10%, #414141);
    }

    .promptboard-tag.is-on {
      border-color: color-mix(in srgb, var(--promptboard-accent) 78%, #d7ecff);
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--promptboard-accent) 52%, #202426),
        color-mix(in srgb, var(--promptboard-accent) 34%, #24496e)
      );
      color: #fff;
    }

    .promptboard-tag.is-search-match {
      border-color: rgba(218, 184, 92, 0.95);
      box-shadow: inset 0 0 0 1px rgba(218, 184, 92, 0.5);
      background: rgba(86, 72, 38, 0.88);
    }

    .promptboard-tag.is-on.is-search-match {
      border-color: rgba(232, 197, 100, 0.95);
      box-shadow: inset 0 0 0 1px rgba(232, 197, 100, 0.58);
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--promptboard-accent) 42%, #574726),
        #345778
      );
    }

    .promptboard-tag-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1 1 auto;
    }

	    .promptboard-tag-state {
	      flex: 0 0 auto;
	      color: #bdbdbd;
	      font-size: 10px;
	    }

    .promptboard-tag-section {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 7px;
      width: 100%;
      min-width: 0;
      margin: 9px 0 2px;
      color: color-mix(in srgb, var(--promptboard-accent) 72%, #d8edf8);
      font-size: 10px;
      font-weight: 700;
      line-height: 1.2;
      grid-column: 1 / -1;
    }

    .promptboard-tag-section::after {
      content: "";
      flex: 1 1 auto;
      height: 1px;
      min-width: 18px;
      background: color-mix(in srgb, var(--promptboard-accent) 42%, rgba(137, 176, 209, 0.24));
    }

    .promptboard-tag-section:first-child {
      margin-top: 4px;
    }

    .promptboard-tag-section-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .promptboard-empty {
      padding: 8px;
      color: #cfcfcf;
    }
  `;
  document.head.appendChild(style);
}

function stopCanvasEvents(element) {
  for (const eventName of ["pointerdown", "mousedown", "dblclick", "click"]) {
    element.addEventListener(eventName, (event) => event.stopPropagation());
  }
  element.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
}

function stopWheelEvents(element) {
  element.addEventListener("wheel", (event) => event.stopPropagation(), { passive: true });
}

function createButton(text, title, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "promptboard-button";
  button.textContent = text;
  button.title = title;
  stopCanvasEvents(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function createResetButton(node) {
  const button = createButton(RESET_BUTTON, "선택된 태그 모두 해제", () => {
    resetSelection(node);
  });
  button.classList.add("promptboard-clear-selection");
  return button;
}

function setYamlPanelOpen(node, open) {
  node.promptboardYamlPanelOpen = !!open;
  const panel = node.promptboardYamlPanel;
  const button = node.promptboardYamlToggleButton;
  const root = node.promptboardElement;
  if (root) {
    root.style.setProperty("--promptboard-yaml-width", open ? `${EDITOR_PANEL_WIDTH}px` : "0px");
  }
  if (panel) {
    panel.classList.toggle("is-collapsed", !open);
  }
  if (button) {
    button.textContent = open ? "›" : "‹";
    button.title = open ? "YAML 닫기" : "YAML 열기";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(open));
  }
  node.promptboardCodeMirror?.requestMeasure?.();
  scheduleLayoutSizeSync(node);
}

function isYamlPanelOpen(node) {
  const panel = node.promptboardYamlPanel;
  if (panel) {
    return !panel.classList.contains("is-collapsed");
  }
  return !!node.promptboardYamlPanelOpen;
}

function createYamlToggleButton(node) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "promptboard-yaml-toggle";
  stopCanvasEvents(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setYamlPanelOpen(node, !isYamlPanelOpen(node));
  });
  return button;
}

function createGroupFilterButton(node, label, active, count) {
  const button = document.createElement("button");
  const name = document.createElement("span");
  const countLabel = document.createElement("span");

  button.type = "button";
  button.className = `promptboard-group-button${active ? " is-active" : ""}`;
  setAccent(button, accentForLabel(label));
  button.title =
    label === GROUP_ALL ? `Show all groups (${count} selected)` : `Show ${label} group (${count} selected)`;
  button.dataset.group = label;
  name.className = "promptboard-group-label";
  name.textContent = label;
  countLabel.className = "promptboard-group-count";
  countLabel.textContent = String(count);
  button.append(name, countLabel);
  stopCanvasEvents(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    node.promptboardActiveUiGroup = label;
    if (node.promptboardBoardSearchInput?.value?.trim()) {
      node.promptboardBoardSearchState = null;
      runBoardSearch(node);
    } else {
      renderCards(node);
    }
    if (node.promptboardScroll) {
      node.promptboardScroll.scrollTop = 0;
    }
  });
  return button;
}

function renderGroupFilter(node) {
  const container = node.promptboardGroupFilter;
  if (!container) {
    return;
  }

  const config = node.promptboardConfig ?? {};
  const attributeBoards = node.promptboardYamlModel?.attributeBoards ?? {};
  const state = node.promptboardState ?? {};
  const groups = availableUiGroups(config, attributeBoards);
  const active = activeUiGroup(node, config);
  const counts = selectedCountsByUiGroup(config, attributeBoards, state);
  container.replaceChildren();
  for (const group of [GROUP_ALL, ...groups]) {
    container.append(createGroupFilterButton(node, group, group === active, counts[group] ?? 0));
  }
}

function updateGroupFilterCounts(node) {
  const container = node.promptboardGroupFilter;
  if (!container) {
    return;
  }

  const config = node.promptboardConfig ?? {};
  const attributeBoards = node.promptboardYamlModel?.attributeBoards ?? {};
  const state = node.promptboardState ?? {};
  const counts = selectedCountsByUiGroup(config, attributeBoards, state);

  for (const button of container.querySelectorAll(".promptboard-group-button")) {
    const group = button.dataset.group || GROUP_ALL;
    const count = counts[group] ?? 0;
    const countLabel = button.querySelector(".promptboard-group-count");
    if (countLabel) {
      countLabel.textContent = String(count);
    }
    button.title =
      group === GROUP_ALL ? `Show all groups (${count} selected)` : `Show ${group} group (${count} selected)`;
  }
}

function createTagButton(node, state, category, tag, accent = null) {
  const selected = Array.isArray(state[category]) && state[category].includes(tag.text);
  const button = document.createElement("button");
  const label = document.createElement("span");
  const stateLabel = document.createElement("span");
  const displayLabel = tagButtonDisplayLabel(tag);

  button.type = "button";
  button.className = `promptboard-tag${selected ? " is-on" : ""}`;
  setAccent(button, accent);
  button.title = tagButtonTitle(tag, displayLabel);
  button.dataset.category = category;
  button.dataset.tagText = tag.text;
  button.classList.toggle("is-search-match", isCurrentBoardSearchMatch(node, category, tag.text));
  stopCanvasEvents(button);
  label.className = "promptboard-tag-label";
  label.textContent = displayLabel;
  stateLabel.className = "promptboard-tag-state";
  stateLabel.textContent = selected ? "on" : "off";

  button.append(label, stateLabel);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const nextSelected = !button.classList.contains("is-on");
    button.classList.toggle("is-on", nextSelected);
    stateLabel.textContent = nextSelected ? "on" : "off";
    setSelected(state, category, tag.text, nextSelected);
    syncState(node, state);
    renderCards(node);
    focusYamlCategoryTag(node, category, tag.text);
  });

  return button;
}

function attributeCountForTarget(state, boardId, targetId, target) {
  return Object.keys(target?.attributes ?? {}).reduce(
    (total, attributeId) => total + attributeSelectedTexts(state, boardId, targetId, attributeId).length,
    0,
  );
}

function createAttributeTagButton(node, state, boardId, targetId, attributeId, tag, accent = null) {
  const selected = attributeSelectedTexts(state, boardId, targetId, attributeId).includes(tag.text);
  const button = document.createElement("button");
  const label = document.createElement("span");
  const stateLabel = document.createElement("span");
  const tagText = String(tag.text ?? "");
  const displayLabel = tagButtonDisplayLabel(tag);

  button.type = "button";
  button.className = `promptboard-tag${selected ? " is-on" : ""}`;
  setAccent(button, accent);
  button.title = tagButtonTitle(tag, displayLabel);
  button.dataset.boardId = boardId;
  button.dataset.targetId = targetId;
  button.dataset.attributeId = attributeId;
  button.dataset.tagText = tagText;
  button.setAttribute("aria-pressed", String(selected));
  button.classList.toggle(
    "is-search-match",
    isCurrentAttributeSearchMatch(node, boardId, targetId, attributeId, tagText),
  );
  stopCanvasEvents(button);
  label.className = "promptboard-tag-label";
  label.textContent = displayLabel;
  stateLabel.className = "promptboard-tag-state";
  stateLabel.textContent = selected ? "on" : "off";
  button.append(label, stateLabel);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setAttributeSelected(
      node.promptboardYamlModel,
      state,
      boardId,
      targetId,
      attributeId,
      tagText,
      !selected,
    );
    requestBoardFocus(node, { kind: "attributeTag", boardId, targetId, attributeId, tagText });
    syncState(node, state);
    renderCards(node);
    focusYamlAttributeTag(node, boardId, targetId, attributeId, tagText);
  });
  return button;
}

function createTagSection(label) {
  const section = document.createElement("div");
  const text = document.createElement("span");

  section.className = "promptboard-tag-section";
  text.className = "promptboard-tag-section-label";
  text.textContent = label;
  section.append(text);
  return section;
}

function appendCategoryTagItems(container, node, state, category, item) {
  const accent = accentForLabel(categoryUiGroup(item));
  for (const tagItem of tagItemsForCategory(item)) {
    if (tagItem.kind === "section") {
      container.append(createTagSection(tagItem.label));
      continue;
    }
    if (tagItem.kind === "tag" && tagItem.tag) {
      container.append(createTagButton(node, state, category, tagItem.tag, accent));
    }
  }
}

function appendAttributeTagItems(container, node, state, boardId, targetId, attributeId, tagSet, accent = null) {
  for (const tagItem of tagItemsForTagSet(tagSet)) {
    if (tagItem.kind === "section") {
      container.append(createTagSection(tagItem.label));
      continue;
    }
    if (tagItem.kind === "tag" && tagItem.tag) {
      container.append(createAttributeTagButton(node, state, boardId, targetId, attributeId, tagItem.tag, accent));
    }
  }
}

function appendNavigatorTagItems(container, node, state, item) {
  const accent = navigatorItemAccent(item);
  if (item?.kind === "attributeTarget") {
    const target = node.promptboardYamlModel?.attributeBoards?.[item.boardId]?.targets?.[item.targetId];
    for (const [attributeId, attribute] of Object.entries(target?.attributes ?? {})) {
      const tagSet = node.promptboardYamlModel?.tagSets?.[attribute.source];
      container.append(createTagSection(attribute.label || attributeId));
      appendAttributeTagItems(container, node, state, item.boardId, item.targetId, attributeId, tagSet, accent);
    }
    return;
  }
  for (const tagItem of item?.tagItems ?? []) {
    if (tagItem.kind === "section") {
      container.append(createTagSection(tagItem.label));
      continue;
    }
    if (tagItem.kind === "tag" && tagItem.tag) {
      container.append(createNavigatorTagButton(node, state, item, tagItem.tag, accent));
    }
  }
}

function requestBoardFocus(node, identity) {
  node.promptboardPendingFocus = identity;
}

function findPendingBoardFocusElement(node, identity) {
  const scroll = node.promptboardScroll;
  if (!scroll || !identity) {
    return null;
  }
  for (const element of scroll.querySelectorAll(".promptboard-tag")) {
    if (element.dataset.boardId !== identity.boardId || element.dataset.targetId !== identity.targetId) {
      continue;
    }
    if (identity.attributeId && element.dataset.attributeId !== identity.attributeId) {
      continue;
    }
    if (identity.tagText && element.dataset.tagText !== identity.tagText) {
      continue;
    }
    return element;
  }
  return null;
}

function restorePendingBoardFocus(node) {
  const identity = node.promptboardPendingFocus;
  if (!identity || typeof requestAnimationFrame !== "function") {
    return;
  }
  node.promptboardPendingFocus = null;
  requestAnimationFrame(() => {
    findPendingBoardFocusElement(node, identity)?.focus({ preventScroll: true });
  });
}

function clearNavigatorItemSelection(node, item) {
  const state = node.promptboardState ?? {};
  if (item?.kind === "attribute") {
    for (const text of attributeSelectedTexts(state, item.boardId, item.targetId, item.attributeId)) {
      setAttributeSelected(
        node.promptboardYamlModel,
        state,
        item.boardId,
        item.targetId,
        item.attributeId,
        text,
        false,
      );
    }
  } else if (item?.kind === "attributeTarget") {
    const target = node.promptboardYamlModel?.attributeBoards?.[item.boardId]?.targets?.[item.targetId];
    for (const attributeId of Object.keys(target?.attributes ?? {})) {
      for (const text of attributeSelectedTexts(state, item.boardId, item.targetId, attributeId)) {
        setAttributeSelected(
          node.promptboardYamlModel,
          state,
          item.boardId,
          item.targetId,
          attributeId,
          text,
          false,
        );
      }
    }
  } else if (item?.kind === "category") {
    state[item.category] = [];
  }
  syncState(node, state);
  renderCards(node);
}

function createNavigatorTagButton(node, state, item, tag, accent = null) {
  if (item.kind === "attribute") {
    return createAttributeTagButton(node, state, item.boardId, item.targetId, item.attributeId, tag, accent);
  }
  return createTagButton(node, state, item.category, tag, accent);
}

function createNavigatorCategoryButton(node, item, active) {
  const button = document.createElement("button");
  const label = document.createElement("span");
  const count = document.createElement("span");
  const selectedCountValue = navigatorItemCount(node, item);

  button.type = "button";
  button.className = `promptboard-navigator-category${active ? " is-active" : ""}`;
  setAccent(button, navigatorItemAccent(item));
  if (item.kind === "category") {
    button.dataset.category = item.category;
  } else if (item.kind === "attributeTarget") {
    button.dataset.boardId = item.boardId;
    button.dataset.targetId = item.targetId;
  }
  button.title = item.kind === "category" && item.label !== item.category
    ? `${item.context} > ${item.label} (${item.category}, ${selectedCountValue} selected)`
    : `${item.context} > ${item.label} (${selectedCountValue} selected)`;
  button.setAttribute("aria-pressed", String(active));
  label.className = "promptboard-navigator-category-label";
  label.textContent = item.label;
  count.className = "promptboard-navigator-category-count";
  count.textContent = String(selectedCountValue);
  button.append(label, count);
  stopCanvasEvents(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveNavigatorItem(node, navigatorItemId(item));
    renderCards(node);
    focusYamlNavigatorItem(node, item);
  });
  return button;
}

function createNavigatorCategoryRail(node, items, active) {
  const rail = document.createElement("div");
  const activeId = navigatorItemId(active);

  rail.className = "promptboard-navigator-category-rail";
  rail.setAttribute("role", "group");
  rail.setAttribute("aria-label", "카테고리");
  for (const item of items) {
    rail.append(createNavigatorCategoryButton(node, item, navigatorItemId(item) === activeId));
  }
  return rail;
}

function createSelectedSummaryButton(node, state, entry) {
  const button = document.createElement("button");
  const label = document.createElement("span");
  const remove = document.createElement("span");

  button.type = "button";
  button.className = "promptboard-selected-chip";
  setAccent(button, entry.accent);
  button.title = `${entry.context}: ${entry.text}`;
  label.className = "promptboard-selected-chip-label";
  label.textContent = `${entry.label}: ${entry.display}`;
  remove.className = "promptboard-selected-chip-remove";
  remove.textContent = "x";
  button.append(label, remove);
  stopCanvasEvents(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (entry.kind === "attribute") {
      setAttributeSelected(
        node.promptboardYamlModel,
        state,
        entry.boardId,
        entry.targetId,
        entry.attributeId,
        entry.text,
        false,
      );
    } else {
      setSelected(state, entry.category, entry.text, false);
    }
    syncState(node, state);
    renderCards(node);
    if (entry.kind === "attribute") {
      focusYamlAttributeTag(node, entry.boardId, entry.targetId, entry.attributeId, entry.text);
    } else {
      focusYamlCategoryTag(node, entry.category, entry.text);
    }
  });
  return button;
}

function selectedSummaryEntries(node, state) {
  const entries = [];
  const config = node.promptboardConfig ?? {};
  for (const [category, item] of Object.entries(config)) {
    const selected = Array.isArray(state[category]) ? state[category] : [];
    for (const text of selected) {
      const tag = item.tags?.find((candidate) => candidate.text === text) ?? { text };
      entries.push({
        kind: "category",
        category,
        label: categoryLabel(category, item),
        context: categoryUiGroup(item),
        accent: accentForLabel(categoryUiGroup(item)),
        text,
        display: tagDisplayLabel(tag),
      });
    }
  }
  for (const [boardId, board] of Object.entries(node.promptboardYamlModel?.attributeBoards ?? {})) {
    for (const [targetId, target] of Object.entries(board.targets ?? {})) {
      for (const [attributeId, attribute] of Object.entries(target.attributes ?? {})) {
        const tagSet = node.promptboardYamlModel?.tagSets?.[attribute.source];
        for (const text of attributeSelectedTexts(state, boardId, targetId, attributeId)) {
          const tag = tagSet?.tags?.find((candidate) => candidate.text === text) ?? { text };
          entries.push({
            kind: "attribute",
            boardId,
            targetId,
            attributeId,
            label: target.label || targetId,
            context: `${board.label || boardId} / ${attribute.label || attributeId}`,
            accent: accentForLabel(attributeBoardUiGroup(board)),
            text,
            display: tagDisplayLabel(tag),
          });
        }
      }
    }
  }
  return entries;
}

function createSelectedSummary(node, state) {
  const section = document.createElement("aside");
  const title = document.createElement("div");
  const chips = document.createElement("div");
  const entries = selectedSummaryEntries(node, state);

  section.className = "promptboard-selected-summary";
  title.className = "promptboard-selected-summary-title";
  title.textContent = `선택됨 ${entries.length}`;
  chips.className = "promptboard-selected-chips";
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "promptboard-selected-empty";
    empty.textContent = "선택된 태그 없음";
    chips.append(empty);
  } else {
    for (const entry of entries) {
      chips.append(createSelectedSummaryButton(node, state, entry));
    }
  }
  section.append(title, chips);
  return section;
}

function renderNavigator(node, scroll, state) {
  const items = navigatorItems(node);
  const active = activeNavigatorItem(node, items);
  const railHost = node.promptboardNavigatorRailHost;
  const shell = document.createElement("div");
  const main = document.createElement("section");
  const content = document.createElement("div");
  const actionRow = document.createElement("div");
  const clearButton = document.createElement("button");
  const tags = document.createElement("div");
  const count = active ? navigatorItemCount(node, active) : 0;

  shell.className = "promptboard-navigator";
  main.className = "promptboard-navigator-main";
  content.className = "promptboard-navigator-content";
  actionRow.className = "promptboard-navigator-action-row";
  tags.className = "promptboard-navigator-tags";
  if (active?.kind === "attributeTarget") {
    main.classList.add("is-attribute-target");
  }
  const activeAccent = navigatorItemAccent(active);
  setAccent(shell, activeAccent);
  setAccent(main, activeAccent);
  setAccent(railHost, activeAccent);
  setAccent(tags, activeAccent);
  railHost?.replaceChildren();
  railHost?.classList.toggle("is-empty", !active);

  if (!active) {
    const empty = document.createElement("div");
    empty.className = "promptboard-empty";
    empty.textContent = "No categories in this group";
    main.append(empty);
    shell.append(main, createSelectedSummary(node, state));
    scroll.append(shell);
    return;
  }

  clearButton.type = "button";
  clearButton.className = "promptboard-navigator-clear";
  clearButton.textContent = count ? "clear" : "clear";
  clearButton.disabled = !count;
  clearButton.title = "Clear current selection";
  stopCanvasEvents(clearButton);
  clearButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearNavigatorItemSelection(node, active);
  });
  actionRow.append(clearButton);
  appendNavigatorTagItems(tags, node, state, active);
  if (active.kind === "category" && !active.tags?.length) {
    const empty = document.createElement("div");
    empty.className = "promptboard-empty";
    empty.textContent = "No tags";
    tags.append(empty);
  }

  if (railHost) {
    railHost.append(actionRow, createNavigatorCategoryRail(node, items, active));
  } else {
    content.append(actionRow);
  }
  content.append(tags);
  main.append(content);
  shell.append(main, createSelectedSummary(node, state));
  scroll.append(shell);
  restorePendingBoardFocus(node);
}

function renderCards(node) {
  const scroll = node.promptboardScroll;
  const state = node.promptboardState ?? {};
  if (!scroll) {
    return;
  }
  renderGroupFilter(node);
  node.promptboardNavigatorRailHost?.replaceChildren();
  node.promptboardNavigatorRailHost?.classList.add("is-empty");
  scroll.replaceChildren();

  renderNavigator(node, scroll, state);
}

function setStatus(node, text) {
  if (node.promptboardStatusTimer) {
    clearTimeout(node.promptboardStatusTimer);
    node.promptboardStatusTimer = null;
  }
  node.promptboardStatus = text;
  const status = node.promptboardStatusElement;
  if (status) {
    status.textContent = text;
  }
}

function setTemporaryStatus(node, text) {
  setStatus(node, text);
  node.promptboardStatusTimer = setTimeout(() => {
    node.promptboardStatus = "";
    node.promptboardStatusTimer = null;
    const status = node.promptboardStatusElement;
    if (status) {
      status.textContent = "";
    }
  }, 2000);
}

function yamlErrorMessage(error) {
  if (error?.code && error?.path) {
    return `[${error.code}] at ${error.path}: ${error.message}`;
  }
  return error?.message || String(error);
}

function updateTemplateControls(node) {
  const select = node.promptboardTemplateSelect;
  const nameInput = node.promptboardTemplateInput;
  const saveButton = node.promptboardTemplateSaveButton;
  const saveModeSelect = node.promptboardTemplateSaveModeSelect;
  const deleteButton = node.promptboardTemplateDeleteButton;
  const status = node.promptboardTemplateStatusElement;

  if (select) {
    const current = node.promptboardSelectedTemplate ?? "";
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "template";
    select.append(placeholder);
    for (const template of node.promptboardTemplates ?? []) {
      const option = document.createElement("option");
      option.value = template.name;
      option.textContent = template.name;
      select.append(option);
    }
    select.value = current;
  }

  if (nameInput && document.activeElement !== nameInput) {
    nameInput.value = node.promptboardTemplateName ?? "";
  }

  const saveMode =
    node.promptboardTemplateSaveMode === TEMPLATE_SAVE_MODE_NEW
      ? TEMPLATE_SAVE_MODE_NEW
      : TEMPLATE_SAVE_MODE_SAVE;

  if (saveModeSelect) {
    saveModeSelect.value = saveMode;
  }

  if (saveButton) {
    const saveDone =
      node.promptboardTemplateSaveDoneTarget === saveMode &&
      Number(node.promptboardTemplateSaveDoneUntil ?? 0) > Date.now();
    saveButton.textContent = saveDone
      ? "완료"
      : saveMode === TEMPLATE_SAVE_MODE_NEW
        ? SAVE_TEMPLATE_NEW_BUTTON
        : SAVE_TEMPLATE_BUTTON;
    saveButton.classList.toggle("is-done", saveDone);
  }

  if (deleteButton) {
    const deleteDone = Number(node.promptboardTemplateDeleteDoneUntil ?? 0) > Date.now();
    deleteButton.textContent = deleteDone ? "완료" : DELETE_TEMPLATE_BUTTON;
    deleteButton.classList.toggle("is-delete-done", deleteDone);
  }

  if (status) {
    status.textContent = node.promptboardTemplateStatus ?? "";
    status.style.display = "";
  }
}

function setTemplateStatus(node, message) {
  if (node.promptboardTemplateStatusTimer) {
    clearTimeout(node.promptboardTemplateStatusTimer);
    node.promptboardTemplateStatusTimer = null;
  }
  node.promptboardTemplateStatus = message;
  updateTemplateControls(node);
}

function setTemporaryTemplateStatus(node, message) {
  setTemplateStatus(node, message);
  node.promptboardTemplateStatusTimer = setTimeout(() => {
    node.promptboardTemplateStatus = "";
    node.promptboardTemplateStatusTimer = null;
    updateTemplateControls(node);
  }, 2000);
}

function showTemplateSaveDone(node, target = TEMPLATE_SAVE_MODE_SAVE) {
  node.promptboardTemplateSaveDoneUntil = Date.now() + 2000;
  node.promptboardTemplateSaveDoneTarget = target;
  if (node.promptboardTemplateDoneTimer) {
    clearTimeout(node.promptboardTemplateDoneTimer);
  }
  updateTemplateControls(node);
  node.promptboardTemplateDoneTimer = setTimeout(() => {
    node.promptboardTemplateSaveDoneUntil = 0;
    node.promptboardTemplateSaveDoneTarget = "";
    node.promptboardTemplateDoneTimer = null;
    updateTemplateControls(node);
  }, 2000);
}

function showTemplateDeleteDone(node) {
  node.promptboardTemplateDeleteDoneUntil = Date.now() + 2000;
  if (node.promptboardTemplateDeleteDoneTimer) {
    clearTimeout(node.promptboardTemplateDeleteDoneTimer);
  }
  updateTemplateControls(node);
  node.promptboardTemplateDeleteDoneTimer = setTimeout(() => {
    node.promptboardTemplateDeleteDoneUntil = 0;
    node.promptboardTemplateDeleteDoneTimer = null;
    updateTemplateControls(node);
  }, 2000);
}

function renderFromYaml(node, resetState = false, options = {}) {
  let model;
  try {
    model = normalizeYamlDocument(widgetValue(node, "yaml_text", ""));
  } catch (error) {
    if (options.openOnError !== false) {
      setYamlPanelOpen(node, true);
    }
    setStatus(node, `YAML error: ${yamlErrorMessage(error)}`);
    return false;
  }
  if (String(node.promptboardStatus ?? "").startsWith("YAML error:")) {
    setStatus(node, "");
  }

  const config = model.categories;
  const warnings = [];
  const sourceState = resetState ? emptyAttributeState(model) : parseSelectedState(node);
  const state = pruneSelectedState(model, sourceState, warnings);
  node.promptboardYamlModel = model;
  node.promptboardConfig = config;
  syncState(node, state);
  renderCards(node);
  scheduleLayoutSizeSync(node);
  if (warnings.length) {
    setStatus(node, `State warning: ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length - 1})` : ""}`);
  } else if (String(node.promptboardStatus ?? "").startsWith("State warning:")) {
    setStatus(node, "");
  }
  return true;
}

async function refreshYamlFileOptions(node) {
  const select = node.promptboardFileSelect;
  if (!select) {
    return;
  }

  try {
    const response = await fetch("/promptboard/yaml/files");
    const values = await response.json();
    if (!response.ok || !Array.isArray(values)) {
      return;
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
  } catch {
    // Keep the server-provided widget default if the API is unavailable.
  }
}

async function refreshBoardTemplates(node, selectedTemplate = node.promptboardSelectedTemplate ?? "") {
  try {
    const response = await fetch("/promptboard/templates");
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    node.promptboardTemplates = Array.isArray(data) ? data : [];
    node.promptboardSelectedTemplate = node.promptboardTemplates.some((item) => item.name === selectedTemplate)
      ? selectedTemplate
      : "";
    writeStoredTemplateState(node);
    updateTemplateControls(node);
  } catch (error) {
    node.promptboardTemplates = [];
    setTemplateStatus(node, `Template load error: ${error.message}`);
  }
}

async function refreshBoardTemplatesAndLoadStored(node) {
  const storedTemplate = node.promptboardSelectedTemplate ?? "";
  await refreshBoardTemplates(node, storedTemplate);
  if (!node.promptboardSelectedTemplate) {
    await loadSelectedYaml(node, { resetState: false });
    return;
  }
  await loadBoardTemplate(node, node.promptboardSelectedTemplate, { silent: true });
}

function uniqueTemplateName(node, rawName) {
  const baseName = String(rawName ?? "").trim();
  if (!baseName) {
    return "";
  }

  const existing = new Set((node.promptboardTemplates ?? []).map((item) => String(item.name ?? "")));
  if (!existing.has(baseName)) {
    return baseName;
  }

  let index = 1;
  let name = `${baseName} (${index})`;
  while (existing.has(name)) {
    index += 1;
    name = `${baseName} (${index})`;
  }
  return name;
}

async function saveBoardTemplate(node, rawName, options = {}) {
  const name = String(rawName ?? "").trim();
  if (!name) {
    setTemplateStatus(node, "Template name is required.");
    return;
  }

  const yamlFile = widgetValue(node, "yaml_file", DEFAULT_YAML_FILE);
  if (!yamlFile || yamlFile === INLINE_YAML_OPTION) {
    setTemplateStatus(node, "Select a YAML file before saving a template.");
    return;
  }

  try {
    const response = await fetch("/promptboard/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        yaml_file: yamlFile,
        selected_state: node.promptboardState ?? parseSelectedState(node),
      }),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    node.promptboardSelectedTemplate = data.name ?? name;
    node.promptboardTemplateName = data.name ?? name;
    writeStoredTemplateState(node);
    setTemporaryTemplateStatus(node, `Saved: ${node.promptboardSelectedTemplate}`);
    showTemplateSaveDone(node, options.newTemplate ? TEMPLATE_SAVE_MODE_NEW : TEMPLATE_SAVE_MODE_SAVE);
    await refreshBoardTemplates(node, node.promptboardSelectedTemplate);
  } catch (error) {
    setTemplateStatus(node, `Template save error: ${error.message}`);
  }
}

async function saveBoardTemplateNew(node, rawName) {
  const name = uniqueTemplateName(node, rawName);
  await saveBoardTemplate(node, name, { newTemplate: true });
}

function saveBoardTemplateWithSelectedMode(node, rawName) {
  if (node.promptboardTemplateSaveMode === TEMPLATE_SAVE_MODE_NEW) {
    saveBoardTemplateNew(node, rawName);
    return;
  }
  saveBoardTemplate(node, rawName);
}

async function deleteBoardTemplate(node, rawName) {
  const name = String(rawName ?? "").trim();
  if (!name) {
    setTemplateStatus(node, "Template name is required.");
    return;
  }

  try {
    const response = await fetch(`/promptboard/template?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    if (node.promptboardSelectedTemplate === name) {
      node.promptboardSelectedTemplate = "";
    }
    writeStoredTemplateState(node);
    setTemporaryTemplateStatus(node, `Deleted: ${name}`);
    showTemplateDeleteDone(node);
    await refreshBoardTemplates(node, "");
  } catch (error) {
    setTemplateStatus(node, `Template delete error: ${error.message}`);
  }
}

async function loadBoardTemplate(node, name, options = {}) {
  const templateName = String(name ?? "").trim();
  if (!templateName) {
    return;
  }
  const yamlPanelOpen = isYamlPanelOpen(node);

  try {
    const response = await fetch(`/promptboard/template?name=${encodeURIComponent(templateName)}`);
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const yamlFile = data.yaml_file || DEFAULT_YAML_FILE;
    setWidgetValue(node, "yaml_file", yamlFile);
    if (node.promptboardFileSelect) {
      node.promptboardFileSelect.value = yamlFile;
    }

    if (yamlFile && yamlFile !== INLINE_YAML_OPTION) {
      const yamlResponse = await fetch(`/promptboard/yaml/file?name=${encodeURIComponent(yamlFile)}`);
      const yamlData = await yamlResponse.json();
      if (!yamlResponse.ok || yamlData.error) {
        throw new Error(yamlData.error || `HTTP ${yamlResponse.status}`);
      }
      setYamlEditorText(node, yamlData.text ?? "");
    }

    const selectedState = data.selected_state && typeof data.selected_state === "object" ? data.selected_state : {};
    setWidgetValue(node, "selected_state", JSON.stringify(selectedState));
    node.promptboardSelectedTemplate = data.name ?? templateName;
    node.promptboardTemplateName = data.name ?? templateName;
    writeStoredTemplateState(node);
    if (!options.silent) {
      setTemporaryTemplateStatus(node, `Loaded: ${node.promptboardSelectedTemplate}`);
    }
    renderFromYaml(node, false, { openOnError: false });
    setYamlPanelOpen(node, yamlPanelOpen);
    updateTemplateControls(node);
  } catch (error) {
    setTemplateStatus(node, `Template load error: ${error.message}`);
  }
}

async function loadSelectedYaml(node, options = {}) {
  const resetState = options.resetState !== false;
  const yamlFile = widgetValue(node, "yaml_file", DEFAULT_YAML_FILE);
  if (!yamlFile || yamlFile === INLINE_YAML_OPTION) {
    return;
  }

  try {
    const response = await fetch(`/promptboard/yaml/file?name=${encodeURIComponent(yamlFile)}`);
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    setYamlEditorText(node, data.text ?? "");
    renderFromYaml(node, resetState);
    setStatus(node, "");
  } catch (error) {
    setStatus(node, `Load error: ${error.message}`);
  }
}

async function saveSelectedYaml(node) {
  const yamlFile = widgetValue(node, "yaml_file", DEFAULT_YAML_FILE);
  if (!yamlFile || yamlFile === INLINE_YAML_OPTION) {
    setYamlPanelOpen(node, true);
    setStatus(node, "Save error: select a YAML file.");
    return;
  }

  try {
    const text = widgetValue(node, "yaml_text", "");
    const response = await fetch("/promptboard/yaml/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: yamlFile, text }),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    setTemporaryStatus(node, "Saved");
    renderFromYaml(node);
  } catch (error) {
    setYamlPanelOpen(node, true);
    setStatus(node, `Save error: ${error.message}`);
  }
}

function createSplitElement(node) {
  ensureStyles();

  const root = document.createElement("div");
  const left = document.createElement("div");
  const right = document.createElement("div");
  const yamlToggle = createYamlToggleButton(node);
  const yamlContent = document.createElement("div");
  const select = document.createElement("select");
  const yamlSearchRow = document.createElement("div");
  const yamlSearch = document.createElement("input");
  const yamlSearchCount = document.createElement("div");
  const editor = document.createElement("div");
  const editorHost = document.createElement("div");
  const textarea = document.createElement("textarea");
  const save = document.createElement("button");
  const status = document.createElement("div");
  const toolbar = document.createElement("div");
  const templateSelect = document.createElement("select");
  const toolbarTemplateRow = document.createElement("div");
  const toolbarSearchRow = document.createElement("div");
  const boardSearchRow = document.createElement("div");
  const boardSearch = document.createElement("input");
  const boardSearchCount = document.createElement("div");
  const boardSearchMenu = document.createElement("div");
  const groupFilter = document.createElement("div");
  const templateInput = document.createElement("input");
  const templateSaveCombo = document.createElement("div");
  const templateSave = document.createElement("button");
  const templateSaveMode = document.createElement("select");
  const templateDelete = document.createElement("button");
  const templateStatus = document.createElement("div");
  const navigatorRailHost = document.createElement("div");
  const scroll = document.createElement("div");

  root.className = "promptboard";
  left.className = "promptboard-panel promptboard-yaml-panel";
  right.className = "promptboard-panel promptboard-right";
  yamlContent.className = "promptboard-yaml-content";
  select.className = "promptboard-select";
  yamlSearchRow.className = "promptboard-search-row";
  yamlSearch.className = "promptboard-input";
  yamlSearchCount.className = "promptboard-search-count";
  editor.className = "promptboard-editor";
  editorHost.className = "promptboard-codemirror";
  textarea.className = "promptboard-textarea";
  save.className = "promptboard-button";
  status.className = "promptboard-status";
  toolbar.className = "promptboard-toolbar";
  toolbarTemplateRow.className = "promptboard-toolbar-template-row";
  toolbarSearchRow.className = "promptboard-toolbar-search-row";
  boardSearchRow.className = "promptboard-search-row";
  groupFilter.className = "promptboard-group-filter";
  templateSelect.className = "promptboard-select";
  boardSearch.className = "promptboard-input";
  boardSearchCount.className = "promptboard-search-count";
  boardSearchMenu.className = "promptboard-search-menu";
  templateInput.className = "promptboard-input";
  templateSaveCombo.className = "promptboard-save-combo";
  templateSave.className = "promptboard-button";
  templateSaveMode.className = "promptboard-save-mode";
  templateDelete.className = "promptboard-button";
  templateStatus.className = "promptboard-template-status";
  navigatorRailHost.className = "promptboard-navigator-rail-host is-empty";
  scroll.className = "promptboard-scroll";

  textarea.spellcheck = false;
  textarea.value = widgetValue(node, "yaml_text", "");
  yamlSearch.type = "text";
  yamlSearch.placeholder = "search";
  yamlSearchCount.textContent = "";
  boardSearch.type = "text";
  boardSearch.placeholder = "search tags";
  boardSearch.autocomplete = "off";
  boardSearch.spellcheck = false;
  boardSearch.setAttribute("role", "combobox");
  boardSearch.setAttribute("aria-autocomplete", "list");
  boardSearch.setAttribute("aria-expanded", "false");
  boardSearchMenu.id = `promptboard-search-menu-${node.id ?? Date.now()}`;
  boardSearchMenu.setAttribute("role", "listbox");
  boardSearch.setAttribute("aria-controls", boardSearchMenu.id);
  boardSearchCount.textContent = "";
  templateInput.type = "text";
  templateInput.placeholder = "template name";
  templateInput.value = node.promptboardTemplateName ?? "";
  save.type = "button";
  save.textContent = "Save YAML";
  templateSave.type = "button";
  templateSave.textContent = SAVE_TEMPLATE_BUTTON;
  templateSaveMode.title = "Save mode";
  templateSaveMode.ariaLabel = "Save mode";
  for (const [value, label] of [
    [TEMPLATE_SAVE_MODE_SAVE, SAVE_TEMPLATE_BUTTON],
    [TEMPLATE_SAVE_MODE_NEW, SAVE_TEMPLATE_NEW_BUTTON],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    templateSaveMode.append(option);
  }
  templateDelete.type = "button";
  templateDelete.textContent = DELETE_TEMPLATE_BUTTON;
  status.textContent = node.promptboardStatus ?? "";
  templateStatus.textContent = node.promptboardTemplateStatus ?? "";

  stopCanvasEvents(select);
  stopCanvasEvents(yamlSearch);
  stopCanvasEvents(textarea);
  stopCanvasEvents(templateSelect);
  stopCanvasEvents(boardSearch);
  stopCanvasEvents(boardSearchMenu);
  stopCanvasEvents(groupFilter);
  stopCanvasEvents(templateInput);
  stopCanvasEvents(templateSave);
  stopCanvasEvents(templateSaveMode);
  stopCanvasEvents(templateDelete);
  stopCanvasEvents(navigatorRailHost);
  stopWheelEvents(groupFilter);
  stopWheelEvents(scroll);
  stopWheelEvents(navigatorRailHost);

  select.addEventListener("change", () => {
    setWidgetValue(node, "yaml_file", select.value);
    node.promptboardSelectedTemplate = "";
    writeStoredTemplateState(node);
    updateTemplateControls(node);
    loadSelectedYaml(node);
  });
  yamlSearch.addEventListener("input", () => {
    node.promptboardYamlSearchState = null;
    scheduleYamlSearch(node);
  });
  yamlSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    runYamlSearch(node, event.shiftKey ? -1 : 1);
  });
  templateSelect.addEventListener("change", () => {
    if (!templateSelect.value) {
      node.promptboardSelectedTemplate = "";
      writeStoredTemplateState(node);
      updateTemplateControls(node);
      return;
    }
    loadBoardTemplate(node, templateSelect.value);
  });
  templateSelect.addEventListener("keydown", (event) => {
    handleTemplateSaveShortcut(event, node);
  });
  templateInput.addEventListener("input", () => {
    node.promptboardTemplateName = templateInput.value;
    writeStoredTemplateState(node);
  });
  boardSearch.addEventListener("input", () => {
    node.promptboardBoardSearchState = null;
    scheduleBoardSearch(node);
  });
  boardSearch.addEventListener("focus", () => {
    if (boardSearch.value.trim()) {
      runBoardSearch(node);
    }
  });
  boardSearch.addEventListener("keydown", (event) => {
    if (handleTemplateSaveShortcut(event, node)) {
      return;
    }
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      hideBoardSearchMenu(node);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (node.promptboardBoardSearchTimer) {
        clearTimeout(node.promptboardBoardSearchTimer);
        node.promptboardBoardSearchTimer = null;
      }
      if (node.promptboardBoardSearchState?.query !== boardSearch.value.trim()) {
        runBoardSearch(node);
      }
      const state = node.promptboardBoardSearchState;
      if (state?.matches?.length) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setBoardSearchMenuIndex(node, state.index + direction);
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (node.promptboardBoardSearchTimer) {
        clearTimeout(node.promptboardBoardSearchTimer);
        node.promptboardBoardSearchTimer = null;
      }
      if (node.promptboardBoardSearchState?.query !== boardSearch.value.trim()) {
        runBoardSearch(node);
      }
      const state = node.promptboardBoardSearchState;
      if (boardSearchMenu.parentElement && state?.matches?.length) {
        if (event.shiftKey) {
          state.index = (state.index - 1 + state.matches.length) % state.matches.length;
        }
        navigateToBoardSearchMatch(node, state.index);
      } else {
        runBoardSearch(node, event.shiftKey ? -1 : 1);
      }
    }
  });
  boardSearch.addEventListener("blur", () => {
    window.setTimeout(() => hideBoardSearchMenu(node), 120);
  });
  templateInput.addEventListener("keydown", (event) => {
    if (handleTemplateSaveShortcut(event, node)) {
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      saveBoardTemplateWithSelectedMode(node, templateInput.value);
    }
  });
  templateSaveMode.addEventListener("change", () => {
    node.promptboardTemplateSaveMode =
      templateSaveMode.value === TEMPLATE_SAVE_MODE_NEW ? TEMPLATE_SAVE_MODE_NEW : TEMPLATE_SAVE_MODE_SAVE;
    updateTemplateControls(node);
  });
  templateSaveMode.addEventListener("keydown", (event) => {
    handleTemplateSaveShortcut(event, node);
  });
  textarea.addEventListener("input", () => {
    updateYamlTextFromEditor(node, textarea.value);
  });
  textarea.addEventListener("keydown", (event) => {
    handleYamlSaveShortcut(event, node);
  });
  save.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    saveSelectedYaml(node);
  });
  templateSave.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    saveBoardTemplateWithSelectedMode(node, templateInput.value);
  });
  templateSave.addEventListener("keydown", (event) => {
    handleTemplateSaveShortcut(event, node);
  });
  templateDelete.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    deleteBoardTemplate(node, templateInput.value);
  });
  templateDelete.addEventListener("keydown", (event) => {
    handleTemplateSaveShortcut(event, node);
  });

  yamlSearchRow.append(yamlSearch, yamlSearchCount);
  editor.append(editorHost, textarea);
  yamlContent.append(select, yamlSearchRow, editor, save, status);
  left.append(yamlContent);
  templateSaveCombo.append(templateSave, templateSaveMode);
  toolbarTemplateRow.append(templateSelect, templateInput, templateSaveCombo, templateDelete);
  boardSearchRow.append(boardSearch, boardSearchCount);
  toolbarSearchRow.append(boardSearchRow, createResetButton(node));
  toolbar.append(toolbarTemplateRow, toolbarSearchRow);
  right.append(toolbar, templateStatus, groupFilter, navigatorRailHost, scroll);
  root.append(right, yamlToggle, left);

  node.promptboardElement = root;
  node.promptboardYamlPanel = left;
  node.promptboardYamlToggleButton = yamlToggle;
  node.promptboardFileSelect = select;
  node.promptboardYamlSearchInput = yamlSearch;
  node.promptboardYamlSearchCount = yamlSearchCount;
  node.promptboardEditor = editor;
  node.promptboardEditorHost = editorHost;
  node.promptboardTextarea = textarea;
  node.promptboardStatusElement = status;
  node.promptboardTemplateSelect = templateSelect;
  node.promptboardBoardSearchInput = boardSearch;
  node.promptboardBoardSearchCount = boardSearchCount;
  node.promptboardBoardSearchRow = boardSearchRow;
  node.promptboardBoardSearchMenu = boardSearchMenu;
  node.promptboardGroupFilter = groupFilter;
  node.promptboardTemplateInput = templateInput;
  node.promptboardTemplateSaveButton = templateSave;
  node.promptboardTemplateSaveModeSelect = templateSaveMode;
  node.promptboardTemplateDeleteButton = templateDelete;
  node.promptboardTemplateStatusElement = templateStatus;
  node.promptboardNavigatorRailHost = navigatorRailHost;
  node.promptboardScroll = scroll;
  setYamlPanelOpen(node, !!node.promptboardYamlPanelOpen);
  renderFromYaml(node);
  createCodeMirrorEditor(node, editorHost, textarea);
  updateTemplateControls(node);
  refreshYamlFileOptions(node);

  return root;
}

function ensureLayoutWidget(node) {
  let layoutWidget = widget(node, LAYOUT_WIDGET);
  if (layoutWidget) {
    return layoutWidget;
  }

  const element = createSplitElement(node);
  layoutWidget = node.addDOMWidget(LAYOUT_WIDGET, "custom", element, {
    serialize: false,
    getMinHeight: () => MIN_LAYOUT_HEIGHT,
    hideOnZoom: true,
  });
  layoutWidget.serialize = false;
  layoutWidget.computeSize = (width) => [width ?? Number(node.size?.[0] ?? MIN_NODE_WIDTH), MIN_LAYOUT_HEIGHT];
  layoutWidget.computeLayoutSize = () => ({
    minHeight: MIN_LAYOUT_HEIGHT,
    minWidth: MIN_NODE_WIDTH - PANEL_GUTTER,
  });

  return layoutWidget;
}

function syncLayoutSize(node) {
  const element = node.promptboardElement;
  if (!element) {
    return;
  }
  element.style.width = `${Math.max(320, Number(node.size?.[0] ?? MIN_NODE_WIDTH) - PANEL_GUTTER)}px`;
  element.style.height = `${layoutHeight(node)}px`;
  node.promptboardCodeMirror?.requestMeasure?.();
}

function scheduleLayoutSizeSync(node) {
  if (!node.promptboardElement || typeof requestAnimationFrame !== "function") {
    syncLayoutSize(node);
    return;
  }

  const previousFrames = node.promptboardLayoutFrames;
  if (Array.isArray(previousFrames)) {
    for (const frame of previousFrames) {
      cancelAnimationFrame(frame);
    }
  }

  const frames = [];
  node.promptboardLayoutFrames = frames;
  frames.push(requestAnimationFrame(() => {
    frames.push(requestAnimationFrame(() => {
      if (node.promptboardLayoutFrames !== frames) {
        return;
      }
      node.promptboardLayoutFrames = null;
      node.promptboardLayoutReady = true;
      syncLayoutSize(node);
      app.canvas?.setDirty(true, true);
    }));
  }));
}

function reorderWidgets(node) {
  const widgets = node.widgets ?? [];
  const ordered = [
    widget(node, LAYOUT_WIDGET),
    widget(node, "yaml_file"),
    widget(node, "yaml_text"),
    widget(node, "selected_state"),
  ].filter(Boolean);
  const rest = widgets.filter((item) => !ordered.includes(item));

  widgets.length = 0;
  widgets.push(...ordered, ...rest);
}

function applySavedValues(node, info) {
  const values = info?.widgets_values;
  if (!Array.isArray(values)) {
    return;
  }
  setWidgetValue(node, "yaml_file", String(values[0] ?? DEFAULT_YAML_FILE).replace(/^workflows\//, ""));
  setWidgetValue(node, "yaml_text", values[1] ?? "");
  setWidgetValue(node, "selected_state", values[2] ?? "{}");
}

function serializeValues(node, info) {
  info.widgets_values = [
    widgetValue(node, "yaml_file", DEFAULT_YAML_FILE),
    widgetValue(node, "yaml_text", ""),
    widgetValue(node, "selected_state", "{}"),
  ];
}

function finalizeNode(node, info = null, isNewNode = false) {
  if (info) {
    applySavedValues(node, info);
  }
  node.promptboardLayoutReady = !isNewNode;
  if (isNewNode) {
    node.size = [MIN_NODE_WIDTH, 420];
  } else {
    restoreTemplateState(node);
  }
  clampSize(node);
  node.resizable = true;
  hideSourceWidgets(node);
  ensureLayoutWidget(node);
  reorderWidgets(node);
  syncLayoutSize(node);
  scheduleLayoutSizeSync(node);
  refreshBoardTemplatesAndLoadStored(node);
  app.canvas?.setDirty(true, true);
}

app.registerExtension({
  name: "comfyui.promptboard",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_NAME) {
      return;
    }

    nodeType.prototype.resizable = true;

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = onNodeCreated?.apply(this, arguments);
      if (isSplitNode(this)) {
        finalizeNode(this, null, true);
      }
      return result;
    };

    const onConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function (info) {
      const result = onConfigure?.apply(this, arguments);
      if (isSplitNode(this)) {
        finalizeNode(this, info);
      }
      return result;
    };

    const onSerialize = nodeType.prototype.onSerialize;
    nodeType.prototype.onSerialize = function (info) {
      const result = onSerialize?.apply(this, arguments);
      if (isSplitNode(this)) {
        serializeValues(this, info);
      }
      return result;
    };

    const onResize = nodeType.prototype.onResize;
    nodeType.prototype.onResize = function () {
      const result = onResize?.apply(this, arguments);
      if (isSplitNode(this)) {
        clampSize(this);
        syncLayoutSize(this);
        if (this.promptboardBoardSearchMenu?.parentElement) {
          showBoardSearchMenu(this);
        }
        app.canvas?.setDirty(true, true);
      }
      return result;
    };

    const onRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      hideBoardSearchMenu(this);
      return onRemoved?.apply(this, arguments);
    };
  },
});
