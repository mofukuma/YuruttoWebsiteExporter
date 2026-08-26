# Scene情報JSONの自動生成と補完を、Godot内で一度に確かめる入口。
# 生成、順序、既存値の保護、再実行時の無変更を同じprojectで通して見る。

@tool
extends SceneTree

const SiteConfig := preload("res://addons/yurutto_website_exporter/site_config.gd") # 検査対象。
const PATH := "res://yweb-site.json" # 生成先。

# 生成、追記、保護の順に確かめ、結果をJSONで出す。
func _init() -> void:
	var result := {}

	# 何も無い状態からmain sceneだけが載る。
	SiteConfig.ensure(PATH)
	var first := _read()
	result["version"] = first.get("version", 0)
	result["first_keys"] = first.scenes.keys()
	result["first_uri"] = first.scenes[first.scenes.keys()[0]].get("uri", "")
	result["minimal"] = first.scenes[first.scenes.keys()[0]].keys()

	# 追加Sceneはfile容量の多い順で後ろへ並ぶ。file名は変換せずURIへ使う。
	_make("res://big.tscn", 4000)
	_make("res://NewsList.tscn", 2000)
	_make("res://small.tscn", 100)
	SiteConfig.ensure(PATH)
	var second := _read()
	result["order"] = second.scenes.keys()
	result["uris"] = second.scenes.keys().map(func(k: String) -> String: return second.scenes[k].uri)

	# 手で書いた値は再実行でも残る。
	second.scenes[second.scenes.keys()[0]]["title"] = "手書きの題名"
	_write(second)
	SiteConfig.ensure(PATH)
	var third := _read()
	result["kept_title"] = third.scenes[third.scenes.keys()[0]].get("title", "")
	result["stable"] = third.scenes.keys() == second.scenes.keys()

	# presetが別pathを指す場合もそちらへ用意する。
	SiteConfig.ensure_all(PATH)
	var custom: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://web/pages.json"))
	result["custom_keys"] = custom.scenes.keys() if custom is Dictionary else []
	result["preferred"] = SiteConfig.paths(PATH)[0]

	print(JSON.stringify(result))
	quit()

# 生成物を読む。
func _read() -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string(PATH))

# 生成物を書き戻す。
func _write(data: Dictionary) -> void:
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	file.store_string(JSON.stringify(data, "\t", false))
	file.close()

# 指定容量の空Sceneを作る。
func _make(path: String, bytes: int) -> void:
	var file := FileAccess.open(path, FileAccess.WRITE)
	file.store_string('[gd_scene format=3]\n\n[node name="Root" type="Node"]\n')
	file.store_string("; %s\n" % "x".repeat(bytes))
	file.close()
