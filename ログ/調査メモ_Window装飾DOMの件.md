# Window装飾DOMの調査

Window枠は内容矩形を装飾済み矩形へ置換せず、Godotが`embedded_border`を内容矩形へ描く手順を再現する。StyleBoxFlatのexpand marginが上側のtitle領域を含む外形を作り、titleとclose iconは内容矩形を基準に負のY座標へ描かれる。

## 根拠

- [Godot 4.7.1 Viewport source](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/scene/main/viewport.cpp): 埋込Windowは`Rect2(position, size)`へ`embedded_border`を描き、titleとclose iconも同じ矩形から配置する。
- [Godot 4.7.1 Window source](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/scene/main/window.cpp): 装飾込み位置はStyleBox offset、装飾込み寸法はminimum sizeから求める。これは描画時のexpand marginと一致するとは限らない。
- [Godot 4.7 Window theme](https://docs.godotengine.org/en/4.7/classes/class_window.html): `embedded_border`の外側はStyleBoxFlatのexpand marginで構成する。
- [Godot 4.7 Window API](https://docs.godotengine.org/en/4.7/classes/class_window.html): GDScriptへ公開される題名取得は`get_title()`。Theme取得は`get_theme_stylebox()`、焦点判定は`has_focus()`を使う。

標準Themeの実測値はoffset `(10, 28)`、minimum size `(20, 36)`、expand margin `(8, 32, 8, 6)`。AcceptDialogの内容矩形 `(18, 230, 230, 125)`に対し、装飾取得値は`(8, 202, 250, 161)`、実描画外形はexpand marginを反映した`(10, 198, 246, 163)`になる。

別経路の監査では、Godot側で可視Windowを内蔵Nodeまで列挙し、実行時Themeから外形、色、枠幅、角丸、題名、閉じる画像を取得する。Browser側ではPlaywrightが対応DOMを実測し、数、矩形、見た目、重なり順を照合する。
