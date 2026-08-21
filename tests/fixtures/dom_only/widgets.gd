# 面と値で伸びる部品を並べた検査画面。
# Slider、ProgressBar、区切り線、線の描画がCSSでどこまで一致するかを見る。

extends Control

const BACK := Color("0f172a") # 下地。
const PANEL := Color("e2e8f0") # 板の面色。

# 値を持つ部品と線を固定位置へ並べる。
func _ready() -> void:
	var font := load("res://fonts/Match.ttf") as FontFile
	if font != null:
		# 輪郭のまま描かせ、Browserの字形計算へ寄せる。
		font.hinting = TextServer.HINTING_NONE
		font.subpixel_positioning = TextServer.SUBPIXEL_POSITIONING_DISABLED
		var text_theme := Theme.new()
		text_theme.default_font = font
		theme = text_theme

	var back := ColorRect.new()
	back.color = BACK
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)

	var panel := Panel.new()
	panel.position = Vector2(40, 40)
	panel.size = Vector2(720, 180)
	var box := StyleBoxFlat.new()
	box.bg_color = PANEL
	box.set_corner_radius_all(16)
	panel.add_theme_stylebox_override("panel", box)
	add_child(panel)

	var bar := ProgressBar.new()
	bar.position = Vector2(72, 80)
	bar.size = Vector2(300, 28)
	bar.value = 64
	bar.show_percentage = false
	add_child(bar)

	var slider := HSlider.new()
	slider.position = Vector2(72, 140)
	slider.size = Vector2(300, 20)
	slider.value = 35
	add_child(slider)

	var line := Line2D.new()
	line.width = 6.0
	line.default_color = Color("38bdf8")
	line.points = PackedVector2Array([Vector2(440, 90), Vector2(560, 150), Vector2(700, 80)])
	add_child(line)

	var label := Label.new()
	label.text = "WIDGETS"
	label.position = Vector2(72, 260)
	label.add_theme_font_size_override("font_size", 28)
	label.add_theme_color_override("font_color", PANEL)
	add_child(label)
