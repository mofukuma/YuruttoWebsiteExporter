# おもちを落としてカゴへ溜める検査画面。
# 物理で決まった位置と傾きがDOMへそのまま出るかを見る。
# 物理を速く回し、決まったframe数で止めて、撮る時刻に結果が左右されないようにする。

extends Control

const TICKS := 1500 # 検査用に上げる物理更新数。FREEZE分を約0.2秒で終える速さ。
const FREEZE := 300 # 形を固定するまでの物理frame数。
const COUNT := 9 # 落とすおもちの数。

var bodies: Array[RigidBody2D] = [] # 落下させる本体。
var ticks := 0 # 経過した物理frame。

# カゴと障害物を置き、おもちを散らして落とす。
func _ready() -> void:
	# 前の画面が止めたままなら動かし直す。scene切替で来ても同じ状態から始める。
	get_tree().paused = false
	Engine.physics_ticks_per_second = TICKS
	var back := ColorRect.new()
	back.color = Color("0b1220")
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)

	_wall(Vector2(400, 560), Vector2(300, 14), Color("475569"))
	_wall(Vector2(250, 480), Vector2(14, 180), Color("475569"))
	_wall(Vector2(550, 480), Vector2(14, 180), Color("475569"))
	_wall(Vector2(330, 300), Vector2(160, 12), Color("64748b"))
	_wall(Vector2(480, 190), Vector2(160, 12), Color("64748b"))

	for index in range(COUNT):
		var body := RigidBody2D.new()
		body.position = Vector2(300 + (index % 4) * 60, 60 - index * 40)
		body.rotation = index * 0.5
		body.physics_material_override = PhysicsMaterial.new()
		body.physics_material_override.bounce = 0.2
		body.physics_material_override.friction = 0.6
		var shape := CollisionShape2D.new()
		var circle := CircleShape2D.new()
		circle.radius = 22.0
		shape.shape = circle
		body.add_child(shape)
		var sprite := Sprite2D.new()
		sprite.texture = load("res://ball.png")
		body.add_child(sprite)
		add_child(body)
		bodies.append(body)

# 決まったframe数で全体を止め、形を固定する。
func _physics_process(_delta: float) -> void:
	ticks += 1
	if ticks == FREEZE:
		get_tree().paused = true

# 動かない板を置く。傾きのない矩形で、面の写し取りも兼ねる。
func _wall(at: Vector2, size: Vector2, tint: Color) -> void:
	var body := StaticBody2D.new()
	body.position = at
	var shape := CollisionShape2D.new()
	var box := RectangleShape2D.new()
	box.size = size
	shape.shape = box
	body.add_child(shape)
	var rect := ColorRect.new()
	rect.color = tint
	rect.position = -size * 0.5
	rect.size = size
	body.add_child(rect)
	add_child(body)
