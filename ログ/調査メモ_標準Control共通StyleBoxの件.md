# 標準Control共通StyleBoxの調査

MenuBarやTabBarなど、Control自身が直接描く枠をDOMへ共通転送するために調べたよ。

## 確認結果

- `StyleBox.draw()` はCanvasItemのRIDとローカル矩形を受け取る。個別Controlへ処理を増やすより、この入口でDOMへ転送すると標準Controlへ広く適用できる。
- MenuBarはPopupMenuの子ごとに項目を作り、非表示・無効・タイトルを項目単位で持つ。DOMの要素番号ではなくGodotの実項目番号を操作へ戻す。
- `clip_contents` は子の描画と入力をControlの矩形内へ制限する。DOMでも同じGodot矩形からクリップ形状と入力範囲を作る。
- CanvasItemの描画はツリー順で、変形は親から継承される。DOMの自動配置を使わず、Godotの変換行列と描画順を渡す。

## 参照

- [StyleBox](https://docs.godotengine.org/en/4.6/classes/class_stylebox.html)
- [MenuBar](https://docs.godotengine.org/en/stable/classes/class_menubar.html)
- [Control](https://docs.godotengine.org/en/stable/classes/class_control.html)
- [CanvasItem](https://docs.godotengine.org/en/stable/classes/class_canvasitem.html)
