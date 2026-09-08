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
import {
  FAMILY_STATE_KEY,
  composeTagFamilyText,
  emptyTagFamilyState,
  normalizeTagFamilyState,
  setTagFamilySelected,
  tagFamilyAllowedCombinations,
  tagFamilyCombinationLabel,
  tagFamilyCombinationSelected,
  tagFamilySelectedCombinations,
  tagFamilySlotIds,
  tagFamilySlotTags,
  tagFamilyTargetEntries,
} from "./promptboard_tag_family_state.mjs";
import { normalizeYamlDocument } from "./promptboard_yaml.mjs";

const NODE_NAME = "PromptBoard";
const LAYOUT_WIDGET = "split_layout";
const RESET_BUTTON = "초기화 ▾";
const TEMPLATE_ACTION_BUTTON = "템플릿 ▾";
const SAVE_TEMPLATE_BUTTON = "저장";
const SAVE_TEMPLATE_NEW_BUTTON = "새로 저장";
const DELETE_TEMPLATE_BUTTON = "삭제";
const TEMPLATE_SAVE_MODE_SAVE = "save";
const TEMPLATE_SAVE_MODE_NEW = "new";
const DEFAULT_YAML_FILE = "default.yaml";
const INLINE_YAML_OPTION = "inline";
const HIDDEN_MARK = "__promptboardHiddenWidget";
const YAML_SOURCE_PANEL_ENABLED = false;
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
const YAML_RELOAD_EVENT = "promptboard:yaml-reloaded";
const YAML_RELOAD_SOURCE = "promptboard";
const LEGACY_GROUP_ALL = "전체";
const DEFAULT_UI_GROUP = "기타";
const UI_GROUP_ACCENTS = {
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
const RELATION_FAMILY_GROUP_PREFIXES = new Set(["grabbing", "spreading"]);
const TOOLBAR_ACTION_WIDTH = "116px";
const UI_GROUP_ORDER = ["캐릭터", "색상", "구도", "파트너", "의상", "세트의상", "화면/장소", "기타"];
const BLANK_CANVAS_DRAG_INTERACTIVE_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[role='button']",
  "[role='option']",
  ".cm-editor",
  ".promptboard-search-menu",
  ".promptboard-tag-modifiers",
].join(",");
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

function selectedYamlFile(node) {
  const selectValue = String(node.promptboardFileSelect?.value ?? "").trim();
  const widgetYamlFile = String(widgetValue(node, "yaml_file", DEFAULT_YAML_FILE) ?? "").trim();
  return (selectValue || widgetYamlFile || DEFAULT_YAML_FILE).replace(/^workflows\//, "");
}

function syncSelectedYamlFile(node) {
  const yamlFile = selectedYamlFile(node);
  setWidgetValue(node, "yaml_file", yamlFile);
  if (node.promptboardFileSelect && node.promptboardFileSelect.value !== yamlFile) {
    node.promptboardFileSelect.value = yamlFile;
  }
  return yamlFile;
}

function dispatchYamlReload(node, yamlFile) {
  if (!yamlFile || yamlFile === INLINE_YAML_OPTION) {
    return;
  }
  window.dispatchEvent(new CustomEvent(YAML_RELOAD_EVENT, {
    detail: {
      yamlFile: String(yamlFile),
      source: YAML_RELOAD_SOURCE,
      sourceNode: node,
    },
  }));
}

function noCacheUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}_=${Date.now()}`;
}

function installYamlReloadListener(node) {
  if (node.promptboardYamlReloadListener) {
    return;
  }

  node.promptboardYamlReloadListener = async (event) => {
    const detail = event.detail ?? {};
    const yamlFile = String(detail.yamlFile ?? "");
    if (
      detail.sourceNode === node
      || !yamlFile
      || widgetValue(node, "yaml_file", DEFAULT_YAML_FILE) !== yamlFile
    ) {
      return;
    }
    const loaded = await loadSelectedYaml(node, { resetState: false, broadcast: false });
    if (loaded) {
      setTemporaryStatus(node, "Reloaded YAML");
    }
  };
  window.addEventListener(YAML_RELOAD_EVENT, node.promptboardYamlReloadListener);
}

function removeYamlReloadListener(node) {
  if (!node.promptboardYamlReloadListener) {
    return;
  }
  window.removeEventListener(YAML_RELOAD_EVENT, node.promptboardYamlReloadListener);
  node.promptboardYamlReloadListener = null;
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

function findYamlTagFamilyMatch(text, familyId) {
  const lines = String(text ?? "").split("\n");
  const rootBlock = findTopLevelYamlBlock(lines, "_promptboard");
  const familiesBlock = findNestedYamlBlock(lines, rootBlock, "tagFamilies");
  const familyBlock = findNestedYamlBlock(lines, familiesBlock, familyId);
  return familyBlock ? yamlLineMatch(lines, familyBlock.start) : null;
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

function focusYamlTagFamily(node, familyId) {
  focusYamlSourceMatch(node, findYamlTagFamilyMatch(widgetValue(node, "yaml_text", ""), familyId));
}

function focusYamlNavigatorItem(node, item) {
  if (item?.kind === "composite") {
    focusYamlNavigatorItem(node, item.children?.[0]);
    return;
  }
  if (item?.kind === "attribute") {
    focusYamlAttributeTag(node, item.boardId, item.targetId, item.attributeId, "");
    return;
  }
  if (item?.kind === "attributeTarget") {
    const attributeId = Object.keys(item.attributes ?? {})[0] ?? "";
    focusYamlAttributeTag(node, item.boardId, item.targetId, attributeId, "");
    return;
  }
  if (item?.kind === "family") {
    focusYamlTagFamily(node, item.familyId);
    return;
  }
  if (item?.kind === "familyGroup") {
    focusYamlTagFamily(node, item.group.members[0]?.familyId);
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
  } else if (match.kind === "family") {
    focusYamlTagFamily(node, match.familyId);
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

function escapeRegexText(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function attributeBoardUiGroup(board) {
  return normalizeUiGroup(board?.uiGroup) || DEFAULT_UI_GROUP;
}

function attributeBoardStandalone(board) {
  return board?.uiStandalone !== false;
}

function tagFamilyUiGroup(family, target = null) {
  return normalizeUiGroup(target?.uiGroup) || inferUiGroup(target || family);
}

function trimTargetPrefix(label, uiGroup) {
  let text = String(label || "").trim();
  const group = String(uiGroup || "").trim();
  if (group) {
    text = text.replace(new RegExp(`^${escapeRegexText(group)}\\s+`), "").trim();
  }
  return text.replace(/^(캐릭터|파트너)\s+/, "").trim();
}

function tagFamilyTargetLabel(familyId, family, targetId, target) {
  const familyLabel = family?.label || familyId;
  const targetLabel = String(target?.label || "").trim();
  const uiGroup = tagFamilyUiGroup(family, target);
  const displayLabel = trimTargetPrefix(targetLabel, uiGroup) || familyLabel;
  if (!targetLabel || targetLabel === familyLabel || targetId === "default") {
    return `${uiGroup} > ${familyLabel}`;
  }
  return `${uiGroup} > ${displayLabel}`;
}

function tagFamilyTargetItems(tagFamilies = {}) {
  const items = [];
  for (const [familyId, family] of Object.entries(tagFamilies ?? {})) {
    for (const [targetId, target] of tagFamilyTargetEntries(family)) {
      items.push({ familyId, family, targetId, target });
    }
  }
  return items;
}

function stripRelationPrefix(label) {
  return String(label || "")
    .replace(/^(자기|상대|캐릭터|파트너)\s+/, "")
    .trim();
}

function relationFamilyInfo(familyId, family) {
  const slotIds = tagFamilySlotIds(family);
  if (slotIds.length !== 1) {
    return null;
  }

  const pattern = String(family?.pattern || "");
  const ownMarker = "_own_";
  const anotherMarker = "_another's_";
  const marker = pattern.includes(ownMarker)
    ? ownMarker
    : pattern.includes(anotherMarker) ? anotherMarker : "";
  if (!marker) {
    return null;
  }

  const [prefix] = pattern.split(marker);
  if (!prefix || !RELATION_FAMILY_GROUP_PREFIXES.has(prefix)) {
    return null;
  }

  const relation = marker === ownMarker
    ? { value: "own", label: "자기", order: 0 }
    : { value: "another's", label: "상대", order: 1 };
  const baseLabel = stripRelationPrefix(family?.label) || prefix.replaceAll("_", " ");
  const baseId = familyId.replace(/(?:Own|Another)$/, "") || prefix.replace(/[^A-Za-z0-9_]/g, "");

  return {
    baseId,
    baseLabel,
    prefix,
    relation,
    slotId: slotIds[0],
  };
}

function familyTargetsSignature(family) {
  return tagFamilyTargetEntries(family)
    .map(([targetId, target]) => `${targetId}:${target?.placeholder || ""}:${tagFamilyUiGroup(family, target)}`)
    .join("|");
}

function groupedRelationFamilies(tagFamilies = {}) {
  const buckets = new Map();

  for (const [familyId, family] of Object.entries(tagFamilies ?? {})) {
    const info = relationFamilyInfo(familyId, family);
    if (!info) {
      continue;
    }
    const key = `${info.prefix}\u0000${info.slotId}\u0000${familyTargetsSignature(family)}`;
    const bucket = buckets.get(key) || {
      groupId: info.baseId,
      label: info.baseLabel,
      prefix: info.prefix,
      slotId: info.slotId,
      members: [],
      familyIds: new Set(),
    };
    bucket.members.push({ familyId, family, info });
    bucket.familyIds.add(familyId);
    bucket.label = bucket.label || info.baseLabel;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.members.length > 1)
    .map((bucket) => {
      bucket.members.sort((left, right) => left.info.relation.order - right.info.relation.order);
      return bucket;
    });
}

function groupedRelationFamilyIds(tagFamilies = {}) {
  const ids = new Set();
  for (const group of groupedRelationFamilies(tagFamilies)) {
    for (const familyId of group.familyIds) {
      ids.add(familyId);
    }
  }
  return ids;
}

function familyGroupTargetItems(tagFamilies = {}) {
  const items = [];
  for (const group of groupedRelationFamilies(tagFamilies)) {
    const firstFamily = group.members[0]?.family;
    for (const [targetId, target] of tagFamilyTargetEntries(firstFamily)) {
      items.push({ group, targetId, target });
    }
  }
  return items;
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

function availableUiGroups(config, attributeBoards = {}, tagFamilies = {}, uiComposites = {}) {
  const groups = new Set();
  for (const item of Object.values(config ?? {})) {
    groups.add(categoryUiGroup(item));
  }
  for (const { family, target } of tagFamilyTargetItems(tagFamilies)) {
    groups.add(tagFamilyUiGroup(family, target));
  }
  for (const { group, target } of familyGroupTargetItems(tagFamilies)) {
    const family = group.members[0]?.family;
    groups.add(tagFamilyUiGroup(family, target));
  }
  for (const board of Object.values(attributeBoards ?? {})) {
    if (!attributeBoardStandalone(board)) {
      continue;
    }
    groups.add(attributeBoardUiGroup(board));
  }
  for (const composite of Object.values(uiComposites ?? {})) {
    const group = normalizeUiGroup(composite?.uiGroup);
    if (group) {
      groups.add(group);
    }
  }
  const ordered = UI_GROUP_ORDER.filter((group) => groups.has(group));
  const remaining = [...groups].filter((group) => !UI_GROUP_ORDER.includes(group));
  return [...ordered, ...remaining];
}

function activeUiGroup(node, config = node.promptboardConfig ?? {}) {
  const groups = availableUiGroups(
    config,
    node.promptboardYamlModel?.attributeBoards,
    node.promptboardYamlModel?.tagFamilies,
    node.promptboardYamlModel?.uiComposites,
  );
  const active = normalizeUiGroup(node.promptboardActiveUiGroup);
  if (active && active !== LEGACY_GROUP_ALL && groups.includes(active)) {
    return active;
  }
  const fallback = groups[0] || "";
  node.promptboardActiveUiGroup = fallback;
  return fallback;
}

function categoryMatchesActiveUiGroup(node, item) {
  const active = activeUiGroup(node);
  return categoryUiGroup(item) === active;
}

function visibleCategoryEntries(node) {
  const config = node.promptboardConfig ?? {};
  return Object.entries(config).filter(([, item]) => categoryMatchesActiveUiGroup(node, item));
}

function allCategoryEntries(node) {
  return Object.entries(node.promptboardConfig ?? {});
}

function visibleAttributeBoardEntries(node) {
  const active = activeUiGroup(node);
  return Object.entries(node.promptboardYamlModel?.attributeBoards ?? {}).filter(([, board]) =>
    attributeBoardStandalone(board) && attributeBoardUiGroup(board) === active,
  );
}

function allAttributeBoardEntries(node) {
  return Object.entries(node.promptboardYamlModel?.attributeBoards ?? {});
}

function visibleTagFamilyEntries(node) {
  const active = activeUiGroup(node);
  const groupedIds = groupedRelationFamilyIds(node.promptboardYamlModel?.tagFamilies);
  return tagFamilyTargetItems(node.promptboardYamlModel?.tagFamilies).filter(({ familyId, family, target }) =>
    !groupedIds.has(familyId) && tagFamilyUiGroup(family, target) === active,
  );
}

function visibleFamilyGroupEntries(node) {
  const active = activeUiGroup(node);
  return familyGroupTargetItems(node.promptboardYamlModel?.tagFamilies).filter(({ group, target }) => {
    const family = group.members[0]?.family;
    return tagFamilyUiGroup(family, target) === active;
  });
}

function allTagFamilyEntries(node) {
  return tagFamilyTargetItems(node.promptboardYamlModel?.tagFamilies);
}

function navigatorItemId(item) {
  if (!item) {
    return "";
  }
  if (item.kind === "composite") {
    return `composite\u0000${item.compositeId}`;
  }
  if (item.kind === "attribute" || item.kind === "attributeTarget") {
    return `attributeTarget\u0000${item.boardId}\u0000${item.targetId}`;
  }
  if (item.kind === "family") {
    return `family\u0000${item.familyId}\u0000${item.targetId || "default"}`;
  }
  if (item.kind === "familyGroup") {
    return `familyGroup\u0000${item.groupId}\u0000${item.targetId || "default"}`;
  }
  return `category\u0000${item.category}`;
}

function familyGroupItemForFamily(node, familyId, targetId) {
  for (const { group, targetId: candidateTargetId, target } of familyGroupTargetItems(node.promptboardYamlModel?.tagFamilies)) {
    if (!group.familyIds.has(familyId)) {
      continue;
    }
    const resolvedTargetId = targetId || candidateTargetId;
    if (candidateTargetId !== resolvedTargetId) {
      continue;
    }
    return {
      kind: "familyGroup",
      groupId: group.groupId,
      group,
      targetId: resolvedTargetId,
      label: group.label,
      context: tagFamilyUiGroup(group.members[0]?.family, target),
      uiGroup: tagFamilyUiGroup(group.members[0]?.family, target),
      placeholder: target?.placeholder,
    };
  }
  return null;
}

function compositeItemForMatch(node, match) {
  if (!node || !match) {
    return null;
  }
  return navigatorItems(node).find((item) =>
    item.kind === "composite" && item.children?.some((child) => {
      if (match.kind === "category") {
        return child.kind === "category" && child.category === match.category;
      }
      if (match.kind === "family") {
        return child.kind === "family" &&
          child.familyId === match.familyId &&
          (child.targetId || "default") === (match.targetId || "default");
      }
      return false;
    }),
  ) || null;
}

function navigatorItemFromMatch(match, node = null) {
  if (!match) {
    return "";
  }
  if (match.kind === "attribute") {
    return navigatorItemId({ kind: "attributeTarget", boardId: match.boardId, targetId: match.targetId });
  }
  if (match.kind === "family") {
    if (node) {
      const compositeItem = compositeItemForMatch(node, match);
      if (compositeItem) {
        return navigatorItemId(compositeItem);
      }
      const groupItem = familyGroupItemForFamily(node, match.familyId, match.targetId);
      if (groupItem) {
        return navigatorItemId(groupItem);
      }
    }
    return navigatorItemId({ kind: "family", familyId: match.familyId, targetId: match.targetId });
  }
  if (match.kind === "familyGroup") {
    return navigatorItemId({ kind: "familyGroup", groupId: match.groupId, targetId: match.targetId });
  }
  if (node) {
    const compositeItem = compositeItemForMatch(node, match);
    if (compositeItem) {
      return navigatorItemId(compositeItem);
    }
  }
  return navigatorItemId({ kind: "category", category: match.category });
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

function composeModifiedTagText(model, state, category, tag) {
  const parts = [];
  for (const [modifierId, modifier] of Object.entries(model?.modifiers ?? {})) {
    if (!tag?.modifiers?.[modifierId]) {
      continue;
    }
    parts.push(...tagModifierSelectedTexts(state, category, tag.text, modifierId));
  }
  parts.push(String(tag?.text ?? ""));
  return parts.filter(Boolean).join(" ");
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

function attributeTargetNavigatorItem(node, boardId, targetId, uiGroupOverride = "") {
  const board = node.promptboardYamlModel?.attributeBoards?.[boardId];
  const target = board?.targets?.[targetId];
  if (!board || !target) {
    return null;
  }
  const uiGroup = normalizeUiGroup(uiGroupOverride) || attributeBoardUiGroup(board);
  return {
    kind: "attributeTarget",
    boardId,
    targetId,
    label: target.label || targetId,
    context: board.label || boardId,
    uiGroup,
    attributes: target.attributes ?? {},
  };
}

function categoryPanelItems(node, item) {
  const uiGroup = categoryUiGroup(item);
  return (item?.uiPanels ?? [])
    .map((panel) => {
      if (panel?.type !== "attributeTarget") {
        return null;
      }
      return attributeTargetNavigatorItem(node, panel.board, panel.target, uiGroup);
    })
    .filter(Boolean);
}

function compositeChildKey(child) {
  if (child?.kind === "category") {
    return `category\u0000${child.category}`;
  }
  if (child?.kind === "family") {
    return `family\u0000${child.family}\u0000${child.target || "default"}`;
  }
  return "";
}

function navigatorCompositeKey(item) {
  if (item?.kind === "category") {
    return `category\u0000${item.category}`;
  }
  if (item?.kind === "family") {
    return `family\u0000${item.familyId}\u0000${item.targetId || "default"}`;
  }
  return "";
}

function createCompositeNavigatorItem(compositeId, composite, children) {
  const uiGroup = normalizeUiGroup(composite?.uiGroup) || children[0]?.uiGroup || DEFAULT_UI_GROUP;
  return {
    kind: "composite",
    compositeId,
    label: composite?.label || compositeId,
    context: uiGroup,
    uiGroup,
    children,
  };
}

function mergeNavigatorItems(items, uiComposites = {}) {
  const compositeEntries = Object.entries(uiComposites ?? {});
  if (!compositeEntries.length) {
    return items;
  }

  const consumed = new Set();
  const insertions = new Map();
  for (const [compositeId, composite] of compositeEntries) {
    const childKeys = (composite.items ?? []).map(compositeChildKey).filter(Boolean);
    if (!childKeys.length) {
      continue;
    }
    const matches = [];
    for (const childKey of childKeys) {
      const index = items.findIndex((item, itemIndex) =>
        !consumed.has(itemIndex) && navigatorCompositeKey(item) === childKey,
      );
      if (index < 0) {
        matches.length = 0;
        break;
      }
      matches.push({ index, item: items[index] });
    }
    if (matches.length !== childKeys.length) {
      continue;
    }
    const firstIndex = Math.min(...matches.map((match) => match.index));
    for (const match of matches) {
      consumed.add(match.index);
    }
    insertions.set(firstIndex, createCompositeNavigatorItem(
      compositeId,
      composite,
      matches.sort((left, right) => left.index - right.index).map((match) => match.item),
    ));
  }

  const merged = [];
  for (let index = 0; index < items.length; index += 1) {
    if (insertions.has(index)) {
      merged.push(insertions.get(index));
    }
    if (!consumed.has(index)) {
      merged.push(items[index]);
    }
  }
  return merged;
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
      uiPanels: item.uiPanels ?? [],
    });
  }
  for (const { familyId, family, targetId, target } of visibleTagFamilyEntries(node)) {
    const uiGroup = tagFamilyUiGroup(family, target);
    items.push({
      kind: "family",
      familyId,
      targetId,
      label: tagFamilyTargetLabel(familyId, family, targetId, target),
      context: uiGroup,
      uiGroup,
      placeholder: target.placeholder,
    });
  }
  for (const { group, targetId, target } of visibleFamilyGroupEntries(node)) {
    const family = group.members[0]?.family;
    const uiGroup = tagFamilyUiGroup(family, target);
    items.push({
      kind: "familyGroup",
      groupId: group.groupId,
      group,
      targetId,
      label: group.label,
      context: uiGroup,
      uiGroup,
      placeholder: target.placeholder,
    });
  }
  for (const [boardId, board] of visibleAttributeBoardEntries(node)) {
    for (const [targetId, target] of Object.entries(board.targets ?? {})) {
      const item = attributeTargetNavigatorItem(node, boardId, targetId, attributeBoardUiGroup(board));
      if (item) {
        items.push(item);
      }
    }
  }
  return mergeNavigatorItems(items, node.promptboardYamlModel?.uiComposites);
}

function navigatorItemCount(node, item) {
  const state = node.promptboardState ?? {};
  if (item?.kind === "composite") {
    return item.children.reduce((total, child) => total + navigatorItemCount(node, child), 0);
  }
  if (item?.kind === "attribute") {
    return attributeSelectedTexts(state, item.boardId, item.targetId, item.attributeId).length;
  }
  if (item?.kind === "attributeTarget") {
    const target = node.promptboardYamlModel?.attributeBoards?.[item.boardId]?.targets?.[item.targetId];
    return attributeCountForTarget(state, item.boardId, item.targetId, target);
  }
  if (item?.kind === "family") {
    return tagFamilySelectedCombinations(state, item.familyId, item.targetId).length;
  }
  if (item?.kind === "familyGroup") {
    return item.group.members.reduce(
      (total, member) => total + tagFamilySelectedCombinations(state, member.familyId, item.targetId).length,
      0,
    );
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

function categorySelectedArray(state, category) {
  const entry = state?.[category];
  if (Array.isArray(entry)) {
    return entry.map((value) => String(value));
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry) && Array.isArray(entry.selected)) {
    return entry.selected.map((value) => String(value));
  }
  return [];
}

function selectedTextsForCategory(category, tags, selectedState) {
  if (Object.prototype.hasOwnProperty.call(selectedState, category)) {
    const selected = categorySelectedArray(selectedState, category);
    if (selected.length) {
      const selectedSet = new Set(selected);
      return tags.map((tag) => tag.text).filter((text) => selectedSet.has(text));
    }
    return [];
  }

  return tags.filter((tag) => tag.default).map((tag) => tag.text);
}

function normalizeModifierValues(tags, rawValues, mode, path, warnings) {
  if (!Array.isArray(rawValues)) {
    if (rawValues != null) {
      warnings.push(`${path} must be an array; the saved value was cleared.`);
    }
    return [];
  }

  const available = new Set(tags.map((tag) => tag.text));
  const requested = rawValues.map((value) => String(value));
  const invalid = requested.filter((value) => !available.has(value));
  if (invalid.length) {
    warnings.push(`${path} removed unknown tags: ${[...new Set(invalid)].join(", ")}`);
  }

  if (mode === "single") {
    const selected = requested.find((value) => available.has(value));
    if (requested.filter((value) => available.has(value)).length > 1) {
      warnings.push(`${path} kept only one tag because its mode is single.`);
    }
    return selected ? [selected] : [];
  }

  const selected = new Set(requested.filter((value) => available.has(value)));
  return tags.map((tag) => tag.text).filter((value) => selected.has(value));
}

function normalizeCategoryModifierState(model, selectedState, category, item, selected, warnings) {
  const sourceEntry = selectedState?.[category];
  const sourceModifiers =
    sourceEntry && typeof sourceEntry === "object" && !Array.isArray(sourceEntry) && sourceEntry.modifiers
      ? sourceEntry.modifiers
      : {};
  const selectedSet = new Set(selected);
  const modifiers = {};

  for (const tag of item.tags ?? []) {
    if (!selectedSet.has(tag.text) || !tag.modifiers) {
      continue;
    }
    const tagState = sourceModifiers?.[tag.text];
    if (!tagState || typeof tagState !== "object" || Array.isArray(tagState)) {
      continue;
    }
    for (const [modifierId, modifier] of Object.entries(model.modifiers ?? {})) {
      if (!tag.modifiers?.[modifierId]) {
        continue;
      }
      const tagSet = model.tagSets?.[modifier.source];
      const values = normalizeModifierValues(
        tagSet?.tags ?? [],
        tagState[modifierId],
        modifier.mode,
        `${category}.${tag.text}.${modifierId}`,
        warnings,
      );
      if (values.length) {
        if (!modifiers[tag.text]) {
          modifiers[tag.text] = {};
        }
        modifiers[tag.text][modifierId] = values;
      }
    }
  }

  return modifiers;
}

function pruneSelectedState(model, selectedState, warnings = []) {
  const config = model.categories ?? {};
  const nextState = {};
  for (const [category, item] of Object.entries(config)) {
    const tagTexts = new Set(item.tags.map((tag) => tag.text));
    const selected = selectedTextsForCategory(category, item.tags, selectedState).filter((text) =>
      tagTexts.has(text),
    );
    const modifiers = normalizeCategoryModifierState(model, selectedState, category, item, selected, warnings);
    nextState[category] = Object.keys(modifiers).length ? { selected, modifiers } : selected;
  }
  if (Object.keys(model.attributeBoards ?? {}).length) {
    nextState[ATTRIBUTE_STATE_KEY] = normalizeAttributeState(model, selectedState, warnings);
  }
  if (Object.keys(model.tagFamilies ?? {}).length) {
    nextState[FAMILY_STATE_KEY] = normalizeTagFamilyState(model, selectedState, warnings);
  }
  return nextState;
}

function selectedCount(state, category, tags) {
  const selected = new Set(categorySelectedArray(state, category));
  return tags.filter((tag) => selected.has(tag.text)).length;
}

function selectedCountsByUiGroup(config, attributeBoards, tagFamilies, state) {
  const counts = {};
  for (const [category, item] of Object.entries(config ?? {})) {
    const count = selectedCount(state, category, item.tags ?? []);
    const group = categoryUiGroup(item);
    counts[group] = (counts[group] ?? 0) + count;
  }
  for (const [boardId, board] of Object.entries(attributeBoards ?? {})) {
    const count = Object.entries(board.targets ?? {}).reduce(
      (boardTotal, [targetId, target]) =>
        boardTotal + attributeCountForTarget(state, boardId, targetId, target),
      0,
    );
    const group = attributeBoardUiGroup(board);
    counts[group] = (counts[group] ?? 0) + count;
  }
  for (const { familyId, family, targetId, target } of tagFamilyTargetItems(tagFamilies)) {
    const count = tagFamilySelectedCombinations(state, familyId, targetId).length;
    const group = tagFamilyUiGroup(family, target);
    counts[group] = (counts[group] ?? 0) + count;
  }
  return counts;
}

function selectedTotalCount(config, attributeBoards, tagFamilies, state) {
  return Object.values(selectedCountsByUiGroup(config, attributeBoards, tagFamilies, state))
    .reduce((total, count) => total + count, 0);
}

function setSelected(state, category, tagText, enabled) {
  const current = state[category];
  const selected = new Set(categorySelectedArray(state, category));
  if (enabled) {
    selected.add(tagText);
  } else {
    selected.delete(tagText);
  }
  if (current && typeof current === "object" && !Array.isArray(current)) {
    const modifiers = current.modifiers && typeof current.modifiers === "object" ? { ...current.modifiers } : {};
    if (!enabled) {
      delete modifiers[tagText];
    }
    state[category] = Object.keys(modifiers).length
      ? { selected: [...selected], modifiers }
      : [...selected];
    return;
  }
  state[category] = [...selected];
}

function tagModifierSelectedTexts(state, category, tagText, modifierId) {
  const entry = state?.[category];
  const values = entry?.modifiers?.[tagText]?.[modifierId];
  return Array.isArray(values) ? values.map((value) => String(value)) : [];
}

function ensureCategoryObjectState(state, category) {
  const current = state[category];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    if (!Array.isArray(current.selected)) {
      current.selected = [];
    }
    if (!current.modifiers || typeof current.modifiers !== "object" || Array.isArray(current.modifiers)) {
      current.modifiers = {};
    }
    return current;
  }
  const next = { selected: categorySelectedArray(state, category), modifiers: {} };
  state[category] = next;
  return next;
}

function cleanupCategoryObjectState(state, category) {
  const current = state[category];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return;
  }
  for (const [tagText, tagState] of Object.entries(current.modifiers ?? {})) {
    if (!tagState || typeof tagState !== "object" || !Object.keys(tagState).length) {
      delete current.modifiers[tagText];
    }
  }
  if (!Object.keys(current.modifiers ?? {}).length) {
    state[category] = current.selected ?? [];
  }
}

function setTagModifierSelected(model, state, category, tag, modifierId, optionText, enabled) {
  const modifier = model?.modifiers?.[modifierId];
  const tagSet = modifier ? model?.tagSets?.[modifier.source] : null;
  if (!modifier || !tag?.modifiers?.[modifierId] || !tagSet?.tags?.some((candidate) => candidate.text === optionText)) {
    return false;
  }

  const categoryState = ensureCategoryObjectState(state, category);
  if (!categoryState.selected.includes(tag.text)) {
    categoryState.selected.push(tag.text);
  }
  if (!categoryState.modifiers[tag.text]) {
    categoryState.modifiers[tag.text] = {};
  }

  const current = new Set(tagModifierSelectedTexts(state, category, tag.text, modifierId));
  if (modifier.mode === "single") {
    categoryState.modifiers[tag.text][modifierId] = enabled ? [optionText] : [];
  } else {
    if (enabled) {
      current.add(optionText);
    } else {
      current.delete(optionText);
    }
    categoryState.modifiers[tag.text][modifierId] = tagSet.tags
      .map((candidate) => candidate.text)
      .filter((text) => current.has(text));
  }

  if (!categoryState.modifiers[tag.text][modifierId].length) {
    delete categoryState.modifiers[tag.text][modifierId];
  }
  cleanupCategoryObjectState(state, category);
  return true;
}

function clearTagModifierSelected(state, category, tagText, modifierId) {
  const categoryState = ensureCategoryObjectState(state, category);
  if (categoryState.modifiers?.[tagText]) {
    delete categoryState.modifiers[tagText][modifierId];
  }
  cleanupCategoryObjectState(state, category);
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
  if (Object.keys(node.promptboardYamlModel?.tagFamilies ?? {}).length) {
    Object.assign(state, emptyTagFamilyState(node.promptboardYamlModel));
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
  for (const [category, item] of allCategoryEntries(node)) {
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
  for (const [boardId, board] of allAttributeBoardEntries(node)) {
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
  for (const { familyId, family, targetId, target } of allTagFamilyEntries(node)) {
    const uiGroup = tagFamilyUiGroup(family, target);
    const familyLabel = tagFamilyTargetLabel(familyId, family, targetId, target);
    if (regex.test(familyId) || regex.test(familyLabel) || regex.test(targetId)) {
      matches.push({
        kind: "family",
        familyId,
        targetId,
        tagText: "",
        label: String(familyLabel),
        description: "",
        uiGroup,
        context: uiGroup,
      });
    }
    for (const combination of tagFamilyAllowedCombinations(node.promptboardYamlModel, familyId)) {
      const tagText = composeTagFamilyText(family, combination);
      const label = tagFamilyCombinationLabel(node.promptboardYamlModel, familyId, combination) || tagText;
      if (regex.test(label) || regex.test(tagText)) {
        matches.push({
          kind: "family",
          familyId,
          targetId,
          combination,
          tagText,
          label,
          description: tagText,
          uiGroup,
          context: familyLabel,
        });
      }
    }
  }
  return matches;
}

function boardSearchMatchKey(match) {
  if (match?.kind === "attribute") {
    return `attribute\u0000${match.boardId}\u0000${match.targetId}\u0000${match.attributeId}\u0000${match.tagText}`;
  }
  if (match?.kind === "family") {
    return `family\u0000${match.familyId}\u0000${match.targetId || "default"}\u0000${match.tagText}`;
  }
  return `category\u0000${match?.category}\u0000${match?.tagText}`;
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
  if (match.kind === "family") {
    return match.combination
      ? tagFamilyCombinationSelected(
          node.promptboardYamlModel,
          node.promptboardState,
          match.familyId,
          match.targetId,
          match.combination,
        )
      : tagFamilySelectedCombinations(node.promptboardState, match.familyId, match.targetId).length > 0;
  }
  return categorySelectedArray(node.promptboardState, match.category).includes(match.tagText);
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
  const compositeItem = compositeItemForMatch(node, match);
  if (compositeItem && !match.tagText) {
    for (const root of roots) {
      for (const element of root.querySelectorAll(".promptboard-navigator-category")) {
        if (element.dataset.compositeId === compositeItem.compositeId) {
          return element;
        }
      }
    }
  }

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
  if (match.kind === "family") {
    const groupItem = familyGroupItemForFamily(node, match.familyId, match.targetId);
    if (groupItem && !match.tagText) {
      for (const root of roots) {
        for (const element of root.querySelectorAll(".promptboard-navigator-category")) {
          if (
            element.dataset.familyGroupId === groupItem.groupId &&
            element.dataset.targetId === groupItem.targetId
          ) {
            return element;
          }
        }
      }
    }
    const selector = match.tagText ? ".promptboard-tag" : ".promptboard-navigator-category";
    for (const root of roots) {
      for (const element of root.querySelectorAll(selector)) {
        if (element.dataset.familyId !== match.familyId) {
          continue;
        }
        if (element.dataset.targetId !== match.targetId) {
          continue;
        }
        if (!match.tagText || element.dataset.tagText === match.tagText) {
          return element;
        }
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
  if (match?.uiGroup) {
    node.promptboardActiveUiGroup = match.uiGroup;
  }
  const navigatorId = navigatorItemFromMatch(match, node);
  setActiveNavigatorItem(node, navigatorId);
  if (match.kind === "family") {
    const groupItem = familyGroupItemForFamily(node, match.familyId, match.targetId);
    if (groupItem) {
      const draft = ensureFamilyDraft(node);
      draft[navigatorId] = { ...(draft[navigatorId] || {}), memberFamilyId: match.familyId };
    }
  }
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

    .promptboard.is-yaml-source-disabled {
      grid-template-columns: minmax(0, 1fr);
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
	      grid-template-rows: auto minmax(0, 1fr) auto auto;
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
      grid-template-columns: minmax(150px, 1.15fr) minmax(112px, 0.8fr) minmax(128px, 1fr) ${TOOLBAR_ACTION_WIDTH};
      gap: 4px;
      min-width: 0;
    }

    .promptboard-toolbar-search-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) ${TOOLBAR_ACTION_WIDTH};
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

    .promptboard-reset-menu {
      position: relative;
      min-width: 0;
    }

    .promptboard-reset-menu > .promptboard-button {
      width: 100%;
    }

    .promptboard-reset-menu-list {
      box-sizing: border-box;
      position: absolute;
      z-index: 20;
      top: calc(100% + 3px);
      right: 0;
      display: none;
      width: max(170px, 100%);
      padding: 4px;
      border: 1px solid rgba(112, 112, 112, 0.9);
      border-radius: 4px;
      background: rgba(24, 24, 24, 0.98);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.38);
    }

    .promptboard-reset-menu.is-open .promptboard-reset-menu-list {
      display: grid;
      gap: 3px;
    }

    .promptboard-reset-menu-item {
      box-sizing: border-box;
      width: 100%;
      min-height: 24px;
      padding: 4px 7px;
      border: 1px solid transparent;
      border-radius: 3px;
      background: transparent;
      color: #e5d3d3;
      font: 11px Arial, sans-serif;
      text-align: left;
      cursor: pointer;
    }

    .promptboard-reset-menu-item:not(:disabled):hover {
      border-color: rgba(176, 108, 108, 0.72);
      background: rgba(76, 42, 42, 0.92);
      color: #fff1f1;
    }

    .promptboard-reset-menu-item:disabled {
      color: rgba(218, 206, 206, 0.42);
      cursor: default;
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

    .promptboard-template-action-menu {
      position: relative;
      min-width: 0;
    }

    .promptboard-template-action-menu > .promptboard-button {
      width: 100%;
    }

    .promptboard-template-action-list {
      box-sizing: border-box;
      position: absolute;
      z-index: 22;
      top: calc(100% + 3px);
      right: 0;
      display: none;
      width: max(150px, 100%);
      padding: 4px;
      border: 1px solid rgba(112, 112, 112, 0.9);
      border-radius: 4px;
      background: rgba(24, 24, 24, 0.98);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.38);
    }

    .promptboard-template-action-menu.is-open .promptboard-template-action-list {
      display: grid;
      gap: 3px;
    }

    .promptboard-template-action-item {
      box-sizing: border-box;
      width: 100%;
      min-height: 24px;
      padding: 4px 7px;
      border: 1px solid transparent;
      border-radius: 3px;
      background: transparent;
      color: #e0e0e0;
      font: 11px Arial, sans-serif;
      text-align: left;
      cursor: pointer;
    }

    .promptboard-template-action-item:not(:disabled):hover {
      border-color: rgba(116, 156, 196, 0.72);
      background: rgba(42, 58, 76, 0.92);
      color: #f3f8ff;
    }

    .promptboard-template-action-item.is-danger {
      color: #f0d8d8;
    }

    .promptboard-template-action-item.is-danger:not(:disabled):hover {
      border-color: rgba(176, 108, 108, 0.72);
      background: rgba(76, 42, 42, 0.92);
      color: #fff1f1;
    }

    .promptboard-template-action-item:disabled {
      color: rgba(218, 218, 218, 0.42);
      cursor: default;
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
	      grid-template-columns: minmax(0, 1fr);
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

	    .promptboard-tag-modifiers {
	      box-sizing: border-box;
	      display: grid;
	      grid-column: 1 / -1;
	      gap: 6px;
	      margin: 0 0 4px;
	      padding: 6px;
	      border: 1px solid color-mix(in srgb, var(--promptboard-accent) 34%, #4a5157);
	      border-radius: 4px;
	      background: color-mix(in srgb, var(--promptboard-accent) 8%, rgba(24, 29, 32, 0.92));
	    }

	    .promptboard-tag-modifier-group {
	      display: grid;
	      gap: 4px;
	      min-width: 0;
	    }

	    .promptboard-tag-modifier-group .promptboard-tag-section {
	      margin: 0;
	    }

	    .promptboard-tag-modifier-options {
	      display: grid;
	      grid-template-columns: repeat(auto-fit, minmax(min(104px, 100%), 1fr));
	      gap: 4px;
	      min-width: 0;
	    }

	    .promptboard-tag.promptboard-modifier-option {
	      min-height: 22px;
	      height: auto;
	      margin-top: 0;
	      padding: 2px 6px;
	      font-size: 11px;
	    }

	    .promptboard-tag.promptboard-modifier-none {
	      border-color: rgba(129, 137, 145, 0.58);
	      background: rgba(38, 42, 45, 0.9);
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

function isBlankCanvasDragTarget(target) {
  return target instanceof Element && !target.closest(BLANK_CANVAS_DRAG_INTERACTIVE_SELECTOR);
}

function canScrollWithPointerDelta(element, deltaY) {
  const maxScrollTop = element.scrollHeight - element.clientHeight;
  if (maxScrollTop <= 1 || Math.abs(deltaY) < 1) {
    return false;
  }
  if (deltaY > 0) {
    return element.scrollTop > 0;
  }
  return element.scrollTop < maxScrollTop - 1;
}

function graphCanvasElement() {
  return app.canvas?.canvas || document.getElementById("graph-canvas");
}

function canvasPointerOptions(event, buttons) {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: event.clientX,
    clientY: event.clientY,
    screenX: event.screenX,
    screenY: event.screenY,
    button: 0,
    buttons,
    pointerId: event.pointerId || 1,
    pointerType: "mouse",
    isPrimary: true,
  };
}

function dispatchCanvasPointerEvent(canvas, type, event, buttons) {
  const options = canvasPointerOptions(event, buttons);
  try {
    canvas.dispatchEvent(new PointerEvent(type, options));
  } catch {
    // Some older mobile WebViews may not construct PointerEvent reliably.
  }
  const mouseType = type === "pointerdown"
    ? "mousedown"
    : type === "pointermove"
      ? "mousemove"
      : type === "pointerup"
        ? "mouseup"
        : "";
  if (mouseType) {
    canvas.dispatchEvent(new MouseEvent(mouseType, options));
  }
}

function installBlankCanvasDragBridge(element) {
  let drag = null;

  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || event.button !== 0 || !isBlankCanvasDragTarget(event.target)) {
      drag = null;
      return;
    }
    drag = {
      pointerId: event.pointerId,
      startEvent: event,
      lastY: event.clientY,
      active: false,
      canvas: null,
    };
  }, { capture: true });

  element.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const dx = event.clientX - drag.startEvent.clientX;
    const dy = event.clientY - drag.startEvent.clientY;
    if (!drag.active) {
      if (dx * dx + dy * dy < 36) {
        return;
      }
      if (canScrollWithPointerDelta(element, event.clientY - drag.lastY)) {
        drag = null;
        return;
      }
      const canvas = graphCanvasElement();
      if (!canvas) {
        drag = null;
        return;
      }
      drag.active = true;
      drag.canvas = canvas;
      dispatchCanvasPointerEvent(canvas, "pointermove", drag.startEvent, 1);
      dispatchCanvasPointerEvent(canvas, "pointerdown", drag.startEvent, 1);
    }
    event.preventDefault();
    event.stopPropagation();
    dispatchCanvasPointerEvent(drag.canvas, "pointermove", event, 1);
    drag.lastY = event.clientY;
  }, { capture: true });

  element.addEventListener("pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (drag.active && drag.canvas) {
      event.preventDefault();
      event.stopPropagation();
      dispatchCanvasPointerEvent(drag.canvas, "pointerup", event, 0);
    }
    drag = null;
  }, { capture: true });

  element.addEventListener("pointercancel", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    if (drag.active && drag.canvas) {
      dispatchCanvasPointerEvent(drag.canvas, "pointerup", event, 0);
    }
    drag = null;
  }, { capture: true });
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

function resetMenuMetrics(node) {
  const config = node.promptboardConfig ?? {};
  const attributeBoards = node.promptboardYamlModel?.attributeBoards ?? {};
  const tagFamilies = node.promptboardYamlModel?.tagFamilies ?? {};
  const state = node.promptboardState ?? {};
  const items = navigatorItems(node);
  const active = activeNavigatorItem(node, items);
  const group = activeUiGroup(node, config);
  const counts = selectedCountsByUiGroup(config, attributeBoards, tagFamilies, state);
  return {
    active,
    activeCount: active ? navigatorItemCount(node, active) : 0,
    group,
    groupCount: counts[group] ?? 0,
    totalCount: selectedTotalCount(config, attributeBoards, tagFamilies, state),
  };
}

function resetMenuItem(label, disabled, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "promptboard-reset-menu-item";
  button.textContent = label;
  button.disabled = disabled;
  stopCanvasEvents(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!button.disabled) {
      onClick();
    }
  });
  return button;
}

function createResetMenu(node) {
  const root = document.createElement("div");
  const trigger = createButton(RESET_BUTTON, "선택 초기화 메뉴", () => {
    root.classList.toggle("is-open");
  });
  const menu = document.createElement("div");

  root.className = "promptboard-reset-menu";
  trigger.classList.add("promptboard-clear-selection");
  menu.className = "promptboard-reset-menu-list";
  root.append(trigger, menu);

  const renderMenu = () => {
    const metrics = resetMenuMetrics(node);
    const activeLabel = metrics.active?.label || "현재 항목";
    const groupLabel = metrics.group || "현재 그룹";
    menu.replaceChildren(
      resetMenuItem(`${activeLabel} 초기화`, !metrics.activeCount, () => {
        root.classList.remove("is-open");
        clearNavigatorItemSelection(node, metrics.active);
      }),
      resetMenuItem(`${groupLabel} 초기화`, !metrics.groupCount, () => {
        root.classList.remove("is-open");
        resetCurrentGroupSelection(node);
      }),
      resetMenuItem("전체 초기화", !metrics.totalCount, () => {
        root.classList.remove("is-open");
        resetSelection(node);
      }),
    );
    trigger.disabled = !metrics.totalCount;
  };

  node.promptboardUpdateResetMenu = renderMenu;
  trigger.addEventListener("click", renderMenu);
  root.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!root.contains(document.activeElement)) {
        root.classList.remove("is-open");
      }
    }, 80);
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      root.classList.remove("is-open");
      trigger.focus();
    }
  });
  renderMenu();
  return root;
}

function templateActionItem(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `promptboard-template-action-item${className ? ` ${className}` : ""}`;
  button.textContent = label;
  stopCanvasEvents(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function createTemplateActionMenu(node) {
  const root = document.createElement("div");
  const trigger = createButton(TEMPLATE_ACTION_BUTTON, "템플릿 작업", () => {
    root.classList.toggle("is-open");
  });
  const menu = document.createElement("div");

  root.className = "promptboard-template-action-menu";
  menu.className = "promptboard-template-action-list";
  menu.append(
    templateActionItem(SAVE_TEMPLATE_BUTTON, "", () => {
      root.classList.remove("is-open");
      saveBoardTemplate(node, node.promptboardTemplateInput?.value ?? node.promptboardTemplateName ?? "");
    }),
    templateActionItem(SAVE_TEMPLATE_NEW_BUTTON, "", () => {
      root.classList.remove("is-open");
      saveBoardTemplateNew(node, node.promptboardTemplateInput?.value ?? node.promptboardTemplateName ?? "");
    }),
    templateActionItem(DELETE_TEMPLATE_BUTTON, "is-danger", () => {
      root.classList.remove("is-open");
      deleteBoardTemplate(node, node.promptboardTemplateInput?.value ?? node.promptboardTemplateName ?? "");
    }),
  );
  root.append(trigger, menu);
  root.addEventListener("focusout", () => {
    window.setTimeout(() => {
      if (!root.contains(document.activeElement)) {
        root.classList.remove("is-open");
      }
    }, 80);
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      root.classList.remove("is-open");
      trigger.focus();
    }
  });
  node.promptboardTemplateActionButton = trigger;
  return root;
}

function setYamlPanelOpen(node, open) {
  const isOpen = YAML_SOURCE_PANEL_ENABLED && !!open;
  node.promptboardYamlPanelOpen = isOpen;
  const panel = node.promptboardYamlPanel;
  const button = node.promptboardYamlToggleButton;
  const root = node.promptboardElement;
  if (root) {
    root.style.setProperty("--promptboard-yaml-width", isOpen ? `${EDITOR_PANEL_WIDTH}px` : "0px");
  }
  if (panel) {
    panel.classList.toggle("is-collapsed", !isOpen);
  }
  if (button) {
    button.style.display = YAML_SOURCE_PANEL_ENABLED ? "" : "none";
    button.textContent = isOpen ? "›" : "‹";
    button.title = isOpen ? "YAML 닫기" : "YAML 열기";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(isOpen));
  }
  node.promptboardCodeMirror?.requestMeasure?.();
  scheduleLayoutSizeSync(node);
}

function isYamlPanelOpen(node) {
  if (!YAML_SOURCE_PANEL_ENABLED) {
    return false;
  }
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
  button.title = `Show ${label} group (${count} selected)`;
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
  const tagFamilies = node.promptboardYamlModel?.tagFamilies ?? {};
  const uiComposites = node.promptboardYamlModel?.uiComposites ?? {};
  const state = node.promptboardState ?? {};
  const groups = availableUiGroups(config, attributeBoards, tagFamilies, uiComposites);
  const active = activeUiGroup(node, config);
  const counts = selectedCountsByUiGroup(config, attributeBoards, tagFamilies, state);
  container.replaceChildren();
  for (const group of groups) {
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
  const tagFamilies = node.promptboardYamlModel?.tagFamilies ?? {};
  const state = node.promptboardState ?? {};
  const counts = selectedCountsByUiGroup(config, attributeBoards, tagFamilies, state);

  for (const button of container.querySelectorAll(".promptboard-group-button")) {
    const group = button.dataset.group || "";
    const count = counts[group] ?? 0;
    const countLabel = button.querySelector(".promptboard-group-count");
    if (countLabel) {
      countLabel.textContent = String(count);
    }
    button.title = `Show ${group} group (${count} selected)`;
  }
}

function createTagButton(node, state, category, tag, accent = null) {
  const selected = categorySelectedArray(state, category).includes(tag.text);
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

function createTagFamilyButton(node, state, familyId, targetId, combination, accent = null) {
  const family = node.promptboardYamlModel?.tagFamilies?.[familyId];
  const tagText = composeTagFamilyText(family, combination);
  const displayLabel = tagFamilyCombinationLabel(node.promptboardYamlModel, familyId, combination) || tagText;
  const selected = tagFamilyCombinationSelected(node.promptboardYamlModel, state, familyId, targetId, combination);
  const button = document.createElement("button");
  const label = document.createElement("span");
  const stateLabel = document.createElement("span");

  button.type = "button";
  button.className = `promptboard-tag${selected ? " is-on" : ""}`;
  setAccent(button, accent);
  button.title = tagText;
  button.dataset.familyId = familyId;
  button.dataset.targetId = targetId;
  button.dataset.tagText = tagText;
  button.setAttribute("aria-pressed", String(selected));
  button.classList.toggle(
    "is-search-match",
    boardSearchMatchKey(currentBoardSearchMatch(node)) === boardSearchMatchKey({
      kind: "family",
      familyId,
      targetId,
      tagText,
    }),
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
    setTagFamilySelected(node.promptboardYamlModel, state, familyId, targetId, combination, !selected);
    requestBoardFocus(node, { kind: "family", familyId, targetId, tagText });
    syncState(node, state);
    renderCards(node);
    focusYamlTagFamily(node, familyId);
  });
  return button;
}

function ensureFamilyDraft(node) {
  if (!node.promptboardFamilyDraft || typeof node.promptboardFamilyDraft !== "object") {
    node.promptboardFamilyDraft = {};
  }
  return node.promptboardFamilyDraft;
}

function familyDraftForItem(node, item) {
  const draft = ensureFamilyDraft(node);
  const key = navigatorItemId(item);
  if (!draft[key] || typeof draft[key] !== "object") {
    draft[key] = {};
  }
  return draft[key];
}

function familySlotLabel(family, slotId) {
  return String(family?.slots?.[slotId]?.label || slotId);
}

function tagSetOptionLabel(tag) {
  return String(tag?.label || tag?.text || "");
}

function familyAllowedForPrefix(family, combinations, prefix, slotIds) {
  return combinations.filter((combination) =>
    slotIds.every((slotId) => !prefix[slotId] || combination?.[slotId] === prefix[slotId]),
  );
}

function familySlotOptionsForStep(model, family, combinations, slotId, prefix, priorSlotIds) {
  const allowed = familyAllowedForPrefix(family, combinations, prefix, priorSlotIds);
  const allowedValues = new Set(allowed.map((combination) => combination?.[slotId]).filter(Boolean));
  return tagFamilySlotTags(model, family, slotId).filter((tag) => allowedValues.has(tag.text));
}

function selectedFamilyGroupMember(item, state, draft) {
  if (draft.memberFamilyId) {
    const member = item.group.members.find((candidate) => candidate.familyId === draft.memberFamilyId);
    if (member) {
      return member;
    }
  }
  const selectedMember = item.group.members.find((member) =>
    tagFamilySelectedCombinations(state, member.familyId, item.targetId).length > 0,
  );
  return selectedMember || item.group.members[0] || null;
}

function createFamilyDraftOptionButton(labelText, title, selected, accent, onClick) {
  const button = document.createElement("button");
  const label = document.createElement("span");
  const stateLabel = document.createElement("span");

  button.type = "button";
  button.className = `promptboard-tag promptboard-family-step-option${selected ? " is-on" : ""}`;
  setAccent(button, accent);
  button.title = title || labelText;
  button.setAttribute("aria-pressed", String(selected));
  stopCanvasEvents(button);
  label.className = "promptboard-tag-label";
  label.textContent = labelText;
  stateLabel.className = "promptboard-tag-state";
  stateLabel.textContent = selected ? "on" : "off";
  button.append(label, stateLabel);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

function appendFamilySlotStepItems(container, node, state, item, accent) {
  const model = node.promptboardYamlModel;
  const family = model?.tagFamilies?.[item.familyId];
  const slotIds = tagFamilySlotIds(family);
  const combinations = tagFamilyAllowedCombinations(model, item.familyId);
  const draft = familyDraftForItem(node, item);

  if (slotIds.length <= 1) {
    if (combinations.length) {
      container.append(createTagSection(item.label || family?.label || item.familyId));
    }
    for (const combination of combinations) {
      container.append(createTagFamilyButton(node, state, item.familyId, item.targetId, combination, accent));
    }
    if (!combinations.length) {
      const empty = document.createElement("div");
      empty.className = "promptboard-empty";
      empty.textContent = "No allowed combinations";
      container.append(empty);
    }
    return;
  }

  if (!combinations.length) {
    const empty = document.createElement("div");
    empty.className = "promptboard-empty";
    empty.textContent = "No allowed combinations";
    container.append(empty);
    return;
  }

  for (let index = 0; index < slotIds.length; index += 1) {
    const slotId = slotIds[index];
    const priorSlotIds = slotIds.slice(0, index);
    const prefix = {};
    for (const priorSlotId of priorSlotIds) {
      if (draft[priorSlotId]) {
        prefix[priorSlotId] = draft[priorSlotId];
      }
    }

    container.append(createTagSection(familySlotLabel(family, slotId)));
    if (priorSlotIds.some((priorSlotId) => !draft[priorSlotId])) {
      const empty = document.createElement("div");
      empty.className = "promptboard-empty promptboard-family-step-empty";
      empty.textContent = `먼저 ${familySlotLabel(family, priorSlotIds.find((priorSlotId) => !draft[priorSlotId]))} 선택`;
      container.append(empty);
      break;
    }

    for (const option of familySlotOptionsForStep(model, family, combinations, slotId, prefix, priorSlotIds)) {
      const nextCombination = { ...prefix, [slotId]: option.text };
      const isFinalSlot = index === slotIds.length - 1;
      const selected = isFinalSlot
        ? tagFamilyCombinationSelected(model, state, item.familyId, item.targetId, nextCombination)
        : draft[slotId] === option.text;
      container.append(createFamilyDraftOptionButton(
        tagSetOptionLabel(option),
        option.description || option.text,
        selected,
        accent,
        () => {
          if (isFinalSlot) {
            setTagFamilySelected(model, state, item.familyId, item.targetId, nextCombination, !selected);
            requestBoardFocus(node, {
              kind: "family",
              familyId: item.familyId,
              targetId: item.targetId,
              tagText: composeTagFamilyText(family, nextCombination),
            });
            syncState(node, state);
            focusYamlTagFamily(node, item.familyId);
          } else {
            draft[slotId] = option.text;
            for (const followingSlotId of slotIds.slice(index + 1)) {
              delete draft[followingSlotId];
            }
          }
          renderCards(node);
        },
      ));
    }
  }
}

function appendFamilyGroupStepItems(container, node, state, item, accent) {
  const draft = familyDraftForItem(node, item);
  const member = selectedFamilyGroupMember(item, state, draft);
  if (!member) {
    const empty = document.createElement("div");
    empty.className = "promptboard-empty";
    empty.textContent = "No family group members";
    container.append(empty);
    return;
  }

  draft.memberFamilyId = member.familyId;
  container.append(createTagSection("대상 관계"));
  for (const candidate of item.group.members) {
    const selected = candidate.familyId === draft.memberFamilyId;
    container.append(createFamilyDraftOptionButton(
      candidate.info.relation.label,
      candidate.info.relation.value,
      selected,
      accent,
      () => {
        draft.memberFamilyId = candidate.familyId;
        renderCards(node);
        focusYamlTagFamily(node, candidate.familyId);
      },
    ));
  }

  const slotId = member.info.slotId;
  const family = member.family;
  const combinations = tagFamilyAllowedCombinations(node.promptboardYamlModel, member.familyId);
  container.append(createTagSection(familySlotLabel(family, slotId)));
  for (const combination of combinations) {
    container.append(createTagFamilyButton(node, state, member.familyId, item.targetId, combination, accent));
  }
  if (!combinations.length) {
    const empty = document.createElement("div");
    empty.className = "promptboard-empty";
    empty.textContent = "No allowed combinations";
    container.append(empty);
  }
}

function createTagModifierOptionButton(node, state, category, tag, modifierId, option, accent = null) {
  const selected = tagModifierSelectedTexts(state, category, tag.text, modifierId).includes(option.text);
  const button = document.createElement("button");
  const label = document.createElement("span");
  const stateLabel = document.createElement("span");
  const displayLabel = tagButtonDisplayLabel(option);

  button.type = "button";
  button.className = `promptboard-tag promptboard-modifier-option${selected ? " is-on" : ""}`;
  setAccent(button, accent);
  button.title = tagButtonTitle(option, displayLabel);
  button.dataset.category = category;
  button.dataset.tagText = tag.text;
  button.dataset.modifierId = modifierId;
  button.dataset.modifierOptionText = option.text;
  stopCanvasEvents(button);
  label.className = "promptboard-tag-label";
  label.textContent = displayLabel;
  stateLabel.className = "promptboard-tag-state";
  stateLabel.textContent = selected ? "on" : "off";
  button.append(label, stateLabel);

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setTagModifierSelected(
      node.promptboardYamlModel,
      state,
      category,
      tag,
      modifierId,
      option.text,
      !selected,
    );
    syncState(node, state);
    renderCards(node);
    focusYamlCategoryTag(node, category, tag.text);
  });
  return button;
}

function createTagModifierNoneButton(node, state, category, tag, modifierId, accent = null) {
  const selected = tagModifierSelectedTexts(state, category, tag.text, modifierId).length === 0;
  const button = document.createElement("button");
  const label = document.createElement("span");

  button.type = "button";
  button.className = `promptboard-tag promptboard-modifier-option promptboard-modifier-none${selected ? " is-on" : ""}`;
  setAccent(button, accent);
  button.title = "이 modifier를 사용하지 않음";
  label.className = "promptboard-tag-label";
  label.textContent = "None";
  button.append(label);
  stopCanvasEvents(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearTagModifierSelected(state, category, tag.text, modifierId);
    syncState(node, state);
    renderCards(node);
    focusYamlCategoryTag(node, category, tag.text);
  });
  return button;
}

function createTagModifierPanel(node, state, category, tag, accent = null) {
  const modifierIds = Object.keys(node.promptboardYamlModel?.modifiers ?? {}).filter(
    (modifierId) => tag?.modifiers?.[modifierId],
  );
  if (!modifierIds.length) {
    return null;
  }

  const panel = document.createElement("div");
  panel.className = "promptboard-tag-modifiers";
  setAccent(panel, accent);

  for (const modifierId of modifierIds) {
    const modifier = node.promptboardYamlModel.modifiers[modifierId];
    const tagSet = node.promptboardYamlModel?.tagSets?.[modifier.source];
    if (!tagSet?.tags?.length) {
      continue;
    }
    const group = document.createElement("div");
    const options = document.createElement("div");
    group.className = "promptboard-tag-modifier-group";
    options.className = "promptboard-tag-modifier-options";
    group.append(createTagSection(modifier.label || modifierId));
    options.append(createTagModifierNoneButton(node, state, category, tag, modifierId, accent));
    for (const option of tagSet.tags ?? []) {
      options.append(createTagModifierOptionButton(node, state, category, tag, modifierId, option, accent));
    }
    group.append(options);
    panel.append(group);
  }

  return panel.childElementCount ? panel : null;
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
      if (categorySelectedArray(state, category).includes(tagItem.tag.text)) {
        const modifierPanel = createTagModifierPanel(node, state, category, tagItem.tag, accent);
        if (modifierPanel) {
          container.append(modifierPanel);
        }
      }
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

function appendAttributeTargetItems(container, node, state, item, accent = null, options = {}) {
  const target = node.promptboardYamlModel?.attributeBoards?.[item.boardId]?.targets?.[item.targetId];
  if (!target) {
    return;
  }
  if (options.title) {
    container.append(createTagSection(options.title));
  }
  for (const [attributeId, attribute] of Object.entries(target.attributes ?? {})) {
    const tagSet = node.promptboardYamlModel?.tagSets?.[attribute.source];
    container.append(createTagSection(attribute.label || attributeId));
    appendAttributeTagItems(container, node, state, item.boardId, item.targetId, attributeId, tagSet, accent);
  }
}

function appendNavigatorTagItems(container, node, state, item) {
  const accent = navigatorItemAccent(item);
  if (item?.kind === "composite") {
    for (const child of item.children ?? []) {
      appendNavigatorTagItems(container, node, state, child);
    }
    return;
  }
  if (item?.kind === "family") {
    appendFamilySlotStepItems(container, node, state, item, accent);
    return;
  }
  if (item?.kind === "familyGroup") {
    appendFamilyGroupStepItems(container, node, state, item, accent);
    return;
  }
  if (item?.kind === "attributeTarget") {
    appendAttributeTargetItems(container, node, state, item, accent);
    return;
  }
  for (const tagItem of item?.tagItems ?? []) {
    if (tagItem.kind === "section") {
      container.append(createTagSection(tagItem.label));
      continue;
    }
    if (tagItem.kind === "tag" && tagItem.tag) {
      container.append(createNavigatorTagButton(node, state, item, tagItem.tag, accent));
      if (item.kind === "category" && categorySelectedArray(state, item.category).includes(tagItem.tag.text)) {
        const modifierPanel = createTagModifierPanel(node, state, item.category, tagItem.tag, accent);
        if (modifierPanel) {
          container.append(modifierPanel);
        }
      }
    }
  }
  if (item?.kind === "category") {
    for (const panelItem of categoryPanelItems(node, item)) {
      appendAttributeTargetItems(
        container,
        node,
        state,
        panelItem,
        accent,
        { title: `${panelItem.label} 속성` },
      );
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
    if (identity.kind === "family") {
      if (
        element.dataset.familyId === identity.familyId &&
        element.dataset.targetId === identity.targetId &&
        element.dataset.tagText === identity.tagText
      ) {
        return element;
      }
      continue;
    }
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

function clearNavigatorItemState(model, state, item) {
  if (item?.kind === "composite") {
    for (const child of item.children ?? []) {
      clearNavigatorItemState(model, state, child);
    }
  } else if (item?.kind === "attribute") {
    for (const text of attributeSelectedTexts(state, item.boardId, item.targetId, item.attributeId)) {
      setAttributeSelected(
        model,
        state,
        item.boardId,
        item.targetId,
        item.attributeId,
        text,
        false,
      );
    }
  } else if (item?.kind === "attributeTarget") {
    const target = model?.attributeBoards?.[item.boardId]?.targets?.[item.targetId];
    for (const attributeId of Object.keys(target?.attributes ?? {})) {
      for (const text of attributeSelectedTexts(state, item.boardId, item.targetId, attributeId)) {
        setAttributeSelected(
          model,
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
  } else if (item?.kind === "family") {
    if (!state[FAMILY_STATE_KEY] || typeof state[FAMILY_STATE_KEY] !== "object" || Array.isArray(state[FAMILY_STATE_KEY])) {
      state[FAMILY_STATE_KEY] = {};
    }
    if (!state[FAMILY_STATE_KEY][item.familyId] || typeof state[FAMILY_STATE_KEY][item.familyId] !== "object" || Array.isArray(state[FAMILY_STATE_KEY][item.familyId])) {
      state[FAMILY_STATE_KEY][item.familyId] = {};
    }
    state[FAMILY_STATE_KEY][item.familyId][item.targetId] = [];
  } else if (item?.kind === "familyGroup") {
    if (!state[FAMILY_STATE_KEY] || typeof state[FAMILY_STATE_KEY] !== "object" || Array.isArray(state[FAMILY_STATE_KEY])) {
      state[FAMILY_STATE_KEY] = {};
    }
    for (const member of item.group.members) {
      if (!state[FAMILY_STATE_KEY][member.familyId] || typeof state[FAMILY_STATE_KEY][member.familyId] !== "object" || Array.isArray(state[FAMILY_STATE_KEY][member.familyId])) {
        state[FAMILY_STATE_KEY][member.familyId] = {};
      }
      state[FAMILY_STATE_KEY][member.familyId][item.targetId] = [];
    }
  }
}

function clearNavigatorItemSelection(node, item) {
  const state = node.promptboardState ?? {};
  clearNavigatorItemState(node.promptboardYamlModel, state, item);
  syncState(node, state);
  renderCards(node);
}

function resetCurrentGroupSelection(node) {
  const state = node.promptboardState ?? {};
  for (const item of navigatorItems(node)) {
    clearNavigatorItemState(node.promptboardYamlModel, state, item);
  }
  syncState(node, state);
  renderCards(node);
  if (node.promptboardScroll) {
    node.promptboardScroll.scrollTop = 0;
  }
}

function createNavigatorTagButton(node, state, item, tag, accent = null) {
  if (item.kind === "attribute") {
    return createAttributeTagButton(node, state, item.boardId, item.targetId, item.attributeId, tag, accent);
  }
  return createTagButton(node, state, item.category, tag, accent);
}

function navigatorButtonLabel(item) {
  const label = String(item?.label || "").trim();
  const context = String(item?.context || "").trim();
  if (!context) {
    return label;
  }
  return label.replace(new RegExp(`^${escapeRegexText(context)}\\s*>\\s*`), "").trim() || label;
}

function createNavigatorCategoryButton(node, item, active) {
  const button = document.createElement("button");
  const label = document.createElement("span");
  const count = document.createElement("span");
  const selectedCountValue = navigatorItemCount(node, item);
  const displayLabel = navigatorButtonLabel(item);

  button.type = "button";
  button.className = `promptboard-navigator-category${active ? " is-active" : ""}`;
  setAccent(button, navigatorItemAccent(item));
  if (item.kind === "composite") {
    button.dataset.compositeId = item.compositeId;
  } else if (item.kind === "category") {
    button.dataset.category = item.category;
  } else if (item.kind === "attributeTarget") {
    button.dataset.boardId = item.boardId;
    button.dataset.targetId = item.targetId;
  } else if (item.kind === "family") {
    button.dataset.familyId = item.familyId;
    button.dataset.targetId = item.targetId;
  } else if (item.kind === "familyGroup") {
    button.dataset.familyGroupId = item.groupId;
    button.dataset.targetId = item.targetId;
  }
  button.title = item.kind === "category" && item.label !== item.category
    ? `${item.context} > ${item.label} (${item.category}, ${selectedCountValue} selected)`
    : `${item.context} > ${item.label} (${selectedCountValue} selected)`;
  button.setAttribute("aria-pressed", String(active));
  label.className = "promptboard-navigator-category-label";
  label.textContent = displayLabel;
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
    } else if (entry.kind === "family") {
      setTagFamilySelected(
        node.promptboardYamlModel,
        state,
        entry.familyId,
        entry.targetId,
        entry.combination,
        false,
      );
    } else {
      setSelected(state, entry.category, entry.text, false);
    }
    syncState(node, state);
    renderCards(node);
    if (entry.kind === "attribute") {
      focusYamlAttributeTag(node, entry.boardId, entry.targetId, entry.attributeId, entry.text);
    } else if (entry.kind === "family") {
      focusYamlTagFamily(node, entry.familyId);
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
    const selected = categorySelectedArray(state, category);
    for (const text of selected) {
      const tag = item.tags?.find((candidate) => candidate.text === text) ?? { text };
      const composed = composeModifiedTagText(node.promptboardYamlModel, state, category, tag);
      entries.push({
        kind: "category",
        category,
        label: categoryLabel(category, item),
        context: categoryUiGroup(item),
        accent: accentForLabel(categoryUiGroup(item)),
        text,
        display: composed || tagDisplayLabel(tag),
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
  for (const { familyId, family, targetId, target } of tagFamilyTargetItems(node.promptboardYamlModel?.tagFamilies)) {
    for (const combination of tagFamilySelectedCombinations(state, familyId, targetId)) {
      const text = composeTagFamilyText(family, combination);
      const uiGroup = tagFamilyUiGroup(family, target);
      entries.push({
        kind: "family",
        familyId,
        targetId,
        combination,
        label: tagFamilyTargetLabel(familyId, family, targetId, target),
        context: uiGroup,
        accent: accentForLabel(uiGroup),
        text,
        display: tagFamilyCombinationLabel(node.promptboardYamlModel, familyId, combination) || text,
      });
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
  const tags = document.createElement("div");

  shell.className = "promptboard-navigator";
  main.className = "promptboard-navigator-main";
  content.className = "promptboard-navigator-content";
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

  appendNavigatorTagItems(tags, node, state, active);
  if (active.kind === "category" && !active.tags?.length && !categoryPanelItems(node, active).length) {
    const empty = document.createElement("div");
    empty.className = "promptboard-empty";
    empty.textContent = "No tags";
    tags.append(empty);
  }

  if (railHost) {
    railHost.append(createNavigatorCategoryRail(node, items, active));
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
  node.promptboardUpdateResetMenu?.();
  node.promptboardNavigatorRailHost?.replaceChildren();
  node.promptboardNavigatorRailHost?.classList.add("is-empty");
  scroll.replaceChildren();

  renderNavigator(node, scroll, state);
}

function promptboardNoticeText(node) {
  return [node.promptboardTemplateStatus, node.promptboardStatus]
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .join(" · ");
}

function updatePromptboardNotice(node) {
  const sharedStatus = node.promptboardTemplateStatusElement;
  if (sharedStatus) {
    sharedStatus.textContent = promptboardNoticeText(node);
    sharedStatus.style.display = "";
  }

  const yamlStatus = node.promptboardStatusElement;
  if (yamlStatus && yamlStatus !== sharedStatus) {
    yamlStatus.textContent = node.promptboardStatus ?? "";
  }
}

function setStatus(node, text) {
  if (node.promptboardStatusTimer) {
    clearTimeout(node.promptboardStatusTimer);
    node.promptboardStatusTimer = null;
  }
  node.promptboardStatus = text;
  updatePromptboardNotice(node);
}

function setTemporaryStatus(node, text) {
  setStatus(node, text);
  node.promptboardStatusTimer = setTimeout(() => {
    node.promptboardStatus = "";
    node.promptboardStatusTimer = null;
    updatePromptboardNotice(node);
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
  const actionButton = node.promptboardTemplateActionButton;
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

  if (actionButton) {
    const saveMode = node.promptboardTemplateSaveDoneTarget || TEMPLATE_SAVE_MODE_SAVE;
    const saveDone =
      node.promptboardTemplateSaveDoneTarget === saveMode &&
      Number(node.promptboardTemplateSaveDoneUntil ?? 0) > Date.now();
    const deleteDone = Number(node.promptboardTemplateDeleteDoneUntil ?? 0) > Date.now();
    actionButton.textContent = saveDone || deleteDone ? "완료" : TEMPLATE_ACTION_BUTTON;
    actionButton.classList.toggle("is-done", saveDone);
    actionButton.classList.toggle("is-delete-done", deleteDone);
  }

  if (status) {
    updatePromptboardNotice(node);
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
    const response = await fetch("/promptboard/yaml/files", { cache: "no-store" });
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
    const response = await fetch(noCacheUrl("/promptboard/templates"), { cache: "no-store" });
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

  const yamlFile = syncSelectedYamlFile(node);
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
    const response = await fetch(`/promptboard/template?name=${encodeURIComponent(templateName)}`, { cache: "no-store" });
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
      const yamlResponse = await fetch(
        noCacheUrl(`/promptboard/yaml/file?name=${encodeURIComponent(yamlFile)}`),
        { cache: "no-store" },
      );
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
  const yamlFile = syncSelectedYamlFile(node);
  if (!yamlFile || yamlFile === INLINE_YAML_OPTION) {
    return false;
  }

  try {
    const response = await fetch(
      noCacheUrl(`/promptboard/yaml/file?name=${encodeURIComponent(yamlFile)}`),
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    setYamlEditorText(node, data.text ?? "");
    renderFromYaml(node, resetState);
    setStatus(node, "");
    if (options.broadcast) {
      dispatchYamlReload(node, yamlFile);
    }
    return true;
  } catch (error) {
    setStatus(node, `Load error: ${error.message}`);
    return false;
  }
}

function queueInitialYamlFileSync(node) {
  if (node.promptboardInitialYamlFileSyncQueued) {
    return;
  }
  node.promptboardInitialYamlFileSyncQueued = true;

  Promise.resolve().then(async () => {
    const loaded = await loadSelectedYaml(node, { resetState: false });
    if (loaded) {
      scheduleLayoutSizeSync(node);
    }
  });
}

async function saveSelectedYaml(node) {
  const yamlFile = syncSelectedYamlFile(node);
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
  const templateActionMenu = createTemplateActionMenu(node);
  const templateStatus = document.createElement("div");
  const navigatorRailHost = document.createElement("div");
  const scroll = document.createElement("div");

  root.className = "promptboard";
  root.classList.toggle("is-yaml-source-disabled", !YAML_SOURCE_PANEL_ENABLED);
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
  stopCanvasEvents(navigatorRailHost);
  stopWheelEvents(groupFilter);
  stopWheelEvents(scroll);
  stopWheelEvents(navigatorRailHost);
  installBlankCanvasDragBridge(scroll);

  select.addEventListener("change", () => {
    setWidgetValue(node, "yaml_file", select.value);
    node.promptboardSelectedTemplate = "";
    writeStoredTemplateState(node);
    updateTemplateControls(node);
    loadSelectedYaml(node, { broadcast: true });
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
  toolbarTemplateRow.append(select, templateSelect, templateInput, templateActionMenu);
  boardSearchRow.append(boardSearch, boardSearchCount);
  toolbarSearchRow.append(boardSearchRow, createResetMenu(node));
  toolbar.append(toolbarTemplateRow, toolbarSearchRow);
  right.append(toolbar, templateStatus, groupFilter, navigatorRailHost, scroll);
  root.append(right);
  if (YAML_SOURCE_PANEL_ENABLED) {
    yamlSearchRow.append(yamlSearch, yamlSearchCount);
    editor.append(editorHost, textarea);
    yamlContent.append(yamlSearchRow, editor, save, status);
    left.append(yamlContent);
    root.append(yamlToggle, left);
  }

  node.promptboardElement = root;
  node.promptboardYamlPanel = left;
  node.promptboardYamlToggleButton = yamlToggle;
  node.promptboardFileSelect = select;
  node.promptboardYamlSearchInput = yamlSearch;
  node.promptboardYamlSearchCount = yamlSearchCount;
  node.promptboardEditor = editor;
  node.promptboardEditorHost = editorHost;
  node.promptboardTextarea = textarea;
  node.promptboardStatusElement = YAML_SOURCE_PANEL_ENABLED ? status : templateStatus;
  node.promptboardTemplateSelect = templateSelect;
  node.promptboardBoardSearchInput = boardSearch;
  node.promptboardBoardSearchCount = boardSearchCount;
  node.promptboardBoardSearchRow = boardSearchRow;
  node.promptboardBoardSearchMenu = boardSearchMenu;
  node.promptboardGroupFilter = groupFilter;
  node.promptboardTemplateInput = templateInput;
  node.promptboardTemplateStatusElement = templateStatus;
  node.promptboardNavigatorRailHost = navigatorRailHost;
  node.promptboardScroll = scroll;
  setYamlPanelOpen(node, !!node.promptboardYamlPanelOpen);
  renderFromYaml(node);
  queueInitialYamlFileSync(node);
  if (YAML_SOURCE_PANEL_ENABLED) {
    createCodeMirrorEditor(node, editorHost, textarea);
  }
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
  installYamlReloadListener(node);
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
      removeYamlReloadListener(this);
      return onRemoved?.apply(this, arguments);
    };
  },
});
