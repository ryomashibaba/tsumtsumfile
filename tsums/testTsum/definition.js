import createSkill from './skill.js';
import visuals from './visuals.js';

const tables = {
  cost: [12, 12, 12, 12, 12, 12],
  durationSec: [5, 6, 7, 8, 9, 10],
  eraseRadius: [75, 80, 85, 90, 95, 100],
  coinCorrectionType: Array(6).fill('correction_0'),
  chargeMultiplier: Array(6).fill(0.5)
};

export default {
  id: 'testTsum', name: 'TDK試験ツム', skillName: '試験タップ消去',
  imageSrc: './tsums/testTsum/image.svg', score: 100,
  boardColor: '#38e5cf', color: '#38e5cf', light: '#d9fff4', dark: '#08756e', accent: '#97ffe0',
  developmentOnly: true,
  modes: { manual: true, cpu: false, strongest: false },
  capabilities: { tick: false, tap: true, chainStart: false, chainCommit: false, drag: false, pointerUp: false, spawn: false, augmentClear: false },
  subTsums: 'auto',
  timing: {
    presentation: { durationMs: 500, pauseClock: true, pausePhysics: true },
    endPause: { durationMs: 150, pauseClock: true, pausePhysics: false }
  },
  tables, handler: createSkill(tables, visuals), visuals
};
