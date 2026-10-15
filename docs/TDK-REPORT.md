# TDK v1.0 変更・検証レポート

## 作業開始時（2026-10-15）

- canonical: ryomashibaba/tsumtsumfile。remote mainをfetch/ls-remoteで確認: `0073b87d41e34d6c0430162bf0f89da8f3329322`。
- 作業ツリーはclean。既存ブランチ `codex/photon-loom-sl6-coins` から移動し、最新origin/mainから `codex/tsum-development-kit` を新規作成。
- Draft PR #1（balance/laser-weave-strong-20261014）は読み取りのみ。変更・マージしない。
- 変更前 `npm test`: 362件、360成功、2失敗、skip 0。
  - static server: sandboxでlocalhost接続EACCES。
  - physics p95: 4.487ms > 4ms。機能退行と区別する。基準は変更しない。
- game.js/config.js/ui.jsの構文チェック実行。
- gh CLIは未インストール。GitHub連携APIを使ってDraft PRを作成予定。

## 接続方針

定義はconfig/game/UIをimportしない。カタログをconfigの末尾で既存TSUM_TYPES / SKILL_TABLES / 固定サブツム表へ変換し、game.js末尾で既存SkillRegistryに登録する。既存ツムの定義・ハンドラーは移行しない。

既存SkillRuntimeManagerの全イベント（tick/tap/chainStart/chainCommit/drag/pointerUp/spawn/augmentClear/end/cleanup）を使用する。特殊なゲームループは変更しない。
