# 指定sceneの選択frameをOGP推奨比率のPNGへ保存する。
# 元画像を中央切り抜きし、変形せず1200x630を満たす設計。

extends SceneTree

const WIDTH := 1200 # OGP画像の横寸法。
const HEIGHT := 630 # OGP画像の縦寸法。

var scene_path := "" # 撮影するscene resource。
var output_path := "" # 保存するPNG resource path。
var capture_frame := 2 # 撮影する描画frame番号。

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

# 元画像を中央基準で拡大・切り抜きし、縦横比を維持する。
func _cover(image: Image) -> Image:
	if image.get_width() == WIDTH and image.get_height() == HEIGHT:
		return image
	var scale := maxf(float(WIDTH) / image.get_width(), float(HEIGHT) / image.get_height())
	var scaled := Vector2i(ceili(image.get_width() * scale), ceili(image.get_height() * scale))
	image.resize(scaled.x, scaled.y, Image.INTERPOLATE_LANCZOS)
	var offset := Vector2i((scaled.x - WIDTH) / 2, (scaled.y - HEIGHT) / 2)
	return image.get_region(Rect2i(offset, Vector2i(WIDTH, HEIGHT)))

# Sceneを指定frameまで描画し、正確な寸法でPNG化する。
func _capture() -> void:
	var packed := load(scene_path) as PackedScene
	if packed == null or output_path.is_empty():
		push_error("OGP撮影引数が不正です。")
		quit(1)
		return
	var scene := packed.instantiate()
	root.add_child(scene)
	current_scene = scene
	for _index in range(capture_frame):
		await process_frame
		await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	var source := Vector2i(image.get_width(), image.get_height())
	image = _cover(image)
	var absolute := ProjectSettings.globalize_path(output_path)
	DirAccess.make_dir_recursive_absolute(absolute.get_base_dir())
	var error := image.save_png(absolute)
	print(JSON.stringify({"frame": capture_frame, "width": image.get_width(), "height": image.get_height(), "source_width": source.x, "source_height": source.y, "output": output_path}))
	quit(0 if error == OK else 1)
