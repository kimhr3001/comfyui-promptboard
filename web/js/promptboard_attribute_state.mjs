export const ATTRIBUTE_STATE_KEY = "$attributes";

function isMapping(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value, key) {
  return isMapping(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function configuredAttribute(model, boardId, targetId, attributeId) {
  const board = model?.attributeBoards?.[boardId];
  const target = board?.targets?.[targetId];
  const attribute = target?.attributes?.[attributeId];
  const tagSet = attribute ? model?.tagSets?.[attribute.source] : null;
  return attribute && tagSet ? { attribute, tags: tagSet.tags ?? [] } : null;
}

function normalizedValues(tags, rawValues, mode, useDefaults, path, warnings) {
  const available = new Set(tags.map((tag) => tag.text));
  const sourceValues = useDefaults
    ? tags.filter((tag) => tag.default).map((tag) => tag.text)
    : rawValues;

  if (!useDefaults && !Array.isArray(rawValues)) {
    warnings.push(`${path} must be an array; the saved value was cleared.`);
    return [];
  }

  const requested = Array.isArray(sourceValues) ? sourceValues.map((value) => String(value)) : [];
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

  const requestedSet = new Set(requested.filter((value) => available.has(value)));
  return tags.map((tag) => tag.text).filter((value) => requestedSet.has(value));
}

function warnUnknownSavedPaths(model, savedRoot, warnings) {
  if (!isMapping(savedRoot)) {
    return;
  }
  for (const [boardId, savedBoard] of Object.entries(savedRoot)) {
    const board = model?.attributeBoards?.[boardId];
    if (!board) {
      warnings.push(`${ATTRIBUTE_STATE_KEY}.${boardId} no longer exists and was removed.`);
      continue;
    }
    if (!isMapping(savedBoard)) {
      continue;
    }
    for (const [targetId, savedTarget] of Object.entries(savedBoard)) {
      const target = board.targets?.[targetId];
      if (!target) {
        warnings.push(`${ATTRIBUTE_STATE_KEY}.${boardId}.${targetId} no longer exists and was removed.`);
        continue;
      }
      if (!isMapping(savedTarget)) {
        continue;
      }
      for (const attributeId of Object.keys(savedTarget)) {
        if (!target.attributes?.[attributeId]) {
          warnings.push(
            `${ATTRIBUTE_STATE_KEY}.${boardId}.${targetId}.${attributeId} no longer exists and was removed.`,
          );
        }
      }
    }
  }
}

function selectedStateValues(selectedState, category) {
  if (!hasOwn(selectedState, category)) {
    return null;
  }
  let selected = selectedState[category];
  if (isMapping(selected)) {
    selected = selected.selected;
  }
  return Array.isArray(selected) ? selected.map((value) => String(value)) : [];
}

function cleanupAttributeText(text) {
  return String(text ?? "")
    .replace(/[ \t]+,/g, ",")
    .replace(/,\s*,+/g, ", ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t,]+|[ \t,]+$/g, "");
}

function migratedStateValues(selectedState, category, placeholder) {
  const values = selectedStateValues(selectedState, category);
  if (values === null) {
    return null;
  }
  return values.map((value) =>
    placeholder && value.includes(placeholder)
      ? cleanupAttributeText(value.replaceAll(placeholder, ""))
      : value,
  );
}

export function normalizeAttributeState(model, selectedState = {}, warnings = []) {
  const savedRoot = isMapping(selectedState?.[ATTRIBUTE_STATE_KEY])
    ? selectedState[ATTRIBUTE_STATE_KEY]
    : {};
  const nextRoot = {};

  warnUnknownSavedPaths(model, savedRoot, warnings);
  for (const [boardId, board] of Object.entries(model?.attributeBoards ?? {})) {
    const nextBoard = {};
    for (const [targetId, target] of Object.entries(board.targets ?? {})) {
      const nextTarget = {};
      for (const [attributeId, attribute] of Object.entries(target.attributes ?? {})) {
        const tagSet = model.tagSets?.[attribute.source];
        const path = `${ATTRIBUTE_STATE_KEY}.${boardId}.${targetId}.${attributeId}`;
        const savedTarget = savedRoot?.[boardId]?.[targetId];
        const hasSavedValue = hasOwn(savedTarget, attributeId);
        const migratedValues = !hasSavedValue && attribute.migrateFrom
          ? migratedStateValues(selectedState, attribute.migrateFrom, target.placeholder)
          : null;
        if (migratedValues !== null) {
          warnings.push(`${path} migrated from ${attribute.migrateFrom}.`);
        }
        nextTarget[attributeId] = normalizedValues(
          tagSet?.tags ?? [],
          hasSavedValue ? savedTarget[attributeId] : migratedValues ?? [],
          attribute.mode,
          !hasSavedValue && migratedValues === null,
          path,
          warnings,
        );
      }
      nextBoard[targetId] = nextTarget;
    }
    nextRoot[boardId] = nextBoard;
  }
  return nextRoot;
}

export function emptyAttributeState(model) {
  const state = { [ATTRIBUTE_STATE_KEY]: {} };
  for (const [boardId, board] of Object.entries(model?.attributeBoards ?? {})) {
    state[ATTRIBUTE_STATE_KEY][boardId] = {};
    for (const [targetId, target] of Object.entries(board.targets ?? {})) {
      state[ATTRIBUTE_STATE_KEY][boardId][targetId] = {};
      for (const attributeId of Object.keys(target.attributes ?? {})) {
        state[ATTRIBUTE_STATE_KEY][boardId][targetId][attributeId] = [];
      }
    }
  }
  return state;
}

export function attributeSelectedTexts(state, boardId, targetId, attributeId) {
  const selected = state?.[ATTRIBUTE_STATE_KEY]?.[boardId]?.[targetId]?.[attributeId];
  return Array.isArray(selected) ? selected : [];
}

export function setAttributeSelected(
  model,
  state,
  boardId,
  targetId,
  attributeId,
  tagText,
  enabled,
) {
  const configured = configuredAttribute(model, boardId, targetId, attributeId);
  if (!configured || !configured.tags.some((tag) => tag.text === tagText)) {
    return false;
  }

  if (!isMapping(state[ATTRIBUTE_STATE_KEY])) {
    state[ATTRIBUTE_STATE_KEY] = normalizeAttributeState(model, state);
  }
  const targetState = state[ATTRIBUTE_STATE_KEY]?.[boardId]?.[targetId];
  if (!targetState) {
    state[ATTRIBUTE_STATE_KEY] = normalizeAttributeState(model, state);
  }

  const current = new Set(attributeSelectedTexts(state, boardId, targetId, attributeId));
  if (configured.attribute.mode === "single") {
    state[ATTRIBUTE_STATE_KEY][boardId][targetId][attributeId] = enabled ? [tagText] : [];
    return true;
  }

  if (enabled) {
    current.add(tagText);
  } else {
    current.delete(tagText);
  }
  state[ATTRIBUTE_STATE_KEY][boardId][targetId][attributeId] = configured.tags
    .map((tag) => tag.text)
    .filter((text) => current.has(text));
  return true;
}

export function composeAttributeTargets(model, selectedState = {}, warnings = []) {
  const state = { [ATTRIBUTE_STATE_KEY]: normalizeAttributeState(model, selectedState, warnings) };
  const targets = {};

  for (const [boardId, board] of Object.entries(model?.attributeBoards ?? {})) {
    for (const [targetId, target] of Object.entries(board.targets ?? {})) {
      const values = [];
      for (const attributeId of Object.keys(target.attributes ?? {})) {
        values.push(...attributeSelectedTexts(state, boardId, targetId, attributeId));
      }

      const separator = String(target.compose?.separator ?? " ");
      const key = `${boardId}.${targetId}`;
      targets[key] = {
        boardId,
        targetId,
        placeholder: target.placeholder,
        selected: values,
        text: values.join(separator),
      };
    }
  }

  return targets;
}
