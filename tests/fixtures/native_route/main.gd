# 起点の画面。Buttonを押すと標準のchange_scene_to_file()でabout sceneへ移る。
# YWebSiteのようなWeb向けの記述は持たない。書き出しただけでrouteが付くかを見るための画面。

extends Control

# 見出しと、次の画面へ移るButtonを置く。
func _ready() -> void:
	var label := Label.new()
	label.text = "MAIN SCENE"
	label.position = Vector2(40, 40)
	add_child(label)

	var button := Button.new()
	button.text = "GO ABOUT"
	button.position = Vector2(40, 100)
	button.size = Vector2(160, 44)
	button.pressed.connect(func() -> void:
		get_tree().change_scene_to_file("res://about.tscn"))
	add_child(button)
