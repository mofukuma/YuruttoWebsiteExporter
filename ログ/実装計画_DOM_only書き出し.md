# 実装計画_DOM_only書き出し

Canvasを使わず、画面の全要素をDOMで組み立てる書き出し。普通のWebページに近い成果物を出す。

## 何を実現するか

Godotで作った画面が、WebGLを持たないHTMLとして出る。文字は選べてコピーでき、検索にも載る。
支援技術からも普通のWebページとして読める。画像とCSSだけで見た目を作るため、GPUを使わない環境でも表示できる。

## 位置の決め方

階層は作らない。Containerのflexへ置き換えると、Godotとブラウザの二箇所でlayoutを解くことになり、
寸法の食い違いがそのまま見た目の差になる。layoutを解くのはGodot一箇所に保つ。

全要素を`position:absolute`の要素として並べ、Godotが確定した`get_global_transform_with_canvas()`と
`get_size()`を毎frame受け取って`transform`と`width`、`height`へ写す。重なりは`z-index`で表す。
この writes-only の一方向で、文字も面も画像も同じ扱いにする。

## 見た目の写し取り

Themeの`StyleBox`をCSSへ変換する。`StyleBoxFlat`が持つ値はCSSに素直な対応がある。

| Godot | CSS |
| --- | --- |
| `bg_color` | `background-color` |
| `border_width_*` | `border-width`(辺ごと) |
| `border_color` | `border-color` |
| `corner_radius_*` | `border-radius`(隅ごと) |
| `shadow_color`、`shadow_size`、`shadow_offset` | `box-shadow` |
| `expand_margin_*` | 矩形を広げて渡す |

`StyleBoxTexture`は9-sliceのため`border-image`へ写す。`StyleBoxLine`は片側だけのborderへ写す。
`ColorRect`はStyleBoxを持たないので色を直接渡す。

## 要素ごとの出し方

| Godot | DOM |
| --- | --- |
| Label、Button、LinkButton | 既存の文字同期をそのまま使う |
| Panel、PanelContainer、Container各種 | StyleBoxの箱 |
| ColorRect | 色だけの箱 |
| TextureRect、NinePatchRect、Sprite2D | textureをPNGへ書き出して`img` |
| LineEdit、TextEdit、CodeEdit | 既存の入力同期。CodeEditの色分けは行ごとの`span`へ |
| RichTextLabel | BBCodeを対応するinline要素へ |
| ProgressBar、Slider | 背景と前景の二枚の箱 |
| TabBar、ItemList、Tree | 項目ごとの箱と文字 |

`_draw()`による直接描画は写せない。使っている場合は書き出し時に知らせ、2Dを選ぶよう促す。

## 画像の扱い

textureはExport時にPNGへ書き出し、`img`の`src`から参照する。同じtextureは一度だけ出す。
`modulate`は`filter`へ、`flip_h`は`transform`へ写す。

## 目標と測り方

Godotの画面とブラウザの画面を同じ寸法で撮り、正規化MAEが0.01未満に入ることを目標にする。
差が残る主因は、字形のhinting、アンチエイリアスのかかり方、小数座標の丸め。
要素ごとの矩形も記録し、どの要素で差が出ているかを追える形にする。

## 進め方

1. 面と枠の箱を出す。Panel、ColorRect、Buttonの背景まで
2. 画像を出す。TextureRectとSprite2D
3. 文字の細部を合わせる。行間、字間、揃え、はみ出しの扱い
4. 残りのControlを埋める
5. MAEを測り、差の大きい要素から詰める
