# Scene情報JSONを、projectの中身から用意して不足だけ埋める。
# 書く人が手を入れた値を守るため、既にある項目へは触れず追加だけを行う設計。

@tool
extends RefCounted

const SKIP := ["res://addons", "res://.godot"] # 作品ではない領域。
const EXTENSIONS := ["tscn", "scn"] # Sceneとして扱うfile。
const PRESETS := "res://export_presets.cfg" # 書き出し設定の在り処。
const OPTION := "yweb/site/config" # Scene情報JSONの位置を指す設定名。

# 既定pathと、presetが指すpathをまとめて用意する。
static func ensure_all(default_path: String) -> void:
	var targets := {default_path: true}
	var presets := ConfigFile.new()
	if presets.load(PRESETS) == OK:
		for section in presets.get_sections():
			var value := String(presets.get_value(section, OPTION, ""))
			if value.begins_with("res://"):
				targets[value] = true
	for path in targets:
		ensure(path)

# 指定pathのJSONを、main sceneと未登録Sceneで満たす。既存値は残す。
static func ensure(path: String) -> void:
	if not path.begins_with("res://"):
		return
	var source := _load(path)
	if source.is_empty() and FileAccess.file_exists(path):
		return # 壊れたJSONを上書きしない。
	var entries: Dictionary = source.get("scenes", {})
	var known := {} # 既に載っているscene path。
	for key in entries:
		if entries[key] is Dictionary:
			known[String(entries[key].get("scene", ""))] = true
	var added := false
	for scene in _scenes():
		if known.has(scene):
			continue
		entries[_key(scene, entries)] = {"scene": scene, "uri": _uri(scene, entries.is_empty())}
		known[scene] = true
		added = true
	if not added and FileAccess.file_exists(path):
		return
	source["version"] = int(source.get("version", 1))
	source["scenes"] = entries
	_save(path, source)

# JSON objectとして読む。無いか壊れていれば空を返す。
static func _load(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if parsed is Dictionary else {}

# 整形したJSONを書き、Editorのfile一覧へ反映する。置き場が無ければ作る。
static func _save(path: String, data: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(data, "\t", false) + "\n")
	file.close()
	if Engine.is_editor_hint():
		EditorInterface.get_resource_filesystem().update_file(path)

# main sceneを先頭に、残りをfile容量の多い順で返す。
static func _scenes() -> Array[String]:
	var main := String(ProjectSettings.get_setting("application/run/main_scene", ""))
	var sized: Array[Array] = []
	for scene in _find():
		if scene != main:
			sized.append([_size(scene), scene])
	sized.sort_custom(func(a: Array, b: Array) -> bool: return a[0] > b[0])
	var order: Array[String] = []
	if not main.is_empty() and FileAccess.file_exists(main):
		order.append(main)
	for item in sized:
		order.append(item[1])
	return order

# project内のSceneをすべて集める。
static func _find() -> Array[String]:
	var found: Array[String] = []
	var pending: Array[String] = ["res://"]
	while not pending.is_empty():
		var current: String = pending.pop_back()
		var directory := DirAccess.open(current)
		if directory == null:
			continue
		directory.list_dir_begin()
		var name := directory.get_next()
		while name != "":
			var child := current.path_join(name) if current != "res://" else "res://" + name
			if directory.current_is_dir():
				if not SKIP.has(child) and not name.begins_with("."):
					pending.append(child)
			elif EXTENSIONS.has(name.get_extension().to_lower()):
				found.append(child)
			name = directory.get_next()
		directory.list_dir_end()
	found.sort()
	return found

# fileの大きさを返す。読めない場合は0。
static func _size(path: String) -> int:
	var file := FileAccess.open(path, FileAccess.READ)
	return 0 if file == null else file.get_length()

# file名からkeyを作り、既存keyとぶつからない形にする。
static func _key(scene: String, entries: Dictionary) -> String:
	var base := scene.get_file().get_basename().to_pascal_case()
	if base.is_empty():
		base = "Page"
	var key := base
	var index := 2
	while entries.has(key):
		key = "%s%d" % [base, index]
		index += 1
	return key

# 最初のSceneをsite rootへ、以降はfile名を区切り付きへ整えた下層URIへ割り当てる。
static func _uri(scene: String, first: bool) -> String:
	return "/" if first else "/%s/" % scene.get_file().get_basename().to_snake_case().replace("_", "-")
