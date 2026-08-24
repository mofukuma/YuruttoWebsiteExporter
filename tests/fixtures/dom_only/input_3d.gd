# 2DとSubViewport上の3D入力をBrowserからGodotへ往復させる。
# 入力値とButtonイベントをGodot modelで受け、結果を別の意味DOMへ表示する設計を検証する。

extends Node

# 入力面の背景を揃える。
func box(color: Color, border := Color("64748b"), width := 2) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(6)
	return style

# 一行入力、複数行入力、Button、結果表示を同じControl面へ組み立てる。
func form(parent: Control, prefix: String, size: Vector2) -> void:
	var background := Panel.new()
	background.size = size
	background.add_theme_stylebox_override("panel", box(Color("111827"), Color("64748b"), 3))
	parent.add_child(background)

	var title := Label.new()
	title.position = Vector2(18, 12)
	title.size = Vector2(size.x - 36, 28)
	title.text = "%s INPUT" % prefix
	title.add_theme_font_size_override("font_size", 20)
	parent.add_child(title)

	var line := LineEdit.new()
	line.position = Vector2(18, 48)
	line.size = Vector2(size.x - 36, 38)
	line.placeholder_text = "%s LINE" % prefix
	line.add_theme_stylebox_override("normal", box(Color("0f172a"), Color("38bdf8"), 2))
	parent.add_child(line)

	var area := TextEdit.new()
	area.position = Vector2(18, 96)
	area.size = Vector2(size.x - 36, 66)
	area.placeholder_text = "%s AREA" % prefix
	area.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	area.add_theme_stylebox_override("normal", box(Color("0f172a"), Color("a78bfa"), 2))
	parent.add_child(area)

	var action := Button.new()
	action.position = Vector2(18, 172)
	action.size = Vector2(136, 42)
	action.text = "APPLY %s" % prefix
	action.add_theme_stylebox_override("normal", box(Color("0ea5e9"), Color("e0f2fe"), 2))
	parent.add_child(action)

	var output := Label.new()
	output.position = Vector2(18, 220)
	output.size = Vector2(size.x - 36, 36)
	output.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	output.add_theme_font_size_override("font_size", 13)
	parent.add_child(output)

	var state := { "clicks": 0, "sets": 0 }
	var update := func() -> void:
		output.text = "%s VALUE:%s|%s|%d|set%d" % [prefix, line.text, area.text.replace("\n", "/"), state.clicks, state.sets]
	line.text_changed.connect(func(_value: String) -> void: update.call())
	area.text_changed.connect(func() -> void: update.call())
	area.text_set.connect(func() -> void:
		state.sets += 1
		update.call()
	)
	action.pressed.connect(func() -> void:
		state.clicks += 1
		update.call()
	)
	update.call()

# 通常2Dと、ViewportTextureを貼ったSprite3Dを同じ画面へ置く。
func _ready() -> void:
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 5.2
	camera.position = Vector3(0, 0, 5)
	camera.current = true
	add_child(camera)

	var viewport := SubViewport.new()
	viewport.name = "InputViewport"
	viewport.size = Vector2i(360, 260)
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	add_child(viewport)
	var surface := Control.new()
	surface.name = "InputSurface"
	surface.size = viewport.size
	viewport.add_child(surface)
	form(surface, "3D", viewport.size)

	var sprite := Sprite3D.new()
	sprite.name = "InputPlane"
	sprite.texture = viewport.get_texture()
	sprite.pixel_size = 0.009
	sprite.position = Vector3(-1.25, 0, 0)
	sprite.rotation = Vector3(-0.08, -0.3, 0.06)
	add_child(sprite)

	var flat := Control.new()
	flat.name = "FlatForm"
	flat.position = Vector2(500, 116)
	flat.size = Vector2(270, 260)
	add_child(flat)
	form(flat, "2D", flat.size)
