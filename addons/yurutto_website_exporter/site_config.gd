# Scene情報JSONを、projectの中身から用意して不足するSceneを補う。
# 書く人が手を入れた値を守るため、既存項目へ触れず未登録Sceneを追加する設計。

@tool
extends RefCounted

const AtomicFile := preload("atomic_file.gd") # JSONを欠落なく切り替える処理。
const SKIP := ["res://addons", "res://.godot"] # 作品ではない領域。
const EXTENSIONS := ["tscn", "scn"] # Sceneとして扱うfile。
const PRESETS := "res://export_presets.cfg" # 書き出し設定の在り処。
const OPTION := "yweb/site/config" # Scene情報JSONの位置を指す設定名。
const IGNORED := "ignored_scenes" # 画面で削除し、自動追加しないSceneの一覧。
const PAGE_FIELDS := ["scene", "uri", "title", "description", "summary", "robots"] # 画面で扱うページ項目。
const RESERVED_PATHS := [
	"CON", "PRN", "AUX", "NUL",
	"COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
	"LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
] # Windowsでもdirectoryにできない名前。

# 既定pathと、presetが指すpathをまとめて用意する。
static func ensure_all(default_path: String) -> void:
	for path in paths(default_path):
		ensure(path)

# 既定pathとExport presetに登録されたpathを重複なく返す。
static func paths(default_path: String) -> Array[String]:
	var targets: Array[String] = [default_path]
	var presets := ConfigFile.new()
	if presets.load(PRESETS) == OK:
		for section in presets.get_sections():
			var value := String(presets.get_value(section, OPTION, ""))
			if _valid_path(value) and not targets.has(value):
				targets.push_front(value)
	return targets

# 編集画面が扱えるJSON objectを読み、結果と理由を返す。
static func read(path: String) -> Dictionary:
	if not _valid_path(path):
		return {"error": "JSON path must be a res:// .json file"}
	if not FileAccess.file_exists(path):
		return {"data": {"version": 1, "scenes": {}}}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		return {"error": "JSON root must be an object"}
	var data: Dictionary = parsed
	if not data.get("scenes", {}) is Dictionary:
		return {"error": "scenes must be an object"}
	for key in data.get("scenes", {}):
		if not data.scenes[key] is Dictionary:
			return {"error": "Scene entry must be an object: %s" % key}
	if data.has(IGNORED) and not data[IGNORED] is Array:
		return {"error": "ignored_scenes must be an array"}
	return {"data": data}

# 主要項目を置き換え、画面へ出していない詳細項目は残す。
static func update_page(data: Dictionary, old_key: String, key: String, values: Dictionary) -> String:
	var error := _page_error(data, old_key, key, values)
	if not error.is_empty():
		return error
	var scenes: Dictionary = data.get("scenes", {})
	var page: Dictionary = scenes.get(old_key, {}).duplicate(true)
	var old_scene := String(page.get("scene", ""))
	var enabled := bool(values.get("page", true))
	for field in PAGE_FIELDS:
		var value := String(values.get(field, "")).strip_edges()
		if field == "uri":
			value = normalize_uri(value)
		if value.is_empty() and (field in ["title", "description", "summary", "robots"] or field == "uri" and not enabled):
			page.erase(field)
		else:
			page[field] = value
	if enabled:
		page.erase("page")
	else:
		page["page"] = false
	var changed := {}
	for current in scenes:
		if current == old_key:
			changed[key] = page
		else:
			changed[current] = scenes[current]
	if not scenes.has(old_key):
		changed[key] = page
	data["version"] = int(data.get("version", 1))
	data["scenes"] = changed
	var ignored: Array = data.get(IGNORED, [])
	if not old_scene.is_empty() and old_scene != String(page.get("scene", "")) and not ignored.has(old_scene):
		ignored.append(old_scene)
	ignored.erase(String(page.get("scene", "")))
	if ignored.is_empty():
		data.erase(IGNORED)
	else:
		data[IGNORED] = ignored
	return ""

# 指定ページをJSON objectから外す。
static func remove_page(data: Dictionary, key: String) -> void:
	var scenes: Dictionary = data.get("scenes", {})
	var page: Dictionary = scenes.get(key, {})
	var scene := String(page.get("scene", ""))
	var ignored: Array = data.get(IGNORED, [])
	if not scene.is_empty() and not ignored.has(scene):
		ignored.append(scene)
	scenes.erase(key)
	data["scenes"] = scenes
	if not ignored.is_empty():
		data[IGNORED] = ignored

# 整形したJSONを保存し、Editorのfile一覧へ反映する。
static func write(path: String, data: Dictionary) -> Error:
	if not _valid_path(path):
		return ERR_FILE_BAD_PATH
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var temporary := path + ".tmp"
	var file := FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(data, "\t", false) + "\n")
	file.close()
	var error := AtomicFile.replace(ProjectSettings.globalize_path(temporary), ProjectSettings.globalize_path(path))
	if error != OK:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(temporary))
		return error
	if Engine.is_editor_hint():
		EditorInterface.get_resource_filesystem().update_file(path)
	return OK

# 公開URIを安全なdirectory形式へ揃え、不正なら空を返す。
static func normalize_uri(value: String) -> String:
	var uri := value.strip_edges()
	if not uri.begins_with("/") or uri.contains("..") or uri.contains("%") or uri.contains("?") or uri.contains("#") or uri.contains("\\"):
		return ""
	while uri.contains("//"):
		uri = uri.replace("//", "/")
	for index in uri.length():
		var code := uri.unicode_at(index)
		if code < 32 or code == 127:
			return ""
	for part in uri.trim_prefix("/").trim_suffix("/").split("/", false):
		if part.ends_with(".") or part.ends_with(" ") or part.contains(":") or part.contains("\"") or part.contains("<") or part.contains(">") or part.contains("|") or part.contains("*"):
			return ""
		if part.get_basename().to_upper() in RESERVED_PATHS:
			return ""
	return uri if uri.ends_with("/") else uri + "/"

# 指定pathのJSONを、main sceneと未登録Sceneで満たす。既存値は残す。
static func ensure(path: String) -> void:
	if not _valid_path(path):
		return
	var source := _load(path)
	if source.is_empty() and FileAccess.file_exists(path):
		return # 壊れたJSONを上書きしない。
	var entries: Dictionary = source.get("scenes", {})
	var known := {} # 既に載っているscene path。
	for scene in source.get(IGNORED, []):
		known[String(scene)] = true
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
	var result := read(path)
	return result.get("data", {})

# 整形したJSONを書き、Editorのfile一覧へ反映する。置き場が無ければ作る。
static func _save(path: String, data: Dictionary) -> void:
	write(path, data)

# project内JSONとして安全に読み書きできるpathか判断する。
static func _valid_path(path: String) -> bool:
	if not path.begins_with("res://") or path.contains("..") or path.contains("\\") or path.get_extension().to_lower() != "json":
		return false
	for index in path.length():
		var code := path.unicode_at(index)
		if code < 32 or code == 127:
			return false
	var root := ProjectSettings.globalize_path("res://").simplify_path().trim_suffix("/")
	var file := ProjectSettings.globalize_path(path).simplify_path()
	return file.begins_with(root + "/")

# page名、Scene、URIの保存可否を判断する。
static func _page_error(data: Dictionary, old_key: String, key: String, values: Dictionary) -> String:
	if key.strip_edges().is_empty():
		return "Page name is required"
	var scenes: Dictionary = data.get("scenes", {})
	if key != old_key and scenes.has(key):
		return "Page name is already used"
	var scene := String(values.get("scene", "")).strip_edges()
	if not scene.begins_with("res://") or scene.get_extension().to_lower() not in EXTENSIONS or not FileAccess.file_exists(scene):
		return "Scene must be an existing res:// .tscn or .scn file"
	if not bool(values.get("page", true)):
		return ""
	var uri := normalize_uri(String(values.get("uri", "")))
	if uri.is_empty():
		return "URI must be an absolute site path"
	for current in scenes:
		if current != old_key and scenes[current] is Dictionary and normalize_uri(String(scenes[current].get("uri", ""))) == uri:
			return "URI is already used"
	return ""

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
