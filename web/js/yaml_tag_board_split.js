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
const RESET_BUTTON = "Reset";
const SAVE_TEMPLATE_BUTTON = "Save";
const SAVE_TEMPLATE_NEW_BUTTON = "Save (New)";
const DELETE_TEMPLATE_BUTTON = "Del";
const TEMPLATE_SAVE_MODE_SAVE = "save";
const TEMPLATE_SAVE_MODE_NEW = "new";
const DEFAULT_YAML_FILE = "default.yaml";
const INLINE_YAML_OPTION = "inline";
const HIDDEN_MARK = "__promptboardHiddenWidget";
const MIN_NODE_WIDTH = 720;
const MIN_NODE_HEIGHT = 360;
const MIN_LAYOUT_HEIGHT = 260;
const EDITOR_PANEL_WIDTH = 320;
const PANEL_GUTTER = 18;
const NODE_BOTTOM_PADDING = 20;
const SCROLL_BOTTOM_PADDING = 8;
const CODEMIRROR_MODULE = "../vendor/codemirror/promptboard-codemirror.bundle.js";
const CODEMIRROR_THEME_CSS = new URL("../vendor/codemirror/css/thema.css", import.meta.url).href;
const MASONRY_SCRIPT_URL = new URL("../vendor/masonry/masonry.pkgd.min.js", import.meta.url).href;
const MASONRY_MIN_COLUMN_WIDTH = 170;
const MASONRY_GUTTER = 8;
const EDITOR_STORAGE_PREFIX = "promptboard:editor:v1";
const TEMPLATE_STORAGE_PREFIX = "promptboard:template:v1";
const SEARCH_DEBOUNCE_MS = 150;
const GROUP_ALL = "전체";
const DEFAULT_UI_GROUP = "기타";
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
};

let codeMirrorModulePromise = null;
let masonryLibraryPromise = null;

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

function loadMasonryLibrary() {
  if (globalThis.Masonry) {
    return Promise.resolve(globalThis.Masonry);
  }
  if (masonryLibraryPromise) {
    return masonryLibraryPromise;
  }

  masonryLibraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MASONRY_SCRIPT_URL;
    script.async = true;
    script.addEventListener("load", () => {
      if (globalThis.Masonry) {
        resolve(globalThis.Masonry);
        return;
      }
      reject(new Error("Masonry did not register a global constructor."));
    }, { once: true });
    script.addEventListener("error", () => {
      reject(new Error(`Failed to load Masonry from ${MASONRY_SCRIPT_URL}`));
    }, { once: true });
    document.head.appendChild(script);
  });

  return masonryLibraryPromise;
}

function masonryCardWidth(container, cardCount) {
  const containerWidth = Math.floor(container.clientWidth);
  if (containerWidth <= 0 || cardCount <= 0) {
    return 0;
  }

  const columns = Math.max(
    1,
    Math.min(cardCount, Math.floor((containerWidth + MASONRY_GUTTER) /
      (MASONRY_MIN_COLUMN_WIDTH + MASONRY_GUTTER))),
  );
  return Math.floor((containerWidth - MASONRY_GUTTER * (columns - 1)) / columns);
}

function destroyBoardMasonry(node) {
  node.promptboardMasonryRequest = Number(node.promptboardMasonryRequest ?? 0) + 1;
  if (node.promptboardMasonryFrame != null) {
    cancelAnimationFrame(node.promptboardMasonryFrame);
    node.promptboardMasonryFrame = null;
  }
  node.promptboardMasonry?.destroy?.();
  node.promptboardMasonry = null;
  node.promptboardMasonryContainer = null;
}

function layoutBoardMasonry(node, Masonry, container, request) {
  if (
    node.promptboardMasonryRequest !== request ||
    node.promptboardMasonryContainer !== container ||
    !container.isConnected
  ) {
    return;
  }

  const cards = Array.from(container.querySelectorAll(":scope > .promptboard-card"));
  const cardWidth = masonryCardWidth(container, cards.length);
  if (!cardWidth) {
    return;
  }

  for (const card of cards) {
    card.style.width = `${cardWidth}px`;
  }
  container.classList.add("is-masonry");

  if (node.promptboardMasonry?.element === container) {
    node.promptboardMasonry.option({ columnWidth: cardWidth, gutter: MASONRY_GUTTER });
    node.promptboardMasonry.layout();
    return;
  }

  node.promptboardMasonry?.destroy?.();
  node.promptboardMasonry = new Masonry(container, {
    itemSelector: ".promptboard-card",
    columnWidth: cardWidth,
    gutter: MASONRY_GUTTER,
    horizontalOrder: true,
    transitionDuration: 0,
    resize: false,
  });
}

function scheduleBoardMasonry(node) {
  const container = node.promptboardMasonryContainer;
  if (!container || typeof requestAnimationFrame !== "function") {
    return;
  }

  const request = Number(node.promptboardMasonryRequest ?? 0) + 1;
  node.promptboardMasonryRequest = request;
  if (node.promptboardMasonryFrame != null) {
    cancelAnimationFrame(node.promptboardMasonryFrame);
  }

  loadMasonryLibrary()
    .then((Masonry) => {
      if (node.promptboardMasonryRequest !== request) {
        return;
      }
      node.promptboardMasonryFrame = requestAnimationFrame(() => {
        node.promptboardMasonryFrame = null;
        layoutBoardMasonry(node, Masonry, container, request);
      });
    })
    .catch((error) => {
      if (!node.promptboardMasonryLoadError) {
        node.promptboardMasonryLoadError = true;
        console.warn("Prompt Board is using its fallback card layout.", error);
      }
    });
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

function inferUiGroup(item) {
  const placeholder = String(item?.placeholder ?? "").trim();
  return PLACEHOLDER_UI_GROUPS[placeholder] || DEFAULT_UI_GROUP;
}

function categoryUiGroup(item) {
  return normalizeUiGroup(item?.uiGroup) || inferUiGroup(item);
}

function availableUiGroups(config) {
  const groups = new Set();
  for (const item of Object.values(config ?? {})) {
    groups.add(categoryUiGroup(item));
  }
  return [...groups];
}

function activeUiGroup(node, config = node.promptboardConfig ?? {}) {
  const groups = availableUiGroups(config);
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

function selectedCountsByUiGroup(config, state) {
  const counts = { [GROUP_ALL]: 0 };
  for (const [category, item] of Object.entries(config ?? {})) {
    const count = selectedCount(state, category, item.tags ?? []);
    const group = categoryUiGroup(item);
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

function setCategorySelected(state, category, tags, enabled) {
  state[category] = enabled ? tags.map((tag) => tag.text) : [];
}

function isCategoryFullySelected(state, category, tags) {
  if (!tags.length) {
    return false;
  }
  const selected = new Set(Array.isArray(state[category]) ? state[category].map((item) => String(item)) : []);
  return tags.every((tag) => selected.has(tag.text));
}

function syncState(node, state) {
  setWidgetValue(node, "selected_state", JSON.stringify(state));
  node.promptboardState = state;
  app.canvas?.setDirty(true, true);
}

function collapsedCategories(node) {
  if (!(node.promptboardCollapsedCategories instanceof Set)) {
    node.promptboardCollapsedCategories = new Set();
  }
  return node.promptboardCollapsedCategories;
}

function categorySignature(config) {
  return Object.keys(config ?? {}).join("\n");
}

function ensureInitialCollapsedCategories(node, config) {
  const signature = categorySignature(config);
  if (node.promptboardCollapsedSignature === signature) {
    return;
  }

  const collapsedSet = collapsedCategories(node);
  collapsedSet.clear();
  for (const category of Object.keys(config ?? {})) {
    collapsedSet.add(category);
  }
  node.promptboardCollapsedSignature = signature;
}

function resetSelectionAndCollapse(node) {
  const config = node.promptboardConfig ?? {};
  const state = {};
  const collapsedSet = collapsedCategories(node);

  collapsedSet.clear();
  for (const category of Object.keys(config)) {
    state[category] = [];
    collapsedSet.add(category);
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
    if (regex.test(category)) {
      matches.push({ category, tagText: "", label: category, description: "", uiGroup });
    }
    for (const tag of item.tags ?? []) {
      const label = tag.label || tag.text;
      const description = tag.description || "";
      if (regex.test(label) || regex.test(tag.text) || regex.test(description)) {
        matches.push({
          category,
          tagText: tag.text,
          label: String(label),
          description: String(description),
          uiGroup,
        });
      }
    }
  }
  return matches;
}

function boardSearchMatchKey(match) {
  return `${match.category}\u0000${match.tagText}`;
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
  return !!match && boardSearchMatchKey(match) === boardSearchMatchKey({ category, tagText });
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
    option.title = match.description || match.tagText || match.category;
    heading.className = "promptboard-search-menu-heading";
    label.className = "promptboard-search-menu-label";
    label.textContent = match.label || match.tagText || match.category;
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
    context.textContent = `${match.category} · ${match.uiGroup}`;
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

function applyBoardSearchCollapsedState(node, matches) {
  const config = node.promptboardConfig ?? {};
  const openCategories = new Set(matches.map((match) => match.category));
  const collapsedSet = collapsedCategories(node);

  collapsedSet.clear();
  for (const category of Object.keys(config)) {
    if (!openCategories.has(category)) {
      collapsedSet.add(category);
    }
  }
}

function findBoardSearchElement(node, match) {
  const scroll = node.promptboardScroll;
  if (!scroll || !match) {
    return null;
  }

  const selector = match.tagText ? ".promptboard-tag" : ".promptboard-card-title";
  for (const element of scroll.querySelectorAll(selector)) {
    if (element.dataset.category !== match.category) {
      continue;
    }
    if (!match.tagText || element.dataset.tagText === match.tagText) {
      return element;
    }
  }
  return null;
}

function scrollBoardElementIntoView(node, element) {
  const scroll = node.promptboardScroll;
  if (!scroll || !element) {
    return;
  }

  const scrollRect = scroll.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  scroll.scrollTop += elementRect.top - scrollRect.top - 6;
}

function navigateToBoardSearchMatch(node, index) {
  const state = node.promptboardBoardSearchState;
  if (!state?.matches?.length) {
    return;
  }

  state.index = (index + state.matches.length) % state.matches.length;
  const match = state.matches[state.index];
  setBoardSearchCount(node, state.index + 1, state.matches.length);
  applyBoardSearchCollapsedState(node, state.matches);
  renderCards(node);
  hideBoardSearchMenu(node);
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
    applyBoardSearchCollapsedState(node, matches);
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
    applyBoardSearchCollapsedState(node, matches);
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
      box-sizing: border-box;
      display: grid;
      grid-template-columns: ${EDITOR_PANEL_WIDTH}px minmax(260px, 1fr);
      gap: 8px;
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

    .promptboard-right {
      grid-template-rows: auto 1fr;
    }

    .promptboard-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 0.85fr);
      gap: 4px;
      min-width: 0;
    }

    .promptboard-toolbar-left,
    .promptboard-toolbar-right {
      display: grid;
      grid-template-rows: auto auto;
      gap: 4px;
      min-width: 0;
    }

    .promptboard-toolbar-left-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(48px, auto);
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
      border-color: #888;
      background: rgba(48, 48, 48, 0.96);
    }

    .promptboard-group-button.is-active {
      border-color: rgba(86, 148, 209, 0.95);
      background: rgba(39, 82, 124, 0.92);
      color: #f5fbff;
    }

    .promptboard-group-button.is-active .promptboard-group-count {
      background: rgba(154, 196, 236, 0.32);
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
      grid-column: 1 / -1;
      min-height: 14px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #cfcfcf;
      font-size: 10px;
    }

    .promptboard-template-save-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(36px, auto);
      gap: 4px;
      min-width: 0;
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

    .promptboard-card-actions {
      margin: 0 0 4px;
    }

    .promptboard-card-action {
      box-sizing: border-box;
      display: block;
      width: 100%;
      height: 17px;
      padding: 0 5px;
      border: 1px solid rgba(120, 120, 120, 0.75);
      border-radius: 3px;
      background: rgba(42, 42, 42, 0.72);
      color: #d8d8d8;
      font: 10px Arial, sans-serif;
      cursor: pointer;
    }

    .promptboard-card-action:hover {
      border-color: #888;
      background: rgba(58, 58, 58, 0.82);
    }

    .promptboard-editor {
      box-sizing: border-box;
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

    .promptboard-attribute-board {
      box-sizing: border-box;
      width: 100%;
      margin: 0 0 10px;
      padding: 2px 0 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.12);
    }

    .promptboard-attribute-header {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
      margin: 0 0 6px;
      color: #ededed;
      font-size: 11px;
      font-weight: 700;
    }

    .promptboard-attribute-context {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #aeb8c2;
      font-size: 9px;
      font-weight: 400;
    }

    .promptboard-attribute-row {
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr);
      align-items: start;
      gap: 5px;
      margin-top: 4px;
      min-width: 0;
    }

    .promptboard-attribute-row-label {
      padding-top: 4px;
      color: #aeb8c2;
      font-size: 9px;
      white-space: nowrap;
    }

    .promptboard-attribute-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
      min-width: 0;
    }

    .promptboard-attribute-control {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      flex: 0 1 auto;
      min-width: 56px;
      max-width: 100%;
      height: 21px;
      padding: 0 7px;
      border: 1px solid rgba(120, 120, 120, 0.72);
      border-radius: 3px;
      background: rgba(32, 32, 32, 0.92);
      color: #d4d4d4;
      font: 10px Arial, sans-serif;
      cursor: pointer;
    }

    .promptboard-attribute-control:hover {
      border-color: #888;
      background: rgba(48, 48, 48, 0.96);
    }

    .promptboard-attribute-control.is-active {
      border-color: rgba(86, 148, 209, 0.95);
      background: rgba(39, 82, 124, 0.92);
      color: #f5fbff;
    }

    .promptboard-attribute-control-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .promptboard-attribute-control-count {
      flex: 0 0 auto;
      min-width: 12px;
      color: #c8d9e8;
      font-size: 9px;
      text-align: right;
    }

    .promptboard-attribute-tags {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
      gap: 3px;
      min-width: 0;
      margin-top: 6px;
    }

    .promptboard-attribute-tags .promptboard-tag {
      min-height: 20px;
      height: auto;
      margin-top: 0;
      padding-top: 2px;
      padding-bottom: 2px;
    }

    .promptboard-attribute-tags .promptboard-tag-label {
      overflow-wrap: anywhere;
      white-space: normal;
    }

    .promptboard-columns {
      column-gap: 8px;
      column-width: 170px;
      width: 100%;
    }

    .promptboard-columns.is-masonry {
      column-gap: normal;
      column-width: auto;
    }

    .promptboard-card {
      box-sizing: border-box;
      display: inline-block;
      width: 100%;
      break-inside: avoid;
      margin: 0 0 8px;
      padding: 6px;
      border: 1px solid rgba(111, 137, 154, 0.5);
      border-radius: 4px;
      background: var(--promptboard-card-bg, rgba(55, 68, 78, 0.62));
      border-color: var(--promptboard-card-border, rgba(111, 137, 154, 0.5));
      color: #e4e4e4;
    }

    .promptboard-card.tone-0 {
      --promptboard-card-bg: rgba(64, 78, 92, 0.48);
      --promptboard-card-border: rgba(117, 139, 158, 0.5);
      --promptboard-card-title-bg: rgba(96, 120, 142, 0.34);
      --promptboard-card-tag-bg: rgba(54, 60, 66, 0.78);
    }

    .promptboard-card.tone-1 {
      --promptboard-card-bg: rgba(54, 82, 78, 0.47);
      --promptboard-card-border: rgba(104, 145, 136, 0.48);
      --promptboard-card-title-bg: rgba(82, 131, 121, 0.32);
      --promptboard-card-tag-bg: rgba(52, 61, 59, 0.78);
    }

    .promptboard-card.tone-2 {
      --promptboard-card-bg: rgba(75, 80, 58, 0.47);
      --promptboard-card-border: rgba(139, 147, 105, 0.48);
      --promptboard-card-title-bg: rgba(126, 136, 88, 0.32);
      --promptboard-card-tag-bg: rgba(59, 61, 52, 0.78);
    }

    .promptboard-card.tone-3 {
      --promptboard-card-bg: rgba(83, 70, 86, 0.45);
      --promptboard-card-border: rgba(145, 125, 151, 0.46);
      --promptboard-card-title-bg: rgba(132, 105, 140, 0.31);
      --promptboard-card-tag-bg: rgba(61, 55, 63, 0.78);
    }

    .promptboard-card.tone-4 {
      --promptboard-card-bg: rgba(88, 68, 74, 0.45);
      --promptboard-card-border: rgba(151, 119, 128, 0.46);
      --promptboard-card-title-bg: rgba(140, 101, 113, 0.31);
      --promptboard-card-tag-bg: rgba(64, 54, 57, 0.78);
    }

    .promptboard-card.tone-5 {
      --promptboard-card-bg: rgba(82, 74, 64, 0.47);
      --promptboard-card-border: rgba(148, 133, 111, 0.48);
      --promptboard-card-title-bg: rgba(132, 116, 88, 0.32);
      --promptboard-card-tag-bg: rgba(62, 58, 52, 0.78);
    }

    .promptboard-card-title {
      display: flex;
      gap: 6px;
      align-items: center;
      min-width: 0;
      margin-bottom: 4px;
      padding: 3px 4px;
      border-radius: 3px;
      background: var(--promptboard-card-title-bg, rgba(89, 112, 128, 0.32));
      font-weight: 700;
      cursor: pointer;
      user-select: none;
    }

    .promptboard-card-title:hover {
      filter: brightness(1.08);
    }

    .promptboard-card-title.is-search-match {
      outline: 1px solid rgba(216, 184, 92, 0.9);
      background: rgba(112, 91, 42, 0.62);
    }

    .promptboard-card-toggle {
      flex: 0 0 auto;
      width: 8px;
      color: #cfcfcf;
      font-size: 9px;
      line-height: 1;
    }

    .promptboard-card-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .promptboard-card-count {
      margin-left: auto;
      color: #c8c8c8;
      font-weight: 400;
      font-size: 10px;
    }

    .promptboard-tag {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      height: 18px;
      margin-top: 3px;
      padding: 0 5px;
      border: 1px solid #656565;
      border-radius: 4px;
      background: var(--promptboard-card-tag-bg, rgba(52, 61, 66, 0.78));
      color: #d4d4d4;
      font: 10px Arial, sans-serif;
      text-align: left;
      cursor: pointer;
    }

    .promptboard-tag:hover {
      border-color: #777;
      background: #414141;
    }

    .promptboard-tag.is-on {
      border-color: #2d74be;
      background: #24496e;
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
      background: #345778;
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
      font-size: 9px;
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
  return createButton(RESET_BUTTON, "Unselect all tags and collapse all groups", () => {
    resetSelectionAndCollapse(node);
  });
}

function createGroupFilterButton(node, label, active, count) {
  const button = document.createElement("button");
  const name = document.createElement("span");
  const countLabel = document.createElement("span");

  button.type = "button";
  button.className = `promptboard-group-button${active ? " is-active" : ""}`;
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
  const state = node.promptboardState ?? {};
  const groups = availableUiGroups(config);
  const active = activeUiGroup(node, config);
  const counts = selectedCountsByUiGroup(config, state);
  container.replaceChildren();
  for (const group of [GROUP_ALL, ...groups]) {
    container.append(createGroupFilterButton(node, group, group === active, counts[group] ?? 0));
  }
}

function createTagButton(node, state, category, tag) {
  const selected = Array.isArray(state[category]) && state[category].includes(tag.text);
  const button = document.createElement("button");
  const label = document.createElement("span");
  const stateLabel = document.createElement("span");
  const sourceLabel = String(tag.label || tag.text);
  const tagText = String(tag.text ?? "");
  const displayLabel = sourceLabel && sourceLabel !== tagText ? `[${sourceLabel}] ${tagText}` : tagText;
  const description = String(tag.description ?? "").trim();

  button.type = "button";
  button.className = `promptboard-tag${selected ? " is-on" : ""}`;
  button.title = description || displayLabel;
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
  });

  return button;
}

function activeAttributeTargetId(node, boardId, board) {
  if (!node.promptboardActiveAttributeTargets) {
    node.promptboardActiveAttributeTargets = {};
  }
  const targetIds = Object.keys(board.targets ?? {});
  const current = node.promptboardActiveAttributeTargets[boardId];
  const targetId = targetIds.includes(current) ? current : targetIds[0] ?? "";
  node.promptboardActiveAttributeTargets[boardId] = targetId;
  return targetId;
}

function activeAttributeId(node, boardId, targetId, target) {
  if (!node.promptboardActiveAttributes) {
    node.promptboardActiveAttributes = {};
  }
  if (!node.promptboardActiveAttributes[boardId]) {
    node.promptboardActiveAttributes[boardId] = {};
  }
  const attributeIds = Object.keys(target?.attributes ?? {});
  const current = node.promptboardActiveAttributes[boardId][targetId];
  const attributeId = attributeIds.includes(current) ? current : attributeIds[0] ?? "";
  node.promptboardActiveAttributes[boardId][targetId] = attributeId;
  return attributeId;
}

function attributeCountForTarget(state, boardId, targetId, target) {
  return Object.keys(target?.attributes ?? {}).reduce(
    (total, attributeId) => total + attributeSelectedTexts(state, boardId, targetId, attributeId).length,
    0,
  );
}

function createAttributeControl(label, count, active, options = {}) {
  const button = document.createElement("button");
  const labelElement = document.createElement("span");
  const countElement = document.createElement("span");

  button.type = "button";
  button.className = `promptboard-attribute-control${active ? " is-active" : ""}`;
  button.title = `${label} (${count} selected)`;
  button.setAttribute("aria-pressed", String(active));
  labelElement.className = "promptboard-attribute-control-label";
  labelElement.textContent = label;
  countElement.className = "promptboard-attribute-control-count";
  countElement.textContent = String(count);
  button.append(labelElement, countElement);
  for (const [key, value] of Object.entries(options.data ?? {})) {
    button.dataset[key] = value;
  }
  stopCanvasEvents(button);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    options.onClick?.();
  });
  return button;
}

function createAttributeTagButton(node, state, boardId, targetId, attributeId, tag) {
  const selected = attributeSelectedTexts(state, boardId, targetId, attributeId).includes(tag.text);
  const button = document.createElement("button");
  const label = document.createElement("span");
  const stateLabel = document.createElement("span");
  const sourceLabel = String(tag.label || tag.text);
  const tagText = String(tag.text ?? "");
  const displayLabel = sourceLabel && sourceLabel !== tagText ? `[${sourceLabel}] ${tagText}` : tagText;
  const description = String(tag.description ?? "").trim();

  button.type = "button";
  button.className = `promptboard-tag${selected ? " is-on" : ""}`;
  button.title = description || displayLabel;
  button.dataset.boardId = boardId;
  button.dataset.targetId = targetId;
  button.dataset.attributeId = attributeId;
  button.dataset.tagText = tagText;
  button.setAttribute("aria-pressed", String(selected));
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
    syncState(node, state);
    renderCards(node);
  });
  return button;
}

function createAttributeBoard(node, boardId, board, state) {
  const section = document.createElement("section");
  const header = document.createElement("div");
  const title = document.createElement("span");
  const context = document.createElement("span");
  const targetRow = document.createElement("div");
  const targetRowLabel = document.createElement("span");
  const targetControls = document.createElement("div");
  const attributeRow = document.createElement("div");
  const attributeRowLabel = document.createElement("span");
  const attributeControls = document.createElement("div");
  const tags = document.createElement("div");
  const targetId = activeAttributeTargetId(node, boardId, board);
  const target = board.targets?.[targetId];
  const attributeId = activeAttributeId(node, boardId, targetId, target);
  const attribute = target?.attributes?.[attributeId];
  const tagSet = attribute ? node.promptboardYamlModel?.tagSets?.[attribute.source] : null;

  section.className = "promptboard-attribute-board";
  section.dataset.boardId = boardId;
  header.className = "promptboard-attribute-header";
  title.textContent = board.label || boardId;
  context.className = "promptboard-attribute-context";
  context.textContent = target && attribute
    ? `${target.label || targetId} / ${attribute.label || attributeId}`
    : "";
  header.append(title, context);

  targetRow.className = "promptboard-attribute-row";
  targetRowLabel.className = "promptboard-attribute-row-label";
  targetRowLabel.textContent = "적용 대상";
  targetControls.className = "promptboard-attribute-controls";
  targetControls.setAttribute("role", "group");
  targetControls.setAttribute("aria-label", `${board.label || boardId} 적용 대상`);
  for (const [candidateId, candidate] of Object.entries(board.targets ?? {})) {
    const active = candidateId === targetId;
    targetControls.append(createAttributeControl(
      candidate.label || candidateId,
      attributeCountForTarget(state, boardId, candidateId, candidate),
      active,
      {
        data: { boardId, targetId: candidateId },
        onClick: () => {
          node.promptboardActiveAttributeTargets[boardId] = candidateId;
          renderCards(node);
        },
      },
    ));
  }
  targetRow.append(targetRowLabel, targetControls);

  attributeRow.className = "promptboard-attribute-row";
  attributeRowLabel.className = "promptboard-attribute-row-label";
  attributeRowLabel.textContent = "속성";
  attributeControls.className = "promptboard-attribute-controls";
  attributeControls.setAttribute("role", "tablist");
  attributeControls.setAttribute("aria-label", `${target?.label || targetId} 속성`);
  for (const [candidateId, candidate] of Object.entries(target?.attributes ?? {})) {
    const active = candidateId === attributeId;
    const control = createAttributeControl(
      candidate.label || candidateId,
      attributeSelectedTexts(state, boardId, targetId, candidateId).length,
      active,
      {
        data: { boardId, targetId, attributeId: candidateId },
        onClick: () => {
          node.promptboardActiveAttributes[boardId][targetId] = candidateId;
          renderCards(node);
        },
      },
    );
    control.role = "tab";
    control.setAttribute("aria-selected", String(active));
    attributeControls.append(control);
  }
  attributeRow.append(attributeRowLabel, attributeControls);

  tags.className = "promptboard-attribute-tags";
  tags.setAttribute("role", "group");
  tags.setAttribute("aria-label", `${attribute?.label || attributeId} 태그`);
  for (const tag of tagSet?.tags ?? []) {
    tags.append(createAttributeTagButton(node, state, boardId, targetId, attributeId, tag));
  }

  section.append(header, targetRow, attributeRow, tags);
  return section;
}

function renderAttributeBoards(node, scroll, state) {
  const entries = Object.entries(node.promptboardYamlModel?.attributeBoards ?? {});
  for (const [boardId, board] of entries) {
    scroll.append(createAttributeBoard(node, boardId, board, state));
  }
  return entries.length;
}

function createCategoryActions(node, state, category, tags) {
  const actions = document.createElement("div");
  const toggleAll = document.createElement("button");
  const fullySelected = isCategoryFullySelected(state, category, tags);

  actions.className = "promptboard-card-actions";
  toggleAll.type = "button";
  toggleAll.className = "promptboard-card-action";
  toggleAll.textContent = fullySelected ? "none" : "all";
  toggleAll.title = fullySelected ? "Clear this category" : "Select all tags in this category";
  stopCanvasEvents(toggleAll);

  toggleAll.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setCategorySelected(state, category, tags, !isCategoryFullySelected(state, category, tags));
    syncState(node, state);
    renderCards(node);
  });

  actions.append(toggleAll);
  return actions;
}

function renderCards(node) {
  const scroll = node.promptboardScroll;
  const config = node.promptboardConfig ?? {};
  const state = node.promptboardState ?? {};
  if (!scroll) {
    return;
  }
  renderGroupFilter(node);
  destroyBoardMasonry(node);
  scroll.replaceChildren();

  const attributeBoardCount = renderAttributeBoards(node, scroll, state);

  if (!Object.keys(config).length && attributeBoardCount === 0) {
    const empty = document.createElement("div");
    empty.className = "promptboard-empty";
    empty.textContent = "No categories";
    scroll.append(empty);
    return;
  }

  const entries = visibleCategoryEntries(node);
  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "promptboard-empty";
    empty.textContent = Object.keys(config).length ? "No categories in this group" : "No categories";
    scroll.append(empty);
    return;
  }

  const columns = document.createElement("div");
  columns.className = "promptboard-columns";

  for (const [index, [category, item]] of entries.entries()) {
    const card = document.createElement("section");
    const title = document.createElement("div");
    const toggle = document.createElement("span");
    const name = document.createElement("span");
    const count = document.createElement("span");
    const collapsed = collapsedCategories(node).has(category);

    card.className = `promptboard-card tone-${index % 6}`;
    card.dataset.category = category;
    title.className = "promptboard-card-title";
    title.dataset.category = category;
    title.classList.toggle("is-search-match", isCurrentBoardSearchMatch(node, category));
    title.role = "button";
    title.tabIndex = 0;
    stopCanvasEvents(title);
    toggle.className = "promptboard-card-toggle";
    name.className = "promptboard-card-name";
    count.className = "promptboard-card-count";

    toggle.textContent = collapsed ? ">" : "v";
    name.textContent = category;
    name.title = category;
    count.textContent = `${selectedCount(state, category, item.tags)}/${item.tags.length}`;

    title.append(toggle, name, count);
    title.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const collapsedSet = collapsedCategories(node);
      if (collapsedSet.has(category)) {
        collapsedSet.delete(category);
      } else {
        collapsedSet.add(category);
      }
      renderCards(node);
    });
    title.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      title.click();
    });
    card.append(title);
    if (!collapsed) {
      card.append(createCategoryActions(node, state, category, item.tags));
      for (const tag of item.tags) {
        card.append(createTagButton(node, state, category, tag));
      }
    }
    columns.append(card);
  }

  scroll.append(columns);
  node.promptboardMasonryContainer = columns;
  scheduleBoardMasonry(node);
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

function renderFromYaml(node, resetState = false) {
  let model;
  try {
    model = normalizeYamlDocument(widgetValue(node, "yaml_text", ""));
  } catch (error) {
    setStatus(node, `YAML error: ${error.message}`);
    return;
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
  ensureInitialCollapsedCategories(node, config);
  syncState(node, state);
  renderCards(node);
  scheduleLayoutSizeSync(node);
  if (warnings.length) {
    setStatus(node, `State warning: ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length - 1})` : ""}`);
  } else if (String(node.promptboardStatus ?? "").startsWith("State warning:")) {
    setStatus(node, "");
  }
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
    await loadSelectedYaml(node);
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
    renderFromYaml(node);
    updateTemplateControls(node);
  } catch (error) {
    setTemplateStatus(node, `Template load error: ${error.message}`);
  }
}

async function loadSelectedYaml(node) {
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
    renderFromYaml(node, true);
    setStatus(node, "");
  } catch (error) {
    setStatus(node, `Load error: ${error.message}`);
  }
}

async function saveSelectedYaml(node) {
  const yamlFile = widgetValue(node, "yaml_file", DEFAULT_YAML_FILE);
  if (!yamlFile || yamlFile === INLINE_YAML_OPTION) {
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
    setStatus(node, `Save error: ${error.message}`);
  }
}

function createSplitElement(node) {
  ensureStyles();

  const root = document.createElement("div");
  const left = document.createElement("div");
  const right = document.createElement("div");
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
  const toolbarLeft = document.createElement("div");
  const toolbarLeftTop = document.createElement("div");
  const toolbarRight = document.createElement("div");
  const boardSearchRow = document.createElement("div");
  const boardSearch = document.createElement("input");
  const boardSearchCount = document.createElement("div");
  const boardSearchMenu = document.createElement("div");
  const groupFilter = document.createElement("div");
  const templateInput = document.createElement("input");
  const templateSaveRow = document.createElement("div");
  const templateSaveCombo = document.createElement("div");
  const templateSave = document.createElement("button");
  const templateSaveMode = document.createElement("select");
  const templateDelete = document.createElement("button");
  const templateStatus = document.createElement("div");
  const scroll = document.createElement("div");

  root.className = "promptboard";
  left.className = "promptboard-panel";
  right.className = "promptboard-panel promptboard-right";
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
  toolbarLeft.className = "promptboard-toolbar-left";
  toolbarLeftTop.className = "promptboard-toolbar-left-top";
  toolbarRight.className = "promptboard-toolbar-right";
  boardSearchRow.className = "promptboard-search-row";
  groupFilter.className = "promptboard-group-filter";
  templateSelect.className = "promptboard-select";
  boardSearch.className = "promptboard-input";
  boardSearchCount.className = "promptboard-search-count";
  boardSearchMenu.className = "promptboard-search-menu";
  templateInput.className = "promptboard-input";
  templateSaveRow.className = "promptboard-template-save-row";
  templateSaveCombo.className = "promptboard-save-combo";
  templateSave.className = "promptboard-button";
  templateSaveMode.className = "promptboard-save-mode";
  templateDelete.className = "promptboard-button";
  templateStatus.className = "promptboard-template-status";
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
  stopWheelEvents(scroll);

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
  left.append(select, yamlSearchRow, editor, save, status);
  templateSaveCombo.append(templateSave, templateSaveMode);
  templateSaveRow.append(templateSaveCombo, templateDelete);
  toolbarLeftTop.append(templateSelect, createResetButton(node));
  boardSearchRow.append(boardSearch, boardSearchCount);
  toolbarLeft.append(toolbarLeftTop, boardSearchRow);
  toolbarRight.append(templateInput, templateSaveRow);
  toolbar.append(toolbarLeft, toolbarRight, groupFilter, templateStatus);
  right.append(toolbar, scroll);
  root.append(left, right);

  node.promptboardElement = root;
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
  node.promptboardScroll = scroll;
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
  scheduleBoardMasonry(node);
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
      destroyBoardMasonry(this);
      return onRemoved?.apply(this, arguments);
    };
  },
});
