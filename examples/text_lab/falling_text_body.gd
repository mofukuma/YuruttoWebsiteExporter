# RigidBody2Dの物理transformで子Buttonを周期的に落下させる。
# resetはPhysicsDirectBodyState2Dへ適用し、不正な外部transform変更を避ける。

extends RigidBody2D

var age := 0.0 # 次の落下へ戻すまでの物理時間。

# 物理stepを進め、一定間隔で安全に落下開始位置へ戻す。
func _integrate_forces(state: PhysicsDirectBodyState2D) -> void:
	age += state.step
	if age < 2.6:
		return
	age = 0.0
	state.transform = Transform2D(0.0, Vector2(880, 390))
	state.linear_velocity = Vector2(35, 0)
	state.angular_velocity = 0.45
