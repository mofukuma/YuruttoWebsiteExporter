# 一つの公開Sceneを3フレーム動かし、静的HTML用の文字と画像を採取する。
# routeごとにprocessを分け、Browser操作なしで初期状態のNode treeを読む設計。

extends SceneTree

const Snapshot := preload("site_snapshot.gd") # 文字と画像の抽出、意味の判定。
const DEFAULT_FRAME := 3 # 初期化後のNodeが揃うまで進めるframe数。

var output := "" # 親Export処理へ返す一時JSON。
var main_scene := "" # 設定表が無い場合の対象Scene。
var selected := "" # このprocessで採取する一つの公開Scene。
var frame := DEFAULT_FRAME # 各Sceneを動かすframe数。

# 引数を検査し、Scene採取を次のframeから始める。
func _initialize() -> void:
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--output="):
			output = argument.trim_prefix("--output=")
		elif argument.begins_with("--main="):
			main_scene = argument.trim_prefix("--main=")
		elif argument.begins_with("--scene="):
			selected = argument.trim_prefix("--scene=")
		elif argument.begins_with("--frame="):
			frame = maxi(int(argument.trim_prefix("--frame=")), 1)
	if output.is_empty() or main_scene.is_empty() or selected.is_empty():
		quit(ERR_INVALID_PARAMETER)
	else:
		# Desktop実行でもWeb向け分岐を選び、書き出し後のNode構成へ合わせる。
		var features := String(ProjectSettings.get_setting("_custom_features", "")).split(",", false)
		if "web" not in features:
			features.append("web")
			ProjectSettings.set_setting("_custom_features", ",".join(features))
		call_deferred("_capture")

# 指定Sceneを実行し、採取結果を一度で書き出す。
func _capture() -> void:
	var result := {}
	var packed := load(selected) as PackedScene
	if packed == null:
		quit(ERR_FILE_CANT_OPEN)
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	current_scene = scene
	for _index in frame:
		await process_frame
	result[selected] = Snapshot.new().collect(scene)
	current_scene = null
	scene.queue_free()
	await process_frame
	var file := FileAccess.open(output, FileAccess.WRITE)
	if file == null:
		quit(ERR_FILE_CANT_WRITE)
		return
	file.store_string(JSON.stringify({"version": 1, "scenes": result}, "\t") + "\n")
	file.close()
	quit()
