# Camera3Dが投影したSprite3DとLabel3DをCSS平面と比較する。
# 2Dの不透明面を重ねず、GodotとBrowserの両方で3D平面を見える状態にする設計。

extends Node3D

const INK := Color("f8fafc") # 3D文字の基準色。

# Cameraと二種類の3D平面を一度に用意する。
func _ready() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 0, 5)
	camera.current = true
	add_child(camera)

	var sprite := Sprite3D.new()
	sprite.texture = load("res://photo.png")
	sprite.pixel_size = 0.008
	sprite.position = Vector3(-1.1, -0.4, 0)
	sprite.rotation = Vector3(0.08, 0.25, -0.12)
	add_child(sprite)

	var label := Label3D.new()
	label.text = "3D DOM"
	label.font = load("res://fonts/Match.ttf")
	label.font_size = 42
	label.pixel_size = 0.008
	label.modulate = INK
	label.position = Vector3(0.8, 0.4, 0)
	label.rotation = Vector3(-0.1, -0.2, 0.08)
	add_child(label)
