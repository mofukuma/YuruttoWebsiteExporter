# Main sceneを表示し、N keyでAbout sceneへ切り替える。
# Godot起点のscene変更をBrowser Historyへ通知する検査画面。

extends Control

# Routeを識別できるDOM Labelを作る。
func _ready() -> void:
	var label := Label.new()
	label.text = "MAIN SCENE"
	label.position = Vector2(160, 80)
	label.add_theme_font_size_override("font_size", 42)
	label.set_meta("yweb_dom_text", true)
	add_child(label)

# Keyboard操作をscene変更へ結び、Browser URL更新を発生させる。
func _input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and event.keycode == KEY_N:
		get_tree().change_scene_to_file("res://about.tscn")
