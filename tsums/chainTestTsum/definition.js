import createSkill from './skill.js';
import visuals from './visuals.js';
const tables = {
  cost: [12, 12, 12, 12, 12, 12],
  durationSec: [5, 6, 7, 8, 9, 10],
  minChainLength: [3, 3, 3, 3, 3, 3],
  splashRadius: [75, 78, 81, 84, 87, 90],
  coinCorrectionType: Array(6).fill('correction_0'),
  chargeMultiplier: Array(6).fill(0.5)
};
export default {
  id: 'chainTestTsum', name: 'TDKチェーン試験ツム', skillName: 'チェーン消去テスト',
  imageSrc: './tsums/chainTestTsum/image.svg', score: 100,
  boardColor: '#af7aff', color: '#af7aff', light: '#f3e5ff',
  dark: '#55339a', accent: '#d5afff',
  developmentOnly: true, modes: { manual: true, cpu: false, strongest: false },
  capabilities: { tick: false, tap: false, chainStart: false,
    chainCommit: true, drag: false, pointerUp: false, spawn: false, augmentClear: false },
  subTsums: 'auto',
  timing: {
    presentation: { durationMs: 500, pauseClock: true, pausePhysics: true },
    endPause: { durationMs: 150, pauseClock: true, pausePhysics: false }
  },
  tables, handler: createSkill(tables, visuals), visuals
};
