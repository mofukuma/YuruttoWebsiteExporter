# 実装計画_DOM_only描画の全対応

DOM onlyで、ふつうのホームページと同じ見た目をCanvasなしで出しきる。
いま出せていない描画を洗い出し、DOMとCSSへ写して、Godotの画面との食い違いをRMSE 0.8%以下にする。

## なぜやるか

DOM onlyはCanvasを積まない。描けないものはそのまま消える。
文字と箱と画像は写せているが、`_draw()`で描く図形の多くと`RichTextLabel`が抜けている。
抜けたまま配ると、作った人の画面と見る人の画面が食い違う。

## いまどこまで出せているか

計測は`tests/dom_only_match.cjs`。同じsceneをGodotとBrowserで撮り、画素の食い違いを出す。

| 画面 | MAE | RMSE | 中身 |
| --- | --- | --- | --- |
| main | 0.118% | 1.767% | 文字、箱、重なり |
| widgets | 0.093% | 1.931% | 標準Control |
| motion | 0.084% | 1.116% | 回転と拡縮 |
| physics | 0.001% | 0.025% | 物理で動く箱と画像 |
| omochi | 2.963% | 13.132% | `_draw()`主体の画面 |

RMSE 0.8%以下に届いていないのは五つ中四つ。`omochi`の13.132%が最も遠い。

### nodeの対応状況

`tests/node_coverage.cjs`が数える。Control 60種のうち。

| 区分 | 数 | 中身 |
| --- | --- | --- |
| 文字DOM | 18 | Label、Button、LineEdit、TextEditなど |
| Canvas任せ | 34 | 図形や絵として写すもの |
| 未対応 | 8 | ColorPicker、GraphEdit系、RichTextLabel、VideoStreamPlayer |

### `_draw()`の対応状況

`CanvasItem`の描画APIは31種。DOMへ写しているのは5種。

| 状態 | API |
| --- | --- |
| 対応済 | `draw_rect` `draw_circle` `draw_line` `draw_string` `draw_texture` |
| 未対応(形) | `draw_arc` `draw_ellipse` `draw_ellipse_arc` `draw_polygon` `draw_colored_polygon` `draw_polyline` `draw_polyline_colors` `draw_primitive` `draw_dashed_line` `draw_multiline` `draw_multiline_colors` |
| 未対応(文字) | `draw_char` `draw_char_outline` `draw_string_outline` `draw_multiline_string` `draw_multiline_string_outline` |
| 未対応(絵) | `draw_texture_rect` `draw_texture_rect_region` `draw_msdf_texture_rect_region` `draw_lcd_texture_rect_region` |
| 未対応(座標) | `draw_set_transform` `draw_set_transform_matrix` |
| 対象外 | `draw_mesh` `draw_multimesh` `draw_animation_slice` `draw_end_animation` `draw_style_box` |

`draw_style_box`は中でrectとtextureへ分かれるため、その先を拾えば足りる。

## 進めかた

### 座標はGodotの値をそのまま使う

階層は作り直さない。Godotが確定した最終の位置と向きを、要素ごとの`transform`へ入れる。
入れ子で位置を積み上げないので、親子の再現ずれが起きない。

2Dは`matrix(a,b,c,d,e,f)`。3Dは`matrix3d(...)`へ4x4をそのまま渡し、
`transform-style:preserve-3d`と`perspective`で奥行きを出す。

### 形はCSSで表す

| 形 | CSSでの表しかた |
| --- | --- |
| 矩形 | `background-color`と`border` |
| 円、楕円 | `border-radius`。楕円は縦横で別の半径 |
| 弧 | `conic-gradient`、または細い要素の回転 |
| 多角形 | `clip-path: polygon()` |
| 折れ線 | 線分ごとの細い要素。太さと角度を`transform`で |
| 破線 | `repeating-linear-gradient` |

### 文字は既にある文字DOMへ寄せる

`draw_char`と`draw_string_outline`は`yweb_text_sync`が持つ経路へ渡す。
縁取りは`-webkit-text-stroke`、影は`text-shadow`で既に出している。

### RichTextLabelとBBCode

いまはDOMの対象外で、DOM onlyでは丸ごと消える。`tests/bbcode.cjs`がその状態を固定している。

段階を分ける。

1. 装飾と色 — `b` `i` `u` `s` `code` `color` `bgcolor` `fgcolor` `font_size` `outline`
   一つの`span`に対応するCSSを当てる。
2. 配置 — `center` `right` `fill` `indent` `ul` `p`
   `text-align`と`padding-left`、`list-style`。
3. 動く効果 — `wave` `tornado` `shake` `fade` `rainbow` `pulse`
   一文字ずつ`span`へ分け、Godotが毎frame決めた位置と色をその`span`へ入れる。
   Canvas側は描かないので、重ねる必要はない。位置はGodotの計算結果をそのまま使う。
4. その他 — `url` `img` `hint` `char` `lb` `rb` `table`

### 検査画面を足す

ふつうのホームページに近い画面を作り、画像も混ぜて測る。

| 画面 | 中身 |
| --- | --- |
| page_hero | 見出し、本文、写真、ボタン。よくある先頭の画面 |
| page_cards | 画像つきの札を並べる。影と角丸 |
| page_article | 長い本文、引用、箇条書き、区切り線 |
| page_form | 入力欄、選択、送信ボタン |
| page_rich | RichTextLabelのBBCodeを並べた画面 |

どれもRMSE 0.8%以下を目標にする。

## ホームページ画面を足して測った結果

`page_hero`と`page_cards`を`dom_only_match`へ足して測った。

| 画面 | 最初 | Themeへ同じfontを入れた後 |
| --- | --- | --- |
| page_hero | RMSE 7.435% | RMSE 3.984% |
| page_cards | RMSE 5.874% | RMSE 2.633% |

同じfontを使うと半分になった。fontを指定し忘れると、Godotは既定fontで描き、
Browserは取り込んだwoff2で描くため、字形が丸ごと食い違う。

### 残る差はどこか

`page_hero`を領域ごとに分けて平均の差を出した。

| 領域 | 平均の差 |
| --- | --- |
| 写真 | 0.4 |
| 英字のナビ | 14.8 |
| 日本語の本文 | 21.7 |
| 日本語の見出し | 48.7 |

写真はほぼ一致する。画像はDOMへそのまま置けるため、もともと崩れにくい。
残る差は文字、それも日本語の字形に寄っている。

画素の数で見ると、差のある画素は`page_hero`で2.18%、`page_cards`で1.59%。
そのうち大きく違うのは0.85%と0.45%で、字の縁に集まっている。

font mapは正しく当たっている。Browser側も`YWeb-f8fb1ca703b3`を読み込み済みで、
日本語と英字の両方へ同じ書体が当たっていることを確かめた。
つまり書体の取り違えではなく、同じ書体をGodotとBrowserが別々に画素へ落とす時の差。

### 日本語はweb fontが無いと崩れる

woff2を隣へ置かないとどうなるかを、実際に書き出して確かめた。
TTFのみを持つprojectで日本語のLabelを出すと、こうなる。

| 見るもの | 結果 |
| --- | --- |
| 配られたwoff2 | 無し |
| `YWEB_FONT_MAP` | 空 |
| 当たった書体 | `sans-serif` |

文字はDOMへ出るので消えはしないが、描くのは見る人の端末が持つfontになる。
日本語は端末ごとに持つfontが違い、字形が変わる。持っていない字は豆腐になる。

書き出しは成功して終わるため、作った人は気づけない。Export画面のWeb font設定へ
警告を出し、隣にwoff2の無いfont名を並べるようにした。

検査の側では、`page_hero`と`page_cards`がこの落とし穴を踏んでいた。
fixtureへ同じfontを入れて初めて、字形の比較として成り立つようになった。

### この差の扱い

字形の落とし込みはGodotとBrowserで実装が違うため、完全一致はしない。
既存の画面も同じ性質を持つ。

| 画面 | RMSE | 中身 |
| --- | --- | --- |
| physics | 0.025% | 文字が少なく図形が主 |
| motion | 1.116% | 文字あり |
| main | 1.767% | 文字が多い |
| widgets | 1.931% | 文字が多い |

文字の多い画面ほど大きい。RMSE 0.8%は、文字の少ない画面では届いているが、
文字が主役の画面では字形の差で超えてしまう。

まずやるのは、字形以外の食い違いを消しきること。図形と画像と配置を合わせ、
残差が字の縁へ寄った状態を作る。そのうえで、字形の差をどこまで詰められるかを見る。

## Node2Dの棚卸し

Controlのほかに、絵を出すNode2Dがある。DOM onlyでDOMへ写せているのは三つ。

| 状態 | node |
| --- | --- |
| 写せる | `Sprite2D` `AnimatedSprite2D` `Line2D` |
| 未対応 | `Polygon2D` `MeshInstance2D` `MultiMeshInstance2D` `TileMapLayer` `CPUParticles2D` `GPUParticles2D` ほか |

`AnimatedSprite2D`は今回足した。いま見せているコマのtextureを取り出して写す。
コマが変わればDOMの絵も入れ替わる。

## Themeを二種で測る

一つの見た目へ合わせ込んだだけの一致を、本当の一致と取り違えないようにする。
`base`は各画面が自分で決めた見た目のまま。`alt`は撮ったあとにThemeを差し替え、
既定の字の大きさを変えてもう一度撮る。二つのRMSEを平均して結果とする。

## 10画面の実測(Theme二種の平均)

| 画面 | RMSE | 中身 |
| --- | --- | --- |
| physics | 0.025% | 図形と画像。文字なし |
| motion | 1.116% | 回転と拡縮 |
| widgets | 1.931% | 標準Control |
| main | 1.934% | 文字、箱、重なり |
| page_sprites | 2.572% | AnimatedSprite2D、Sprite2D、NinePatchRect |
| page_cards | 2.633% | 画像つきの札を六枚 |
| page_shapes | 3.630% | Polygon2D四種、Line2D二種 |
| page_hero | 3.984% | 見出し、写真、ボタン |
| omochi | 5.476% | `_draw()`主体 |
| page_rich | 11.731% | BBCode二十五種 |

Themeを二種で撮って平均している。`main`はbase 1.77%に対しalt 2.10%、
`page_rich`はbase 10.65%に対しalt 12.81%と、Themeで値が動く。
片方の見た目へ合わせ込んだだけの一致でないことが、この差で分かる。

`page_rich`が最も遠い。RichTextLabelは文字DOMの対象外で、DOM onlyでは
文字が丸ごと出ないため、差がそのまま残る。

## RichTextLabelの現状(更新)

DOM onlyでもBBCodeの文字が読めるようになった。原因は二つあった。

一つは2Dの分岐にRichTextLabelの枝が無く、文字までCanvas任せになっていたこと。
2Dは文字をDOMへ、それ以外をCanvasへ置く設計なので、これは取り違えだった。

もう一つはDOM所有の判定。`yweb_text_dom_owns`の末尾が`capture_control`を返し、
そこにRichTextLabelが無いため常に偽になっていた。箱は出るのに文字が出ない、
という症状はこれで説明がつく。

行の位置は`get_line_offset`と`get_line_range`から取る。折り返しも含めた行ごとに
一つの文字要素を置き、高さは次の行との差から求める。実測で行の位置は揃った。

| 見るもの | Godot | Browser |
| --- | --- | --- |
| 行の帯 | 46-59 64-77 98-114 | 44-58 62-76 98-112 |

残る差は飾りそのもの。太字や色や`wave`の一文字ごとの動きは、行を丸ごと一つの
要素にする作りでは表せない。飾りを写すには、一文字ずつ`span`へ分けて
Godotが決めた位置と色を入れる形が要る。

## 前の記録

## RichTextLabelの現状

C++側へ、段ごとの文字としてDOMへ出す処理を入れた。旧警告文がwasmから消えている
ことで、実装が入っていることは確かめた。

しかしDOM onlyの画面では、いまも文字が出ない。実測でDOM要素は二つ(背景の箱と
比べる相手のLabel)で、RichTextLabelは箱すら出ていない。Godot側は同じ画面で
明るい画素15780を描いており、描画そのものは行われている。

箱も出ないことから、文字を作る手前で対象から外れていると見ている。次に見るのは
`sync_box`がRichTextLabelへ届いているか、`fit_content`と`size`の組み合わせで
寸法が0になっていないかの二点。

## 目標

| 対象 | いま | 目標 |
| --- | --- | --- |
| dom_only_matchの各画面 | 0.025〜13.132% | 0.8%以下 |
| 新しいホームページ画面 | 未計測 | 0.8%以下 |
| `_draw()`のAPI | 5/31 | 形と文字と絵を網羅 |
| RichTextLabel | 出ない | BBCodeを段階順に出す |

## 確かめかた

`tests/dom_only_match.cjs`と新しい画面の検査で、MAEとRMSEの両方を出す。
RMSEは狭い範囲の大崩れを平均より強く数えるため、形の作り違いを見つけやすい。

`omochi`の13.132%は物理で位置が乱れる画面のため、まず静止した画面で0.8%を確かめ、
そのあと動く画面の落とし込みかたを決める。
