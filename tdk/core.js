import { areBoardTypesColorCompatible, findValidBoardTypeLineups, getSubTsumCandidates } from '../boardTypeSelection.js';

export const ID_PATTERN = /^[a-z][a-zA-Z0-9]{1,47}$/;
const hooks = { tick: 'onTick', tap: 'onTap', chainStart: 'onChainStart', chainCommit: 'onChainCommit', drag: 'onDrag', pointerUp: 'onPointerUp', spawn: 'onSpawn', augmentClear: 'onAugmentClear' };

export function isDevelopmentMode(search = globalThis.location?.search || '') {
  return new URLSearchParams(search).get('tdk') === '1';
}

export function validateDefinition(definition) {
  const d = definition;
  const fail = (message) => { throw new Error(`TDK ${d?.id || '?'}: ${message}`); };
  if (!d || typeof d.id !== 'string' || !ID_PATTERN.test(d.id) || ['constructor', 'prototype', '__proto__'].includes(d.id)) fail('invalid ID');
  for (const key of ['name', 'skillName', 'imageSrc', 'boardColor', 'color', 'light', 'dark', 'accent']) {
    if (typeof d[key] !== 'string' || !d[key].trim()) fail(`missing ${key}`);
  }
  if (!/^#[\da-f]{6}$/i.test(d.boardColor)) fail('invalid boardColor');
  if (!Number.isFinite(d.score) || d.score < 0) fail('invalid score');
  if (typeof d.developmentOnly !== 'boolean') fail('developmentOnly must be boolean');
  for (const mode of ['manual', 'cpu', 'strongest']) if (typeof d.modes?.[mode] !== 'boolean') fail(`missing modes.${mode}`);
  if (!d.modes.manual) fail('manual mode is required');
  for (const key of ['cost', 'coinCorrectionType', 'chargeMultiplier', 'durationSec']) {
    if (!d.tables?.[key]) fail(`missing tables.${key}`);
  }
  for (const [key, values] of Object.entries(d.tables || {})) {
    if (!Array.isArray(values) || values.length !== 6) fail(`${key} must define SL1–6`);
    if (key === 'coinCorrectionType') {
      if (Array.from(values).some(v => !/^correction_-?\d+$/.test(v))) fail('invalid coin correction');
    } else if (Array.from(values).some(v => !Number.isFinite(v) || v < 0)) fail(`invalid numeric ${key}`);
  }
  if (d.tables.cost.some(v => v <= 0) || d.tables.durationSec.some(v => v <= 0)) fail('cost/duration must be positive');
  if (d.handler?.id !== d.id || typeof d.handler.onActivate !== 'function' || typeof d.handler.cleanupBySession !== 'function') fail('missing handler registration/cleanup');
  for (const [capability, hook] of Object.entries(hooks)) {
    if (typeof d.capabilities?.[capability] !== 'boolean') fail(`missing capability ${capability}`);
    if (d.capabilities[capability] !== (typeof d.handler[hook] === 'function')) fail(`capability/hook mismatch: ${capability}`);
  }
  if (!d.visuals || typeof d.visuals.presentation !== 'function' || !d.visuals.theme) fail('missing visuals');
  for (const kind of ['presentation', 'endPause']) {
    const timing = d.timing?.[kind];
    if (!timing || !Number.isFinite(timing.durationMs) || timing.durationMs < 0 || typeof timing.pauseClock !== 'boolean' || typeof timing.pausePhysics !== 'boolean') fail(`invalid timing.${kind}`);
  }
  return d;
}

export function toTsumType(d) {
  const { id, name, skillName, imageSrc, boardColor, color, light, dark, accent, score, developmentOnly } = d;
  return { id, name, skillName, imageSrc, boardColor, color, light, dark, accent, score, emoji: 'TD', skillType: id, coinCorrectionType: d.tables.coinCorrectionType[0], subEligible: false, selectable: !developmentOnly, developmentOnly };
}

export function suggestSubTsums(type, types) {
  return Object.fromEntries([3, 4, 5].map(count => {
    const lineup = findValidBoardTypeLineups({ requiredTypes: [type], candidates: getSubTsumCandidates(types), targetCount: count })[0];
    if (!lineup) throw new Error(`TDK ${type.id}: no compatible ${count}-type lineup`);
    return [count, lineup.slice(1).map(t => t.id)];
  }));
}

export function validateSubTsums(d, types, lineups = d.subTsums) {
  for (const count of [3, 4, 5]) {
    const ids = lineups?.[count];
    if (!Array.isArray(ids) || ids.length !== count - 1 || new Set([d.id, ...ids]).size !== count) throw new Error(`TDK ${d.id}: invalid ${count}-type subTsums`);
    const subs = ids.map(id => types.find(t => t.id === id));
    if (subs.some(t => !t || t.subEligible !== true || !(t.imageSrc || t.imageSources?.length)) || !areBoardTypesColorCompatible([toTsumType(d), ...subs])) throw new Error(`TDK ${d.id}: incompatible ${count}-type subTsums`);
  }
  return lineups;
}

export function adaptDefinitions(definitions, { types, tables, fixedSubTsums, development = false }) {
  const seen = new Set(types.map(t => t.id));
  const prepared = definitions.map(d => {
    validateDefinition(d);
    if (seen.has(d.id) || Object.hasOwn(tables, d.id) || Object.hasOwn(fixedSubTsums, d.id)) throw new Error(`TDK duplicate ID: ${d.id}`);
    seen.add(d.id);
    const subTsums = d.subTsums === 'auto' ? suggestSubTsums(toTsumType(d), types) : d.subTsums;
    validateSubTsums(d, types, subTsums);
    return { d, subTsums };
  });
  const nextFixed = { ...fixedSubTsums };
  for (const { d, subTsums } of prepared) {
    if (d.developmentOnly && !development) continue;
    types.push(toTsumType(d));
    tables[d.id] = d.tables;
    nextFixed[d.id] = subTsums;
  }
  return Object.freeze(nextFixed);
}

export function registerDefinitions(definitions, registry, types) {
  for (const d of definitions) {
    if (!types.some(t => t.id === d.id)) continue;
    validateDefinition(d);
    if (Object.hasOwn(registry, d.id)) throw new Error(`TDK duplicate handler: ${d.id}`);
    registry[d.id] = { ...d.handler, tables: d.tables };
  }
}
