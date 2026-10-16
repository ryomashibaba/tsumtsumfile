import createSkill from './skill.js';
import visuals from './visuals.js';
// TDK requires six table slots; only SL6 can be launched/activated.
const tables = { cost: Array(6).fill(22), durationSec: Array(6).fill(10),
  coinCorrectionType: Array(6).fill('correction_0'), chargeMultiplier: Array(6).fill(0.1) };
export default {
  id: 'autoChain', name: 'AUTO CHAIN', skillName: 'AUTO CHAIN · SL6',
  imageSrc: './tsums/autoChain/image.svg', score: 160,
  boardColor: '#38e5cf', color: '#38e5cf', light: '#eaffff', dark: '#07576b', accent: '#ffe7a3',
  developmentOnly: false, modes: { manual: true, cpu: false, strongest: true },
  capabilities: { tick: true, tap: false, chainStart: false, chainCommit: true,
    drag: false, pointerUp: false, spawn: false, augmentClear: false },
  subTsums: { 3: ['jafarGenie', 'grim'], 4: ['perfumeAlice', 'jamilViper', 'finalBattleHook'],
    5: ['perfumeAlice', 'jamilViper', 'jafarGenie', 'grim'] },
  timing: { presentation: { durationMs: 0, pauseClock: false, pausePhysics: false },
    endPause: { durationMs: 0, pauseClock: false, pausePhysics: false } },
  tables, handler: createSkill(tables, visuals), visuals
};
