export const FAMILY_STATE_KEY = "$families";

function isMapping(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function familySlotIds(family) {
  return Object.keys(family?.slots ?? {});
}

export function tagFamilyTargetEntries(family) {
  const targets = family?.targets && isMapping(family.targets)
    ? family.targets
    : {
        default: {
          label: family?.label || "default",
          placeholder: family?.placeholder || "",
          uiGroup: family?.uiGroup || "",
        },
      };
  return Object.entries(targets);
}

export function firstTagFamilyTargetId(family) {
  return tagFamilyTargetEntries(family)[0]?.[0] || "default";
}

function familySlotTags(model, family, slotId) {
  const source = family?.slots?.[slotId]?.source;
  return model?.tagSets?.[source]?.tags ?? [];
}

function familySlotValues(model, family, slotId) {
  return new Set(familySlotTags(model, family, slotId).map((tag) => tag.text));
}

export function tagFamilyAllowedKey(family, combination) {
  return familySlotIds(family).map((slotId) => String(combination?.[slotId] ?? "")).join("\u0000");
}

export function composeTagFamilyText(family, combination) {
  let text = String(family?.pattern ?? "");
  for (const slotId of familySlotIds(family)) {
    text = text.replaceAll(`{${slotId}}`, String(combination?.[slotId] ?? ""));
  }
  return text;
}

function normalizeCombination(model, familyId, family, rawCombination, warnings) {
  const path = `${FAMILY_STATE_KEY}.${familyId}`;
  if (!isMapping(rawCombination)) {
    warnings.push(`${path} must contain objects; the saved value was cleared.`);
    return null;
  }

  const slotIds = familySlotIds(family);
  const rawKeys = Object.keys(rawCombination);
  const slotSet = new Set(slotIds);
  const missing = slotIds.filter((slotId) => !rawKeys.includes(slotId));
  const extra = rawKeys.filter((slotId) => !slotSet.has(slotId)).sort();
  if (missing.length) {
    warnings.push(`${path} removed incomplete combination missing slot: ${missing[0]}`);
    return null;
  }
  if (extra.length) {
    warnings.push(`${path} removed combination with unknown slot: ${extra[0]}`);
    return null;
  }

  const combination = {};
  for (const slotId of slotIds) {
    const value = String(rawCombination[slotId] ?? "").trim();
    if (!familySlotValues(model, family, slotId).has(value)) {
      warnings.push(`${path}.${slotId} removed unknown tag: ${value || "<empty>"}`);
      return null;
    }
    combination[slotId] = value;
  }

  if (Array.isArray(family.allowed)) {
    const allowedKeys = new Set(family.allowed.map((item) => tagFamilyAllowedKey(family, item)));
    if (!allowedKeys.has(tagFamilyAllowedKey(family, combination))) {
      warnings.push(`${path} removed disallowed combination: ${composeTagFamilyText(family, combination)}`);
      return null;
    }
  }

  return combination;
}

export function normalizeTagFamilyState(model, selectedState = {}, warnings = []) {
  const savedRoot = isMapping(selectedState?.[FAMILY_STATE_KEY])
    ? selectedState[FAMILY_STATE_KEY]
    : {};
  const nextRoot = {};

  for (const familyId of Object.keys(savedRoot)) {
    if (!model?.tagFamilies?.[familyId]) {
      warnings.push(`${FAMILY_STATE_KEY}.${familyId} no longer exists and was removed.`);
    }
  }

  for (const [familyId, family] of Object.entries(model?.tagFamilies ?? {})) {
    const familyTargets = Object.fromEntries(tagFamilyTargetEntries(family));
    const firstTargetId = firstTagFamilyTargetId(family);
    const rawFamilyValue = savedRoot[familyId];
    const targetRoot = Array.isArray(rawFamilyValue)
      ? { [firstTargetId]: rawFamilyValue }
      : isMapping(rawFamilyValue) ? rawFamilyValue : {};
    if (rawFamilyValue != null && !Array.isArray(rawFamilyValue) && !isMapping(rawFamilyValue)) {
      warnings.push(`${FAMILY_STATE_KEY}.${familyId} must be a target mapping; the saved value was cleared.`);
    }

    nextRoot[familyId] = {};
    for (const targetId of Object.keys(targetRoot)) {
      if (!familyTargets[targetId]) {
        warnings.push(`${FAMILY_STATE_KEY}.${familyId}.${targetId} no longer exists and was removed.`);
      }
    }

    for (const targetId of Object.keys(familyTargets)) {
      let rawCombinations = targetRoot[targetId] ?? [];
      if (!Array.isArray(rawCombinations)) {
        warnings.push(`${FAMILY_STATE_KEY}.${familyId}.${targetId} must be an array; the saved value was cleared.`);
        rawCombinations = [];
      }

      const selected = [];
      const seen = new Set();
      for (const rawCombination of rawCombinations) {
        const combination = normalizeCombination(model, familyId, family, rawCombination, warnings);
        if (!combination) {
          continue;
        }
        const key = tagFamilyAllowedKey(family, combination);
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        selected.push(combination);
      }
      nextRoot[familyId][targetId] = selected;
    }
  }

  return nextRoot;
}

function selectedRootForFamily(state, familyId) {
  const selected = state?.[FAMILY_STATE_KEY]?.[familyId];
  if (Array.isArray(selected)) {
    return { default: selected };
  }
  return isMapping(selected) ? selected : {};
}

export function emptyTagFamilyState(model) {
  const state = { [FAMILY_STATE_KEY]: {} };
  for (const [familyId, family] of Object.entries(model?.tagFamilies ?? {})) {
    state[FAMILY_STATE_KEY][familyId] = {};
    for (const [targetId] of tagFamilyTargetEntries(family)) {
      state[FAMILY_STATE_KEY][familyId][targetId] = [];
    }
  }
  return state;
}

export function tagFamilySelectedCombinations(state, familyId, targetId = "default") {
  const selected = selectedRootForFamily(state, familyId)?.[targetId];
  return Array.isArray(selected) ? selected.filter(isMapping) : [];
}

export function tagFamilySelectedTexts(model, state, familyId, targetId = "default") {
  const family = model?.tagFamilies?.[familyId];
  if (!family) {
    return [];
  }
  return tagFamilySelectedCombinations(state, familyId, targetId).map((combination) =>
    composeTagFamilyText(family, combination),
  );
}

export function tagFamilyCombinationSelected(model, state, familyId, targetId, combination) {
  const family = model?.tagFamilies?.[familyId];
  if (!family) {
    return false;
  }
  const key = tagFamilyAllowedKey(family, combination);
  return tagFamilySelectedCombinations(state, familyId, targetId).some(
    (candidate) => tagFamilyAllowedKey(family, candidate) === key,
  );
}

export function tagFamilyAllowedCombinations(model, familyId) {
  const family = model?.tagFamilies?.[familyId];
  if (!family || !Array.isArray(family.allowed)) {
    return [];
  }
  return family.allowed.map((combination) => ({ ...combination }));
}

export function setTagFamilySelected(model, state, familyId, targetId, combination, enabled) {
  const family = model?.tagFamilies?.[familyId];
  if (!family || !isMapping(combination)) {
    return false;
  }
  if (!Object.fromEntries(tagFamilyTargetEntries(family))[targetId]) {
    return false;
  }
  const normalized = normalizeCombination(model, familyId, family, combination, []);
  if (!normalized) {
    return false;
  }

  if (!isMapping(state[FAMILY_STATE_KEY])) {
    state[FAMILY_STATE_KEY] = normalizeTagFamilyState(model, state);
  }
  if (!isMapping(state[FAMILY_STATE_KEY][familyId])) {
    state[FAMILY_STATE_KEY][familyId] = {};
  }
  if (!Array.isArray(state[FAMILY_STATE_KEY][familyId][targetId])) {
    state[FAMILY_STATE_KEY][familyId][targetId] = [];
  }

  const key = tagFamilyAllowedKey(family, normalized);
  const selected = state[FAMILY_STATE_KEY][familyId][targetId];
  const nextSelected = selected.filter((candidate) => tagFamilyAllowedKey(family, candidate) !== key);
  if (enabled) {
    nextSelected.push(normalized);
  }
  state[FAMILY_STATE_KEY][familyId][targetId] = nextSelected;
  return true;
}

export function tagFamilyCombinationLabel(model, familyId, combination) {
  const family = model?.tagFamilies?.[familyId];
  if (!family) {
    return "";
  }
  return familySlotIds(family)
    .map((slotId) => {
      const tag = familySlotTags(model, family, slotId).find((candidate) => candidate.text === combination?.[slotId]);
      return tag?.label || tag?.text || combination?.[slotId] || "";
    })
    .filter(Boolean)
    .join(" / ");
}
