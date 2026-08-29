import { STORAGE_KEY } from "./config.js?v=tsum-images-5";

export const BATTLE_STORAGE_KEY = `${STORAGE_KEY}_cpu_battle_v1`;

export const DIFFICULTY_PROFILES = Object.freeze({
  easy: Object.freeze({
    id: "easy",
    label: "Easy",
    strategy: "fastClear",
    actionInterval: 1.2,
    chainStepDelay: 0.14,
    chainFinishDelay: 0.25,
    winBonus: 1000
  }),
  normal: Object.freeze({
    id: "normal",
    label: "Normal",
    strategy: "longestChain",
    actionInterval: 0.75,
    chainStepDelay: 0.1,
    chainFinishDelay: 0.2,
    winBonus: 5000
  }),
  hard: Object.freeze({
    id: "hard",
    label: "Hard",
    strategy: "skillFirst",
    actionInterval: 0.4,
    chainStepDelay: 0.06,
    chainFinishDelay: 0.12,
    winBonus: 10000
  })
});

export function createDefaultBattleRecords() {
  const empty = () => ({ wins: 0, losses: 0, draws: 0, streak: 0, recent: [] });
  return {
    version: 1,
    selectedDifficulty: "normal",
    byDifficulty: {
      easy: empty(),
      normal: empty(),
      hard: empty()
    }
  };
}

export function normalizeDifficulty(value) {
  return DIFFICULTY_PROFILES[value] ? value : "normal";
}

export function calculateAdaptiveMultiplier(recent = []) {
  const sample = recent.slice(-5);
  if (sample.length < 3) {
    return 1;
  }
  const wins = sample.filter((result) => result === "win").length;
  const winRate = wins / sample.length;
  if (winRate >= 0.8) {
    return 0.9;
  }
  if (winRate <= 0.2) {
    return 1.1;
  }
  return 1;
}

export function resolveBattleOutcome(playerScore, cpuScore) {
  if (playerScore > cpuScore) {
    return "win";
  }
  if (playerScore < cpuScore) {
    return "loss";
  }
  return "draw";
}

export function getWinBonus(difficulty, outcome) {
  return outcome === "win"
    ? DIFFICULTY_PROFILES[normalizeDifficulty(difficulty)].winBonus
    : 0;
}

export class BattleController {
  constructor(playerGame, cpuGame, arena, options = {}) {
    this.player = playerGame;
    this.cpu = cpuGame;
    this.createCpuGame = typeof options.createCpuGame === "function" ? options.createCpuGame : null;
    this.arena = arena;
    this.mode = "solo";
    this.active = false;
    this.pendingResults = { player: null, cpu: null };
    this.finalizeQueued = false;
    this.lastFrame = performance.now();
    this.records = this.loadRecords();
    this.difficulty = normalizeDifficulty(this.records.selectedDifficulty);
    this.desktopQuery = window.matchMedia("(min-width: 900px)");

    this.player.battleController = this;
    this.player.gameMode = "solo";
    this.player.battleDifficulty = this.difficulty;
    this.player.onRunFinished = (stats, game) => this.onRunFinished(stats, game);
    this.configureCpu();

    this.updateArena();
  }

  configureCpu() {
    if (!this.cpu) {
      return null;
    }
    this.cpu.battleController = this;
    this.cpu.gameMode = "battle";
    this.cpu.battleDifficulty = this.difficulty;
    this.cpu.onRunFinished = (stats, game) => this.onRunFinished(stats, game);
    return this.cpu;
  }

  ensureCpu() {
    if (!this.cpu && this.createCpuGame) {
      this.cpu = this.createCpuGame();
      this.configureCpu();
    }
    return this.cpu;
  }

  loadRecords() {
    const fallback = createDefaultBattleRecords();
    try {
      const parsed = JSON.parse(localStorage.getItem(BATTLE_STORAGE_KEY) || "null");
      if (!parsed || typeof parsed !== "object") {
        return fallback;
      }
      for (const id of Object.keys(DIFFICULTY_PROFILES)) {
        const source = parsed.byDifficulty?.[id] || {};
        fallback.byDifficulty[id] = {
          wins: Math.max(0, Number(source.wins) || 0),
          losses: Math.max(0, Number(source.losses) || 0),
          draws: Math.max(0, Number(source.draws) || 0),
          streak: Math.max(0, Number(source.streak) || 0),
          recent: Array.isArray(source.recent)
            ? source.recent.filter((entry) => ["win", "loss", "draw"].includes(entry)).slice(-5)
            : []
        };
      }
      fallback.selectedDifficulty = normalizeDifficulty(parsed.selectedDifficulty);
      return fallback;
    } catch (error) {
      console.warn("[Battle] Failed to load records", error);
      return fallback;
    }
  }

  saveRecords() {
    try {
      localStorage.setItem(BATTLE_STORAGE_KEY, JSON.stringify(this.records));
    } catch (error) {
      console.warn("[Battle] Failed to save records", error);
    }
  }

  setMode(mode) {
    if (this.active) {
      return;
    }
    this.mode = mode === "battle" ? "battle" : "solo";
    if (this.mode === "battle") {
      this.ensureCpu();
    }
    this.player.gameMode = this.mode;
    this.player.battleStats = null;
    this.updateArena();
  }

  setDifficulty(difficulty) {
    if (this.active) {
      return;
    }
    this.difficulty = normalizeDifficulty(difficulty);
    this.player.battleDifficulty = this.difficulty;
    if (this.cpu) {
      this.cpu.battleDifficulty = this.difficulty;
    }
    this.records.selectedDifficulty = this.difficulty;
    this.saveRecords();
  }

  updateArena() {
    const battleVisible = this.mode === "battle" || this.active || !!this.player.battleStats;
    this.arena.dataset.mode = battleVisible ? "battle" : "solo";
    const station = this.arena.querySelector(".cpu-station");
    if (station) {
      station.setAttribute("aria-hidden", battleVisible ? "false" : "true");
    }
  }

  start() {
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastFrame) / 1000, 0.05);
    this.lastFrame = timestamp;
    this.player.tick(dt, true);
    if (this.cpu && (this.active || this.cpu.state === "result" || this.cpu.state === "battleWaiting")) {
      this.cpu.tick(dt, this.desktopQuery.matches);
    }
    requestAnimationFrame((nextTimestamp) => this.loop(nextTimestamp));
  }

  startSelectedMode() {
    if (this.mode !== "battle") {
      this.player.startGame();
      return;
    }
    this.startBattle();
  }

  getDifficultyRuntime() {
    const profile = DIFFICULTY_PROFILES[this.difficulty];
    const recent = this.records.byDifficulty[this.difficulty].recent;
    const adaptiveMultiplier = calculateAdaptiveMultiplier(recent);
    return { profile, adaptiveMultiplier };
  }

  startBattle() {
    if (!this.ensureCpu()) {
      console.error("[Battle] CPU game could not be created.");
      return;
    }
    this.active = true;
    this.finalizeQueued = false;
    this.pendingResults = { player: null, cpu: null };
    this.player.battleStats = null;
    this.cpu.battleStats = null;
    const { profile, adaptiveMultiplier } = this.getDifficultyRuntime();

    this.cpu.selectedMyTsumIndex = this.player.selectedMyTsumIndex;
    this.cpu.selectedSkillLevel = this.player.selectedSkillLevel;
    this.cpu.currentSkillLevel = this.player.selectedSkillLevel;
    this.cpu.itemSelection = { ...this.player.itemSelection };
    this.cpu.myTsum = this.player.myTsum;
    this.cpu.aiAutoPlay = true;
    this.cpu.aiLearningMode = false;
    this.cpu.aiLearningAutoRepeat = false;
    this.cpu.aiTrainingMode = false;
    this.cpu.strongestModeEnabled = false;
    this.cpu.aiCurrentStrategy = profile.strategy;
    this.cpu.aiAutoPlayInterval = profile.actionInterval * adaptiveMultiplier;
    this.cpu.aiChainStepDelay = profile.chainStepDelay * adaptiveMultiplier;
    this.cpu.aiChainFinishDelay = profile.chainFinishDelay * adaptiveMultiplier;

    const shared = {
      active: true,
      complete: false,
      difficulty: this.difficulty,
      profile,
      adaptiveMultiplier
    };
    this.player.battleContext = { ...shared, opponent: this.cpu };
    this.cpu.battleContext = { ...shared, opponent: this.player };
    this.player.runFinished = false;
    this.cpu.runFinished = false;
    this.updateArena();

    this.player.startGame({ battle: true });
    this.cpu.startGame({ battle: true, skipCost: true, skipProgressSave: true });
  }

  setPaused(paused) {
    if (!this.active) {
      return false;
    }
    for (const game of [this.player, this.cpu]) {
      game.paused = paused;
      if (paused && game.dragging) {
        game.inputRouter.handlePointerUp(game.dragPointer);
      }
    }
    return true;
  }

  onRunFinished(stats, game) {
    if (!this.active || !game.battleContext?.active) {
      return false;
    }
    this.pendingResults[game.role] = { ...stats };
    if (this.pendingResults.player && this.pendingResults.cpu && !this.finalizeQueued) {
      this.finalizeQueued = true;
      queueMicrotask(() => this.finalizeBattle());
    }
    return true;
  }

  finalizeBattle() {
    if (!this.active || !this.pendingResults.player || !this.pendingResults.cpu) {
      return;
    }
    const playerResult = this.pendingResults.player;
    const cpuResult = this.pendingResults.cpu;
    const outcome = resolveBattleOutcome(playerResult.finalScore, cpuResult.finalScore);
    const bonus = getWinBonus(this.difficulty, outcome);
    const record = this.records.byDifficulty[this.difficulty];
    record.recent = [...record.recent, outcome].slice(-5);
    if (outcome === "win") {
      record.wins += 1;
      record.streak += 1;
    } else if (outcome === "loss") {
      record.losses += 1;
      record.streak = 0;
    } else {
      record.draws += 1;
      record.streak = 0;
    }
    this.saveRecords();

    if (bonus > 0) {
      this.player.coins += bonus;
      this.player.saveProgress();
    }
    const adaptiveMultiplier = this.player.battleContext?.adaptiveMultiplier || 1;
    const battleStats = {
      outcome,
      playerScore: playerResult.finalScore,
      cpuScore: cpuResult.finalScore,
      scoreDifference: playerResult.finalScore - cpuResult.finalScore,
      difficulty: this.difficulty,
      adaptiveMultiplier,
      bonus,
      record: { ...record, recent: [...record.recent] }
    };
    this.player.resultStats = playerResult;
    this.cpu.resultStats = cpuResult;
    this.player.battleStats = battleStats;
    this.cpu.battleStats = battleStats;
    this.player.battleContext.complete = true;
    this.cpu.battleContext.complete = true;
    this.player.state = "result";
    this.cpu.state = "battleWaiting";
    this.active = false;
    this.updateArena();
  }

  prepareRematch() {
    this.active = false;
    this.pendingResults = { player: null, cpu: null };
    this.player.battleStats = null;
    if (!this.cpu) {
      this.updateArena();
      return;
    }
    this.cpu.battleStats = null;
    this.player.battleContext = null;
    this.cpu.battleContext = null;
    this.cpu.resetGame();
    this.updateArena();
  }

  returnToTitle() {
    this.abortBattle();
    this.player.state = "title";
    this.player.itemSelection = this.player.blankItemSelection();
  }

  abortBattle() {
    this.active = false;
    this.finalizeQueued = false;
    this.pendingResults = { player: null, cpu: null };
    this.player.battleStats = null;
    if (!this.cpu) {
      this.updateArena();
      return;
    }
    this.cpu.battleStats = null;
    this.player.battleContext = null;
    this.cpu.battleContext = null;
    this.cpu.aiAutoPlay = false;
    this.cpu.resetGame();
    this.updateArena();
  }
}
