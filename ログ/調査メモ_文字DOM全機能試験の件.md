# 文字DOM全機能試験の調査

## 公式根拠

- [Godot 4.7 CanvasItem](https://docs.godotengine.org/en/4.7/classes/class_canvasitem.html): `get_screen_transform()`は画面座標を返す。親CanvasItemのtransformを継承するため、回転と物理親の移動も同じ経路で取得可能。
- [Godot Button](https://docs.godotengine.org/en/stable/classes/class_button.html): Button文字はThemeのfont、font size、状態別色、outline、alignment、autowrapを使用。
- [Godot 4.7 LinkButton](https://docs.godotengine.org/en/4.7/classes/class_linkbutton.html): LinkButtonは状態別文字色、outline、underlineを使用。
- [Godot 4.7 Control](https://docs.godotengine.org/en/4.7/classes/class_control.html): Theme overrideはControl単位でfont、font size、色を上書き可能。
- [Godot 4.4 RigidBody2D](https://docs.godotengine.org/en/4.4/classes/class_rigidbody2d.html): RigidBody2Dが自身のtransformを物理frameごとに管理。

## 判断

dirty通知だけでは、親Node2DやRigidBody2Dの移動を子Controlが必ず通知できない。DOM指定ControlをObjectID集合へ登録し、可視要素だけ毎frame再同期する方式。

DOM化対象は文字glyphのみ。Label、Button、LinkButtonの背景、枠、icon、入力判定、物理、ShaderはCanvas所有。ButtonのiconはCanvasへ残したまま文字矩形だけを同期。autowrap、文字省略など正確に再現できない設定はCanvasへ戻す。独自fontに対応Web fontがない場合はBrowser標準fontでDOMを維持。

DOM IDは`ObjectID`から`yuruttoweb-text-<id>`を生成。連番対応表を廃止し、Browser検査と解放確認を直接行う。

## 試験群

- Label: 移動、回転、拡縮、色、outline、shadow、継承Theme変更、表示切替、文字変更
- Button: normal、hover、pressed、disabled、継承Theme変更、局所override、背景Canvas維持
- LinkButton: 状態色、underline間隔・太さ、入力後文字、背景なし
- 親追従: Node2D回転、RigidBody2D落下
- 動的負荷: 弾、敵、score、80個Label
- 境界: 親clip、Material、Web font不在、文字省略、削除
- Web: DPR 1/2、desktop/mobile、DOM ID一意、親超過、残留DOM、Browser error、frame追従差
- 比較: 同一動的sceneの標準Canvasとminimumを交互順三回で計測し、固定sceneの文字mask外画像差を確認
