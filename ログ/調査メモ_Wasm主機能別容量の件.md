# 調査メモ Wasm主機能別容量の件

gdweb限定Wasmの容量を、機能フラグの差分ビルドとリンク前オブジェクトの両方で棚卸し。
配布容量とソース境界の効果を混同せず、次の物理除外順序を決めるための計測。
調査日: 2026-08-12

## 結論

同一条件の差分をGDScript、2Dナビゲーション、文字metricsで実測。

- GDScript: Brotli後144,132 B、6.37%
- 2Dナビゲーション: Brotli後40,686 B、1.80%
- TextServerFallback、FreeType、MSDFGen: Brotli後234,665 B、10.37%
- 2D物理: Brotli後約97 KBの参考差。計測中のGUI橋渡し差分が混入したため因果値に不採用
- 高度GUI: ShaderMaterial依存でlink失敗。Shaderを外したgdwebでは機能群ごと不採用が必要

基準Wasmはraw 11,970,757 B、gzip -9 3,335,953 B、Brotli q11 2,263,186 B。現状の主部分はフラグで独立に切れない。GUI、Resource、Canvas、音声、通信の完全な配布容量比は、専用SCsub分割後の同一リビジョン差分ビルドが必要。現時点で推定値を確定値にしない。

## 計測条件

対象。

- Godot 4.7.1 stable、commit `a13da4feb8d8aefc283c3763d33a2f170a18d541`
- Emscripten 4.0.11
- `optimize=size_extra`、`lto=none`、`debug_symbols=no`
- `threads=no`、`wasm_simd=no`、`initial_memory=16`
- `gdweb_2d=yes`、`opengl3=no`、`vulkan=no`
- 3D、2D物理、2Dナビゲーション、XR、高度GUIは基準で無効
- moduleは基準でGDScriptのみ

中間物とbuild logは`.tmp/gdweb/capacity/`。Godot本体の作業中buildと競合させないよう、専用suffixと凍結source複製を使用。

## 配布Wasmの差分

### GDScript

GDScriptありと`module_gdscript_enabled=no`の一要因差分。両者は同一source状態。

| 構成 | raw | gzip -9 | Brotli q11 |
|---|---:|---:|---:|
| 基準 | 11,961,306 B | 3,334,160 B | 2,262,347 B |
| GDScriptなし | 11,235,701 B | 3,142,615 B | 2,118,215 B |
| GDScript差分 | 725,605 B | 191,545 B | 144,132 B |
| 基準比 | 6.07% | 5.75% | 6.37% |

GDScriptは調査用に無効化しただけ。gdwebの必須機能のため製品からは外さない。

### 2Dナビゲーション

`disable_navigation_2d=yes/no`の一要因差分。凍結sourceの基準と同じGUI橋渡しオブジェクトを確認。

| 構成 | raw | gzip -9 | Brotli q11 |
|---|---:|---:|---:|
| 基準 | 11,970,757 B | 3,335,953 B | 2,263,186 B |
| 2Dナビゲーションあり | 12,209,417 B | 3,402,137 B | 2,303,872 B |
| 機能差分 | 238,660 B | 66,184 B | 40,686 B |
| 基準比 | 1.99% | 1.98% | 1.80% |

gdwebでは排除維持。DOM/CSSとCanvas 2Dの表示に不要。

### 文字metrics

`module_text_server_fb_enabled=yes`と必須依存の`freetype`、`msdfgen`を同時に有効化。`svg`はoptional依存のため無効のまま。基準と同じ凍結source、build profile、compiler条件。

| 構成 | raw | Brotli q11 |
|---|---:|---:|
| 基準 | 11,970,757 B | 2,263,186 B |
| fallback文字metricsあり | 12,645,971 B | 2,497,851 B |
| 機能差分 | 675,214 B | 234,665 B |
| 基準比 | 5.64% | 10.37% |

VBoxContainer内Labelの`get_combined_minimum_size().y`は、TextServerなしの0 pxから15 pxへ変化。Labelの実配置高も0 pxから15 px、Container全体の最小高さ14 pxから29 px。DOMは両方とも`SPAN`で文字を保持し、文字描画をCanvasへ戻していない。

本家fallbackは配置を正す既存実装として成立。Brotli 234,665 Bの追加は小さくない。製品候補とするが、glyph raster、MSDF生成、font形式の不要部を外したmetrics専用TextServerの差分試験が必要。

### 2D物理

2D物理ありの成果物。

| 構成 | raw | gzip -9 | Brotli q11 |
|---|---:|---:|---:|
| 2D物理あり | 12,654,061 B | 3,503,199 B | 2,360,213 B |
| 現行基準との観測差 | 683,304 B | 167,246 B | 97,027 B |

このビルドと現行基準の間にButton橋渡しのsource差分あり。観測差は2D物理のみの容量と断定できない。リンク前の物理専用入力は、物理server 639,565 Bと物理Node 630,284 B、合計1,269,849 B。この値もdead-code elimination前の上限。

### 高度GUI

`disable_advanced_gui=no`でcompile完了後、link失敗。

```text
color_picker_shape.o: undefined symbol: ShaderMaterial::set_shader(...)
graph_edit.o: undefined symbol: ShaderMaterial::set_shader_parameter(...)
```

Shader完全排除と本家の高度GUIは同時に成立しない証拠。ColorPickerとGraphEditのShader使用部分だけ代替する別試験を行うまで、高度GUI全体を不採用。容量差は未測定。

## リンク前の機能別入力

`llvm-size`で凍結source基準のWasm objectのtextとdataを合算。合計27,623,835 B。これは最終Wasm 11,970,757 Bの内訳ではない。静的libraryから未参照コードが除去される前の入力比。機能群の物理分割候補を見つける用途。

| 機能群 | object入力 | 入力全体比 | 主な範囲 |
|---|---:|---:|---|
| Core共通基盤 | 8,384,856 B | 30.35% | Variant、IO、Object、String、Math、Input |
| GUI | 5,089,226 B | 18.42% | `scene/gui` |
| Resource | 4,007,227 B | 14.51% | `scene/resources` |
| Rendering共通契約 | 1,606,132 B | 5.81% | Canvas cull、viewport、dummy storage |
| SceneTree・Node・通信node | 1,331,318 B | 4.82% | `scene/main` |
| GDScript module | 1,295,554 B | 4.69% | parser、compiler、VM |
| Node2D・Canvasノード | 1,182,836 B | 4.28% | `scene/2d`、物理とnavigation無効時 |
| Animation | 976,915 B | 3.54% | `scene/animation` |
| 共通圧縮等 | 861,354 B | 3.12% | zlib、zstd、clipper等 |
| Text server | 713,822 B | 2.58% | 文字レイアウト契約 |
| Audio | 712,499 B | 2.58% | audio server 647,333 B、scene 65,166 B |
| Serverその他 | 583,829 B | 2.11% | display、camera、debugger等 |
| Sceneその他 | 469,858 B | 1.70% | theme、登録、property |
| Platform | 162,534 B | 0.59% | Web橋渡しとplatform API |
| Main | 160,537 B | 0.58% | 起動とmain loop |
| Drivers | 85,338 B | 0.31% | PNG、OS依存部 |

GUI 18.42%やResource 14.51%をそのまま「配布Wasmの容量比」としてはいけない。例えばGUI objectには、`disable_advanced_gui=yes`で登録されず最終linkで落ちる実装も含む。

## 独立して切れる範囲

SConstructとSCsubで現在確認できる単独switch。

| 機能 | 切替 | 状態 |
|---|---|---|
| GDScript | `module_gdscript_enabled` | 差分成功 |
| 高度GUI | `disable_advanced_gui` | ON側がShader依存でlink失敗 |
| 2D物理 | `disable_physics_2d` | build成功、同一source差分は再測定必要 |
| 2Dナビゲーション | `disable_navigation_2d` | 差分成功 |
| 3D、3D物理、3D navigation、XR | 専用disable群 | gdwebで常時排除 |
| Audio | 専用switchなし | SCsubと登録を分割必要 |
| Network | 専用switchなし | Core IOとScene mainから分割必要 |
| Resource・Image | 専用switchなし | Core IO、scene/resources、driverの同時分割必要 |
| Text metrics | `module_text_server_fb_enabled` | 必須依存はFreeTypeとMSDFGen。差分とLabel最小高さを実証 |
| 基本GUI | 専用switchなし | DOM表示にControl契約が必要 |
| Node2D・Canvas | 専用switchなし | Canvas出力に必要 |

## 測定限界

一要因差分は、その基準に対する限界効果。機能AとBが共通codeを参照する場合、Aだけを外しても共通codeは残る。そのため各差分は加算不可。

Shapley値による完全分解には、機能群が8個でも2の8乗の組合せ候補がある。現状はAudio、Network、Resource、Text、GUI、Canvasを独立に切れず、Shapley近似の前提も未成立。分割完了後に、基準順序と逆順序を含む複数のランダム順列で限界効果を平均化する方法が必要。

## 次の実測順

1. Audio server、Web audio driver、AudioStreamPlayerの専用build option化
2. HTTP、socket、multiplayerの専用build option化
3. TextServerFallbackからglyph rasterとMSDFの不要部を除いたmetrics専用実装の差分
4. GUIのDOM必須Controlと不採用Controlの登録分割
5. Resourceをscene、theme、image、audio、animationへ分割
6. 各群のraw、gzip -9、Brotli q11の同一source差分
7. 機能順の交互試験による共通codeの影響確認

容量だけで排除しない。GUIと文字はSEO、キー操作、IMEの成立条件が優先。その条件をブラウザで満たした後、Godot側の代替済み実装だけを物理除外。
