# 改善点_DOM_only

Godot画面との画素差と、node対応の穴を埋めるために残っている作業。

## 画素差の内訳

調和平均MAE 0.075%。内訳はmain 0.134%、widgets 0.052%。

差の出どころは二つに絞れている。

### 字形のラスタライズ差

同じfont fileを使っても、GodotのFreeTypeとBrowserのSkiaでは輪郭の丸め方が違う。
画素を1pxずつ9方向へずらして測ると最小値が原点にあり、位置ずれではないと確認済み。
文字面積が大きい画面ほどMAEが上がる関係にあり、mainの下限を決めている。

寄せる手立ては二つ。

- Browser側: `text-rendering:geometricPrecision`で字送りの丸めを止める。widgetsで0.066%から0.052%へ効いた
- Godot側: fontのhintingを切り、subpixel配置を止める。輪郭のまま描かせればBrowserの計算に近づく

後者はprojectの見た目そのものを変えるため、DOM onlyを選ぶprojectへの推奨設定として案内する形が要る。

### 角のアンチエイリアス

StyleBoxFlatの角丸は`corner_detail`の分割数で描かれ、CSSの`border-radius`は曲線として描かれる。
輪郭1px分の差が四隅に残る。面積が小さく、MAEへの寄与は文字より一桁小さい。

## node対応の穴

Controlは46種中43種。残りは`TextureButton`、`TextureProgressBar`、`VideoStreamPlayer`。
前二つはtextureを状態で選ぶだけなので、既存の画像同期へ状態選択を足せば済む。

Node2Dが47種中2種と大きく空いている。描画を持つものから順に埋める。

- `Polygon2D`: 頂点を`clip-path: polygon()`へ写す。塗りつぶし色と頂点色の扱いを決める
- `AnimatedSprite2D`: 現在frameのtextureを既存の画像同期へ渡す
- `TileMapLayer`: 敷き詰めたcellをtextureの部分参照として出す。cell数が多い画面では要素数が問題になる
- `MeshInstance2D`、`MultiMeshInstance2D`、`CPUParticles2D`、`GPUParticles2D`: 頂点や粒子の集合。DOMの要素数と釣り合わない可能性が高く、対象外にする線引きも要る

## 方式そのものの見直し

現在はnode種別ごとに「どのstyleboxを、どの矩形へ」を書いている。種別が増えるほど分岐が増える。

Godotは描画命令をRenderingServerのcanvas item commandとして積む。この層は描画driverに関係なく通るため、
`canvas_item_add_rect`、`canvas_item_add_texture_rect`、`canvas_item_add_polygon`などを捕まえれば、
node種別を知らずに全nodeを覆える。分岐が消え、Node2Dの穴も一度に埋まる。

移行の判断材料は、命令数とDOM要素数の対応。命令が多い画面で要素が増えすぎないかを先に測る。

## 検査の穴

比較画面が2枚しかない。入力、リスト、木、tab、scrollを含む画面がない。
node対応の達成率は種類数で数えており、実際の画面での再現度とは別物。
代表的な画面を増やし、調和平均で評価する形にしてある。画面を足すほど下限が見える。
