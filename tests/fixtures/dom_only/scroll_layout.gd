# ScrollContainerの切り抜き、VBox配置、Scrollbar、重なりを一画面で確かめる。
# Godotが決めた最終座標と切り抜き範囲を、平坦DOMへ同じ順序で移す設計を検証する。

extends Control

var scroller: ScrollContainer # Browserスクロール中もGodot値を変えない検査対象。
var nested: ScrollContainer # 入れ子でも外側と内側のBrowser状態を分ける検査対象。
var status: Label # Godot側のスクロール値を監視する文字。

# 色と枠を持つ検査用の面を作る。
func box(color: Color, border := Color("64748b"), width := 2) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(6)
	return style

# VBoxへ置く一行を作り、行自身の範囲でも子のはみ出しを隠す。
func row(index: int) -> Control:
	var item := Control.new()
	item.name = "Row%d" % index
	item.custom_minimum_size = Vector2(480, 68)
	item.clip_contents = true

	var face := ColorRect.new()
	face.position = Vector2(-24, -8)
	face.size = Vector2(530, 84)
	face.color = Color.from_hsv(index / 8.0, 0.62, 0.82)
	face.mouse_filter = Control.MOUSE_FILTER_IGNORE
	item.add_child(face)

	var label := Label.new()
	label.position = Vector2(18, 18)
	label.size = Vector2(190, 32)
	label.text = "ROW %d" % index
	label.add_theme_font_size_override("font_size", 20)
	item.add_child(label)

	var tail := Label.new()
	tail.position = Vector2(390, 18)
	tail.size = Vector2(130, 32)
	tail.text = "TAIL %d" % index
	tail.add_theme_font_size_override("font_size", 18)
	item.add_child(tail)

	# 入れ子のnative scrollとColorPicker色面が、外側の移動へ一緒に追従するか確かめる。
	if index == 2:
		nested = ScrollContainer.new()
		nested.name = "NestedScroll"
		nested.position = Vector2(214, 6)
		nested.size = Vector2(156, 56)
		var nested_content := Control.new()
		nested_content.custom_minimum_size = Vector2(270, 104)
		var picker := ColorPicker.new()
		picker.name = "NestedPicker"
		picker.size = Vector2(250, 96)
		nested_content.add_child(picker)
		nested.add_child(nested_content)
		item.add_child(nested)

	# Polygon自身の形と行・ScrollContainerのclipを二層で交差できるか確かめる。
	if index == 3:
		var polygon := Polygon2D.new()
		polygon.name = "ClippedPolygon"
		polygon.position = Vector2(220, 0)
		polygon.polygon = PackedVector2Array([Vector2(-28, -16), Vector2(210, -16), Vector2(210, 82), Vector2(-28, 82)])
		polygon.color = Color("fb7185")
		item.add_child(polygon)
	return item

# Scrollbarの見た目を明確にし、trackとgrabberの移動も比較できるThemeを作る。
func scroll_theme() -> Theme:
	var value := Theme.new()
	for type in ["HScrollBar", "VScrollBar"]:
		value.set_stylebox("scroll", type, box(Color("172033"), Color("334155"), 1))
		value.set_stylebox("scroll_focus", type, box(Color("1e293b"), Color("38bdf8"), 2))
		value.set_stylebox("grabber", type, box(Color("38bdf8"), Color("e0f2fe"), 1))
		value.set_stylebox("grabber_highlight", type, box(Color("22d3ee"), Color("ffffff"), 1))
		value.set_stylebox("grabber_pressed", type, box(Color("f59e0b"), Color("ffffff"), 1))
	return value

# Browser操作がGodotへ逆流していないか、Rangeの変更通知から監視する。
func show_godot_scroll(_value := 0.0) -> void:
	status.text = "GODOT OFFSET %d %d NESTED %d %d" % [scroller.scroll_horizontal, scroller.scroll_vertical, nested.scroll_horizontal, nested.scroll_vertical]

# 切り抜き対象と手前の兄弟を、木の順序とz順が異なる状態で組み立てる。
func _ready() -> void:
	var background := ColorRect.new()
	background.color = Color("0b1020")
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	background.z_index = -20
	add_child(background)

	# 先に追加した要素を高いzへ置き、木の順でなくGodotの重なり順を使うか確かめる。
	var front := Button.new()
	front.position = Vector2(248, 150)
	front.size = Vector2(210, 64)
	front.text = "OVERLAY FRONT"
	front.z_index = 20
	front.add_theme_stylebox_override("normal", box(Color("facc15"), Color("ffffff"), 3))
	front.add_theme_color_override("font_color", Color("111827"))
	add_child(front)

	var frame := Panel.new()
	frame.position = Vector2(48, 68)
	frame.size = Vector2(390, 294)
	frame.add_theme_stylebox_override("panel", box(Color("111827"), Color("94a3b8"), 3))
	add_child(frame)

	scroller = ScrollContainer.new()
	scroller.name = "ContentScroll"
	scroller.position = Vector2(60, 82)
	scroller.size = Vector2(360, 260)
	scroller.theme = scroll_theme()
	add_child(scroller)

	var content := VBoxContainer.new()
	content.name = "Rows"
	content.custom_minimum_size = Vector2(480, 0)
	content.add_theme_constant_override("separation", 8)
	for index in 8:
		content.add_child(row(index))
	scroller.add_child(content)

	status = Label.new()
	status.position = Vector2(500, 76)
	status.size = Vector2(290, 34)
	status.add_theme_font_size_override("font_size", 14)
	add_child(status)
	scroller.get_h_scroll_bar().value_changed.connect(show_godot_scroll)
	scroller.get_v_scroll_bar().value_changed.connect(show_godot_scroll)
	nested.get_h_scroll_bar().value_changed.connect(show_godot_scroll)
	nested.get_v_scroll_bar().value_changed.connect(show_godot_scroll)
	show_godot_scroll()

	var guide := Label.new()
	guide.position = Vector2(500, 132)
	guide.size = Vector2(260, 100)
	guide.text = "VBoxContainer\nNested clipping\nScrollbar movement\nz-index overlap"
	guide.add_theme_font_size_override("font_size", 18)
	add_child(guide)
