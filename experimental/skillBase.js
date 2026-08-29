// skillBase.js - スキルシステムのベースクラスとナミネスキルのクラス化例

import {
  pickMostCommonType,
  getLiveTsums,
  collectNodesNearCenters,
  skillValue
} from '../game.js';

// スキルコンテキストインターフェース
// ctx.game: Gameインスタンス
// ctx.board: BoardState
// ctx.level: スキルレベル
// ctx.runtime: SkillRuntime
// ctx.clear: ClearPipeline
// ctx.applyFreeze: 凍結適用
// ctx.applyBubble: バブル適用
// ctx.transformNodes: 変換適用
// ctx.createSession: セッション作成
// ctx.setSpawnModifier: スポーン変更
// ctx.removeSpawnModifier: スポーン変更解除
// ctx.clearBySource: ソースによるクリア

export class SkillBase {
  constructor(id, tables) {
    this.id = id;
    this.tables = tables;
  }

  // スキル発動時
  onActivate(ctx) {
    throw new Error('onActivate must be implemented');
  }

  // スキル効果中（毎フレーム）
  onTick(ctx, session) {
    // デフォルトでは何もしない
  }

  // ツムがスポーンされたとき
  onSpawn(ctx, session, node) {
    return null;
  }

  // チェーンが確定したとき
  onChainCommit(ctx, session, chain) {
    return false;
  }

  // クリア要求を強化
  onAugmentClear(ctx, session, request) {
    return request;
  }

  // タップされたとき
  onTap(ctx, session, pos) {
    return false;
  }

  // スキル終了時
  onEnd(ctx, session) {
    // デフォルトでは何もしない
  }

  // セッションによるクリーンアップ
  cleanupBySession(ctx, session) {
    // デフォルトでは何もしない
  }

  // スキル値の取得
  getValue(key, level) {
    return skillValue(this.id, key, level);
  }
}

// ナミネスキルの実装例
export class NamineSkill extends SkillBase {
  constructor() {
    super('namine', null); // tablesはskillValueで参照
  }

  onActivate(ctx) {
    const duration = this.getValue('durationSec', ctx.level) || 4.0;
    const sourceType = pickMostCommonType(ctx.game, ctx.game.myTsum.id);
    
    ctx.game.pushCenterMessage("NAMINE!", "#ffd2ff", 0.92);
    ctx.game.namineSkillTimer = duration;
    
    const session = ctx.createSession({
      remainingMs: duration * 1000,
      cleanupOnEnd: false,
      data: {
        sourceTypeId: sourceType?.id || null
      }
    });

    if (sourceType) {
      const targets = getLiveTsums(ctx.game, (tsum) => 
        ctx.board.getResolvedType(tsum).id === sourceType.id
      );
      if (targets.length) {
        ctx.transformNodes(targets.map((tsum) => tsum.id), {
          sessionId: session.id,
          toTypeId: "namineSora",
          kind: "namineSora"
        });
      }
    }

    return session;
  }

  onTick(ctx, session) {
    ctx.game.namineSkillTimer = Math.max(0, session.remainingMs / 1000);
  }

  onSpawn(ctx, session, node) {
    // スキル効果中、最も多いサブツムタイプをソラに変換
    const mostCommon = pickMostCommonType(ctx.game, ctx.game.myTsum.id);
    if (mostCommon && node.type.id === mostCommon.id) {
      ctx.transformNodes([node.id], {
        sessionId: session.id,
        toTypeId: "namineSora",
        kind: "namineSora"
      });
    }
    return null;
  }

  onAugmentClear(ctx, session, request) {
    if (request.source !== "chain") {
      return request;
    }

    const familyNodes = request.targets.filter((tsum) => {
      const typeId = ctx.board.getResolvedType(tsum).id;
      return typeId === "namine" || typeId === "namineSora";
    });

    if (!familyNodes.length) {
      return request;
    }

    const seen = new Set(request.targets.map((tsum) => tsum.id));
    const extra = collectNodesNearCenters(
      ctx.game,
      familyNodes,
      this.getValue('splashRadius', ctx.level),
      (tsum) => !seen.has(tsum.id)
    );

    extra.forEach((tsum) => request.targets.push(tsum));
    request.correctionType = this.getValue('coinCorrectionType', ctx.level);
    request.chargeMultiplier = this.getValue('chargeMultiplier', ctx.level);

    return request;
  }

  onEnd(ctx, session) {
    ctx.game.namineSkillTimer = 0;
    if (ctx.game.dragging && ctx.game.chainRule?.mode === "namine") {
      ctx.game.postChainCleanupSessionIds.push(session.id);
      return;
    }
    ctx.clearBySource(session.id);
  }

  cleanupBySession(ctx, session) {
    // 必要なクリーンアップ処理
  }
}

// スキルレジストリ（クラスベース）
export class SkillRegistry {
  constructor() {
    this.skills = new Map();
  }

  register(id, skill) {
    if (!(skill instanceof SkillBase)) {
      throw new Error('Skill must extend SkillBase');
    }
    this.skills.set(id, skill);
  }

  get(id) {
    return this.skills.get(id);
  }

  has(id) {
    return this.skills.has(id);
  }

  // すべてのスキルをオブジェクト形式で取得（既存コードとの互換性のため）
  toObject() {
    const obj = {};
    for (const [id, skill] of this.skills) {
      obj[id] = skill;
    }
    return obj;
  }
}

// グローバルスキルレジストリ
export const globalSkillRegistry = new SkillRegistry();

// ナミネスキルを登録
globalSkillRegistry.register('namine', new NamineSkill());
