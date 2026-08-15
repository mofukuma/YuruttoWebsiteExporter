# About sceneをBrowser直リンクから識別できる文字で表示する。
# Browser起点のscene変更結果だけを観測する検査画面。

extends Control

# Routeを識別できるDOM Labelを作る。
func _ready() -> void:
	var label := Label.new()
	label.text = "ABOUT SCENE"
	label.position = Vector2(150, 80)
	label.add_theme_font_size_override("font_size", 42)
	label.set_meta("gdweb_dom_text", true)
	add_child(label)
