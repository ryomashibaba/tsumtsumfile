# ローカルDraft PR案（未作成・未公開）

Title: Add TDK v1.1 chain skill template and isolated development Tsum

Base: `codex/tsum-development-kit`

Head: `codex/tdk-v1-1-chain-template`

## 本文

TDK v1.0のDraft PR #2（https://github.com/ryomashibaba/tsumtsumfile/pull/2）に依存するスタックPRです。mainへの直接統合は対象外です。

これまでタップ型だけだった生成コマンドに `--template=chain` を追加します。発動中に3個以上つなぐと既存ClearPipelineで特殊消去し、コイン・回収・終了を処理します。チェーン確定を消費して通常消去との二重処理を防ぎ、時間切れ・ゲーム終了・リセットで途中入力を解除します。

共通契約とタップ／チェーン固有テストを分離し、従来の呼出名も維持します。開発専用 `chainTestTsum` は通常選択と保存から隔離され、CPU／最強モードは未対応です。既存のgame/config/UI、物理、PHOTON LOOM、DOPAは変更していません。

検証: カタログ2定義、TDK61件、機能422件、ブラウザ18ケース成功。最終 `npm test` は422件成功・物理p95の1件失敗（7.066ms > 4ms）。単独性能試験も成功／失敗が混在し、性能変動は未解決です。閾値と既存テストは変更していません。

実測生成・登録・検証・基本テストは、タップ1485.54ms／チェーン1069.98ms（各1回、複製時間除外）。詳細は `docs/TDK-V1.1-REPORT.md` を参照してください。
