# 三種類のThemeを実行中に切り替え、Controlの全描画層が追従するか確かめる画面。
# 同じControlを使い続け、DOM要素の再生成に頼らずTheme変更通知へ追従する設計。

extends Control

const NAMES := ["WHITE", "COLORFUL", "MANGA"] # 検査で識別するTheme名。
const PALETTES := [
	[Color("f8fafc"), Color("ffffff"), Color("1e293b"), Color("2563eb"), Color("dbeafe")],
	[Color("24103f"), Color("392060"), Color("fff7d6"), Color("ff4fa3"), Color("26e6d4")],
	[Color("fffbea"), Color("ffffff"), Color("111111"), Color("111111"), Color("ffe100")],
] # 背景、面、文字、主色、副色。

var themes: Array[Theme] = [] # 実行中に交換するTheme resource。
var current := 0 # 現在のTheme番号。
var status: Label # Browser試験が切替完了を読む表示。

# StyleBoxを同じ形の設定入口から作る。
func box(fill: Color, border: Color, width: int, radius: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 6
	style.content_margin_bottom = 6
	return style

# 小さなTheme iconを画素で作り、色変更も検査対象にする。
func icon(color: Color, kind: int) -> ImageTexture:
	var image := Image.create(18, 18, false, Image.FORMAT_RGBA8)
	image.fill(Color.TRANSPARENT)
	for y in range(18):
		for x in range(18):
			var draw := kind == 0 and (x < 4 or x > 13 or y < 4 or y > 13)
			draw = draw or (kind == 1 and abs(x - y) < 2)
			draw = draw or (kind == 2 and x >= 5 and x <= 12 and y >= 5 and y <= 12)
			draw = draw or (kind == 3 and x >= 5 and x <= 12 and abs(y - 9) <= (x - 5) / 2)
			if draw:
				image.set_pixel(x, y, color)
	return ImageTexture.create_from_image(image)

# 一つのpaletteからControl全体の状態別Themeを作る。
func make_theme(index: int) -> Theme:
	var colors: Array = PALETTES[index]
	var back: Color = colors[0]
	var face: Color = colors[1]
	var ink: Color = colors[2]
	var accent: Color = colors[3]
	var second: Color = colors[4]
	var thick := 4 if index == 2 else 2
	var radius := 0 if index == 2 else (14 if index == 1 else 7)
	var value := Theme.new()
	value.default_font = load("res://fonts/Match.ttf")
	value.default_font_size = 18
	value.set_color("font_color", "Label", ink)

	value.set_stylebox("panel", "Panel", box(back, ink, thick, radius))
	for type in ["Button", "CheckBox", "CheckButton", "OptionButton"]:
		value.set_stylebox("normal", type, box(face, ink, thick, radius))
		value.set_stylebox("hover", type, box(second, accent, thick, radius))
		value.set_stylebox("pressed", type, box(accent, ink, thick, radius))
		value.set_stylebox("disabled", type, box(back.darkened(0.08), ink.lightened(0.45), thick, radius))
		value.set_stylebox("focus", type, box(Color.TRANSPARENT, second, thick, radius))
		value.set_color("font_color", type, ink)
		value.set_color("font_hover_color", type, ink)
		value.set_color("font_pressed_color", type, face)
		value.set_color("font_disabled_color", type, ink.lightened(0.45))

	value.set_stylebox("normal", "LineEdit", box(face, ink, thick, radius))
	value.set_stylebox("read_only", "LineEdit", box(back, ink.lightened(0.35), thick, radius))
	value.set_stylebox("focus", "LineEdit", box(Color.TRANSPARENT, accent, thick, radius))
	value.set_color("font_color", "LineEdit", ink)
	value.set_color("font_uneditable_color", "LineEdit", ink.lightened(0.35))
	value.set_color("font_placeholder_color", "LineEdit", ink * Color(1, 1, 1, 0.55))

	value.set_stylebox("background", "ProgressBar", box(face, ink, thick, radius))
	value.set_stylebox("fill", "ProgressBar", box(accent, accent, 0, radius))
	value.set_color("font_color", "ProgressBar", ink)
	value.set_color("font_outline_color", "ProgressBar", face)

	for type in ["HSlider", "VSlider"]:
		value.set_stylebox("slider", type, box(second, ink, 1, radius))
		value.set_stylebox("grabber_area", type, box(accent, accent, 0, radius))
		value.set_icon("grabber", type, icon(ink, 2))
		value.set_icon("grabber_highlight", type, icon(accent, 2))

	for type in ["HScrollBar", "VScrollBar"]:
		value.set_stylebox("scroll", type, box(face, ink, thick, radius))
		value.set_stylebox("scroll_focus", type, box(second, accent, thick, radius))
		value.set_stylebox("grabber", type, box(accent, ink, 1, radius))
		value.set_stylebox("grabber_highlight", type, box(second, accent, 1, radius))
		value.set_stylebox("grabber_pressed", type, box(accent, accent, 1, radius))
		value.set_icon("decrement", type, icon(ink, 1))
		value.set_icon("increment", type, icon(accent, 1))
		value.set_icon("decrement_highlight", type, icon(second, 1))
		value.set_icon("increment_highlight", type, icon(second, 1))
		value.set_icon("decrement_pressed", type, icon(accent, 1))
		value.set_icon("increment_pressed", type, icon(accent, 1))
		for side in ["padding_left", "padding_top", "padding_right", "padding_bottom"]:
			value.set_constant(side, type, 2)

	value.set_stylebox("separator", "HSeparator", box(accent, accent, 0, 0))
	value.set_stylebox("separator", "VSeparator", box(accent, accent, 0, 0))
	value.set_icon("checked", "CheckBox", icon(accent, 0))
	value.set_icon("unchecked", "CheckBox", icon(ink, 0))
	value.set_icon("checked_disabled", "CheckBox", icon(ink.lightened(0.5), 0))
	value.set_icon("unchecked_disabled", "CheckBox", icon(ink.lightened(0.5), 0))
	value.set_icon("checked", "CheckButton", icon(accent, 2))
	value.set_icon("unchecked", "CheckButton", icon(ink, 2))
	value.set_icon("checked_disabled", "CheckButton", icon(ink.lightened(0.5), 2))
	value.set_icon("unchecked_disabled", "CheckButton", icon(ink.lightened(0.5), 2))
	value.set_icon("arrow", "OptionButton", icon(accent, 3))
	value.set_constant("arrow_margin", "OptionButton", 8)
	return value

# Controlを固定位置へ置く小さな共通処理。
func put(node: Control, at: Vector2, size: Vector2) -> Control:
	node.position = at
	node.size = size
	add_child(node)
	return node

# Themeの各要素を同時に見られる画面を組み立てる。
func _ready() -> void:
	for index in NAMES.size():
		themes.append(make_theme(index))
	theme = themes[current]

	var panel := put(Panel.new(), Vector2(24, 24), Vector2(752, 552))
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	status = put(Label.new(), Vector2(52, 48), Vector2(240, 34))
	status.name = "ThemeStatus"
	status.text = "THEME WHITE"
	status.add_theme_font_size_override("font_size", 24)

	var change := put(Button.new(), Vector2(572, 44), Vector2(170, 42)) as Button
	change.name = "ThemeSwitch"
	change.text = "CHANGE THEME"
	change.pressed.connect(next_theme)

	var normal := put(Button.new(), Vector2(52, 112), Vector2(180, 44)) as Button
	normal.text = "BUTTON"
	var pressed := put(Button.new(), Vector2(250, 112), Vector2(180, 44)) as Button
	pressed.text = "PRESSED"
	pressed.toggle_mode = true
	pressed.button_pressed = true
	var disabled := put(Button.new(), Vector2(448, 112), Vector2(180, 44)) as Button
	disabled.text = "DISABLED"
	disabled.disabled = true

	var check := put(CheckBox.new(), Vector2(52, 178), Vector2(180, 42)) as CheckBox
	check.text = "CHECK BOX"
	check.button_pressed = true
	var toggle := put(CheckButton.new(), Vector2(250, 178), Vector2(180, 42)) as CheckButton
	toggle.text = "CHECK BUTTON"
	toggle.button_pressed = true
	var option := put(OptionButton.new(), Vector2(448, 178), Vector2(180, 42)) as OptionButton
	option.add_item("OPTION")

	var edit := put(LineEdit.new(), Vector2(52, 242), Vector2(378, 44)) as LineEdit
	edit.text = "Theme follows every state"
	edit.placeholder_text = "PLACEHOLDER"
	var progress := put(ProgressBar.new(), Vector2(448, 242), Vector2(280, 38)) as ProgressBar
	progress.value = 64
	progress.show_percentage = false

	var slider := put(HSlider.new(), Vector2(52, 316), Vector2(378, 28)) as HSlider
	slider.value = 36
	var vslider := put(VSlider.new(), Vector2(404, 306), Vector2(28, 120)) as VSlider
	vslider.value = 64

	var hscroll := put(HScrollBar.new(), Vector2(52, 382), Vector2(320, 30)) as HScrollBar
	hscroll.max_value = 120
	hscroll.page = 30
	hscroll.value = 42
	var vscroll := put(VScrollBar.new(), Vector2(464, 306), Vector2(30, 120)) as VScrollBar
	vscroll.max_value = 120
	vscroll.page = 30
	vscroll.value = 42

	put(HSeparator.new(), Vector2(52, 448), Vector2(620, 8))
	put(VSeparator.new(), Vector2(696, 306), Vector2(8, 150))

	var note := put(Label.new(), Vector2(52, 488), Vector2(620, 42)) as Label
	note.text = "WHITE / COLORFUL / MANGA"

# 同じNodeへ次のTheme resourceを適用し、表示完了を文字で知らせる。
func next_theme() -> void:
	current = (current + 1) % themes.size()
	theme = themes[current]
	status.text = "THEME %s" % NAMES[current]
