# 回転、拡大、重なりを一枚へ集めた検査画面。
# 位置だけでなく、傾きと前後関係がDOMへ正しく写るかを見る。

extends Control

const BACK := Color("111827") # 下地。
const TINTS := [Color("f87171"), Color("fbbf24"), Color("34d399"), Color("60a5fa"), Color("a78bfa")] # 重なりを見分ける色。

# 傾けた板、拡大した板、重ねた板を固定値で置く。
func _ready() -> void:
	var font := load("res://fonts/Match.ttf") as FontFile
	if font != null:
		font.hinting = TextServer.HINTING_NONE
		font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
		var text_theme := Theme.new()
		text_theme.default_font = font
		theme = text_theme

	var back := ColorRect.new()
	back.color = BACK
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)

	# 角度を変えた板を並べ、傾きの写し取りを見る。
	for index in range(4):
		var panel := _panel(Color("e5e7eb"), Vector2(120, 80))
		panel.position = Vector2(80 + index * 170, 90)
		panel.pivot_offset = Vector2(60, 40)
		panel.rotation_degrees = index * 15.0
		add_child(panel)

	# 拡大率を変えた板を並べる。
	for index in range(3):
		var panel := _panel(Color("94a3b8"), Vector2(80, 50))
		panel.position = Vector2(90 + index * 200, 250)
		panel.pivot_offset = Vector2(40, 25)
		panel.scale = Vector2(1.0 + index * 0.4, 1.0 + index * 0.4)
		add_child(panel)

	# 半透明の板を少しずつずらして重ね、前後関係を見る。
	for index in range(TINTS.size()):
		var panel := _panel(TINTS[index], Vector2(140, 100))
		panel.position = Vector2(120 + index * 40, 380 + index * 16)
		panel.modulate = Color(1, 1, 1, 0.75)
		add_child(panel)

	var label := Label.new()
	label.text = "MOTION"
	label.position = Vector2(560, 420)
	label.pivot_offset = Vector2(60, 20)
	label.rotation_degrees = -20.0
	label.add_theme_font_size_override("font_size", 30)
	label.add_theme_color_override("font_color", Color("e5e7eb"))
	add_child(label)

# 角丸の板を一枚作る。
func _panel(tint: Color, size: Vector2) -> Panel:
	var box := StyleBoxFlat.new()
	box.bg_color = tint
	box.set_corner_radius_all(10)
	var panel := Panel.new()
	panel.size = size
	panel.add_theme_stylebox_override("panel", box)
	return panel
