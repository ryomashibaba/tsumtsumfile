import { tsumDefinitions } from '../tsums/catalog.js';

export function resolveDevelopmentLaunch(params) {
  if (params.get('tdk') !== '1') return null;
  const id = params.get('tsum') || 'testTsum';
  const definition = tsumDefinitions.find(d => d.id === id);
  if (!definition) throw new Error(`TDK unknown Tsum: ${id}`);
  const level = Number(params.get('sl') || 1);
  if (id === 'autoChain' && level !== 6) throw new Error('AUTO CHAIN supports SL6 only: use sl=6');
  const count = Number(params.get('types') || 5);
  if (!Number.isInteger(level) || level < 1 || level > 6 || ![3, 4, 5].includes(count)) throw new Error('TDK requires sl=1..6 and types=3/4/5');
  return { definition, level, count };
}

export function applyDevelopmentLaunch(game, { definition, level, count }) {
  if (game.persistenceEnabled || game.tdkDevelopment !== true) throw new Error('TDK development session must disable persistence and set tdkDevelopment before Game construction');
  game.selectTsum(definition.id, level);
  game.itemSelection.reduce3 = count === 3;
  game.itemSelection.reduce = count === 4;
  game.tdkDefinition = definition;
  game.aiAutoPlay = false;
  game.strongestModeEnabled = false;
  game.startGame();
  game.pushCenterMessage('TDK 開発専用・保存なし', definition.color, 2);
}

export function mountDevelopmentControls(game, launch) {
  const panel = document.createElement('aside');
  panel.setAttribute('aria-label', 'TDK開発ツール');
  panel.style.cssText = 'position:fixed;top:30px;left:8px;z-index:20;padding:8px;border-radius:8px;background:#102030e8;color:white;font:12px sans-serif;max-width:280px';
  const label = document.createElement('div');
  label.textContent = `TDK 開発専用・保存なし / ${launch.definition.id} SL${launch.level} / ${launch.count}種類`;
  const modes = document.createElement('div');
  modes.textContent = `CPU: ${launch.definition.modes.cpu ? '対応' : '未対応'} / 最強モード: ${launch.definition.modes.strongest ? '対応' : '未対応'}`;
  const charge = document.createElement('button');
  charge.textContent = 'スキル充填';
  charge.onclick = () => game.skillSystem.addCharge(game.skillSystem.maxCharge);
  const restart = document.createElement('button');
  restart.textContent = '再試験';
  restart.onclick = () => applyDevelopmentLaunch(game, launch);
  const status = document.createElement('output');
  status.style.display = 'block';
  panel.append(label, modes, charge, restart, status);
  document.body.append(panel);
  const update = () => { status.textContent = `消去 ${game.totalCleared} / コイン ${game.coinBonus} / ゲージ ${game.skillSystem.charge}/${game.skillSystem.maxCharge} / スキル ${game.skillRuntime.sessions.length}`; };
  update();
  const timer = setInterval(update, 250);
  window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
}
