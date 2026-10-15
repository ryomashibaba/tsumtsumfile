# Tsum Development Kit v1.1

新ツムを追加するための軽量な開発基盤です。既存のSkillRegistry、SkillRuntimeManager、ClearPipeline、InputRouterをそのまま使用します。既存ツムの移行は不要です。

## 最短の手順

```sh
npm run tsum:new -- newTsum
npm run tsum:new -- newChainTsum --template=chain
npm run tsum:validate
npm run test:tdk
node scripts/serve.mjs
```

ブラウザで `http://localhost:8765/?tdk=1&tsum=newTsum&sl=1&types=5` を開きます。SLは1〜6、typesは3/4/5を指定できます。既存の `testTsum` は同名で生成できません。別のIDを使ってください。

開発ツールの「スキル充填」を押し、ゲーム内のスキルボタンかSpaceで発動して、盤面をタップします。「再試験」で同じ条件を再開できます。通常のドラッグチェーンも使えます。開発専用ツムは通常の選択画面に出ず、開発セッションは進行・設定・AI学習・CPU対戦記録を保存しません。開発モードを終了するには、クエリのない通常URLへ移動します。

`--template=chain` は同じ種類の有効なツムを3個以上つなぐ単発スキルです。発動後の `CHAIN READY` と残り秒数を確認し、通常と同じドラッグでつなぎ、離すと特殊消去します。成功時またはスキル時間切れで終了します。発動前・終了後は既存の通常チェーンです。試験URL: `http://localhost:8765/?tdk=1&tsum=chainTestTsum&sl=1&types=3`。

オプションなし／`--template=tap` は従来のタップ型です。不明なオプションは生成前に拒否します。どちらも5ファイルを生成し、カタログを自動登録します。

試験ツムは手動操作のみ対応します。CPUと最強モードは未対応として表示し、その操作とCPU対戦の開始を抑止します。既存ツムのAIは変更しません。

## 生成物と編集箇所

| ファイル | 編集内容 |
| --- | --- |
| `tsums/newTsum/definition.js` | 名前、画像、色、スコア、SL1〜6、必要数、コイン補正、回収率、サブツム、対応モード、演出時間 |
| `tsums/newTsum/skill.js` | 専用のスキルロジック。初期状態は単発タップ範囲消去 |
| `tsums/newTsum/visuals.js` | 発動、スキル中背景・前景、消去、終了演出 |
| `tsums/newTsum/image.svg` | 仮画像。制作したSVG/PNG/WebPへ差し替え可能 |
| `tsums/newTsum/skill.test.mjs` | 初期タップスキルの実動テスト。挙動を変えたら固有の期待値に更新 |

チェーン型では `skill.js` が `createChainSkill`、`visuals.js` が `createChainVisuals`、テストが `testChainTsumContract` を使用します。SL別の `minChainLength`（整数3以上）、`eraseRadius`（チェーン各中心からの周辺消去距離、0ならチェーン本体のみ）、`coinCorrectionType`、`chargeMultiplier`、`durationSec` を `definition.js` で調整できます。初期値の周辺距離はSL1〜6で0/8/12/16/20/24です。

カタログのimportと配列への追加は自動です。大きなゲーム/UIファイルを毎回編集する必要はありません。IDは英小文字で始まる英数字2〜48文字。既存IDと大文字小文字だけ異なるID、予約名、既存ディレクトリへの生成は拒否します。同時に複数の生成コマンドを実行しないでください。

## 定義の契約

- `tables` の各項目は必ず6要素。`cost`、`durationSec` は正数、その他の数値は有限の非負数です。
- `coinCorrectionType` は既存のコイン補正表のキーをSL別に指定。`chargeMultiplier` は**スキル消去時**の回収率です。通常チェーンの回収は既存処理に従います。
- `developmentOnly: true` が生成時の既定。自動的に正式化しません。
- `modes: { manual, cpu, strongest }` で対応を明記。対応フラグをtrueにする前に、専用のAI入力と実機検証を用意してください。フラグ自体はAIを実装しません。
- `capabilities` はイベントフックの実在と一致させます。宣言と実装の不一致は検証エラーになります。
- 定義・スキル・演出は `config.js`、`game.js`、`ui.js` をimportしないでください。必要な操作は実行時のctx/game経由で利用します。これにより循環依存を防ぎます。

## 既存ランタイムAPI

ハンドラーの `id` は定義IDと一致させ、`onActivate(ctx)` が `ctx.createSession(...)` を返します。`remainingMs` が経過すると既存ランタイムが終了します。終了は `onEnd(ctx, session, reason)`、一時状態の解除は `cleanupBySession(ctx, sessionId)` で行い、通常は `ctx.clearBySource(sessionId)` を使用します。

| フック | 入力・引数 |
| --- | --- |
| `onTick` | ctx, session, dtMs |
| `onTap` / `onChainStart` / `onDrag` / `onPointerUp` | ctx, session, position |
| `onChainCommit` | ctx, session, chain |
| `onSpawn` | ctx, session, node |
| `onAugmentClear` | ctx, session, request（変更したrequestを返す） |
| `onEnd` | ctx, session, reason |
| `cleanupBySession` | ctx, sessionId |

入力を処理したらtrueを返し、処理しない入力はfalseで既存入力処理へ渡します。特殊なスキルは `createTapSkill` を使わず、独自ハンドラーを実装できます。

`createChainSkill` は `onChainStart` から既存 `game.startChain` を呼び、実際の追跡・戻し・ポインターキャンセルを再利用します。`onChainCommit` は成功・拒否・消去受付失敗のいずれも **true** を返します。これにより `Game.finishChain` が通常消去へフォールバックしません。盤面上の実体、選択状態、種類と接続距離、凍結・消去中・重複などを再検証します。成功前に再入防止フラグを立て、成功時にセッションを終了します。失敗時は新しいジェスチャーで再試行できます。時間切れ・リセット時は途中のチェーンをキャンセルし、指を離したときの通常消去への混入を防ぎます。`onTick` はゲーム全体の時間切れも検出し、結果画面へ移る前にチェーンとセッションを解除します。

接続判定に渡す余白4は既存エンジンの `CHAIN_CONNECT_MARGIN` と同じです。将来エンジン側を変更するときは併せて確認してください。時計と物理は従来どおり独立し、チェーン追跡中は両方進行、消去中は時計のみ停止します。

`ctx.clear.beginClear({ source: 'skill', targets, correctionType, chargeMultiplier, ... })` を使用すれば、重複・無効ターゲットの除去、コイン、ゲージ、補充を既存経路で処理できます。`pauseClock` と `pausePhysics` は別々に指定できます。直接コインやゲージを加算する実装を重ねないでください。

その他の既存API：`applyFreeze`、`clearFrozenGroup`、`applyBubble`、`transformNodes`、`setSpawnModifier`、`removeSpawnModifier`、`addSpecialChainNodes`、`setScaleModifier`、`clearScaleBySource`、`schedule`。詳細な契約はgame.jsの `SkillRuntimeManager.createContext` と既存スキルを参照してください。PHOTON LOOM/DOPA固有のループは変更していません。

## 演出

`visuals.presentation(ctx2d, game, rawState, options)` は既存の発動演出入口から呼び出します。`visuals.theme` は既存のスキル中描画に渡す配色です。独自描画が必要な場合は `backdrop(ctx2d, frame)`、`background(ctx2d, frame)`、`foreground(ctx2d, frame)` を定義できます。二次演出用の `secondary(ctx2d, game, rawState, options)` も利用できます。

初期タップスキルは `visuals.clear(game, position)`、`visuals.end(game)` を呼びます。複雑なスキルは自身の発動・更新・終了フックから演出や任意の音声処理を呼び出せます。音声アセットや再生基盤は追加していません。ブラウザのユーザー操作制限と音量設定を守ってください。

`timing.presentation` / `timing.endPause` のdurationMs、pauseClock、pausePhysicsは既存のタイミング管理へ登録します。生成時は発動500ms（時計・物理停止）、終了150ms（時計のみ停止）。消去中は時計のみ停止します。

## サブツム

`subTsums: 'auto'` は画像のある既存のサブ対象から、既存の色識別基準（OKLab距離0.12）で3/4/5種類の盤面を決定的に提案します。ランダムな提案ではありません。組み合わせが存在しなければ起動前にエラーにします。

固定したい場合は `{ 3: ['id1','id2'], 4: [...], 5: [...] }` を指定します。各盤面はマイツム1種類とサブツム2/3/4種類です。欠落、重複、対象外、画像設定なし、識別困難な組み合わせを検出します。既存の固定構成は変更しません。

## 検証

`npm run tsum:validate` は全定義、カタログ登録漏れ、SL、ハンドラー、対応能力、画像ファイル、テストファイル、コイン補正、3/4/5種類の盤面をチェックします。`npm run test:tdk` は全フォルダーの生成済みテストを実行します。通常の `npm test` は既存回帰とTDK基盤・試験ツムを実行するため、新ツムの固有テストには必ず `test:tdk` も実行してください。

共通契約は `testCommonTsumContract`、専用契約は `testTapSkillContract`／`testChainSkillContract` です。`testTsumContract` は共通＋タップの従来互換入口、`testChainTsumContract` は共通＋チェーンの入口です。独自の操作方式に改造した場合は共通契約を残し、専用テストを置き換えます。

生成されるテストは実Game・既存ランタイム・ClearPipelineで動き、Canvas境界だけを置き換えます。再現用の盤面とシード付きゲーム乱数を使用します。テクスチャ等の既存の見た目用Math.randomは変更しません。ブラウザ実操作の代替にはならないため、SL1/6、3/4/5種類、発動・通常チェーン・終了・再試験を確認してください。

機能だけを分けて実行する場合:

```sh
node --test --test-skip-pattern="45-body ten-second" *.test.mjs tsums/testTsum/skill.test.mjs tsums/chainTestTsum/skill.test.mjs
node --test --test-name-pattern="45-body ten-second" tsumPhysics.test.mjs
```

物理p95は環境依存です。失敗時は計測環境と値を残し、閾値を変更して成功扱いにしないでください。

正式化はレビューを伴う別工程です。`developmentOnly` の変更に加え、仕様・AI対応・画像権利・保存互換・実プレイを確認してください。mainへのマージや本番公開を生成コマンドは行いません。

## ブラウザQAと生成時間の再計測

```sh
node scripts/serve.mjs
# 別のターミナル（Playwrightを利用できる環境）
npm run test:tdk:browser
npm run benchmark:tdk
```

ブラウザQAはPlaywrightを使用します。共有ランタイムを使う場合、`TDK_PLAYWRIGHT_PATH` に `playwright/index.mjs`、`TDK_BROWSER_PATH` にChrome等の実行ファイルを指定します。任意で `TDK_BASE_URL`、`TDK_QA_OUTPUT` を指定できます。結果JSONとスクリーンショットは既定で `artifacts/tdk-v1-1/` へ出力します。

SL1/3/5はマウス、SL2/4/6はChromiumのタッチイベントを使い、通常チェーン・自然時間切れ・ドラッグ中再試験・従来タップ型・通常URLへの復帰も検証します。コイン比較用に6個の既知の盤面を配置しますが、物理・入力・消去処理は置き換えません。物理実機のタッチ画面の検証とは区別してください。性能測定はブラウザQA終了後に単独実行してください。

ベンチマークは一時フォルダーにソースを複製し、両テンプレートの生成・登録・カタログ検証・生成テストを実測します。元のカタログは変更しません。生成はCLIと同じ関数を直接呼ぶためnpm起動時間を含みません。ソース複製時間を除いた各1回の測定であり、旧方式との短縮率は算出しません。
