# AAゲームのwave、残機、一発制限、敵弾選択をheadlessで検査する。
# Browser操作に時間を足さず、rule境界をScene直前状態から固定する。

extends SceneTree

# 二つの独立instanceで終了系とwave更新を検査する。
func _initialize() -> void:
	var packed := load("res://main.tscn") as PackedScene
	assert(packed != null)
	var life_game = packed.instantiate()
	root.add_child(life_game)
	await process_frame
	assert(life_game.invader_count == 40)
	assert(life_game.lives == 3)
	assert(life_game.shields.size() == 21)
	assert(life_game._shield_health() == 42)
	life_game._fire_player()
	var first_shot: Vector2 = life_game.player_shot
	life_game._fire_player()
	assert(life_game.player_shot == first_shot)
	life_game._fire_enemy()
	assert(life_game.enemy_shots.size() == 1)
	# 複数敵弾の後方弾命中で全弾消去後の走査を終了できるか判断する。
	var shots: Array[Vector2] = [Vector2(10.0, 100.0), Vector2(life_game.player_x, life_game.PLAYER_Y)]
	life_game.enemy_shots = shots
	life_game._move_enemy_shots(0.0)
	assert(life_game.lives == 2 and life_game.enemy_shots.is_empty())
	life_game._lose_life("TEST")
	life_game._lose_life("TEST")
	assert(life_game.lives == 0 and life_game.game_over)
	life_game.queue_free()
	await process_frame
	var wave_game = packed.instantiate()
	root.add_child(wave_game)
	await process_frame
	for invader in wave_game.invaders:
		wave_game._hit_invader(invader)
	assert(wave_game.invader_count == 0)
	wave_game._next_wave()
	assert(wave_game.wave == 2 and wave_game.invader_count == 40)
	print(JSON.stringify({"invaders": 40, "shields": 21, "lives": 3, "single_shot": true, "enemy_shot": true, "next_wave": 2, "game_over": true}))
	quit()
