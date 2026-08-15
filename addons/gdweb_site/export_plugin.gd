# Web presetへsite設定とOGP自動撮影を追加する。
# 設定値をexport後処理へ渡し、Adaptive表示だけを強制する設計。

@tool
extends EditorExportPlugin

const SITE_SCRIPT := "res://addons/gdweb_site/site_export.cjs" # site生成処理。
const CAPTURE_SCRIPT := "res://addons/gdweb_site/ogp_capture.gd" # OGP撮影処理。
const OGP_PATH := "res://web/ogp.png" # Auto撮影の既定保存先。

var editor: EditorPlugin # 現在sceneとfilesystemへ接続するEditor。
var export_path := "" # export完了後に加工するHTML path。

# Editor機能を受け取ってexport拡張を構築する。
func _init(owner: EditorPlugin) -> void:
	editor = owner

# pluginを安定した識別名で登録する。
func _get_name() -> String:
	return "GDWebSite"

# Web platformだけへ設定を表示する。
func _supports_platform(platform: EditorExportPlatform) -> bool:
	return platform is EditorExportPlatformWeb

# Callableを含むWebサイト設定をExport presetへ追加する。
func _get_export_options(_platform: EditorExportPlatform) -> Array[Dictionary]:
	return [
		_option("gdweb/site/enabled", TYPE_BOOL, true),
		_option("gdweb/site/config", TYPE_STRING, "res://gdweb-site.json", PROPERTY_HINT_FILE, "*.json"),
		_option("gdweb/site/base_url", TYPE_STRING, "https://example.com"),
		_option("gdweb/site/title", TYPE_STRING, ProjectSettings.get_setting("application/config/name", "Godot Web Site")),
		_option("gdweb/site/description", TYPE_STRING, "Godotで作成したWebサイトです。"),
		_option("gdweb/site/locale", TYPE_STRING, "ja_JP"),
		_option("gdweb/site/favicon", TYPE_STRING, "", PROPERTY_HINT_FILE, "*.png,*.svg,*.ico"),
		_option("gdweb/routing/mode", TYPE_INT, 0, PROPERTY_HINT_ENUM, "Hash,History"),
		_option("gdweb/font/matching_webfont", TYPE_BOOL, true),
		_option("gdweb/font/avoid_canvas_theme_font", TYPE_BOOL, true),
		_option("gdweb/ogp/image", TYPE_STRING, OGP_PATH, PROPERTY_HINT_FILE, "*.png,*.jpg,*.jpeg,*.webp"),
		_option("gdweb/ogp/alt", TYPE_STRING, "サイトのプレビュー画像"),
		_option("gdweb/ogp/frame", TYPE_INT, 2, PROPERTY_HINT_RANGE, "1,3600,1"),
		_option("gdweb/ogp/auto", TYPE_CALLABLE, _capture_ogp, PROPERTY_HINT_TOOL_BUTTON, "OGP Auto,Image"),
	]

# CanvasをBrowser全体へ追従させるAdaptiveを常に上書きする。
func _get_export_options_overrides(_platform: EditorExportPlatform) -> Dictionary:
	return {"html/canvas_resize_policy": 2}

# 無効時はsite固有項目だけを隠し、Web font設定を独立して残す。
func _get_export_option_visibility(_platform: EditorExportPlatform, option: String) -> bool:
	if option == "gdweb/site/enabled" or option.begins_with("gdweb/font/"):
		return true
	var preset := get_export_preset()
	return preset == null or bool(preset.get("gdweb/site/enabled"))

# 設定画面で修正できるfile不足と公開URL不足を早く知らせる。
func _get_export_option_warning(_platform: EditorExportPlatform, option: String) -> String:
	var preset := get_export_preset()
	if preset == null or not bool(preset.get("gdweb/site/enabled")):
		return ""
	if option == "gdweb/site/config":
		var config: String = preset.get(option)
		if config.is_empty() or not FileAccess.file_exists(config):
			return "Scene情報JSONがありません。未指定時はmain sceneの既定値で書き出します。"
	if option == "gdweb/site/base_url":
		var base: String = preset.get(option)
		if not base.begins_with("https://") and not base.begins_with("http://localhost") and not base.begins_with("http://127.0.0.1"):
			return "公開用base URLにはHTTPS URLを指定してください。"
	if option == "gdweb/ogp/image":
		var image: String = preset.get(option)
		if image.is_empty() or not FileAccess.file_exists(image):
			return "OGP画像がありません。OGP Autoで現在Sceneから生成できます。"
	return ""

# export後処理で使う出力先を保持する。
func _export_begin(_features: PackedStringArray, _debug: bool, path: String, _flags: int) -> void:
	export_path = path

# GUI ExportでもCLIと同じ静的site生成を実行する。
func _export_end() -> void:
	if export_path.is_empty() or not FileAccess.file_exists(export_path):
		return
	var script := ProjectSettings.globalize_path(SITE_SCRIPT)
	var project := ProjectSettings.globalize_path("res://")
	var output: Array = []
	var code := OS.execute("node", PackedStringArray([script, project, export_path, "Web"]), output, true)
	if code != 0:
		push_error("GDWeb site生成失敗: %s" % "\n".join(output))
	export_path = ""

# PropertyInfo互換の一設定を短く生成する。
func _option(name: String, type: int, value: Variant, hint := PROPERTY_HINT_NONE, hint_text := "") -> Dictionary:
	return {
		"option": {"name": name, "type": type, "hint": hint, "hint_string": hint_text, "usage": PROPERTY_USAGE_EDITOR if type == TYPE_CALLABLE else PROPERTY_USAGE_DEFAULT},
		"default_value": value,
	}

# 現在sceneを指定frameまで描画し、縦横比を保った1200x630 OGP画像へ保存する。
func _capture_ogp() -> void:
	var root := editor.get_editor_interface().get_edited_scene_root()
	if root == null or root.scene_file_path.is_empty():
		push_error("OGP Autoには保存済みsceneが必要です。")
		return
	var preset := get_export_preset()
	var target: String = preset.get("gdweb/ogp/image") if preset else OGP_PATH
	if target.is_empty():
		target = OGP_PATH
		if preset:
			preset.set("gdweb/ogp/image", target)
	var frame := 2
	if preset:
		frame = clampi(int(preset.get("gdweb/ogp/frame")), 1, 3600)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(target.get_base_dir()))
	var args := PackedStringArray([
		"--path", ProjectSettings.globalize_path("res://"),
		"--resolution", "1200x630", "--position", "10000,10000",
		"--script", ProjectSettings.globalize_path(CAPTURE_SCRIPT), "--",
		"--scene=%s" % root.scene_file_path, "--output=%s" % target, "--frame=%d" % frame,
	])
	var lines: Array = []
	var code := OS.execute(OS.get_executable_path(), args, lines, true)
	if code != 0:
		push_error("OGP Auto失敗: %s" % "\n".join(lines))
		return
	editor.get_editor_interface().get_resource_filesystem().scan()
	print("OGP Auto: %s (1200x630 / %d frame)" % [target, frame])
