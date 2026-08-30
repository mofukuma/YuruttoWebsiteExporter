# DOMの意味文字を2D物理盤へ重ねるOmochi捕獲ゲーム。
# Godou-sanはマウスへ追従し、丸いOmochiは坂とピンを跳ねて落下する。
# 設計思想：文字と意味だけをDOM、物理、背景、衝突形状をGodot Canvasへ保持。

extends Node2D

const YWEB_TICKS := 600 # 検査用に上げる物理更新数。実時間を縮めて待ち時間を減らす。
const YWEB_FREEZE := 900 # 形を固定するまでの物理frame数。

var _yweb_ticks := 0 # 経過した物理frame。

# 決まったframe数で全体を止め、撮る時刻で結果が変わらないようにする。
func _yweb_settle() -> bool:
	_yweb_ticks += 1
	if _yweb_ticks != YWEB_FREEZE:
		return false
	# nativeとWebAssemblyの物理丸め差を画面比較へ持ち込まない。
	var bodies := get_tree().get_nodes_in_group("omochi")
	bodies.sort_custom(func(left: Node, right: Node) -> bool: return left.name < right.name)
	for index in bodies.size():
		var body := bodies[index] as RigidBody2D
		body.freeze = true
		body.position = Vector2(210 + index % 8 * 78, 125 + index / 8 * 74)
		body.rotation = (index % 5 - 2) * 0.12
	score = 0
	machine_contacts = 0
	score_label.text = "捕獲 0"
	contact_label.text = "接触 0"
	status_label.text = "日本語テーマ"
	frame_label.text = "投下 %d / フレーム %d" % [drops, frames]
	get_tree().paused = true
	return true

const BG := Color("07101f") # 物理盤の背景色。
const BOARD := Color("10213b") # 遊技盤の内側色。
const CYAN := Color("45e6ff") # Godou-sanと進行表示の色。
const PINK := Color("ff5f9e") # Omochiと得点の色。
const GOLD := Color("ffd166") # 坂とピンの色。
const WHITE := Color("f6f8ff") # 主見出しの文字色。
const MUTED := Color("8ea0bd") # 操作案内の文字色。
const DROP_Y := 88.0 # Omochi再投下位置。
const CATCH_Y := 548.0 # 捕獲機の物理位置。
const DROP_STEP := 30 # Omochiを追加する物理frame間隔。
const THEME_FRAME := 100 # 日本語Themeへ切り替える物理frame。

var ui: Control # 画面固定の意味文字を所有するroot。
var catcher: AnimatableBody2D # マウスへ追従する物理捕獲機。
var godou: LinkButton # 捕獲機の名前と意味を表すリンク。
var title_label: Label # 日本語版の見出しを表示する文字。
var guide_label: Label # 日本語版の操作案内を表示する文字。
var score_label: Label # 捕獲数を表示する文字。
var status_label: Label # 物理状態を表示する文字。
var contact_label: Label # 坂とピンへの接触数を表示する文字。
var frame_label: Label # 投下数と物理frameを表示する文字。
var score := 0 # 捕獲済みOmochi数。
var drops := 0 # 投下回数。
var frames := 0 # 起動後に進んだ物理frame数。
var machine_contacts := 0 # 坂とピンへ入った物理接触数。
var spawn_x := 480.0 # 次のOmochi投下位置。
var japanese := false # 日本語Theme適用済みの状態。
var text_theme: Theme # LinkButtonとButtonで共有する動的Theme。
var ramps: Array[Dictionary] = [] # Canvas描画と衝突を共有する坂情報。
var pins: Array[Vector2] = [] # Canvas描画と衝突を共有する丸ピン位置。

# 遊技盤、意味文字、物理障害物、捕獲機、Omochiを一括構築する。
func _ready() -> void:
	Engine.physics_ticks_per_second = YWEB_TICKS
	text_theme = _make_text_theme()
	_build_ui()
	_build_course()
	_build_catcher()
	queue_redraw()

# 物理盤と障害物をCanvasへ描画する。
func _draw() -> void:
	draw_rect(Rect2(0, 0, 960, 640), BG)
	draw_rect(Rect2(18, 72, 924, 550), BOARD)
	for ramp in ramps:
		draw_set_transform(ramp.position, ramp.rotation)
		draw_rect(Rect2(-ramp.size / 2.0, ramp.size), Color(GOLD, 0.85), true)
	draw_set_transform(Vector2.ZERO, 0.0)
	for pin in pins:
		draw_circle(pin, 11.0, GOLD)
		draw_circle(pin, 6.0, BG)
	if catcher:
		draw_set_transform(catcher.position, 0.0)
		draw_line(Vector2(-76, -35), Vector2(-65, 34), CYAN, 10.0)
		draw_line(Vector2(-65, 34), Vector2(65, 34), CYAN, 10.0)
		draw_line(Vector2(65, 34), Vector2(76, -35), CYAN, 10.0)
		draw_set_transform(Vector2.ZERO, 0.0)
	draw_string(ThemeDB.fallback_font, Vector2(28, 614), "CANVAS: PHYSICS / RAMPS / ROUND COLLISIONS", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, MUTED)

# マウス位置へ捕獲機を追従させ、30物理frameごとにOmochiを追加する。
func _physics_process(delta: float) -> void:
	if _yweb_settle():
		return
	frames += 1
	if frames == THEME_FRAME:
		_apply_japanese_theme()
	var target := clampf(get_viewport().get_mouse_position().x, 92.0, 868.0)
	catcher.position.x = move_toward(catcher.position.x, target, delta * 1100.0)
	if frames % DROP_STEP == 0:
		_spawn_omochi()
	frame_label.text = ("投下 %d / フレーム %d" if japanese else "DROP %d / FRAME %d") % [drops, frames]
	queue_redraw()

# 見出し、操作案内、得点を意味DOM対象として作る。
func _build_ui() -> void:
	ui = Control.new()
	ui.name = "GameUI"
	add_child(ui)
	title_label = _label("Title", "GODOU-SAN × OMOCHI MACHINE", Vector2(28, 18), Vector2(620, 38), 26, WHITE)
	guide_label = _label("Guide", "MOVE THE MOUSE — CATCH THE FALLING OMOCHI", Vector2(30, 52), Vector2(430, 22), 13, MUTED)
	contact_label = _label("Contacts", "MACHINE CONTACT 0", Vector2(460, 52), Vector2(180, 22), 13, GOLD)
	frame_label = _label("Frames", "DROP 0 / FRAME 0", Vector2(635, 52), Vector2(180, 22), 13, WHITE)
	score_label = _label("Score", "CATCH 0", Vector2(760, 18), Vector2(170, 34), 23, PINK)
	status_label = _label("Status", "ROUND HIT: READY", Vector2(815, 52), Vector2(130, 22), 13, CYAN)

# 坂、丸ピン、外壁を同じ寸法で描画と物理へ登録する。
func _build_course() -> void:
	_add_wall("LeftWall", Vector2(8, 346), Vector2(16, 550), 0.0)
	_add_wall("RightWall", Vector2(952, 346), Vector2(16, 550), 0.0)
	_add_wall("Floor", Vector2(480, 632), Vector2(960, 16), 0.0)
	_add_ramp(Vector2(235, 164), Vector2(310, 16), 0.16)
	_add_ramp(Vector2(720, 238), Vector2(300, 16), -0.18)
	_add_ramp(Vector2(275, 348), Vector2(245, 16), 0.22)
	_add_ramp(Vector2(685, 430), Vector2(270, 16), -0.20)
	for pin in [Vector2(470, 176), Vector2(570, 288), Vector2(430, 394), Vector2(545, 470)]:
		pins.append(pin)
		var body := StaticBody2D.new()
		body.name = "Pin%d" % pins.size()
		body.position = pin
		var shape := CollisionShape2D.new()
		var circle := CircleShape2D.new()
		circle.radius = 11.0
		shape.shape = circle
		body.add_child(shape)
		add_child(body)

# マウス追従する受け皿とLinkButtonを一つの物理親へ構成する。
func _build_catcher() -> void:
	catcher = AnimatableBody2D.new()
	catcher.name = "GodouCatcher"
	catcher.position = Vector2(480, CATCH_Y)
	catcher.sync_to_physics = true
	add_child(catcher)
	_add_catcher_wall("Bottom", Vector2(0, 32), Vector2(150, 14), 0.0)
	_add_catcher_wall("Left", Vector2(-70, 1), Vector2(14, 70), -0.18)
	_add_catcher_wall("Right", Vector2(70, 1), Vector2(14, 70), 0.18)
	var sensor := Area2D.new()
	sensor.name = "CatchSensor"
	var sensor_shape := CollisionShape2D.new()
	var sensor_rect := RectangleShape2D.new()
	sensor_rect.size = Vector2(116, 58)
	sensor_shape.position = Vector2(0, -4)
	sensor_shape.shape = sensor_rect
	sensor.add_child(sensor_shape)
	sensor.body_entered.connect(_catch_omochi)
	catcher.add_child(sensor)
	godou = LinkButton.new()
	godou.name = "GodouLink"
	godou.text = "Godou-san"
	godou.uri = "https://godotengine.org/"
	godou.underline = LinkButton.UNDERLINE_MODE_ALWAYS
	godou.focus_mode = Control.FOCUS_ALL
	godou.position = Vector2(-56, 39)
	godou.size = Vector2(112, 28)
	godou.theme = text_theme
	godou.set_meta("yweb_dom_text", true)
	godou.pressed.connect(_godou_pressed)
	catcher.add_child(godou)

# 丸い物理bodyの中央へ意味Button Omochiを配置して追加する。
func _spawn_omochi() -> void:
	drops += 1
	var omochi := RigidBody2D.new()
	omochi.name = "OmochiBody%03d" % drops
	omochi.position = Vector2(spawn_x, DROP_Y)
	omochi.linear_velocity = Vector2(45.0 if drops % 2 == 0 else -45.0, 0)
	omochi.angular_velocity = 1.8
	omochi.mass = 0.8
	omochi.contact_monitor = true
	omochi.max_contacts_reported = 8
	omochi.physics_material_override = PhysicsMaterial.new()
	omochi.physics_material_override.bounce = 0.62
	omochi.physics_material_override.friction = 0.18
	omochi.set_meta("omochi", true)
	omochi.add_to_group("omochi")
	omochi.body_entered.connect(_omochi_contact)
	var collision := CollisionShape2D.new()
	collision.name = "RoundCollision"
	var circle := CircleShape2D.new()
	circle.radius = 31.0
	collision.shape = circle
	omochi.add_child(collision)
	var button := Button.new()
	button.name = "OmochiButton"
	button.text = "Omochi"
	button.position = Vector2(-37, -31)
	button.size = Vector2(74, 62)
	button.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.theme = text_theme
	button.add_theme_stylebox_override("normal", _round_box(PINK))
	button.set_meta("yweb_dom_text", true)
	omochi.add_child(button)
	add_child(omochi)
	spawn_x = 320.0 + fmod(drops * 173.0, 320.0)
	status_label.text = "ROUND HIT: FALLING"
	if japanese:
		button.text = "おもち"
		status_label.text = "落下中"

# 捕獲機内へ入ったOmochiだけを重複なく得点化する。
func _catch_omochi(body: Node2D) -> void:
	if not body.get_meta("omochi", false) or body.get_meta("caught", false):
		return
	body.set_meta("caught", true)
	score += 1
	score_label.text = ("捕獲 %d" if japanese else "CATCH %d") % score
	status_label.text = "おもち捕獲" if japanese else "ROUND HIT: OMOCHI"

# Godou-san LinkButtonのCanvas経由clickを画面状態へ反映する。
func _godou_pressed() -> void:
	status_label.text = "ゴドウリンク: CLICK" if japanese else "GODOU LINK: CLICK"

# OmochiがIncredible Machineの坂またはピンへ接触した回数を記録する。
func _omochi_contact(body: Node) -> void:
	if not body.name.begins_with("Ramp") and not body.name.begins_with("Pin"):
		return
	machine_contacts += 1
	contact_label.text = ("接触 %d" if japanese else "MACHINE CONTACT %d") % machine_contacts

# 共有Themeを100 frame時点で書き換え、既存DOMの見た目と日本語を更新する。
func _apply_japanese_theme() -> void:
	japanese = true
	text_theme.set_font_size("font_size", "LinkButton", 22)
	text_theme.set_color("font_color", "LinkButton", PINK)
	text_theme.set_font_size("font_size", "Button", 18)
	text_theme.set_color("font_color", "Button", BG)
	title_label.text = "ゴドウさん × おもちマシン"
	guide_label.text = "マウスで動かして、落ちてくるおもちを捕まえる"
	contact_label.text = "接触 %d" % machine_contacts
	score_label.text = "捕獲 %d" % score
	status_label.text = "日本語テーマ"
	for body in get_tree().get_nodes_in_group("omochi"):
		body.get_node("OmochiButton").text = "おもち"
	godou.text = "ゴドウさん"

# LinkButtonとButtonの初期文字styleを共有するTheme Resourceへまとめる。
func _make_text_theme() -> Theme:
	var theme := Theme.new()
	theme.set_font_size("font_size", "LinkButton", 18)
	theme.set_color("font_color", "LinkButton", CYAN)
	theme.set_font_size("font_size", "Button", 15)
	theme.set_color("font_color", "Button", WHITE)
	return theme

# Canvasと衝突で共有する坂を追加する。
func _add_ramp(position: Vector2, size: Vector2, rotation: float) -> void:
	ramps.append({ "position": position, "size": size, "rotation": rotation })
	_add_wall("Ramp%d" % ramps.size(), position, size, rotation)

# 矩形の静的衝突面を追加する。
func _add_wall(node_name: String, position: Vector2, size: Vector2, rotation: float) -> void:
	var body := StaticBody2D.new()
	body.name = node_name
	body.position = position
	body.rotation = rotation
	var collision := CollisionShape2D.new()
	var rectangle := RectangleShape2D.new()
	rectangle.size = size
	collision.shape = rectangle
	body.add_child(collision)
	add_child(body)

# 捕獲機の局所座標へ矩形衝突面を追加する。
func _add_catcher_wall(node_name: String, position: Vector2, size: Vector2, rotation: float) -> void:
	var collision := CollisionShape2D.new()
	collision.name = node_name
	collision.position = position
	collision.rotation = rotation
	var rectangle := RectangleShape2D.new()
	rectangle.size = size
	collision.shape = rectangle
	catcher.add_child(collision)

# 意味DOM対象のLabelを共通生成する。
func _label(node_name: String, text: String, position: Vector2, size: Vector2, font_size: int, color: Color) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.position = position
	label.size = size
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.set_meta("yweb_dom_text", true)
	ui.add_child(label)
	return label

# Omochi ButtonのCanvas背景を丸く見せるStyleBoxを作る。
func _round_box(color: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.corner_radius_top_left = 31
	box.corner_radius_top_right = 31
	box.corner_radius_bottom_left = 31
	box.corner_radius_bottom_right = 31
	return box
