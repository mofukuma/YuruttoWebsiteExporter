# Canvas版で入力の意味DOMとGodot描画の面を同時に検査する。
# 文字はBrowser操作へ渡し、背景、枠、icon、_drawはCanvasへ残す構成にする。

extends Control

var result: Label # Browser操作がGodotへ届いた結果。
var counts: Label # 入力signalの発火回数。
var focus: Label # Godotが所有する現在のfocus先。
var area: TextEdit # 複数行入力の現在値。
var line_count := 0 # LineEdit変更回数。
var submit_count := 0 # LineEdit送信回数。
var area_count := 0 # TextEdit変更回数。
var button_count := 0 # Buttonの発火回数。
var link_count := 0 # LinkButtonの発火回数。
var unexpected_count := 0 # 無効Controlから届いてはいけない発火回数。

# 入力面の色と枠を判別できるStyleBoxを作る。
func panel(color: Color, border: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(4)
	style.set_corner_radius_all(8)
	return style

# Buttonの画像描画がCanvasへ残ることを示すiconを作る。
func icon() -> ImageTexture:
	var image := Image.create(28, 28, false, Image.FORMAT_RGBA8)
	image.fill(Color("facc15"))
	image.fill_rect(Rect2i(5, 5, 18, 18), Color("ef4444"))
	image.fill_rect(Rect2i(10, 2, 8, 24), Color("f8fafc"))
	return ImageTexture.create_from_image(image)

# DOM文字を外しても残るCanvas図形を画面下へ描く。
func _draw() -> void:
	draw_rect(Rect2(36, 500, 728, 54), Color("0891b2"), true)
	draw_circle(Vector2(400, 527), 20, Color("facc15"))

# Browser入力の往復結果を意味DOMへ表示する。
func show_result(value: String) -> void:
	result.text = value
	counts.text = "COUNTS %d/%d/%d/%d/%d/%d" % [line_count, submit_count, area_count, button_count, link_count, unexpected_count]

# BrowserのactiveElementとGodotのfocus先が一致することを表示する。
func show_focus(value: String) -> void:
	focus.text = "FOCUS " + value

# 無効Controlの誤発火を成功回数と分けて検出する。
func press_unexpected() -> void:
	unexpected_count += 1
	show_result("UNEXPECTED %d" % unexpected_count)

# LineEditの変更signalを数えて現在値を表示する。
func change_line(value: String) -> void:
	line_count += 1
	show_result("LINE " + value)

# LineEditの送信signalを数えて現在値を表示する。
func submit_line(value: String) -> void:
	submit_count += 1
	show_result("SUBMIT " + value)

# TextEditの変更signalを数えて複数行を一行へ表示する。
func change_area() -> void:
	area_count += 1
	show_result("AREA " + area.text.replace("\n", "|"))

# Buttonのnative clickが一度ずつ届いたことを数える。
func press_button() -> void:
	button_count += 1
	show_result("BUTTON %d" % button_count)

# LinkButtonのnative clickが一度ずつ届いたことを数える。
func press_link() -> void:
	link_count += 1
	show_result("LINK %d" % link_count)

# DOM所有Control五系統を、背景と重ならない位置へ並べる。
func _ready() -> void:
	var background := ColorRect.new()
	background.name = "Background"
	background.size = Vector2(800, 600)
	background.color = Color("0f172a")
	background.z_index = -1
	add_child(background)

	var title := Label.new()
	title.name = "Title"
	title.text = "CANVAS INPUT CONTROLS"
	title.position = Vector2(36, 26)
	title.add_theme_font_size_override("font_size", 24)
	add_child(title)

	var line := LineEdit.new()
	line.name = "LineInput"
	line.placeholder_text = "LINE INPUT"
	line.position = Vector2(36, 90)
	line.size = Vector2(330, 58)
	line.add_theme_stylebox_override("normal", panel(Color("172554"), Color("38bdf8")))
	add_child(line)

	area = TextEdit.new()
	area.name = "TextArea"
	area.placeholder_text = "TEXT AREA"
	area.position = Vector2(36, 176)
	area.size = Vector2(330, 170)
	area.add_theme_stylebox_override("normal", panel(Color("3b0764"), Color("c084fc")))
	add_child(area)

	var button := Button.new()
	button.name = "ActionButton"
	button.text = "CANVAS BUTTON"
	button.icon = icon()
	button.position = Vector2(416, 90)
	button.size = Vector2(330, 76)
	button.add_theme_stylebox_override("normal", panel(Color("14532d"), Color("4ade80")))
	add_child(button)

	var link := LinkButton.new()
	link.name = "ActionLink"
	link.text = "CANVAS LINK"
	link.uri = "https://example.invalid/"
	link.focus_mode = Control.FOCUS_ALL
	link.position = Vector2(416, 208)
	link.size = Vector2(230, 48)
	link.add_theme_color_override("font_color", Color("67e8f9"))
	add_child(link)
	var no_tab_line := LineEdit.new()
	no_tab_line.name = "NoTabLine"
	no_tab_line.placeholder_text = "NO TAB LINE"
	no_tab_line.focus_mode = Control.FOCUS_NONE
	no_tab_line.position = Vector2(36, 398)
	no_tab_line.size = Vector2(170, 42)
	add_child(no_tab_line)
	var no_tab_area := TextEdit.new()
	no_tab_area.name = "NoTabArea"
	no_tab_area.placeholder_text = "NO TAB AREA"
	no_tab_area.focus_mode = Control.FOCUS_NONE
	no_tab_area.position = Vector2(226, 398)
	no_tab_area.size = Vector2(170, 42)
	add_child(no_tab_area)
	var disabled_button := Button.new()
	disabled_button.name = "DisabledButton"
	disabled_button.text = "DISABLED BUTTON"
	disabled_button.disabled = true
	disabled_button.position = Vector2(416, 398)
	disabled_button.size = Vector2(160, 42)
	add_child(disabled_button)
	var disabled_link := LinkButton.new()
	disabled_link.name = "DisabledLink"
	disabled_link.text = "DISABLED LINK"
	disabled_link.uri = "https://example.invalid/disabled"
	disabled_link.disabled = true
	disabled_link.focus_mode = Control.FOCUS_ALL
	disabled_link.position = Vector2(596, 398)
	disabled_link.size = Vector2(160, 42)
	add_child(disabled_link)

	result = Label.new()
	result.name = "BrowserResult"
	result.text = "READY"
	result.position = Vector2(416, 292)
	result.size = Vector2(330, 48)
	result.add_theme_color_override("font_color", Color("facc15"))
	add_child(result)
	counts = Label.new()
	counts.name = "EventCounts"
	counts.text = "COUNTS 0/0/0/0/0/0"
	counts.position = Vector2(416, 340)
	counts.size = Vector2(330, 48)
	counts.add_theme_color_override("font_color", Color("f8fafc"))
	add_child(counts)
	focus = Label.new()
	focus.name = "FocusOwner"
	focus.text = "FOCUS NONE"
	focus.position = Vector2(416, 448)
	focus.size = Vector2(330, 38)
	focus.add_theme_color_override("font_color", Color("f8fafc"))
	add_child(focus)

	# Browserの意味DOM操作をGodot signalへ通し、結果表示まで往復させる。
	line.text_changed.connect(change_line)
	line.text_submitted.connect(submit_line)
	area.text_changed.connect(change_area)
	button.pressed.connect(press_button)
	link.pressed.connect(press_link)
	disabled_button.pressed.connect(press_unexpected)
	disabled_link.pressed.connect(press_unexpected)
	line.focus_entered.connect(show_focus.bind("LineInput"))
	button.focus_entered.connect(show_focus.bind("ActionButton"))
	area.focus_entered.connect(show_focus.bind("TextArea"))
	link.focus_entered.connect(show_focus.bind("ActionLink"))
