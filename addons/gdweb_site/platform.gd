# ゆるっとWebの独立Exportプラットフォーム。
# 固定runtime、PCK、HTML、site設定を一つの失敗境界で書き出す設計。

@tool
extends EditorExportPlatformExtension

const NAME := "ゆるっとWeb" # Export画面へ表示する名称。
const TEMPLATE := "res://addons/gdweb_site/templates/yurutto_web_4.7.1.zip" # 固定4.7.1 runtime。
const TEMPLATE_HASH := "res://addons/gdweb_site/templates/yurutto_web_4.7.1.sha256" # runtime識別値。
const SiteBuilder := preload("site_builder.gd") # SEOと配信物の生成処理。
const ProjectCheck := preload("project_check.gd") # 3D境界検査。
const OGP_PATH := "res://web/ogp.png" # OGP画像の既定位置。

var editor: EditorPlugin # Editor機能への接続元。

# Editorとの接続元を保持する。
func _init(owner: EditorPlugin) -> void:
	editor = owner

# 独立プラットフォーム名を返す。
func _get_name() -> String:
	return NAME

# Web向けresource overrideを選ぶ識別名を返す。
func _get_os_name() -> String:
	return "Web"

# Export一覧へ専用ロゴを返す。
func _get_logo() -> Texture2D:
	return editor.get_editor_interface().get_base_control().get_theme_icon("Web", "EditorIcons")

# 生成する主file形式をHTMLだけに限定する。
func _get_binary_extensions(_preset: EditorExportPreset) -> PackedStringArray:
	return PackedStringArray(["html"])

# project設定のWeb向けoverrideに使う基本featureを返す。
func _get_platform_features() -> PackedStringArray:
	return PackedStringArray(["web"])

# 固定runtimeの機能境界とtexture形式を返す。
func _get_preset_features(preset: EditorExportPreset) -> PackedStringArray:
	var features := PackedStringArray(["nothreads", "web_noextensions", "wasm32"])
	if bool(preset.get("vram_texture_compression/for_desktop")):
		features.append_array(PackedStringArray(["s3tc", "bptc"]))
	return features

# Editorへ表示する全設定と安全な既定値を返す。
func _get_export_options() -> Array[Dictionary]:
	return [
		_option("vram_texture_compression/for_desktop", TYPE_BOOL, true),
		_option("html/focus_canvas_on_start", TYPE_BOOL, true),
		_option("gdweb/site/enabled", TYPE_BOOL, true, PROPERTY_HINT_NONE, "", true),
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
	]

# Site無効時もDOM文字設定だけを表示する。
func _get_export_option_visibility(preset: EditorExportPreset, option: String) -> bool:
	if option == "gdweb/site/enabled" or option.begins_with("gdweb/font/"):
		return true
	return not option.begins_with("gdweb/") or bool(preset.get("gdweb/site/enabled"))

# 設定画面で直せる不足を対象項目へ表示する。
func _get_export_option_warning(preset: EditorExportPreset, option: StringName) -> String:
	var name := String(option)
	if not bool(preset.get("gdweb/site/enabled")):
		return ""
	if name == "gdweb/site/config":
		var config := String(preset.get(name))
		if config.is_empty() or not FileAccess.file_exists(config):
			return "Scene情報JSONがありません。main sceneの既定値で書き出します。"
	if name == "gdweb/site/base_url":
		var base := String(preset.get(name))
		if not base.begins_with("https://") and not base.begins_with("http://localhost") and not base.begins_with("http://127.0.0.1"):
			return "公開用base URLにはHTTPS URLを指定してください。"
	if name == "gdweb/ogp/image":
		var image := String(preset.get(name))
		if image.is_empty() or not FileAccess.file_exists(image):
			return "OGP画像がありません。OGP Autoで現在Sceneから生成できます。"
	return ""

# 内蔵runtimeと対応Godotが揃う場合だけExportを許可する。
func _has_valid_export_configuration(preset: EditorExportPreset, _debug: bool) -> bool:
	var errors: Array[String] = []
	var version := Engine.get_version_info()
	if int(version.major) != 4 or int(version.minor) != 7 or int(version.patch) != 1:
		errors.append("ゆるっとWebはGodot 4.7.1専用です。")
	if ClassDB.class_exists("CSharpScript"):
		errors.append("Godot 4.7.1のC# projectはWebへ書き出せません。")
	if not FileAccess.file_exists(TEMPLATE):
		errors.append("内蔵Web runtimeがありません。アドオンを再導入してください。")
	elif FileAccess.get_sha256(TEMPLATE) != FileAccess.get_file_as_string(TEMPLATE_HASH).strip_edges():
		errors.append("内蔵Web runtimeの内容が一致しません。")
	set_config_error("\n".join(errors))
	set_config_missing_templates(false)
	return errors.is_empty()

# main sceneが設定済みの場合だけprojectを書き出す。
func _has_valid_project_configuration(_preset: EditorExportPreset) -> bool:
	var scene := String(ProjectSettings.get_setting("application/run/main_scene", ""))
	set_config_error("main sceneを設定してください。" if scene.is_empty() else "")
	return not scene.is_empty()

# PCKと内蔵runtimeから一つのWeb siteを生成する。
func _export_project(preset: EditorExportPreset, debug: bool, path: String, flags: int) -> Error:
	if path.get_extension().to_lower() != "html":
		return _fail("Export", "出力先は.htmlを指定してください。", ERR_FILE_BAD_PATH)
	var directory := path.get_base_dir()
	var made := DirAccess.make_dir_recursive_absolute(directory)
	if made != OK:
		return _fail("Export", "出力directoryを作成できません: %s" % directory, made)
	var blocked: Array[String] = ProjectCheck.new().inspect(ProjectSettings.globalize_path("res://"))
	if not blocked.is_empty():
		return _fail("Project検査", "\n".join(blocked), ERR_UNAVAILABLE)
	var base := path.get_file().get_basename()
	var pack := path.get_basename() + ".pck"
	var saved: Dictionary = save_pack(preset, debug, pack)
	var error := int(saved.get("result", FAILED)) as Error
	if error != OK:
		return _fail("PCK", "PCKを生成できません: %s" % pack, error)
	if not saved.get("so_files", []).is_empty():
		return _fail("Runtime", "GDExtensionは固定Web runtimeで使用できません。", ERR_UNAVAILABLE)
	error = _extract(directory, base)
	if error != OK:
		return error
	error = _write_html(preset, path, base, pack, flags)
	if error != OK:
		return error
	var builder := SiteBuilder.new()
	error = builder.build(_site_options(preset), path)
	if error != OK:
		return _fail("Site生成", builder.error_message, error)
	error = _copy_licenses(directory)
	if error != OK:
		return error
	add_message(EditorExportPlatform.EXPORT_MESSAGE_INFO, "ゆるっとWeb", "独立runtimeで書き出しました: %s" % path)
	return OK

# PropertyInfo互換の一設定を生成する。
func _option(name: StringName, type: int, value: Variant, hint := PROPERTY_HINT_NONE, hint_text := "", update := false) -> Dictionary:
	return {
		"name": name,
		"type": type,
		"hint": hint,
		"hint_string": hint_text,
		"usage": PROPERTY_USAGE_DEFAULT,
		"default_value": value,
		"update_visibility": update,
	}

# Site生成に必要な値だけをpresetから複製する。
func _site_options(preset: EditorExportPreset) -> Dictionary:
	var options := {}
	for name in SiteBuilder.OPTIONS:
		options[name] = preset.get(name)
	return options

# 内蔵ZIPを安全に展開し、runtime名を出力名へ揃える。
func _extract(directory: String, base: String) -> Error:
	var zip := ZIPReader.new()
	var error := zip.open(ProjectSettings.globalize_path(TEMPLATE))
	if error != OK:
		return _fail("Runtime", "内蔵Web runtimeを開けません。", error)
	for name in zip.get_files():
		if name.ends_with("/"):
			continue
		if name.is_absolute_path() or name.contains(".."):
			zip.close()
			return _fail("Runtime", "不正なruntime pathです: %s" % name, ERR_FILE_BAD_PATH)
		var target := directory.path_join(name.replace("godot", base))
		var file := FileAccess.open(target, FileAccess.WRITE)
		if file == null:
			zip.close()
			return _fail("Runtime", "runtimeを書き込めません: %s" % target, ERR_FILE_CANT_WRITE)
		file.store_buffer(zip.read_file(name))
	zip.close()
	return OK

# runtime HTMLへ実行名、容量、Adaptive表示を設定する。
func _write_html(preset: EditorExportPreset, path: String, base: String, pack: String, flags: int) -> Error:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _fail("HTML", "runtime HTMLを読めません: %s" % path, ERR_FILE_CANT_READ)
	var html := file.get_as_text()
	var sizes := {
		pack.get_file(): _size(pack),
		"%s.wasm" % base: _size(path.get_basename() + ".wasm"),
	}
	var config := {
		"canvasResizePolicy": 2,
		"experimentalVK": false,
		"focusCanvas": bool(preset.get("html/focus_canvas_on_start")),
		"gdextensionLibs": [],
		"executable": base,
		"args": gen_export_flags(flags),
		"fileSizes": sizes,
		"ensureCrossOriginIsolationHeaders": false,
		"godotPoolSize": 0,
		"emscriptenPoolSize": 0,
	}
	var color := Color.BLACK
	var setting: Variant = preset.get_project_setting("application/boot_splash/bg_color")
	if setting is Color:
		color = setting
	var replacements := {
		"$GODOT_URL": "%s.js" % base,
		"$GODOT_PROJECT_NAME": _html(String(preset.get_project_setting("application/config/name"))),
		"$GODOT_HEAD_INCLUDE": "",
		"$GODOT_CONFIG": JSON.stringify(config).replace("<", "\\u003c"),
		"$GODOT_SPLASH_COLOR": "#%s" % color.to_html(false),
		"$GODOT_SPLASH_CLASSES": "show-image--false fullsize--false use-filter--true",
		"$GODOT_SPLASH": "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
		"$GODOT_THREADS_ENABLED": "false",
	}
	for key in replacements:
		html = html.replace(key, replacements[key])
	file = FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return _fail("HTML", "runtime HTMLを書けません: %s" % path, ERR_FILE_CANT_WRITE)
	file.store_string(html)
	return OK

# project固有licenseを成果物へそのまま伝える。
func _copy_licenses(directory: String) -> Error:
	var legacy := [directory.path_join("FONT_LICENSE.txt"), directory.path_join("godot.font.woff2")]
	for file in legacy:
		if FileAccess.file_exists(file):
			DirAccess.remove_absolute(file)
	var source := ProjectSettings.globalize_path("res://web/licenses")
	var dir := DirAccess.open(source)
	if dir == null:
		return OK
	dir.list_dir_begin()
	var name := dir.get_next()
	while not name.is_empty():
		if not dir.current_is_dir():
			var error := DirAccess.copy_absolute(source.path_join(name), directory.path_join(name))
			if error != OK:
				dir.list_dir_end()
				return _fail("License", "licenseを配置できません: %s" % name, error)
		name = dir.get_next()
	dir.list_dir_end()
	return OK

# fileのbyte数をruntime進捗表示へ渡す。
func _size(path: String) -> int:
	var file := FileAccess.open(path, FileAccess.READ)
	return file.get_length() if file else 0

# HTML本文へ安全に埋め込む文字列へ変換する。
func _html(value: String) -> String:
	return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

# Export messageとErrorを同時に返す。
func _fail(category: String, message: String, error: Error) -> Error:
	add_message(EditorExportPlatform.EXPORT_MESSAGE_ERROR, category, message)
	return error
