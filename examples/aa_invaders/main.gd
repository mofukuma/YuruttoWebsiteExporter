# 顔文字の自機で独自AAの侵入者を迎撃するスマートフォンゲーム。
# 意味文字をDOM、背景、弾、防壁をCanvasへ分け、標準2D入力で操作する設計。

extends Node2D

const WIDTH := 390.0 # 基準画面幅。
const HEIGHT := 844.0 # 基準画面高。
const PLAYER_Y := 705.0 # 自機の固定Y位置。
const ROWS := 5 # 敵編隊の行数。
const COLS := 8 # 敵編隊の列数。
const START_Y := 118.0 # 敵編隊の開始Y位置。
const SHOT_STEP := 42 # 敵が弾を撃つ物理frame間隔。
const BG := Color("050913") # 宇宙背景色。
const GRID := Color("12203b") # 画面区切り色。
const PLAYER_COLOR := Color("6fffe9") # 自機文字色。
const ENEMY_COLOR := Color("ff70b5") # 敵AA文字色。
const SHIELD_COLOR := Color("8cff98") # 防壁色。
const SHOT_COLOR := Color("ffe66d") # 自機弾色。
const ENEMY_SHOT_COLOR := Color("ff6577") # 敵弾色。
const WHITE := Color("f7f8ff") # 情報文字色。
const MUTED := Color("91a0bb") # 補助文字色。
const AA := ["╱(• •)╲", "〈[°°]〉", "Ψ(××)Ψ", "╭[••]╮", "≪(oo)≫"] # 行別の独自敵AA。

var ui: Control # 固定情報と操作Buttonを保持するroot。
var formation: Node2D # 敵編隊の共通移動親。
var invaders: Array[Label] = [] # 生存状態を持つ敵AA。
var shields: Array[Dictionary] = [] # Canvas防壁cellと耐久値。
var enemy_shots: Array[Vector2] = [] # Canvas上の敵弾位置。
var player: Label # 顔文字自機のDOM文字。
var score_text: Label # 得点表示。
var life_text: Label # 残機表示。
var wave_text: Label # wave表示。
var stats_text: Label # 自動試験可能な戦況表示。
var status_text: Label # 直近event表示。
var player_x := WIDTH / 2.0 # 自機中央X位置。
var player_shot := Vector2.ZERO # 自機弾位置。
var shot_active := false # 自機弾の存在状態。
var left_down := false # 左移動入力状態。
var right_down := false # 右移動入力状態。
var direction := 1.0 # 敵編隊の水平移動方向。
var frames := 0 # 物理frame数。
var drops := 0 # 編隊下降回数。
var enemy_fired := 0 # 敵弾生成数。
var invader_count := 0 # 生存敵数。
var score := 0 # 累積得点。
var lives := 3 # 残機数。
var wave := 1 # 現在wave。
var game_over := false # 入力と更新を止める終了状態。

# 画面、編隊、防壁、操作UIを一括構築する。
func _ready() -> void:
	_build_ui()
	_build_shields()
	_spawn_formation()
	_refresh()
	queue_redraw()

# 背景、弾、防壁をGodot Canvasへ描く。
func _draw() -> void:
	draw_rect(Rect2(0, 0, WIDTH, HEIGHT), BG)
	for index in range(36):
		var star := Vector2(float((index * 83) % 380) + 5.0, float((index * 47) % 650) + 80.0)
		draw_circle(star, 1.2, Color(WHITE, 0.42))
	draw_line(Vector2(10, 82), Vector2(380, 82), GRID, 2.0)
	draw_line(Vector2(10, 744), Vector2(380, 744), GRID, 2.0)
	for cell in shields:
		if int(cell.hp) > 0:
			draw_rect(cell.rect, Color(SHIELD_COLOR, 0.55 + int(cell.hp) * 0.2))
	if shot_active:
		draw_rect(Rect2(player_shot - Vector2(2, 10), Vector2(4, 20)), SHOT_COLOR)
	for shot in enemy_shots:
		draw_rect(Rect2(shot - Vector2(2, 7), Vector2(4, 14)), ENEMY_SHOT_COLOR)

# 移動、射撃、侵入判定を一つの物理frameで更新する。
func _physics_process(delta: float) -> void:
	if game_over:
		return
	frames += 1
	_move_player(delta)
	_move_invaders(delta)
	_move_player_shot(delta)
	_move_enemy_shots(delta)
	if frames % SHOT_STEP == 0:
		_fire_enemy()
	if invader_count == 0:
		_next_wave()
	if frames % 5 == 0:
		_refresh()
	queue_redraw()

# keyboardを画面Buttonと同じ入力状態へ接続する。
func _input(event: InputEvent) -> void:
	if event is not InputEventKey:
		return
	if event.keycode == KEY_LEFT or event.keycode == KEY_A:
		left_down = event.pressed
	elif event.keycode == KEY_RIGHT or event.keycode == KEY_D:
		right_down = event.pressed
	elif event.keycode == KEY_SPACE and event.pressed and not event.echo:
		_fire_player()

# 情報、顔文字自機、画面操作Buttonを構築する。
func _build_ui() -> void:
	ui = Control.new()
	ui.name = "GameUI"
	add_child(ui)
	score_text = _label("Score", "SCORE 0000", Vector2(14, 14), Vector2(130, 28), 18, WHITE)
	wave_text = _label("Wave", "WAVE 1", Vector2(148, 14), Vector2(92, 28), 18, ENEMY_COLOR)
	life_text = _label("Lives", "LIFE 3", Vector2(276, 14), Vector2(100, 28), 18, PLAYER_COLOR)
	_label("Title", "AA INVADERS", Vector2(94, 47), Vector2(202, 30), 24, WHITE)
	stats_text = _label("Stats", "", Vector2(14, 84), Vector2(362, 22), 13, MUTED)
	status_text = _label("Status", "READY", Vector2(14, 752), Vector2(362, 22), 13, SHOT_COLOR)
	player = _label("Player", "(´・ω・`)", Vector2(player_x - 46, PLAYER_Y), Vector2(92, 30), 22, PLAYER_COLOR)
	var left := _button("MoveLeft", "◀", Vector2(18, 782), Vector2(104, 48))
	var fire := _button("Fire", "FIRE", Vector2(143, 782), Vector2(104, 48))
	var right := _button("MoveRight", "▶", Vector2(268, 782), Vector2(104, 48))
	left.button_down.connect(_set_left.bind(true))
	left.button_up.connect(_set_left.bind(false))
	right.button_down.connect(_set_right.bind(true))
	right.button_up.connect(_set_right.bind(false))
	fire.pressed.connect(_fire_player)

# 3基の損耗する防壁をcell単位で作る。
func _build_shields() -> void:
	for center in [78.0, 195.0, 312.0]:
		for row in range(2):
			for column in range(5):
				if row == 1 and column > 0 and column < 4:
					continue
				var rect := Rect2(center - 30.0 + column * 12.0, 614.0 + row * 12.0, 11.0, 11.0)
				shields.append({"rect": rect, "hp": 2})

# 5行8列の独自AA編隊を生成する。
func _spawn_formation() -> void:
	formation = Node2D.new()
	formation.name = "InvaderFormation"
	add_child(formation)
	invaders.clear()
	invader_count = ROWS * COLS
	for row in range(ROWS):
		for column in range(COLS):
			var invader := _label("InvaderR%dC%d" % [row, column], AA[row], Vector2(18 + column * 44, START_Y + row * 42), Vector2(42, 26), 13, ENEMY_COLOR, formation)
			invader.set_meta("row", row)
			invader.set_meta("column", column)
			invaders.append(invader)

# 自機を入力方向へ移し、画面内へ制限する。
func _move_player(delta: float) -> void:
	var axis := float(int(right_down) - int(left_down))
	player_x = clampf(player_x + axis * 230.0 * delta, 52.0, WIDTH - 52.0)
	player.position.x = player_x - 46.0

# 敵編隊を左右移動し、端で反転と下降を行う。
func _move_invaders(delta: float) -> void:
	var speed := 58.0 + wave * 5.0 + (ROWS * COLS - invader_count) * 1.2
	formation.position.x += direction * speed * delta
	var bounds := _invader_bounds()
	if bounds.x < 8.0 or bounds.y > WIDTH - 8.0:
		formation.position.x += 8.0 - bounds.x if bounds.x < 8.0 else WIDTH - 8.0 - bounds.y
		direction *= -1.0
		formation.position.y += 14.0
		drops += 1
		status_text.text = "INVADERS DESCEND"
	if _invader_bottom() >= PLAYER_Y - 12.0:
		_lose_life("INVASION")
		formation.position = Vector2.ZERO

# 自機弾を上へ進め、防壁または敵への命中を処理する。
func _move_player_shot(delta: float) -> void:
	if not shot_active:
		return
	player_shot.y -= 1100.0 * delta
	if _hit_shield(player_shot):
		shot_active = false
		status_text.text = "SHIELD HIT"
		return
	for invader in invaders:
		if not invader.visible:
			continue
		var rect := Rect2(invader.global_position, invader.size)
		if rect.grow(8.0).has_point(player_shot):
			_hit_invader(invader)
			shot_active = false
			return
	if player_shot.y < 80.0:
		shot_active = false

# 敵弾を下へ進め、防壁、自機、画面外を処理する。
func _move_enemy_shots(delta: float) -> void:
	for index in range(enemy_shots.size() - 1, -1, -1):
		enemy_shots[index].y += 250.0 * delta
		var shot := enemy_shots[index]
		if _hit_shield(shot):
			enemy_shots.remove_at(index)
			continue
		if absf(shot.x - player_x) < 43.0 and shot.y >= PLAYER_Y and shot.y <= PLAYER_Y + 32.0:
			enemy_shots.remove_at(index)
			_lose_life("PLAYER HIT")
			return
		if shot.y > HEIGHT:
			enemy_shots.remove_at(index)

# 残存列の最下段から一発だけ敵弾を生成する。
func _fire_enemy() -> void:
	for offset in range(COLS):
		var column := (enemy_fired + offset) % COLS
		for row in range(ROWS - 1, -1, -1):
			var invader := invaders[row * COLS + column]
			if invader.visible:
				enemy_shots.append(invader.global_position + Vector2(invader.size.x / 2.0, invader.size.y))
				enemy_fired += 1
				return

# 同時一発の自機弾を顔文字中央から生成する。
func _fire_player() -> void:
	if shot_active or game_over:
		return
	shot_active = true
	player_shot = Vector2(player_x, PLAYER_Y - 6.0)
	status_text.text = "PLAYER FIRE"

# 敵一体を得点化し、DOMから隠す。
func _hit_invader(invader: Label) -> void:
	var row := int(invader.get_meta("row"))
	score += [30, 20, 20, 10, 10][row]
	invader_count -= 1
	invader.visible = false
	status_text.text = "INVADER HIT"
	_refresh()

# 指定点の防壁cellを一段損耗させる。
func _hit_shield(point: Vector2) -> bool:
	for index in range(shields.size()):
		if int(shields[index].hp) > 0 and Rect2(shields[index].rect).has_point(point):
			shields[index]["hp"] = int(shields[index].hp) - 1
			return true
	return false

# 被弾または侵入でlifeを一つ減らし、全喪失で終了する。
func _lose_life(reason: String) -> void:
	lives -= 1
	status_text.text = reason
	shot_active = false
	enemy_shots.clear()
	player_x = WIDTH / 2.0
	if lives <= 0:
		lives = 0
		game_over = true
		status_text.text = "GAME OVER"
	_refresh()

# 全滅後に速度が上がる次waveを生成する。
func _next_wave() -> void:
	formation.queue_free()
	wave += 1
	direction = 1.0
	status_text.text = "WAVE CLEAR"
	_spawn_formation()
	_refresh()

# 生存敵の左右端を画面座標で返す。
func _invader_bounds() -> Vector2:
	var left := WIDTH
	var right := 0.0
	for invader in invaders:
		if invader.visible:
			left = minf(left, invader.global_position.x)
			right = maxf(right, invader.global_position.x + invader.size.x)
	return Vector2(left, right)

# 生存敵の最下端を画面座標で返す。
func _invader_bottom() -> float:
	var bottom := 0.0
	for invader in invaders:
		if invader.visible:
			bottom = maxf(bottom, invader.global_position.y + invader.size.y)
	return bottom

# score、life、wave、戦況をDOM文字へ反映する。
func _refresh() -> void:
	score_text.text = "SCORE %04d" % score
	life_text.text = "LIFE %d" % lives
	wave_text.text = "WAVE %d" % wave
	stats_text.text = "INV %d | DROP %d | ESHOT %d | SHIELD %d" % [invader_count, drops, enemy_fired, _shield_health()]

# 現在の防壁耐久合計を返す。
func _shield_health() -> int:
	var total := 0
	for cell in shields:
		total += int(cell.hp)
	return total

# DOM対象Labelを共通設定で生成する。
func _label(node_name: String, text: String, position: Vector2, size: Vector2, font_size: int, color: Color, parent: Node = null) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.position = position
	label.size = size
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.set_meta("gdweb_dom_text", true)
	(parent if parent else ui).add_child(label)
	return label

# Canvas背景とDOM文字を持つ操作Buttonを生成する。
func _button(node_name: String, text: String, position: Vector2, size: Vector2) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text
	button.position = position
	button.size = size
	button.focus_mode = Control.FOCUS_ALL
	button.add_theme_font_size_override("font_size", 20)
	button.add_theme_color_override("font_color", WHITE)
	button.add_theme_stylebox_override("normal", _button_box(Color("182746")))
	button.add_theme_stylebox_override("pressed", _button_box(Color("334c75")))
	button.set_meta("gdweb_dom_text", true)
	ui.add_child(button)
	return button

# 画面ButtonのCanvas背景を生成する。
func _button_box(color: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = color
	box.border_color = Color("5674a7")
	box.set_border_width_all(2)
	box.set_corner_radius_all(12)
	return box

# 左Buttonの押下状態を更新する。
func _set_left(value: bool) -> void:
	left_down = value

# 右Buttonの押下状態を更新する。
func _set_right(value: bool) -> void:
	right_down = value
