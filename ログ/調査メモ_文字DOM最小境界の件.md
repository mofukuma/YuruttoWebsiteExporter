# 文字DOM最小境界の調査

## 結論

標準Godot Web Canvasを残し、`Label`のglyphだけをDOMへ移す構成。Control全体のDOM化、DOM入力、親子DOM階層、Canvas命令変換は不要。

## 公式根拠

- [Godot 4.7 CanvasItem](https://docs.godotengine.org/en/4.7/classes/class_canvasitem.html): 2D項目はCanvasItem treeで描画され、transform、modulate、visibility、zを継承。`get_screen_transform()`は画面座標の取得手段。
- [Godot Label](https://docs.godotengine.org/en/4.4/classes/class_label.html): font color、font size、outline、shadow、line spacing、clip、autowrapをLabelが所有。
- [Godot LabelSettings](https://docs.godotengine.org/en/4.0/classes/class_labelsettings.html): Label固有のfont、色、size、outline、shadowがThemeより優先される設定。
- [Godot CanvasItem Shader](https://docs.godotengine.org/en/4.0/tutorials/shaders/shader_reference/canvas_item_shader.html): CanvasItem ShaderはGUIを含む2D要素へ使う標準経路。
- [Godot 4.7 Window](https://docs.godotengine.org/en/4.7/classes/class_window.html): `content_scale_size`は仮想画素、`Window.size`は物理画素。高DPIでは両者を分離して扱う。
- [Godot 4.7 Web exporter](https://docs.godotengine.org/en/4.7/classes/class_editorexportplatformweb.html): AdaptiveはCanvasをWeb pageへ自動適合する設定。

## 判断

DOM文字の実現自体にShaderは不要。ただし非文字2Dを標準Canvasのまま扱うため、Godotの2D Shader経路は残す。3D scene rendererだけを除外する。

Canvasは物理画素、Godot画面配置とDOMはCSS論理画素を使用。Godot側で`Window.size / screen scale`を仮想寸法に設定し、DOM側ではDPRを再適用しない。

## 制約

一枚のCanvasとDOMの間では項目単位のz交差ができない。DOM化Labelは前面UIへ限定し、Canvas項目の背面へ置くLabelはCanvas表示を維持する。
