# 調査メモ ChromiumとWeb描画仕様の件

HTML、CSS Transform、Canvas 2D、Wasmを使う軽量2D描画の仕様確認。
調査日: 2026-08-12

## 前提

ChromiumはHTMLやCSSの独自仕様を持つのではなく、WHATWG、W3C、CSSWGのWeb標準を実装。実装上の速さはChrome DevelopersとRenderingNG資料で補完。

禁止するのはWebGL、OpenGL、GLES、WebGPUのAPI利用。CSSとCanvas 2DがChromium内部でGPU合成される可能性まではWebページから禁止できない。

## CSS Transform

[CSS Transforms Level 1](https://www.w3.org/TR/css-transforms-1/)は2D変換を3x2行列として定義。`transform-origin`を適用し、transform関数を左から順に乗算。

root Controlの全体`Transform2D`と、子Controlの親相対`Transform2D`をCSSの`matrix(a,b,c,d,tx,ty)`へ写像。DOM所有Controlを`transform-origin: 0 0`とし、pivotは変換行列へ含める方式。

```text
Godot Transform2D
x.x, x.y, y.x, y.y, origin.x, origin.y
  ↓
CSS matrix(a, b, c, d, e, f)
```

注意点。

- `transform`指定は新しい座標系とstacking contextを作る
- 深いDOM親子へ変換を重ねるとstackingとclipの把握が難化
- Control親子をDOM親子へ対応し、本家が計算した親相対変換をDOMへ反映
- Node2Dは本家Canvas選別後にCanvas 2Dへ変換
- 全Control階層をDOM親子へ一致。clipは同じ階層の`overflow`だけで切替
- z順は`z-index`とDOM順を明示管理

## Chromiumの描画工程

[Rendering performance](https://web.dev/articles/rendering-performance)は処理をJavaScript、Style、Layout、Paint、Compositeに分類。

[高性能CSS animation](https://web.dev/articles/animations-guide)は、動く値を`transform`と`opacity`へ絞ることを推奨。他の多くの値はLayoutまたはPaintを起こす。

適用。

- 毎フレーム変える値は`transform`と`opacity`だけ
- 大きさ、文章、枠、背景は値が変わった時だけ
- DOM読取と書込を混ぜない
- 一フレームの変更を命令列で一括適用
- `requestAnimationFrame`内で一回だけ反映

## will-change

[Chromeの再ラスタライズ説明](https://developer.chrome.com/blog/re-rastering-composite)では、`will-change: transform`が拡大中の再ラスタライズを避ける一方、追加・削除にも一時費用があると説明。

[Chrome browser内部説明](https://developer.chrome.com/blog/inside-browser-part3)は、過剰なlayerが小さな再描画より遅くなり得ると警告。

適用。

- 全Nodeへ付けない
- 現在動いている少数要素だけ
- animation開始前に付け、停止後に外す
- DevTools Layersとメモリーで上限を実測

## CSS containmentと画面外停止

[CSS Containment Level 2](https://www.w3.org/TR/css-contain-2/)は`contain`で子孫のlayout、style、paint、size影響を隔離。`content-visibility: auto`は画面外subtreeのlayoutとpaintを省略可能。

[content-visibility解説](https://web.dev/articles/content-visibility)では、画面外内容をDOMとaccessibility treeへ残しながら描画を省略できると説明。対象subtreeへ強制layoutを起こすDOM APIを呼ぶと利点を失う。

適用。

- ページ区画へ`content-visibility: auto`
- 寸法既知の区画へ`contain-intrinsic-size`
- 独立場面へ`contain: layout paint style`
- DOM区画の画面外判定はブラウザーへ委譲
- Canvas項目は本家Godotの既存選別だけを使用し、gdweb独自判定を追加しない
- skipped subtreeの寸法を毎フレーム読まない

`content-visibility`だけへ依存しない。ゲーム座標とCSSの画面外判定は一致しない場合があるため。

## Canvas 2DとOffscreenCanvas

[HTML Canvas仕様](https://html.spec.whatwg.org/multipage/canvas.html)は`2d`、`webgl`、`webgl2`、`webgpu`を別のcontext modeとして定義。一度選んだcontextへ別種を後付けできない。

gdwebは`getContext("2d")`だけを許可。共通関数一か所から取得し、テストで引数を監視。

同仕様のOffscreenCanvasはWindowとWorkerで利用でき、DOMと接続しないCanvas 2D描画が可能。[Chromium RenderingNG](https://developer.chrome.com/docs/chromium/renderingng)もCanvas 2Dを別threadへ移せる機能として説明。

適用。

- 初期版は通常Canvas 2D
- 静的TileMapと複雑図形のcacheにOffscreenCanvas
- Worker転送はCanvas専用層だけ
- DOM描画と入力はmain thread
- Worker非対応でも同じ見た目を維持

複数Canvasへの分割は、Chrome DevTools自身のPerformance UIでもmainとhighlightの分離例あり。[Performance Insights実装](https://developer.chrome.com/blog/performance-insights)

## Animation frame

[HTML requestAnimationFrame仕様](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html)に従い、ブラウザーの更新時機へ一回の反映を予約。

適用順。

1. 入力を収集
2. Wasmの固定更新と可変更新
3. Wasmメモリーへ差分命令を生成
4. DOM styleを一括反映
5. 汚れたCanvas層だけ描画
6. 計測値を記録

複数の独立`requestAnimationFrame` loopを作らない。

## Pointer Events

[Pointer Events](https://www.w3.org/TR/pointerevents/)はmouse、touch、penを統一。Pointer Captureによりdrag中のevent targetを固定可能。`touch-action`でブラウザーのpanやzoomとアプリ操作の境界を宣言。

適用。

- 独自MouseEventとTouchEventの二重経路なし
- drag開始時に`setPointerCapture`
- page scrollを許す区画へ適切な`touch-action`
- Canvasは座標変換後にWasmのhit test
- HTML buttonやinputはbrowserのhit testとfocusを優先

## Wasm

[WebAssembly Core](https://www.w3.org/TR/wasm-core/)はWasmを小型、streamable、sandboxedな低水準形式として定義。Web機能は持たず、DOM操作はJavaScript import経由。

[WebAssembly Web API](https://www.w3.org/TR/wasm-web-api-2/)は`compileStreaming`と`instantiateStreaming`を定義。正しい`application/wasm`が必要。

[Emscripten MINIMAL_RUNTIME](https://emscripten.org/docs/tools_reference/settings_reference.html#minimal-runtime)はPOSIX、標準Module、組込XHRなどを省き、最小出力を狙う設定。streaming compilationも利用可能。

[Emscripten最適化](https://emscripten.org/docs/optimizing/Optimizing-Code.html)は`-Os`または`-Oz`、不要filesystemの無効化を案内。

適用。

- Wasmは本家SceneTree、GDScript VM、ResourceLoader、場面状態、数学を保持
- DOM、Canvas、fetch、audioは小さなJS host
- Wasm→JSはnodeごとの細かい呼出しを禁止
- 線形メモリー上の命令列をJSが一括走査
- 遅延PCKをmountする最小filesystemを保持
- `size_extra`を使用し、LTOは圧縮後容量と起動時間の実測で選択
- `MINIMAL_RUNTIME`は本家loader・filesystemとの両立を確認するまで未採用

## 通信とcache

[RFC 9111](https://www.rfc-editor.org/rfc/rfc9111.html)がHTTP cacheを定義。[RFC 8246](https://www.rfc-editor.org/info/rfc8246/)が`immutable`を定義。

[Chrome Lighthouse](https://developer.chrome.com/docs/lighthouse/performance/uses-long-cache-ttl/)は、変更しない静的資産へ長いcache期間を設定し、ファイル名へ内容hashを入れて更新を切り替える方式を推奨。

適用。

```http
Content-Type: application/wasm
Content-Encoding: br
Cache-Control: public, max-age=31536000, immutable
```

HTMLだけは短期cache。Wasm、JS、CSS、場面、画像、音声は内容hash付き。再訪時の再検証も避ける構成。

## HTMLを使う価値

文章、button、link、inputをHTMLとして出すことで、次をCanvas実装から外せる。

- 文字選択と検索
- focusとTab移動
- IME
- screen reader向け意味
- linkの標準動作
- responsive layout
- Wasm前の先行表示

Canvasは大量2Dと独自図形へ限定。サイト全体を一枚のCanvasにしない。

## 採用規則

1. 動きはCSS `transform`と`opacity`
2. 文章と操作はHTML
3. 大量2Dと独自描画はCanvas 2D
4. 画面外描画はブラウザーと本家Canvas選別へ委譲。通常nodeの更新は継続
5. Wasm境界は一括命令
6. `will-change`は少数・短時間
7. OpenGL系context生成はテストで即失敗
8. 内容hashとimmutable cacheを既定
