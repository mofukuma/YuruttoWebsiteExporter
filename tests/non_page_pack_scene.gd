# ページではないSceneがPCK内に残り、Godotから生成できることを確かめる入口。
# 公開routeから外す処理が通常のScene利用を壊していないかを一度で見る。

extends SceneTree

# PCKから内部Sceneを読み、Nodeを生成できなければ失敗する。
func _init() -> void:
	var packed: Variant = load("res://component.tscn")
	if not packed is PackedScene:
		push_error("ページではないSceneがPCKにない")
		quit(1)
		return
	var node: Node = packed.instantiate()
	if node.name != "Component":
		push_error("ページではないSceneを生成できない")
		quit(1)
		return
	node.free()
	quit()
