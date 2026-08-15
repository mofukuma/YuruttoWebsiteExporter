# ゆるっとWebのOGP Autoボタン。
# 選択中presetのScene、保存先、撮影frameをEditorから撮影処理へ渡す。

@tool
extends EditorExportPlugin

const CAPTURE_SCRIPT := "res://addons/gdweb_site/ogp_capture.gd" # OGP撮影処理。
const OGP_PATH := "res://web/ogp.png" # 未指定時の保存先。
const PLATFORM := preload("res://addons/gdweb_site/platform.gd") # 対象platformの識別子。

var editor: EditorPlugin # 現在Sceneとfilesystemへの接続元。

# Editor機能を受け取る。
func _init(owner: EditorPlugin) -> void:
	editor = owner

# pluginを安定した識別名で登録する。
func _get_name() -> String:
	return "YuruttoWebOGP"

# ゆるっとWebだけへ撮影ボタンを追加する。
func _supports_platform(platform: EditorExportPlatform) -> bool:
	return platform.get_script() == PLATFORM

# OGP AutoをExport設定内へ表示する。
func _get_export_options(_platform: EditorExportPlatform) -> Array[Dictionary]:
	return [{
		"option": {
			"name": "gdweb/ogp/auto",
			"type": TYPE_CALLABLE,
			"hint": PROPERTY_HINT_TOOL_BUTTON,
			"hint_string": "OGP Auto,Image",
			"usage": PROPERTY_USAGE_EDITOR,
		},
		"default_value": _capture_ogp,
	}]

# Site無効時は撮影ボタンを隠す。
func _get_export_option_visibility(_platform: EditorExportPlatform, _option: String) -> bool:
	var preset := get_export_preset()
	return preset == null or bool(preset.get("gdweb/site/enabled"))

# 現在Sceneを指定frameまで描画し、縦横比を保った1200x630画像へ保存する。
func _capture_ogp() -> void:
	var root := editor.get_editor_interface().get_edited_scene_root()
	if root == null or root.scene_file_path.is_empty():
		push_error("OGP Autoには保存済みsceneが必要です。")
		return
	var preset := get_export_preset()
	var target := String(preset.get("gdweb/ogp/image")) if preset else OGP_PATH
	if target.is_empty():
		target = OGP_PATH
		if preset:
			preset.set("gdweb/ogp/image", target)
	var frame := clampi(int(preset.get("gdweb/ogp/frame")), 1, 3600) if preset else 2
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(target.get_base_dir()))
	var args := PackedStringArray([
		"--path", ProjectSettings.globalize_path("res://"),
		"--resolution", "1200x630", "--position", "10000,10000",
		"--script", ProjectSettings.globalize_path(CAPTURE_SCRIPT), "--",
		"--scene=%s" % root.scene_file_path, "--output=%s" % target, "--frame=%d" % frame,
	])
	var output: Array = []
	var code := OS.execute(OS.get_executable_path(), args, output, true)
	if code != 0:
		push_error("OGP Auto失敗: %s" % "\n".join(output))
		return
	editor.get_editor_interface().get_resource_filesystem().scan()
	print("OGP Auto: %s (1200x630 / %d frame)" % [target, frame])
