# DOMで再現するControlを変形、入力、切り抜きと組み合わせる試験画面。
# Godotの確定行列とTheme状態を正本にし、Browser側へ配置判断を持たせない設計。

extends Control

const BG := Color("111827") # 画面全体の背景色。
const TEXT := Color("f8fafc") # 状態表示の文字色。

var menu_status: Label # MenuBarからPopup項目までの操作結果。
var input_status: Label # 一行と複数行のBrowser入力結果。
var clip_status: Label # 切り抜き内のButton操作結果。

# 色、枠、角丸を持つ試験用StyleBoxを作る。
func box(color: Color, border := Color("475569"), width := 2) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(8)
	return style

# 一つの状態文字を固定位置へ置く。
func status(text: String, at: Vector2) -> Label:
	var label := Label.new()
	label.text = text
	label.position = at
	label.size = Vector2(330, 26)
	label.add_theme_color_override("font_color", TEXT)
	add_child(label)
	return label

# Popup項目の選択結果を状態文字へ反映する。
func menu_selected(_id: int, title: String) -> void:
	menu_status.text = "MENU:%s" % title

# MenuBarのThemeとPopupを作り、Browser操作の往復先を用意する。
func menu() -> MenuBar:
	var bar := MenuBar.new()
	bar.name = "MainMenu"
	bar.position = Vector2(390, 205)
	bar.size = Vector2(340, 52)
	bar.scale = Vector2(0.82, 0.74)
	bar.add_theme_stylebox_override("normal", box(Color("1e293b")))
	bar.add_theme_stylebox_override("hover", box(Color("0e7490"), Color("67e8f9"), 3))
	bar.add_theme_stylebox_override("pressed", box(Color("7c3aed"), Color("c4b5fd"), 3))
	bar.add_theme_stylebox_override("disabled", box(Color("334155")))
	bar.add_theme_color_override("font_color", TEXT)
	bar.add_theme_color_override("font_hover_color", Color("ecfeff"))
	for title in ["FILE", "EDIT", "HIDDEN"]:
		var popup := PopupMenu.new()
		popup.name = title
		popup.add_separator()
		popup.add_item("%s ITEM" % title)
		popup.id_pressed.connect(menu_selected.bind(title))
		bar.add_child(popup)
	bar.set_menu_disabled(1, true)
	bar.set_menu_hidden(2, true)
	return bar

# MenuBarと同じ直接StyleBox描画を使うTabBarを作る。
func tabs() -> TabBar:
	var bar := TabBar.new()
	bar.name = "MainTabs"
	bar.position = Vector2(390, 316)
	bar.size = Vector2(310, 48)
	bar.add_tab("HOME")
	bar.add_tab("SETTINGS")
	bar.current_tab = 1
	bar.add_theme_stylebox_override("tab_selected", box(Color("166534"), Color("86efac"), 3))
	bar.add_theme_stylebox_override("tab_unselected", box(Color("3f3f46"), Color("a1a1aa"), 2))
	bar.add_theme_color_override("font_selected_color", TEXT)
	bar.add_theme_color_override("font_unselected_color", Color("d4d4d8"))
	return bar

# 回転、縮小、入力、切り抜きを同じ画面へ独立配置する。
func _ready() -> void:
	var background := ColorRect.new()
	background.color = BG
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var rotated := PanelContainer.new()
	rotated.name = "RotatedPanel"
	rotated.position = Vector2(82, 64)
	rotated.size = Vector2(220, 86)
	rotated.pivot_offset = rotated.size * 0.5
	rotated.rotation = deg_to_rad(17)
	rotated.add_theme_stylebox_override("panel", box(Color("be123c"), Color("fda4af"), 4))
	var rotated_text := Label.new()
	rotated_text.text = "ROTATED PANEL"
	rotated_text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rotated_text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	rotated.add_child(rotated_text)
	add_child(rotated)

	var scaled := Button.new()
	scaled.name = "ScaledButton"
	scaled.text = "SCALED BUTTON"
	scaled.position = Vector2(430, 70)
	scaled.size = Vector2(210, 58)
	scaled.scale = Vector2(0.64, 0.72)
	scaled.pressed.connect(func() -> void: clip_status.text = "BUTTON:SCALED")
	add_child(scaled)

	var clip := Panel.new()
	clip.name = "ClipPanel"
	clip.position = Vector2(54, 210)
	clip.size = Vector2(270, 122)
	clip.clip_contents = true
	clip.add_theme_stylebox_override("panel", box(Color("1e3a8a"), Color("93c5fd"), 4))
	var overflow := Button.new()
	overflow.name = "OverflowButton"
	overflow.text = "OVERFLOW BUTTON"
	overflow.position = Vector2(194, 34)
	overflow.size = Vector2(190, 54)
	overflow.pressed.connect(func() -> void: clip_status.text = "BUTTON:OVERFLOW")
	clip.add_child(overflow)
	add_child(clip)

	var line := LineEdit.new()
	line.name = "RotatedInput"
	line.placeholder_text = "Rotated input"
	line.position = Vector2(72, 408)
	line.size = Vector2(250, 44)
	line.pivot_offset = line.size * 0.5
	line.rotation = deg_to_rad(-7)
	line.text_changed.connect(func(value: String) -> void: input_status.text = "INPUT:%s" % value.replace("\n", "|"))
	add_child(line)

	var edit := TextEdit.new()
	edit.name = "ScaledInput"
	edit.placeholder_text = "Scaled textarea"
	edit.position = Vector2(408, 392)
	edit.size = Vector2(300, 112)
	edit.scale = Vector2(0.78, 0.68)
	edit.text_changed.connect(func() -> void: input_status.text = "INPUT:%s" % edit.text.replace("\n", "|"))
	add_child(edit)

	menu_status = status("MENU:idle", Vector2(390, 278))
	input_status = status("INPUT:idle", Vector2(54, 532))
	clip_status = status("BUTTON:idle", Vector2(54, 350))
	add_child(menu())
	add_child(tabs())
