import { tsumDefinitions } from '../tsums/catalog.js';

export function resolveDevelopmentLaunch(params) {
  if (params.get('tdk') !== '1') return null;
  const id = params.get('tsum') || 'testTsum';
  const definition = tsumDefinitions.find(d => d.id === id);
  if (!definition) throw new Error(`TDK unknown Tsum: ${id}`);
  const level = Number(params.get('sl') || 1);
  const count = Number(params.get('types') || 5);
  if (!Number.isInteger(level) || level < 1 || level > 6 || ![3, 4, 5].includes(count)) throw new Error('TDK requires sl=1..6 and types=3/4/5');
  return { definition, level, count };
}

export function applyDevelopmentLaunch(game, { definition, level, count }) {
  if (game.persistenceEnabled) throw new Error('TDK development session must disable persistence before Game construction');
  game.selectTsum(definition.id, level);
  game.itemSelection.reduce3 = count === 3;
  game.itemSelection.reduce = count === 4;
  game.tdkDefinition = definition;
  game.aiAutoPlay = false;
  game.strongestModeEnabled = false;
  game.startGame();
  game.pushCenterMessage('TDK 開発専用・保存なし', definition.color, 2);
}
