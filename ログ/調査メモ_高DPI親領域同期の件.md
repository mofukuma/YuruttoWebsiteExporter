# 高DPI親領域同期

## 原因

devicePixelRatio 2の1280×720 px画面で、Canvas backingは2560×1440 px。DOMはGodot座標をCSS pxのまま使い、主見出しの幅2400 pxが親幅1280 pxを貫通。CanvasのCSS倍率とViewport stretch変換の脱落。

## 実装

- DOM rootの寸法をCanvas backingへ合わせ、CSS表示寸法との比で変換
- 最上位Controlへ`get_viewport_transform()`を適用
- Web UI作品はHiDPI backingを有効に保ち、仮想画面を物理寸法÷DPRで親CSS幅へ一致
- stretchは`canvas_items` + `ignore`。desktop/mobile分岐をCSS幅で判定

## 公式根拠

[Godot公式 Multiple resolutions](https://docs.godotengine.org/en/latest/tutorials/rendering/multiple_resolutions.html)は、非ゲーム応用でstretch `disabled`を推奨。HiDPIでは論理サイズと表示倍率を明示的に扱う。[Godot 4.7移行資料](https://docs.godotengine.org/en/stable/tutorials/migrating/upgrading_to_godot_4.7.html)では新規作品の初期値が`canvas_items` + `expand`に変更されたため、Web UI用の値を作品で明示。

## 検証

| 条件 | Canvas backing / CSS | DOM root CSS | 最大右端 | 親幅 |
|---|---:|---:|---:|---:|
| desktop DPR 2 | 2880 / 1440 px | 1440 px | 1440 px | 1440 px |
| mobile DPR 2 | 780 / 390 px | 390 px | 390 px | 390 px |

親貫通は両方0 px。特集画像領域をbacking倍率で変換し、色差画素10,561標本成立後に`featured.png`を保存。証拠は`tmp/daito-site/result.json`。
