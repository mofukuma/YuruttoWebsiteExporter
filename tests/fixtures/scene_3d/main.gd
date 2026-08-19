# 3Dのmeshを回しながら、画面の文字を決まった位置へ置く検査画面。
# 3Dの描画と、文字のDOM化と位置再現が同時に成り立つことを確かめるためのもの。

extends Node3D

const SPOTS := [Vector2(20, 20), Vector2(180, 90), Vector2(60, 260)] # 位置再現を見る置き場所。

var box: MeshInstance3D # 回して描画を確かめる立方体。

# 3Dの見えるもの一式と、位置の違う文字を用意する。
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
	# 文字は2Dと同じControlで置く。3Dの上でも位置がそのまま出ることを見る。
	var layer := Control.new()
	layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(layer)
	for index in SPOTS.size():
		var label := Label.new()
		label.text = "SPOT %d" % index
		label.position = SPOTS[index]
		label.add_theme_font_size_override("font_size", 24)
		layer.add_child(label)

# 立方体を回し続けて、3Dが毎frame描けていることを見えるようにする。
func _process(delta: float) -> void:
	box.rotate_y(delta)
