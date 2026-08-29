// coinFormula.js - コイン補正の数式化

// 基本コイン計算式
//  clears: 消去数
//  correctionLevel: 補正レベル（-10〜10）
//  baseMultiplier: 基本倍率（デフォルト1.0）

// 補正レベルに応じた係数を計算
function getCorrectionMultiplier(correctionLevel) {
  // correctionLevel: -10（最低）〜 10（最高）
  // 各レベルで約10%ずつ増減
  return 1.0 + (correctionLevel * 0.1);
}

// 消去数に応じた基本コイン数を計算（線形近似）
function calculateBaseCoins(clears) {
  if (clears <= 0) return 0;
  if (clears <= 3) return 0;
  
  // 実データから近似した数式
  // 消去数が少ないときは緩やか、多いときは急激に増加
  const base = Math.floor(clears * 2.5);
  const bonus = Math.floor(Math.pow(clears, 1.3) * 0.8);
  
  return Math.max(0, base + bonus);
}

// コイン補正を適用した最終コイン数を計算
export function calculateCoins(clears, correctionLevel = 0, baseMultiplier = 1.0) {
  if (clears <= 0) return 0;
  
  const baseCoins = calculateBaseCoins(clears);
  const correctionMultiplier = getCorrectionMultiplier(correctionLevel);
  
  const finalCoins = Math.floor(baseCoins * correctionMultiplier * baseMultiplier);
  
  return Math.max(0, finalCoins);
}

// 旧テーブルとの互換性のため、数式化された補正タイプを定義
// correction_-10 〜 correction_10 の16種類
export const COIN_CORRECTION_FORMULAS = {
  'correction_-10': (clears) => calculateCoins(clears, -10),
  'correction_-9': (clears) => calculateCoins(clears, -9),
  'correction_-8': (clears) => calculateCoins(clears, -8),
  'correction_-7': (clears) => calculateCoins(clears, -7),
  'correction_-6': (clears) => calculateCoins(clears, -6),
  'correction_-5': (clears) => calculateCoins(clears, -5),
  'correction_-4': (clears) => calculateCoins(clears, -4),
  'correction_-3': (clears) => calculateCoins(clears, -3),
  'correction_-2': (clears) => calculateCoins(clears, -2),
  'correction_-1': (clears) => calculateCoins(clears, -1),
  'correction_0': (clears) => calculateCoins(clears, 0),
  'correction_1': (clears) => calculateCoins(clears, 1),
  'correction_2': (clears) => calculateCoins(clears, 2),
  'correction_3': (clears) => calculateCoins(clears, 3),
  'correction_4': (clears) => calculateCoins(clears, 4),
  'correction_5': (clears) => calculateCoins(clears, 5),
  'correction_6': (clears) => calculateCoins(clears, 6),
  'correction_7': (clears) => calculateCoins(clears, 7),
  'correction_8': (clears) => calculateCoins(clears, 8),
  'correction_9': (clears) => calculateCoins(clears, 9),
  'correction_10': (clears) => calculateCoins(clears, 10)
};

// 指定された補正タイプのコイン数を取得
export function getCoinsByFormula(correctionType, clears) {
  const formula = COIN_CORRECTION_FORMULAS[correctionType];
  if (!formula) {
    console.warn(`[COIN] Unknown correction type: ${correctionType}, using correction_0`);
    return COIN_CORRECTION_FORMULAS['correction_0'](clears);
  }
  return formula(clears);
}

// 旧テーブルとの互換レイヤー（段階的移行用）
export function createCoinCalculator(allowFallback = true) {
  return {
    getCoins(correctionType, clears) {
      if (allowFallback) {
        try {
          return getCoinsByFormula(correctionType, clears);
        } catch (e) {
          console.warn(`[COIN] Formula calculation failed, this should not happen: ${e.message}`);
          return 0;
        }
      }
      return getCoinsByFormula(correctionType, clears);
    },
    
    // デバッグ用：計算過程を表示
    debugCoins(correctionType, clears) {
      const baseCoins = calculateBaseCoins(clears);
      const level = parseInt(correctionType.split('_')[1]);
      const multiplier = getCorrectionMultiplier(level);
      const final = Math.floor(baseCoins * multiplier);
      
      return {
        clears,
        correctionType,
        correctionLevel: level,
        baseCoins,
        multiplier,
        finalCoins: final
      };
    }
  };
}

// グローバルコイン計算機
export const coinCalculator = createCoinCalculator();