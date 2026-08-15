# Omochi捕獲ゲームの物理構造と意味Controlをheadlessで検査する。
# Browser表示では観測できない丸い衝突形状と捕獲機の構成を固定する。

extends SceneTree

# SceneTree準備後に検査本体を呼ぶ。
func _initialize() -> void:
	call_deferred("_run")

# sceneを起動し、物理所有とDOM指定の境界を一括判定する。
func _run() -> void:
	var packed := load("res://main.tscn") as PackedScene
	var scene := packed.instantiate()
	root.add_child(scene)
	for frame in 32:
		await physics_frame
	var omochi := scene.get_node_or_null("OmochiBody001") as RigidBody2D
	var round_collision := scene.get_node_or_null("OmochiBody001/RoundCollision") as CollisionShape2D
	var button := scene.get_node_or_null("OmochiBody001/OmochiButton") as Button
	var catcher := scene.get_node_or_null("GodouCatcher") as AnimatableBody2D
	var link := scene.get_node_or_null("GodouCatcher/GodouLink") as LinkButton
	var sensor := scene.get_node_or_null("GodouCatcher/CatchSensor") as Area2D
	var wall_count := catcher.get_children().filter(func(child: Node) -> bool: return child is CollisionShape2D).size() if catcher else 0
	var machine_count := scene.get_children().filter(func(child: Node) -> bool: return child.name.begins_with("Ramp") or child.name.begins_with("Pin")).size()
	if not omochi or not round_collision or not round_collision.shape is CircleShape2D:
		_fail("Omochiの丸いRigidBody2Dなし")
		return
	if not is_equal_approx((round_collision.shape as CircleShape2D).radius, 31.0):
		_fail("Omochiの丸い半径不一致")
		return
	if not omochi.contact_monitor or omochi.max_contacts_reported < 8 or machine_count != 8:
		_fail("坂とピンの接触監視構成なし")
		return
	if not button or button.text != "Omochi" or not button.get_meta("gdweb_dom_text", false):
		_fail("Omochi Buttonの意味DOM指定なし")
		return
	if not catcher or not sensor or wall_count != 3:
		_fail("Godou捕獲機の三面衝突またはsensorなし")
		return
	if not link or link.text != "Godou-san" or link.mouse_filter == Control.MOUSE_FILTER_IGNORE or not link.get_meta("gdweb_dom_text", false):
		_fail("Godou-san LinkButtonの意味DOM指定なし")
		return
	print(JSON.stringify({ "ok": true, "circle_radius": 31, "machine_parts": machine_count, "catcher_walls": 3, "button": true, "link": true }))
	quit()

# 検査失敗を非0終了へ変換する。
func _fail(message: String) -> void:
	push_error(message)
	quit(1)
