# Yurutto Websiteの独立Exportプラットフォーム。
# 固定テンプレート、PCK、HTML、site設定を一つの失敗境界で書き出す設計。

@tool
extends EditorExportPlatformExtension

const NAME := "Yurutto Website" # Export画面へ表示する名称。
const MANIFEST := "res://addons/yurutto_website_exporter/templates/manifest-3d.json" # 対応版と配布テンプレートの由来。
const SiteBuilder := preload("site_builder.gd") # SEOと配信物の生成処理。
const SiteConfig := preload("site_config.gd") # Scene情報JSONの用意と補完。
const CONFIG_PATH := "res://yweb-site.json" # Scene情報JSONの既定位置。
const I18n := preload("i18n.gd") # 画面文言の言語選び。
const ProjectCheck := preload("project_check.gd") # 受け入れ境界検査。
const OGP_PATH := "res://web/ogp.png" # OGP画像の既定位置。

var editor: EditorPlugin # Editor機能への接続元。
var manifest: Dictionary # 読込済み配布テンプレート情報。

# Editorとの接続元を保持し、Scene情報JSONを使える状態にする。
func _init(owner: EditorPlugin) -> void:
	editor = owner
	manifest = _manifest()
	SiteConfig.ensure_all(CONFIG_PATH)

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

# 固定テンプレートの機能境界とtexture形式を返す。
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
		_option("yweb/site/enabled", TYPE_BOOL, true, PROPERTY_HINT_NONE, "", true),
		_option("yweb/site/config", TYPE_STRING, CONFIG_PATH, PROPERTY_HINT_FILE, "*.json"),
		_option("yweb/site/base_url", TYPE_STRING, "https://example.com"),
		_option("yweb/site/title", TYPE_STRING, ProjectSettings.get_setting("application/config/name", "Godot Web Site")),
		_option("yweb/site/description", TYPE_STRING, I18n.t("site_description")),
		_option("yweb/site/locale", TYPE_STRING, "ja_JP"),
		_option("yweb/site/favicon", TYPE_STRING, "", PROPERTY_HINT_FILE, "*.png,*.svg,*.ico"),
		_option("yweb/routing/mode", TYPE_INT, 0, PROPERTY_HINT_ENUM, "Hash,History"),
		_option("yweb/font/matching_webfont", TYPE_BOOL, true),
		_option("yweb/font/avoid_canvas_theme_font", TYPE_BOOL, true),
		_option("yweb/ogp/image", TYPE_STRING, OGP_PATH, PROPERTY_HINT_FILE, "*.png,*.jpg,*.jpeg,*.webp"),
		_option("yweb/ogp/alt", TYPE_STRING, I18n.t("ogp_alt")),
		_option("yweb/ogp/frame", TYPE_INT, 2, PROPERTY_HINT_RANGE, "1,3600,1"),
	]

# Site無効時もDOM文字設定だけを表示する。
func _get_export_option_visibility(preset: EditorExportPreset, option: String) -> bool:
	if option == "yweb/site/enabled" or option.begins_with("yweb/font/"):
		return true
	return not option.begins_with("yweb/") or bool(preset.get("yweb/site/enabled"))

# 設定画面で直せる不足を対象項目へ表示する。
func _get_export_option_warning(preset: EditorExportPreset, option: StringName) -> String:
	var name := String(option)
	if not bool(preset.get("yweb/site/enabled")):
		return ""
	if name == "yweb/site/config":
		var config := String(preset.get(name))
		if config.is_empty() or not FileAccess.file_exists(config):
			return I18n.t("warn_no_config")
	if name == "yweb/site/base_url":
		var base := String(preset.get(name))
		if not base.begins_with("https://") and not base.begins_with("http://localhost") and not base.begins_with("http://127.0.0.1"):
			return I18n.t("warn_https")
	if name == "yweb/ogp/image":
		var image := String(preset.get(name))
		if image.is_empty() or not FileAccess.file_exists(image):
			return I18n.t("warn_no_ogp")
	return ""

# 内蔵テンプレートと対応Godotが揃う場合だけExportを許可する。
func _has_valid_export_configuration(preset: EditorExportPreset, _debug: bool) -> bool:
	var errors: Array[String] = []
	var version := Engine.get_version_info()
	var supported := String(manifest.get("godot", {}).get("version", ""))
	if manifest.is_empty():
		errors.append(I18n.t("no_manifest"))
	elif not _version_matches(version, manifest.godot):
		errors.append(I18n.t("godot_mismatch", [supported]))
	if ClassDB.class_exists("CSharpScript"):
		errors.append(I18n.t("no_csharp", [supported]))
	var template := _template()
	if template.is_empty() or not FileAccess.file_exists(template):
		errors.append(I18n.t("no_template"))
	elif FileAccess.get_sha256(template) != String(manifest.get("template", {}).get("sha256", "")):
		errors.append(I18n.t("template_changed"))
	set_config_error("\n".join(errors))
	set_config_missing_templates(false)
	return errors.is_empty()

# main sceneが設定済みの場合だけprojectを書き出す。
func _has_valid_project_configuration(_preset: EditorExportPreset) -> bool:
	var scene := String(ProjectSettings.get_setting("application/run/main_scene", ""))
	set_config_error(I18n.t("need_main_scene") if scene.is_empty() else "")
	return not scene.is_empty()

# PCKと内蔵テンプレートから一つのWeb siteを生成する。
func _export_project(preset: EditorExportPreset, debug: bool, path: String, flags: int) -> Error:
	if path.get_extension().to_lower() != "html":
		return _fail(I18n.t("topic_export"), I18n.t("need_html"), ERR_FILE_BAD_PATH)
	var directory := path.get_base_dir()
	var made := DirAccess.make_dir_recursive_absolute(directory)
	if made != OK:
		return _fail(I18n.t("topic_export"), I18n.t("no_out_dir", [directory]), made)
	var blocked: Array[String] = ProjectCheck.new().inspect(ProjectSettings.globalize_path("res://"))
	if not blocked.is_empty():
		return _fail(I18n.t("topic_project"), "\n".join(blocked), ERR_UNAVAILABLE)
	var base := path.get_file().get_basename()
	var pack := path.get_basename() + ".pck"
	var saved: Dictionary = save_pack(preset, debug, pack)
	var error := int(saved.get("result", FAILED)) as Error
	if error != OK:
		return _fail(I18n.t("topic_pck"), I18n.t("no_pck", [pack]), error)
	if not saved.get("so_files", []).is_empty():
		return _fail(I18n.t("topic_template"), I18n.t("no_gdextension"), ERR_UNAVAILABLE)
	error = _extract(directory, base)
	if error != OK:
		return error
	error = _write_html(preset, path, base, pack, flags)
	if error != OK:
		return error
	var builder := SiteBuilder.new()
	error = builder.build(_site_options(preset), path)
	if error != OK:
		return _fail(I18n.t("topic_site"), builder.error_message, error)
	error = _copy_licenses(directory)
	if error != OK:
		return error
	add_message(EditorExportPlatform.EXPORT_MESSAGE_INFO, NAME, I18n.t("exported", [path]))
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

# 配布manifestを安全なJSON objectとして読む。
func _manifest() -> Dictionary:
	if not FileAccess.file_exists(MANIFEST):
		return {}
	var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(MANIFEST))
	return value if value is Dictionary and int(value.get("schema", 0)) == 1 else {}

# manifestが指すaddon内templateだけを返す。
func _template() -> String:
	var name := String(manifest.get("template", {}).get("file", ""))
	if name.is_empty() or name != name.get_file() or name.get_extension() != "zip":
		return ""
	return "res://addons/yurutto_website_exporter/templates/%s" % name

# Editorとテンプレートで、Godot版とcommitが同じか判断する。
func _version_matches(version: Dictionary, godot: Dictionary) -> bool:
	var expected := String(godot.get("version", ""))
	var dash := expected.rfind("-")
	if dash < 0:
		return false
	var parts := expected.substr(0, dash).split(".")
	if parts.size() != 3:
		return false
	if int(version.get("major", -1)) != int(parts[0]) or int(version.get("minor", -1)) != int(parts[1]) or int(version.get("patch", -1)) != int(parts[2]):
		return false
	if String(version.get("status", "")) != expected.substr(dash + 1):
		return false
	var current := String(version.get("hash", ""))
	var commit := String(godot.get("commit", ""))
	return not current.is_empty() and (commit.begins_with(current) or current.begins_with(commit))

# 内蔵ZIPを安全に展開し、テンプレート名を出力名へ揃える。
func _extract(directory: String, base: String) -> Error:
	var zip := ZIPReader.new()
	var error := zip.open(ProjectSettings.globalize_path(_template()))
	if error != OK:
		return _fail(I18n.t("topic_template"), I18n.t("template_open"), error)
	for name in zip.get_files():
		if name.ends_with("/"):
			continue
		if name.is_absolute_path() or name.contains(".."):
			zip.close()
			return _fail(I18n.t("topic_template"), I18n.t("template_path", [name]), ERR_FILE_BAD_PATH)
		var target := directory.path_join(name.replace("godot", base))
		var file := FileAccess.open(target, FileAccess.WRITE)
		if file == null:
			zip.close()
			return _fail(I18n.t("topic_template"), I18n.t("template_write", [target]), ERR_FILE_CANT_WRITE)
		file.store_buffer(zip.read_file(name))
	zip.close()
	return OK

# テンプレートHTMLへ実行名、容量、Adaptive表示を設定する。
func _write_html(preset: EditorExportPreset, path: String, base: String, pack: String, flags: int) -> Error:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _fail(I18n.t("topic_html"), I18n.t("html_read", [path]), ERR_FILE_CANT_READ)
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
		return _fail(I18n.t("topic_html"), I18n.t("html_write", [path]), ERR_FILE_CANT_WRITE)
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
				return _fail(I18n.t("topic_license"), I18n.t("license_copy", [name]), error)
		name = dir.get_next()
	dir.list_dir_end()
	return OK

# fileのbyte数を読み込み進捗表示へ渡す。
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
