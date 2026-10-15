import createSkill from './skill.js';
import visuals from './visuals.js';

const tables = {
  minChainLength: [3, 3, 3, 3, 3, 3],
  cost: [12, 12, 12, 12, 12, 12],
  durationSec: [5, 6, 7, 8, 9, 10],
  eraseRadius: [0, 8, 12, 16, 20, 24],
  coinCorrectionType: Array(6).fill('correction_0'),
  chargeMultiplier: Array(6).fill(0.5)
};

export default {
  id: 'chainTestTsum', name: 'chainTestTsum', skillName: 'チェーン特殊消去',
  imageSrc: './tsums/chainTestTsum/image.svg', score: 100,
  boardColor: '#38e5cf', color: '#38e5cf', light: '#d9fff4', dark: '#08756e', accent: '#97ffe0',
  template: 'chain',
  developmentOnly: true,
  modes: { manual: true, cpu: false, strongest: false },
  capabilities: { tick: true, tap: false, chainStart: true, chainCommit: true, drag: false, pointerUp: false, spawn: false, augmentClear: false },
  subTsums: 'auto',
  timing: {
    presentation: { durationMs: 500, pauseClock: true, pausePhysics: true },
    endPause: { durationMs: 150, pauseClock: true, pausePhysics: false }
  },
  tables, handler: createSkill(tables, visuals), visuals
};
