# 比較用に、sceneを決まった大きさと決まったframeでPNGへ写し取る。
# Web側と同じ条件で撮るための、Godot側の見本を作る入口。

extends SceneTree

var scene_path := "" # 撮影するscene resource。
var output_path := "" # 保存するPNGの実path。
var capture_frame := 12 # 撮影する描画frame番号。動きが落ち着くまで待つ。

# 引数を読み、描画開始を次のloopへ送る。
func _initialize() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--scene="):
			scene_path = arg.trim_prefix("--scene=")
		elif arg.begins_with("--output="):
			output_path = arg.trim_prefix("--output=")
		elif arg.begins_with("--frame="):
			capture_frame = clampi(int(arg.trim_prefix("--frame=")), 1, 3600)
	call_deferred("_capture")

# Sceneを決まったframeまで進め、画面をそのままPNGにする。
func _capture() -> void:
	var packed := load(scene_path) as PackedScene
	if packed == null or output_path.is_empty():
		printerr("sceneとoutputを指定してください。")
		quit(1)
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	current_scene = scene
	# 毎frame同じ時間が進んだことにして、動きのある作品でも同じ絵になるようにする。
	Engine.time_scale = 0.0
	for _index in range(capture_frame):
		await process_frame
		await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	DirAccess.make_dir_recursive_absolute(output_path.get_base_dir())
	var error := image.save_png(output_path)
	print(JSON.stringify({"width": image.get_width(), "height": image.get_height(), "output": output_path}))
	quit(0 if error == OK else 1)
