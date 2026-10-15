# TDK v1.1 変更・検証レポート

## 起点と保護条件
- v1.0 Draft PR #2 HEAD: `170c737329c8aba659d2d31a0e4fd805e9a00886`
- v1.1: `codex/tdk-v1-1-chain-templates`
- v1.0、PR #1、mainへの変更・マージ・本番公開なし。Astra使用なし。

## 変更点
- `tdk/chainSkill.js`：チェーン確定で1回のスキル消去。既存のInputRouter、SkillRuntimeManager、ClearPipelineを利用。
- `tdk/testing.mjs`：共通契約・タップ型契約・チェーン型契約に分離。既存`testTsumContract`は互換維持。
- `scripts/tsum-new.mjs`：`--template=chain`を追加。既定のタップ型維持。
- `tsums/chainTestTsum`：SL1〜6、3/4/5種類の盤面を持つ開発専用の例示ツム。
- TDK README、生成テスト、npm testを更新。既存スキルは移行しない。

## 実行予定の検証と結果記録
- `npm run tsum:validate`：定義、画像、色の識別性、サブツム3/4/5種類。
- `npm run test:tdk`：両テンプレートの実ゲーム契約テスト。
- `npm test`：既存回帰とTDK追加。
- 実ブラウザ：SL1/3種類、SL6/5種類のドラッグ入力・消去・ゲージ・終了・再試験。
- 物理p95：環境依存として分離し、成功・失敗値を隠さない。
GitHubのCIログなど実行証拠が得られた場合はその結果を追記する。未実行項目をPASSと記載しない。

## 開発効率
- タップ/チェーン双方のひな型生成は同一CLIから実行可能。
- 生成後の共通ファイルへの手動編集は従来TDK v1.0と同様に不要。
- 開発時間の短縮率は未計測であり、推測値は実測として使用しない。

## 既知の制約
- チェーン型試験ツムはCPU・最強モード非対応。
- 全SL×全盤面のブラウザ実機総当たり、モバイル実機、長時間負荷は別途QA。
- 高度な特殊スキルの自動生成、汎用AI、ビジュアルGUIは対象外。

## GitHub Actions実測（2026-10-15）

- 検証：[Actions run #38731195842](https://github.com/ryomashibaba/tsumtsumfile/actions/runs/38731195842)
- `npm run tsum:validate`：2定義、SL1〜6、登録、画像、3/4/5種類盤面の検証成功。
- `npm run test:tdk`：25件成功、0失敗。
- 既存回帰＋TDKを含む機能テスト：386件成功、0失敗。
- 物理p95：同一GitHub runner系列の検証で一度 5.404ms（基準4ms超過）を観測。その後、失敗ジョブのみ再実行してPASS。旧v1.0でも別環境で4.487msの失敗例があるため、安定性改善を主張しない。
- v1.1では物理エンジン・ゲームループ本体・既存スキルの実装を変更していない。
- 実ブラウザの手動ドラッグ確認、スマートフォン実機、長時間走行は**未実施**。自動テストのPASSと混同しない。

### 追加した契約テストの意味
新しいチェーン型試験ツムでは、SL1〜6すべてについて、標準の`startChain`→`extendChain`→`finishChain`経路、確定後の範囲消去、コイン、スキルゲージ、終了復旧、二重確定防止を検証した。これはブラウザのポインターイベントを実際に操作した証拠ではない。
