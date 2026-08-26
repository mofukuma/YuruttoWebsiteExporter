# Browser scroll後のButton hoverをGodot標準signalまで往復検査する画面。
# GodotのScrollContainer値を変えず、DOMの移動量を入力位置へ反映する。

extends Control

var scroll: ScrollContainer # Godot側で0を保つ横scroll。
var state: Label # enter、exit、is_hoveredの観測値。
var offset: Label # Godot側scroll値の観測値。
var order: Label # PASSで親子へ届く通知順の観測値。
var canvas_state: Label # DOM外Controlへ一度で移るhoverの観測値。
var active: Button # 有効Buttonのhover対象。
var disabled: Button # disabled状態のhover対象。
var ignored: Button # mouse filterで除外する対象。
var hiding: Button # hover中に非表示へ変える対象。
var recursive: Button # 親のrecursive設定で除外する対象。
var counts := [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] # 子、親、除外、非表示、recursiveのenter、exit回数。
var events: Array[String] = [] # PASS時の通知順をBrowserへ渡す記録。
var canvas_counts := [0, 0] # DOM外Controlのenter、exit回数。

# 通常、hover、disabledを色で区別できるButton Themeを作る。
func box(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(10)
	# 文字外の余白でも意味DOMがButton全体を操作できるか確認する。
	style.content_margin_left = 22
	style.content_margin_top = 8
	style.content_margin_right = 14
	style.content_margin_bottom = 6
	return style

# signal時点の回数、通知順、Godot hover状態をBrowserへ表示する。
func show_hover(index: int, event: String) -> void:
	counts[index] += 1
	events.append(event)
	state.text = "HOVER %d/%d/%d/%d/%d/%d/%d/%d/%d/%d/%d/%d %d/%d/%d" % [
		counts[0], counts[1], counts[2], counts[3], counts[4], counts[5], counts[6], counts[7], counts[8], counts[9], counts[10], counts[11],
		int(active.is_hovered()), int(disabled.is_hovered()), int(hiding.is_hovered()),
	]
	order.text = "ORDER " + ",".join(events)

# DOM要素が消える場合もViewport標準経路でexitを一度出す。
func hide_hovered() -> void:
	show_hover(8, "hide-enter")
	await get_tree().create_timer(0.08).timeout
	hiding.visible = false

# DOM外Controlの標準hover回数をBrowserへ表示する。
func show_canvas(index: int) -> void:
	canvas_counts[index] += 1
	canvas_state.text = "CANVAS %d/%d" % canvas_counts

# Browser操作がGodot scroll値へ逆流していないことを毎frame表示する。
func _process(_delta: float) -> void:
	offset.text = "GODOT OFFSET %d" % scroll.scroll_horizontal

# 画面外の2 ButtonをBrowser scrollで表示できる横長領域へ置く。
func _ready() -> void:
	var background := ColorRect.new()
	background.name = "Background"
	background.color = Color("eef2ff")
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	state = Label.new()
	state.name = "HoverState"
	state.text = "HOVER 0/0/0/0/0/0/0/0/0/0/0/0 0/0/0"
	state.position = Vector2(28, 24)
	state.add_theme_color_override("font_color", Color("172554"))
	add_child(state)
	offset = Label.new()
	offset.name = "GodotOffset"
	offset.text = "GODOT OFFSET 0"
	offset.position = Vector2(28, 54)
	offset.add_theme_color_override("font_color", Color("172554"))
	add_child(offset)
	order = Label.new()
	order.name = "HoverOrder"
	order.text = "ORDER"
	order.position = Vector2(28, 78)
	order.add_theme_color_override("font_color", Color("172554"))
	add_child(order)
	canvas_state = Label.new()
	canvas_state.name = "CanvasState"
	canvas_state.text = "CANVAS 0/0"
	canvas_state.position = Vector2(360, 78)
	canvas_state.add_theme_color_override("font_color", Color("172554"))
	add_child(canvas_state)
	scroll = ScrollContainer.new()
	scroll.name = "HoverScroll"
	scroll.position = Vector2(28, 112)
	scroll.size = Vector2(380, 82)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add_child(scroll)
	var strip := Control.new()
	strip.name = "HoverStrip"
	strip.custom_minimum_size = Vector2(1450, 70)
	scroll.add_child(strip)
	var canvas_target := ColorRect.new()
	canvas_target.name = "CanvasTarget"
	canvas_target.color = Color("facc15")
	canvas_target.position = Vector2(260, 8)
	canvas_target.size = Vector2(220, 50)
	canvas_target.mouse_filter = Control.MOUSE_FILTER_STOP
	canvas_target.mouse_entered.connect(show_canvas.bind(0))
	canvas_target.mouse_exited.connect(show_canvas.bind(1))
	strip.add_child(canvas_target)
	active = Button.new()
	active.name = "ActiveButton"
	active.text = "SCROLLED HOVER"
	active.position = Vector2(260, 8)
	active.size = Vector2(170, 50)
	active.mouse_filter = Control.MOUSE_FILTER_PASS
	active.add_theme_stylebox_override("normal", box(Color("2563eb")))
	active.add_theme_stylebox_override("hover", box(Color("f97316")))
	strip.add_child(active)
	disabled = Button.new()
	disabled.name = "DisabledButton"
	disabled.text = "DISABLED HOVER"
	disabled.disabled = true
	disabled.position = Vector2(520, 8)
	disabled.size = Vector2(170, 50)
	disabled.add_theme_stylebox_override("disabled", box(Color("94a3b8")))
	strip.add_child(disabled)
	ignored = Button.new()
	ignored.name = "IgnoredButton"
	ignored.text = "IGNORED HOVER"
	ignored.position = Vector2(700, 8)
	ignored.size = Vector2(170, 50)
	ignored.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ignored.add_theme_stylebox_override("normal", box(Color("0f766e")))
	strip.add_child(ignored)
	hiding = Button.new()
	hiding.name = "HiddenButton"
	hiding.text = "HIDE ON HOVER"
	hiding.position = Vector2(900, 8)
	hiding.size = Vector2(170, 50)
	hiding.add_theme_stylebox_override("normal", box(Color("7c3aed")))
	strip.add_child(hiding)
	var blocked := Control.new()
	blocked.name = "RecursiveBlock"
	blocked.position = Vector2(1100, 8)
	blocked.size = Vector2(170, 50)
	blocked.mouse_behavior_recursive = Control.MOUSE_BEHAVIOR_DISABLED
	strip.add_child(blocked)
	recursive = Button.new()
	recursive.name = "RecursiveButton"
	recursive.text = "RECURSIVE DISABLED"
	recursive.size = Vector2(170, 50)
	recursive.add_theme_stylebox_override("normal", box(Color("be123c")))
	blocked.add_child(recursive)
	active.mouse_entered.connect(show_hover.bind(0, "active-enter"))
	active.mouse_exited.connect(show_hover.bind(1, "active-exit"))
	disabled.mouse_entered.connect(show_hover.bind(2, "disabled-enter"))
	disabled.mouse_exited.connect(show_hover.bind(3, "disabled-exit"))
	strip.mouse_entered.connect(show_hover.bind(4, "parent-enter"))
	strip.mouse_exited.connect(show_hover.bind(5, "parent-exit"))
	ignored.mouse_entered.connect(show_hover.bind(6, "ignored-enter"))
	ignored.mouse_exited.connect(show_hover.bind(7, "ignored-exit"))
	hiding.mouse_entered.connect(hide_hovered)
	hiding.mouse_exited.connect(show_hover.bind(9, "hide-exit"))
	recursive.mouse_entered.connect(show_hover.bind(10, "recursive-enter"))
	recursive.mouse_exited.connect(show_hover.bind(11, "recursive-exit"))
