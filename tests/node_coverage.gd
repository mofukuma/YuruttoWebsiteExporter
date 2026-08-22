# Godotが実体化できる全NodeをClassDBから取り出す。
# 分類の正本と突き合わせるため、名前、直系親、描画系統を機械可読な形で返す。

extends SceneTree

# Nodeの描画系統を、棚卸し表で使う四群へ分ける。
func _group(name: StringName) -> String:
	if ClassDB.is_parent_class(name, &"Control"):
		return "control"
	if ClassDB.is_parent_class(name, &"Node2D"):
		return "node2d"
	if ClassDB.is_parent_class(name, &"Node3D"):
		return "node3d"
	return "other"

# 実行中のGodotが持つ全Nodeを漏れなく列挙する。
func _initialize() -> void:
	var nodes: Array[Dictionary] = []
	var groups := {"control": [], "node2d": [], "node3d": [], "other": []}
	var constructed: Array[String] = [] # ClassDBから実体を作れたNode名。
	for name in ClassDB.get_class_list():
		if not ClassDB.can_instantiate(name) or not ClassDB.is_parent_class(name, &"Node"):
			continue
		# 共通設定で外すXRとOS表示を除き、各Nodeの生成経路も一括で通す。
		var value := String(name)
		if not value.begins_with("XR") and not value.begins_with("OpenXR") and value != "StatusIndicator":
			var instance := ClassDB.instantiate(name) as Node
			if instance != null:
				constructed.append(value)
				instance.free()
		var group := _group(name)
		nodes.append({"name": value, "parent": String(ClassDB.get_parent_class(name)), "group": group})
		groups[group].append(value)
	nodes.sort_custom(func(left: Dictionary, right: Dictionary) -> bool: return left.name < right.name)
	for group in groups:
		groups[group].sort()
	constructed.sort()
	print(JSON.stringify({"nodes": nodes, "groups": groups, "constructed": constructed}))
	quit(0)
