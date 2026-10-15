import { evolutionHandler, evolutionSpec, EVOLUTION_TUNING as tuning } from './skill.js';
import { createStandardVisuals } from '../../tdk/standardVisuals.js';
const levels = [1, 2, 3, 4, 5, 6];
const visuals = createStandardVisuals('#70fff2', '段階進化型ツム');
export default {
  id: 'evolutionTsum', name: '段階進化型ツム', skillName: '段階進化 / OVERDRIVE',
  imageSrc: './tsums/evolutionTsum/image.svg', score: 150,
  boardColor: '#36c9b5', color: '#36c9b5', light: '#dcfff5', dark: '#07596c', accent: '#ffda79',
  developmentOnly: false, modes: { manual: true, cpu: false, strongest: false },
  capabilities: { tick: true, tap: false, chainStart: false, chainCommit: false,
    drag: false, pointerUp: false, spawn: true, augmentClear: true },
  subTsums: { 3: ['jafarGenie', 'grim'],
    4: ['perfumeAlice', 'jamilViper', 'finalBattleHook'],
    5: ['perfumeAlice', 'jamilViper', 'jafarGenie', 'grim'] },
  timing: { presentation: { durationMs: 400, pauseClock: true, pausePhysics: false },
    endPause: { durationMs: 0, pauseClock: false, pausePhysics: false } },
  tables: {
    cost: levels.map(() => tuning.cost), durationSec: levels.map(sl => evolutionSpec(sl).durationSec),
    first: levels.map(sl => evolutionSpec(sl).first), splash: levels.map(sl => evolutionSpec(sl).splash),
    overdrive: levels.map(sl => evolutionSpec(sl).overdrive), periodic: levels.map(sl => evolutionSpec(sl).periodic),
    coinCorrectionType: levels.map(() => 'correction_0'), chargeMultiplier: levels.map(() => tuning.manualCharge)
  }, handler: evolutionHandler, visuals
};
