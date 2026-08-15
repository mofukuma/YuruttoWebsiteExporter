# 意味DOM対象とCanvas所有機能を一画面で検証する実験場。
# Theme、IME入力、回転、物理、動的生成、ゲーム状態を毎frame変化させる。
# 設計思想：意味要素をDOMへ渡し、確定入力と2D世界はGodotを唯一の正本に保つ。

extends Node2D

const FallingTextBody = preload("res://falling_text_body.gd") # 落下Buttonを所有する物理body。
const BG := Color("080b12") # 実験場の背景色。
const LINE := Color("263044") # 区画と方眼の線色。
const CYAN := Color("00e5ff") # Theme変更後の強調色。
const PINK := Color("ff4f9a") # enemyとoutlineの強調色。
const WHITE := Color("f4f7ff") # 通常文字色。
const MUTED := Color("8792a8") # 補足文字色。
const SWARM_COUNT := 80 # 毎frame追従負荷を作る文字数。
const SHOT_COUNT := 12 # 循環させる弾Label数。
const ENEMY_COUNT := 8 # 循環させる敵Label数。

var ui: Control # 画面固定のGUI所有root。
var lab_theme: Theme # 継承Themeの動的変更対象。
var theme_button: Button # Theme上書きを切り替えるCanvas Button。
var theme_label: Label # Theme結果をDOMで観測するLabel。
var inherited_label: Label # 継承Themeだけを観測するLabel。
var inherited_button: Button # 継承Themeだけを観測するButton。
var link: LinkButton # underlineと状態色を観測するLinkButton。
var line_input: LineEdit # 一行IMEと選択を観測するLineEdit。
var text_area: TextEdit # 複数行IMEと選択を観測するTextEdit。
var line_state: Label # LineEditのGodot確定状態をBrowser試験へ公開する非表示Label。
var area_state: Label # TextEditのGodot確定状態をBrowser試験へ公開する非表示Label。
var button_state: Label # Buttonの押下端とfocus状態をBrowser試験へ公開する非表示Label。
var press_button: Button # 押下時発火とprogrammatic focus解放を観測するButton。
var fall_body: RigidBody2D # 物理transformを与えるButton親。
var score: Label # ゲーム進行値。
var shots: Array[Label] = [] # 上へ移動する弾文字。
var enemies: Array[Label] = [] # 横へ移動する敵文字。
var swarm: Array[Label] = [] # 多数追従の小文字。
var elapsed := 0.0 # animation位相。
var themed := false # Theme切替状態。
var points := 0 # 自動シューティング得点。
var button_edge := "IDLE" # 標準Buttonの直近pointer端。

# 実験場一式を構築し、動的削除試験を予約する。
func _ready() -> void:
	ui = Control.new()
	ui.name = "LabUI"
	add_child(ui)
	_build_theme()
	_build_controls()
	_build_fallbacks()
	_build_physics()
	_build_shooter()
	_build_swarm()
	get_tree().create_timer(4.0).timeout.connect(_remove_temp)
	queue_redraw()

# 方眼、区画、物理床をCanvasへ描く。
func _draw() -> void:
	draw_rect(Rect2(0, 0, 1280, 720), BG)
	for x in range(0, 1281, 64):
		draw_line(Vector2(x, 0), Vector2(x, 720), Color(LINE, 0.35), 1.0)
	for y in range(0, 721, 64):
		draw_line(Vector2(0, y), Vector2(1280, y), Color(LINE, 0.35), 1.0)
	draw_line(Vector2(0, 360), Vector2(1280, 360), LINE, 2.0)
	draw_line(Vector2(0, 680), Vector2(1280, 680), Color("53627d"), 4.0)

# 回転、弾、敵、負荷文字を毎frame進める。
func _process(delta: float) -> void:
	elapsed += delta
	$LabUI/RotatingLabel.rotation = sin(elapsed * 1.7) * 0.38
	$LabUI/ScalingLabel.scale = Vector2.ONE * (1.0 + sin(elapsed * 2.1) * 0.18)
	for i in shots.size():
		var shot := shots[i]
		shot.position.y -= delta * (120.0 + i * 5.0)
		if shot.position.y < 385:
			shot.position.y = 650
			points += 1
	for i in enemies.size():
		var enemy := enemies[i]
		enemy.position.x = 70.0 + fmod(elapsed * (28.0 + i * 3.0) + i * 137.0, 1120.0)
		enemy.rotation = sin(elapsed * 1.3 + i) * 0.14
	for i in swarm.size():
		var item := swarm[i]
		item.position += Vector2(sin(elapsed * 2.0 + i) * 0.08, cos(elapsed * 1.8 + i) * 0.06)
	score.text = "SCORE %05d" % points
	line_state.text = "LINE MODEL:%s:%d:%d" % [line_input.text, line_input.get_selection_from_column() if line_input.has_selection() else line_input.caret_column, line_input.get_selection_to_column() if line_input.has_selection() else line_input.caret_column]
	area_state.text = "AREA MODEL:%s:%d:%d:%d:%d:%d:%d" % [text_area.text.replace("\n", "|"), text_area.get_selection_from_line() if text_area.has_selection() else text_area.get_caret_line(), text_area.get_selection_from_column() if text_area.has_selection() else text_area.get_caret_column(), text_area.get_selection_to_line() if text_area.has_selection() else text_area.get_caret_line(), text_area.get_selection_to_column() if text_area.has_selection() else text_area.get_caret_column(), roundi(text_area.get_v_scroll()), text_area.get_h_scroll()]
	button_state.text = "BUTTON MODEL:%s:%d:%d" % [button_edge, int(theme_button.has_focus()), int(link.has_focus())]

# 継承Themeの初期値を作る。
func _build_theme() -> void:
	lab_theme = Theme.new()
	lab_theme.set_color("font_color", "Label", WHITE)
	lab_theme.set_font_size("font_size", "Label", 16)
	lab_theme.set_color("font_color", "Button", WHITE)
	lab_theme.set_color("font_hover_color", "Button", CYAN)
	lab_theme.set_color("font_pressed_color", "Button", PINK)
	lab_theme.set_font_size("font_size", "Button", 17)
	lab_theme.set_color("font_color", "LinkButton", CYAN)
	lab_theme.set_color("font_hover_color", "LinkButton", PINK)
	lab_theme.set_font_size("font_size", "LinkButton", 18)
	lab_theme.set_constant("underline_spacing", "LinkButton", 2)
	lab_theme.set_color("font_color", "LineEdit", WHITE)
	lab_theme.set_color("font_placeholder_color", "LineEdit", Color(MUTED, 0.6))
	lab_theme.set_font_size("font_size", "LineEdit", 18)
	lab_theme.set_color("font_color", "TextEdit", WHITE)
	lab_theme.set_color("font_placeholder_color", "TextEdit", Color(CYAN, 0.6))
	lab_theme.set_font_size("font_size", "TextEdit", 16)
	ui.theme = lab_theme

# Theme、Button、Link、回転、表示状態の代表Controlを作る。
func _build_controls() -> void:
	_label(ui, "Title", "TEXT DOM FULL INVENTORY", Vector2(32, 22), Vector2(500, 42), 30, WHITE)
	_label(ui, "Guide", "TEXT / IME = DOM   BACKGROUNDS / PHYSICS = CANVAS", Vector2(34, 58), Vector2(720, 24), 12, MUTED)

	theme_button = _button(ui, "ThemeToggle", "THEME OVERRIDE", Vector2(32, 96), Vector2(230, 54))
	theme_button.pressed.connect(_toggle_theme)
	theme_button.button_down.connect(_button_down)
	theme_button.button_up.connect(_button_up)
	theme_button.add_theme_color_override("font_hover_color", CYAN)
	theme_button.add_theme_color_override("font_pressed_color", PINK)

	link = LinkButton.new()
	link.name = "DocsLink"
	link.text = "LINK BUTTON"
	link.position = Vector2(300, 108)
	link.size = Vector2(170, 34)
	link.uri = "https://docs.godotengine.org/"
	link.underline = LinkButton.UNDERLINE_MODE_ALWAYS
	link.focus_mode = Control.FOCUS_ALL
	link.set_meta("gdweb_dom_text", true)
	link.pressed.connect(_link_pressed)
	ui.add_child(link)

	line_input = LineEdit.new()
	line_input.name = "ImeLineInput"
	line_input.position = Vector2(760, 96)
	line_input.size = Vector2(220, 48)
	line_input.placeholder_text = "日本語 IME"
	line_input.max_length = 24
	line_input.text_submitted.connect(_line_submitted)
	line_input.set_meta("gdweb_dom_text", true)
	ui.add_child(line_input)

	text_area = TextEdit.new()
	text_area.name = "ImeTextArea"
	text_area.position = Vector2(760, 300)
	text_area.size = Vector2(220, 56)
	text_area.placeholder_text = "複数行 IME"
	text_area.set_meta("gdweb_dom_text", true)
	ui.add_child(text_area)

	line_state = _label(ui, "LineModelState", "LINE MODEL::0:0", Vector2.ZERO, Vector2(1, 1), 1, WHITE)
	line_state.visible = false
	area_state = _label(ui, "AreaModelState", "AREA MODEL::0:0:0:0:0:0", Vector2.ZERO, Vector2(1, 1), 1, WHITE)
	area_state.visible = false
	button_state = _label(ui, "ButtonModelState", "BUTTON MODEL:IDLE:0:0", Vector2.ZERO, Vector2(1, 1), 1, WHITE)
	button_state.visible = false

	press_button = _button(ui, "PressModeButton", "PRESS MODE", Vector2(1010, 302), Vector2(220, 46))
	press_button.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
	press_button.pressed.connect(_press_fired)

	var icon_button := _button(ui, "IconButton", "ICON + GLYPH", Vector2(500, 96), Vector2(210, 54))
	icon_button.icon = _icon_texture()
	icon_button.icon_alignment = HORIZONTAL_ALIGNMENT_LEFT

	theme_label = _label(ui, "ThemeLabel", "THEME TARGET 24", Vector2(32, 170), Vector2(410, 55), 24, WHITE)
	theme_label.add_theme_color_override("font_outline_color", PINK)
	theme_label.add_theme_constant_override("outline_size", 1)
	theme_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	theme_label.add_theme_constant_override("shadow_offset_x", 3)
	theme_label.add_theme_constant_override("shadow_offset_y", 3)

	var rotating := _label(ui, "RotatingLabel", "ROTATING LABEL", Vector2(500, 180), Vector2(250, 42), 24, CYAN)
	rotating.pivot_offset = rotating.size / 2.0
	var scaling := _label(ui, "ScalingLabel", "SCALING LABEL", Vector2(770, 180), Vector2(220, 42), 21, PINK)
	scaling.pivot_offset = scaling.size / 2.0

	var disabled := _button(ui, "DisabledButton", "DISABLED BUTTON", Vector2(32, 250), Vector2(230, 48))
	disabled.disabled = true
	disabled.add_theme_color_override("font_disabled_color", MUTED)
	var hidden := _label(ui, "HiddenLabel", "HIDDEN DOM", Vector2(300, 258), Vector2(160, 30), 16, WHITE)
	hidden.visible = false
	_label(ui, "RtlLabel", "RTL  مرحبا", Vector2(500, 255), Vector2(240, 40), 22, WHITE).text_direction = Control.TEXT_DIRECTION_RTL

	var temp := _label(ui, "TemporaryLabel", "TEMPORARY DOM", Vector2(780, 255), Vector2(220, 36), 18, CYAN)
	temp.set_meta("temporary", true)
	inherited_label = Label.new()
	inherited_label.name = "InheritedThemeLabel"
	inherited_label.text = "INHERITED THEME"
	inherited_label.position = Vector2(300, 310)
	inherited_label.size = Vector2(180, 34)
	inherited_label.set_meta("gdweb_dom_text", true)
	ui.add_child(inherited_label)
	inherited_button = Button.new()
	inherited_button.name = "InheritedThemeButton"
	inherited_button.text = "INHERITED BUTTON"
	inherited_button.position = Vector2(500, 302)
	inherited_button.size = Vector2(220, 46)
	inherited_button.set_meta("gdweb_dom_text", true)
	inherited_button.add_theme_stylebox_override("normal", _box(Color("111827"), LINE))
	ui.add_child(inherited_button)

# DOM非対応設定がCanvasへ戻る境界例を作る。
func _build_fallbacks() -> void:
	var clipped_parent := Control.new()
	clipped_parent.name = "ClippedParent"
	clipped_parent.position = Vector2(1010, 88)
	clipped_parent.size = Vector2(180, 34)
	clipped_parent.clip_contents = true
	ui.add_child(clipped_parent)
	_label(clipped_parent, "ClippedFallback", "CLIPPED FALLBACK LONG", Vector2.ZERO, Vector2(260, 32), 14, WHITE)

	var material_label := _label(ui, "MaterialFallback", "MATERIAL FALLBACK", Vector2(1010, 135), Vector2(220, 30), 14, WHITE)
	var shader := Shader.new()
	shader.code = "shader_type canvas_item;\nvoid fragment() { COLOR = vec4(0.0, 0.9, 1.0, COLOR.a); }"
	var material := ShaderMaterial.new()
	material.shader = shader
	material_label.material = material

	var ellipsis := _label(ui, "EllipsisFallback", "ELLIPSIS FALLBACK LONG", Vector2(1010, 177), Vector2(150, 30), 14, WHITE)
	ellipsis.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	var canvas_only := _label(ui, "CanvasOnly", "CANVAS ONLY", Vector2(1010, 219), Vector2(180, 30), 14, MUTED)
	canvas_only.remove_meta("gdweb_dom_text")
	var font_parent := Control.new()
	font_parent.name = "CustomFontParent"
	font_parent.position = Vector2(1010, 261)
	var font_theme := Theme.new()
	font_theme.default_font = SystemFont.new()
	font_parent.theme = font_theme
	ui.add_child(font_parent)
	_label(font_parent, "CustomFontFallback", "THEME FONT FALLBACK", Vector2.ZERO, Vector2(230, 30), 14, MUTED)

# RigidBody2D、衝突形状、DOM Buttonを同じ親へ構成する。
func _build_physics() -> void:
	var floor := StaticBody2D.new()
	floor.name = "Floor"
	floor.position = Vector2(640, 684)
	var floor_shape := CollisionShape2D.new()
	var floor_rect := RectangleShape2D.new()
	floor_rect.size = Vector2(1280, 12)
	floor_shape.shape = floor_rect
	floor.add_child(floor_shape)
	add_child(floor)

	fall_body = FallingTextBody.new()
	fall_body.name = "FallingBody"
	fall_body.position = Vector2(880, 390)
	fall_body.can_sleep = false
	var body_shape := CollisionShape2D.new()
	var body_rect := RectangleShape2D.new()
	body_rect.size = Vector2(190, 52)
	body_shape.shape = body_rect
	fall_body.add_child(body_shape)
	var falling := _button(fall_body, "FallingButton", "PHYSICS BUTTON", Vector2(-95, -26), Vector2(190, 52))
	falling.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(fall_body)

# 自動進行するLabelシューティングのscore、弾、敵を作る。
func _build_shooter() -> void:
	_label(ui, "ShooterTitle", "LABEL SHOOTER", Vector2(32, 382), Vector2(260, 34), 23, WHITE)
	score = _label(ui, "Score", "SCORE 00000", Vector2(1040, 382), Vector2(210, 34), 20, CYAN)
	for i in SHOT_COUNT:
		var shot := _label(ui, "Shot%02d" % i, "▲", Vector2(120 + i * 86, 620 - i * 17), Vector2(24, 24), 15, CYAN)
		shots.append(shot)
	for i in ENEMY_COUNT:
		var enemy := _label(ui, "Enemy%02d" % i, "ENEMY", Vector2(80 + i * 140, 435 + i % 3 * 48), Vector2(80, 26), 13, PINK)
		enemies.append(enemy)

# 大量文字の毎frame同期負荷を画面下部へ分散する。
func _build_swarm() -> void:
	for i in SWARM_COUNT:
		var col := i % 20
		var row := i / 20
		var item := _label(ui, "Swarm%02d" % i, "%02d" % i, Vector2(34 + col * 61, 540 + row * 30), Vector2(34, 20), 10, Color("65718a"))
		swarm.append(item)

# Theme ResourceとButton単体overrideを同時に切り替える。
func _toggle_theme() -> void:
	themed = not themed
	var color := CYAN if themed else WHITE
	var size := 40 if themed else 24
	lab_theme.set_color("font_color", "Label", color)
	lab_theme.set_font_size("font_size", "Label", 28 if themed else 16)
	lab_theme.set_color("font_color", "Button", CYAN if themed else WHITE)
	lab_theme.set_font_size("font_size", "Button", 21 if themed else 17)
	lab_theme.set_constant("underline_spacing", "LinkButton", 7 if themed else 2)
	lab_theme.set_color("font_color", "LineEdit", PINK if themed else WHITE)
	lab_theme.set_color("font_placeholder_color", "LineEdit", Color(CYAN if themed else MUTED, 0.8 if themed else 0.6))
	lab_theme.set_font_size("font_size", "LineEdit", 20 if themed else 18)
	lab_theme.set_color("font_color", "TextEdit", CYAN if themed else WHITE)
	lab_theme.set_color("font_placeholder_color", "TextEdit", Color(PINK if themed else CYAN, 0.8 if themed else 0.6))
	lab_theme.set_font_size("font_size", "TextEdit", 18 if themed else 16)
	theme_label.text = "THEME TARGET %d" % size
	theme_label.add_theme_font_size_override("font_size", size)
	theme_label.add_theme_color_override("font_color", color)
	theme_label.add_theme_constant_override("outline_size", 3 if themed else 1)
	theme_button.add_theme_font_size_override("font_size", 23 if themed else 17)
	theme_button.add_theme_color_override("font_color", PINK if themed else WHITE)
	theme_button.text = "THEME ACTIVE" if themed else "THEME OVERRIDE"
	line_input.text = "PROGRAMMATIC"
	line_input.caret_column = line_input.text.length()
	text_area.text = "PROGRAM\nMODEL"
	text_area.set_caret_line(1)
	text_area.set_caret_column(5)

# LinkButtonのnative click結果を同じDOM要素へ反映する。
func _link_pressed() -> void:
	link.text = "LINK BUTTON" if link.text == "LINK PRESSED" else "LINK PRESSED"

# 標準Buttonの押下開始を記録する。
func _button_down() -> void:
	button_edge = "DOWN"

# 標準Buttonの押下終了を記録する。
func _button_up() -> void:
	button_edge = "UP"

# 押下時発火を記録し、GodotからDOM focusを解放する。
func _press_fired() -> void:
	press_button.text = "PRESS FIRED"
	call_deferred("_release_press_focus")

# Browserのnative focus確定後にGodotを正本として解放する。
func _release_press_focus() -> void:
	press_button.release_focus()

# Enter確定後にGodot側からinput focusを解放する。
func _line_submitted(_text: String) -> void:
	line_input.release_focus()

# 時間終了した動的LabelをSceneTreeから解放する。
func _remove_temp() -> void:
	var temp := ui.get_node_or_null("TemporaryLabel")
	if temp:
		temp.queue_free()

# DOM文字指定を付けたLabelを共通生成する。
func _label(parent: Node, node_name: String, text: String, position: Vector2, size: Vector2, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.position = position
	label.size = size
	label.clip_text = true
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.set_meta("gdweb_dom_text", true)
	parent.add_child(label)
	return label

# Canvas背景を保つButtonへ意味DOM指定を付ける。
func _button(parent: Node, node_name: String, text: String, position: Vector2, size: Vector2) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text
	button.position = position
	button.size = size
	button.set_meta("gdweb_dom_text", true)
	button.add_theme_stylebox_override("normal", _box(Color("111827"), LINE))
	button.add_theme_stylebox_override("hover", _box(Color("172033"), CYAN))
	button.add_theme_stylebox_override("pressed", _box(Color("25152a"), PINK))
	parent.add_child(button)
	return button

# Button背景用の短いStyleBoxを作る。
func _box(color: Color, border: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.border_color = border
	box.set_border_width_all(1)
	box.set_corner_radius_all(5)
	box.set_content_margin_all(10)
	return box

# iconがCanvasに残ることを確認する小画像を作る。
func _icon_texture() -> ImageTexture:
	var image := Image.create(14, 14, false, Image.FORMAT_RGBA8)
	image.fill(CYAN)
	return ImageTexture.create_from_image(image)

# KeyboardからもTheme切替を再現できるようにする。
func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed:
		return
	if event.keycode == KEY_T:
		_toggle_theme()
	elif event.keycode == KEY_F:
		_freeze_lab()
	else:
		return
	get_viewport().set_input_as_handled()

# 標準版との画像比較へ動的要素を同じ初期配置で固定する。
func _freeze_lab() -> void:
	set_process(false)
	$LabUI/RotatingLabel.rotation = 0.0
	$LabUI/ScalingLabel.scale = Vector2.ONE
	fall_body.freeze = true
	fall_body.position = Vector2(880, 390)
	fall_body.rotation = 0.0
	fall_body.visible = false
	for i in shots.size():
		shots[i].position = Vector2(120 + i * 86, 620 - i * 17)
	for i in enemies.size():
		enemies[i].position = Vector2(80 + i * 140, 435 + i % 3 * 48)
		enemies[i].rotation = 0.0
	for i in swarm.size():
		var col := i % 20
		var row := i / 20
		swarm[i].position = Vector2(34 + col * 61, 540 + row * 30)
	score.text = "SCORE 00000"
