# 3Dのmeshを一つ回しながら、DOM文字も一緒に出す検査画面。
# 3Dの描画と文字のHTML化が同時に成り立つことを確かめるためのもの。

extends Node3D

var box: MeshInstance3D # 回して描画を確かめる立方体。

# 3Dの見えるもの一式と、画面の文字を用意する。
func _ready() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 0, 4)
	add_child(camera)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-45, -30, 0)
	add_child(light)
	box = MeshInstance3D.new()
	box.mesh = BoxMesh.new()
	add_child(box)
	var label := Label.new()
	label.text = "SCENE 3D"
	label.position = Vector2(20, 20)
	label.add_theme_font_size_override("font_size", 32)
	add_child(label)

# 立方体を回し続けて、3Dが毎frame描けていることを見えるようにする。
func _process(delta: float) -> void:
	box.rotate_y(delta)
