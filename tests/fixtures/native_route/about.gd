# 移った先の画面。Buttonを押すと標準のscene切替で起点へ戻る。
# 行きと帰りの両方で、URLと見出しが画面に追いつくかを見る。

extends Control

# 見出しと、起点へ戻るButtonを置く。
func _ready() -> void:
	var label := Label.new()
	label.text = "ABOUT SCENE"
	label.position = Vector2(40, 40)
	add_child(label)

	var button := Button.new()
	button.text = "GO HOME"
	button.position = Vector2(40, 100)
	button.size = Vector2(160, 44)
	button.pressed.connect(func() -> void:
		get_tree().change_scene_to_file("res://main.tscn"))
	add_child(button)
