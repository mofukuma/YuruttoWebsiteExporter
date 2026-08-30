# Yurutto Websiteの独立Exportプラットフォーム。
# 固定テンプレート、PCK、HTML、site設定を一つの失敗境界で書き出す設計。

@tool
extends EditorExportPlatformExtension

const NAME := "Yurutto Website" # Export画面へ表示する名称。
const MANIFEST := "res://addons/yurutto_website_exporter/templates/manifest.json" # 対応版と配布テンプレートの由来。
const SiteBuilder := preload("site_builder.gd") # SEOと配信物の生成処理。
const AtomicFile := preload("atomic_file.gd") # 公開fileを欠落なく切り替える処理。
const SNAPSHOT_SCRIPT := "res://addons/yurutto_website_exporter/site_snapshot_runner.gd" # 初期HTMLへ渡すScene採取処理。
const WORK_ROOT := "res://tmp/yweb-exporter" # 公開前の組立とScene採取cacheを置く作業領域。
const SiteConfig := preload("site_config.gd") # Scene情報JSONの用意と補完。
const CONFIG_PATH := "res://yweb-site.json" # Scene情報JSONの既定位置。
const I18n := preload("i18n.gd") # 画面文言の言語選び。
const ProjectCheck := preload("project_check.gd") # 2D以下の3D境界検査。
const ProductionCheck := preload("production_check.gd") # 本番公開へ秘密と危険な通信を持ち込まない検査。
const OGP_PATH := "res://web/ogp.png" # OGP画像の既定位置。
const LEVELS := ["dom", "2d", "3d"] # 書き出しlevel。表示順とmanifestのkeyを揃える。
const LEVEL_HINT := "DOM only,2D,3D" # Export画面へ出すlevelの選択肢。
const SNAPSHOT_JOBS := 3 # Scene状態を分離しながら同時起動するGodot数。
const SNAPSHOT_TIMEOUT_MSEC := 15000 # 一Sceneの停止を待つ上限。無期限待機を防ぐ。

var editor: EditorPlugin # Editor機能への接続元。
var manifest: Dictionary # 読込済み配布テンプレート情報。
var runtime_pattern := RegEx.new() # 再生成可能なhash付き公開fileの判定式。

# Editorとの接続元を保持し、Scene情報JSONを使える状態にする。
func _init(owner: EditorPlugin) -> void:
	editor = owner
	manifest = _manifest()
	runtime_pattern.compile("^(yweb-[0-9a-f]{12}\\.(js|wasm|audio\\.worklet\\.js|audio\\.position\\.worklet\\.js)(\\.br)?|site-[0-9a-f]{12}\\.pck)$")
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

# 生成する主file形式をHTMLに限定する。
func _get_binary_extensions(_preset: EditorExportPreset) -> PackedStringArray:
	return PackedStringArray(["html"])

# project設定のWeb向けoverrideに使う基本featureを返す。
func _get_platform_features() -> PackedStringArray:
	return PackedStringArray(["web"])

# 固定テンプレートの機能境界とtexture形式を返す。
func _get_preset_features(preset: EditorExportPreset) -> PackedStringArray:
	var features := PackedStringArray(["nothreads", "web_noextensions", "wasm32", _level(preset)])
	if bool(preset.get("vram_texture_compression/for_desktop")):
		features.append_array(PackedStringArray(["s3tc", "bptc"]))
	return features

# Editorへ表示する全設定と安全な既定値を返す。
func _get_export_options() -> Array[Dictionary]:
	return [
		_option("vram_texture_compression/for_desktop", TYPE_BOOL, true), # PC向けtexture圧縮を含めるか。
		_option("html/focus_canvas_on_start", TYPE_BOOL, true), # 起動直後に操作対象をCanvasへ移すか。
		_option("yweb/level", TYPE_INT, 1, PROPERTY_HINT_ENUM, LEVEL_HINT, true), # 書き出しの段。使うテンプレートが変わる。
		_option("yweb/site/enabled", TYPE_BOOL, true, PROPERTY_HINT_NONE, "", true), # SEOとroute生成を行うか。
		_option("yweb/site/production", TYPE_BOOL, true), # HTTPSと公開前安全検査を必須にするか。
		_option("yweb/site/config", TYPE_STRING, CONFIG_PATH, PROPERTY_HINT_FILE, "*.json"), # Sceneと公開URLの対応表の位置。
		_option("yweb/site/base_url", TYPE_STRING, "https://example.com"), # 公開先の基点URL。canonicalとsitemapへ使う。
		_option("yweb/site/title", TYPE_STRING, ProjectSettings.get_setting("application/config/name", "Godot Web Site")), # pageのtitle。既定はproject名。
		_option("yweb/site/description", TYPE_STRING, I18n.t("site_description")), # 検索結果へ出る説明文。
		_option("yweb/site/locale", TYPE_STRING, "ja_JP"), # HTMLへ書く言語。
		_option("yweb/site/favicon", TYPE_STRING, "", PROPERTY_HINT_FILE, "*.png,*.svg,*.ico"), # tabへ出す小さな絵。
		_option("yweb/font/matching_webfont", TYPE_BOOL, true), # Theme fontと同名のwoff2をDOMへ適用するか。
		_option("yweb/font/avoid_canvas_theme_font", TYPE_BOOL, true), # 再現できない文字装飾をBrowser標準へ寄せるか。
		_option("yweb/ogp/image", TYPE_STRING, OGP_PATH, PROPERTY_HINT_FILE, "*.png,*.jpg,*.jpeg,*.webp"), # SNSへ出す共有画像。
		_option("yweb/ogp/alt", TYPE_STRING, I18n.t("ogp_alt")), # 共有画像の代替文字。
		_option("yweb/ogp/frame", TYPE_INT, 2, PROPERTY_HINT_RANGE, "1,3600,1"), # OGP Autoで撮る描画frame。
	]

# Site無効時もDOM文字設定は表示する。
func _get_export_option_visibility(preset: EditorExportPreset, option: String) -> bool:
	if option == "yweb/level" or option == "yweb/site/enabled" or option.begins_with("yweb/font/"):
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

# 内蔵テンプレートと対応Godotが揃う場合にExportを許可する。
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
	var level := _level(preset)
	var template := _template(level)
	if template.is_empty() or not FileAccess.file_exists(template):
		errors.append(I18n.t("no_template"))
	elif FileAccess.get_sha256(template) != String(_entry(level).get("sha256", "")):
		errors.append(I18n.t("template_changed"))
	set_config_error("\n".join(errors))
	set_config_missing_templates(false)
	return errors.is_empty()

# main sceneが設定済みの場合にprojectを書き出す。
func _has_valid_project_configuration(_preset: EditorExportPreset) -> bool:
	var scene := String(ProjectSettings.get_setting("application/run/main_scene", ""))
	set_config_error(I18n.t("need_main_scene") if scene.is_empty() else "")
	return not scene.is_empty()

# 公開先の複製でsiteを完成させ、成功した差分を公開先へ反映する。
func _export_project(preset: EditorExportPreset, debug: bool, path: String, flags: int) -> Error:
	if path.get_extension().to_lower() != "html":
		return _fail(I18n.t("topic_export"), I18n.t("need_html"), ERR_FILE_BAD_PATH)
	var directory := path.get_base_dir()
	var made := DirAccess.make_dir_recursive_absolute(directory)
	if made != OK:
		return _fail(I18n.t("topic_export"), I18n.t("no_out_dir", [directory]), made)
	var work := _work_dir("publish", directory)
	if work.is_empty():
		return _fail(I18n.t("topic_export"), I18n.t("no_out_dir", [WORK_ROOT]), ERR_CANT_CREATE)
	var stage := work.path_join("site")
	var error := _copy_tree(directory, stage, true)
	if error == OK:
		error = _build_project(preset, debug, stage.path_join(path.get_file()), flags)
	if error == OK:
		error = _publish(stage, directory, work.path_join("rollback"))
	_remove_tree(work)
	if error == OK:
		add_message(EditorExportPlatform.EXPORT_MESSAGE_INFO, NAME, I18n.t("exported", [path]))
	return error

# PCKと内蔵テンプレートから作業用Web siteを組み立てる。
func _build_project(preset: EditorExportPreset, debug: bool, path: String, flags: int) -> Error:
	var directory := path.get_base_dir()
	var level := _level(preset)
	var blocked: Array[String] = []
	# Canvas 2D版では、3D resourceを書き出す前に止める。
	if level == "2d":
		blocked = ProjectCheck.new().inspect(ProjectSettings.globalize_path("res://"))
	if not blocked.is_empty():
		return _fail(I18n.t("topic_project"), "\n".join(blocked), ERR_UNAVAILABLE)
	var site_options := _site_options(preset)
	var production_errors := ProductionCheck.new().inspect(site_options)
	if not production_errors.is_empty():
		return _fail(I18n.t("topic_project"), "\n".join(production_errors), ERR_UNAVAILABLE)
	var base := path.get_file().get_basename()
	var pack := path.get_basename() + ".pck"
	var saved: Dictionary = save_pack(preset, debug, pack)
	var error := int(saved.get("result", FAILED)) as Error
	if error != OK:
		return _fail(I18n.t("topic_pck"), I18n.t("no_pck", [pack]), error)
	if not saved.get("so_files", []).is_empty():
		return _fail(I18n.t("topic_template"), I18n.t("no_gdextension"), ERR_UNAVAILABLE)
	var snapshots := _snapshots(site_options, path, pack)
	if bool(site_options.get("yweb/site/enabled", true)) and snapshots.is_empty():
		return _fail(I18n.t("topic_site"), I18n.t("snapshot_failed"), FAILED)
	error = _extract(directory, base, level)
	if error != OK:
		return error
	var versioned := _version_runtime(directory, base, pack)
	if not versioned.has("engine"):
		return _fail(I18n.t("topic_export"), I18n.t("html_write", [path]), FAILED)
	base = versioned.engine
	pack = versioned.pack
	error = _write_html(preset, path, base, pack, flags)
	if error != OK:
		return error
	# transaction用stage内で旧世代を先に除き、容量と秘密検査を最終構成へ限定する。
	error = _clean_versions(directory, base, pack.get_file())
	if error != OK:
		return error
	error = _copy_licenses(directory)
	if error != OK:
		return error
	var builder := SiteBuilder.new()
	var quality := int(_entry(level).get("brotli", {}).get("quality", 0))
	error = builder.build(site_options, path, snapshots, base, quality)
	if error != OK:
		return _fail(I18n.t("topic_site"), builder.error_message, error)
	if bool(site_options.get("yweb/site/production", true)):
		var output_errors := ProductionCheck.new().inspect_output(directory)
		if not output_errors.is_empty():
			return _fail(I18n.t("topic_project"), "\n".join(output_errors), ERR_UNAVAILABLE)
	return OK

# 公開Sceneごとに独立したGodotを並列で3フレーム動かし、文字と画像を受け取る。
func _snapshots(options: Dictionary, path: String, pack: String) -> Dictionary:
	if not bool(options.get("yweb/site/enabled", true)):
		return {}
	var main := String(ProjectSettings.get_setting("application/run/main_scene", ""))
	var result := {}
	var scenes := _snapshot_scenes(options, main)
	var work := _work_dir("snapshots")
	if work.is_empty():
		return {}
	var jobs: Array[Dictionary] = []
	var next := 0
	while next < scenes.size() or not jobs.is_empty():
		# 起動数を抑え、page数が多いsiteでもmemory使用量を一定にする。
		while next < scenes.size() and jobs.size() < SNAPSHOT_JOBS:
			var scene := scenes[next]
			var temporary := work.path_join("%d.json" % next)
			var args := PackedStringArray([
				"--headless", "--path", path.get_base_dir(), "--main-pack", pack,
				"--script", ProjectSettings.globalize_path(SNAPSHOT_SCRIPT), "--",
				"--output=%s" % temporary, "--main=%s" % main, "--scene=%s" % scene, "--frame=3",
			])
			var process := OS.create_process(OS.get_executable_path(), args)
			if process < 0:
				_stop_jobs(jobs)
				_remove_tree(work)
				return {}
			jobs.append({"pid": process, "scene": scene, "file": temporary, "started": Time.get_ticks_msec()})
			next += 1
		# 完了したprocessを一つずつ検証し、待機中のbusy loopを避ける。
		var done := -1
		while done < 0:
			for index in jobs.size():
				if not OS.is_process_running(jobs[index].pid):
					done = index
					break
				if Time.get_ticks_msec() - int(jobs[index].started) >= SNAPSHOT_TIMEOUT_MSEC:
					_stop_jobs(jobs)
					_remove_tree(work)
					return {}
			if done < 0:
				OS.delay_msec(10)
		var job: Dictionary = jobs.pop_at(done)
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(job.file)) if OS.get_process_exit_code(job.pid) == 0 and FileAccess.file_exists(job.file) else null
		if not parsed is Dictionary or int(parsed.get("version", 0)) != 1 or not parsed.get("scenes", {}) is Dictionary or not parsed.scenes.has(job.scene):
			_stop_jobs(jobs)
			_remove_tree(work)
			return {}
		result.merge(parsed.scenes, true)
	_remove_tree(work)
	return result

# 採取失敗時に残りの子processを止める。
func _stop_jobs(jobs: Array[Dictionary]) -> void:
	for job in jobs:
		if OS.is_process_running(job.pid):
			OS.kill(job.pid)

# 公開設定から重複しないScene pathを取り出し、各processの境界にする。
func _snapshot_scenes(options: Dictionary, main: String) -> Array[String]:
	var found: Array[String] = []
	var seen := {}
	var config := String(options.get("yweb/site/config", CONFIG_PATH))
	if FileAccess.file_exists(config):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(config))
		if parsed is Dictionary and parsed.get("scenes", {}) is Dictionary:
			for entry in parsed.scenes.values():
				if entry is Dictionary and bool(entry.get("page", true)):
					var scene := String(entry.get("scene", ""))
					if scene.begins_with("res://") and not scene.contains("..") and FileAccess.file_exists(scene) and not seen.has(scene):
						found.append(scene)
						seen[scene] = true
	if found.is_empty():
		found.append(main)
	return found

# 公開先と重ならないtmpを選び、project内ではresource取込を止める。
func _work_root(avoid := "") -> String:
	var project_root := ProjectSettings.globalize_path(WORK_ROOT)
	var root := project_root
	if not avoid.is_empty() and (root == avoid or root.begins_with(avoid.trim_suffix("/") + "/")):
		root = OS.get_temp_dir().path_join("yweb-exporter")
	if DirAccess.make_dir_recursive_absolute(root) != OK:
		return ""
	if root == project_root:
		var marker := root.get_base_dir().path_join(".gdignore")
		if not FileAccess.file_exists(marker):
			var file := FileAccess.open(marker, FileAccess.WRITE)
			if file == null:
				return ""
			file.store_string("# Export作業領域をproject resourceから外す。\n")
	return root

# 一回のExportに専用の空directoryを作る。
func _work_dir(kind: String, avoid := "") -> String:
	var root := _work_root(avoid)
	if root.is_empty():
		return ""
	var directory := root.path_join("%s-%d-%d" % [kind, OS.get_process_id(), Time.get_ticks_msec()])
	_remove_tree(directory)
	return directory if DirAccess.make_dir_recursive_absolute(directory) == OK else ""

# directoryの全fileと空directoryを複製する。
func _copy_tree(source: String, target: String, skip_runtime := false) -> Error:
	var opened := DirAccess.open(source)
	if opened == null:
		return DirAccess.make_dir_recursive_absolute(target)
	var error := DirAccess.make_dir_recursive_absolute(target)
	if error != OK:
		return error
	for name in opened.get_files():
		if opened.is_link(name):
			return ERR_FILE_BAD_PATH
		if skip_runtime and _generated_runtime(name):
			continue
		error = DirAccess.copy_absolute(source.path_join(name), target.path_join(name))
		if error != OK:
			return error
	for name in opened.get_directories():
		if opened.is_link(name):
			return ERR_FILE_BAD_PATH
		error = _copy_tree(source.path_join(name), target.path_join(name))
		if error != OK:
			return error
	return OK

# 内容hash名を持つ再生成可能な大容量runtimeか判断する。
func _generated_runtime(name: String) -> bool:
	return runtime_pattern.search(name) != null

# directory以下のfileを相対pathで集める。
func _tree_files(root: String, prefix := "") -> Array[String]:
	var found: Array[String] = []
	var directory := root.path_join(prefix) if not prefix.is_empty() else root
	var opened := DirAccess.open(directory)
	if opened == null:
		return found
	for name in opened.get_files():
		if opened.is_link(name):
			continue
		found.append(prefix.path_join(name) if not prefix.is_empty() else name)
	for name in opened.get_directories():
		if opened.is_link(name):
			continue
		var child := prefix.path_join(name) if not prefix.is_empty() else name
		found.append_array(_tree_files(root, child))
	return found

# directory以下の各directoryを相対pathで集める。
func _tree_dirs(root: String, prefix := "") -> Array[String]:
	var found: Array[String] = []
	var directory := root.path_join(prefix) if not prefix.is_empty() else root
	var opened := DirAccess.open(directory)
	if opened == null:
		return found
	for name in opened.get_directories():
		if opened.is_link(name):
			continue
		var child := prefix.path_join(name) if not prefix.is_empty() else name
		found.append(child)
		found.append_array(_tree_dirs(root, child))
	return found

# 完成済みfileとの差分を退避してから公開し、失敗時は元へ戻す。
func _publish(stage: String, live: String, rollback: String) -> Error:
	var wanted := _tree_files(stage)
	var current := _tree_files(live)
	var current_dirs := _tree_dirs(live)
	var wanted_set := {}
	for relative in wanted:
		wanted_set[relative] = true
	var writes: Array[String] = []
	var deletes: Array[String] = []
	for relative in wanted:
		var source := stage.path_join(relative)
		var target := live.path_join(relative)
		if not FileAccess.file_exists(target) or FileAccess.get_sha256(source) != FileAccess.get_sha256(target):
			writes.append(relative)
	for relative in current:
		if not wanted_set.has(relative):
			deletes.append(relative)
	writes.sort_custom(func(a: String, b: String) -> bool: return _publish_order(a) < _publish_order(b))
	var changed := writes + deletes
	if changed.is_empty():
		_remove_missing_dirs(live, _tree_dirs(stage))
		return OK
	DirAccess.make_dir_recursive_absolute(rollback)
	# 変更対象を先に全退避し、途中失敗から公開中の組合せを復元できるようにする。
	for relative in changed:
		var target := live.path_join(relative)
		if not FileAccess.file_exists(target):
			continue
		var backup := rollback.path_join(relative)
		var error := DirAccess.make_dir_recursive_absolute(backup.get_base_dir())
		if error == OK:
			error = DirAccess.copy_absolute(target, backup)
		if error != OK:
			return error
	var prepared: Array[Dictionary] = []
	var error := OK
	for index in range(writes.size()):
		var relative := writes[index]
		var item := _prepare_file(stage.path_join(relative), live.path_join(relative), index)
		error = item.error
		if error != OK:
			_clean_prepared(prepared)
			return error
		prepared.append(item)
	error = AtomicFile.replace_all(prepared)
	_clean_prepared(prepared)
	if error != OK:
		var restored := _restore_publish(live, rollback, changed, current_dirs)
		return error if restored == OK else restored
	# 新HTMLが参照する資源を全て置いた後に、旧hash世代と削除pageを回収する。
	for relative in deletes:
		var target := live.path_join(relative)
		if FileAccess.file_exists(target):
			error = DirAccess.remove_absolute(target)
		if error != OK:
			var restored := _restore_publish(live, rollback, changed, current_dirs)
			return error if restored == OK else restored
	_remove_missing_dirs(live, _tree_dirs(stage))
	return OK

# 公開中HTMLの参照切れを避けるため、資源、設定、HTMLの順へ並べる。
func _publish_order(relative: String) -> int:
	if relative.get_extension().to_lower() == "html":
		return 2
	if relative.get_file() in ["yweb-site.json", "yweb-security.json", "_headers", "sitemap.xml", "robots.txt"]:
		return 1
	return 0

# 公開元を同一volumeの一時fileへ複製し、まとめて原子的に切り替えられる形にする。
func _prepare_file(source: String, target: String, index: int) -> Dictionary:
	var error := DirAccess.make_dir_recursive_absolute(target.get_base_dir())
	if error != OK:
		return {"error": error}
	var temporary := "%s.yweb-%d-%d-%d" % [target, OS.get_process_id(), Time.get_ticks_msec(), index]
	if FileAccess.file_exists(temporary):
		DirAccess.remove_absolute(temporary)
	error = DirAccess.copy_absolute(source, temporary)
	if error != OK:
		push_error(I18n.t("publish_copy", [source, temporary, error]))
		if FileAccess.file_exists(temporary):
			DirAccess.remove_absolute(temporary)
		return {"error": error}
	return {"error": OK, "source": temporary, "target": target}

# 切替に使われず残った一時fileを回収する。
func _clean_prepared(items: Array[Dictionary]) -> void:
	for item in items:
		if FileAccess.file_exists(item.source):
			DirAccess.remove_absolute(item.source)

# 公開反映に失敗したfileを、欠落時間を作らず退避内容へ戻す。
func _restore_publish(live: String, rollback: String, changed: Array[String], directories: Array[String]) -> Error:
	var restores: Array[String] = []
	var additions: Array[String] = []
	for relative in changed:
		if FileAccess.file_exists(rollback.path_join(relative)):
			restores.append(relative)
		else:
			additions.append(relative)
	restores.sort_custom(func(a: String, b: String) -> bool: return _publish_order(a) < _publish_order(b))
	var prepared: Array[Dictionary] = []
	for index in range(restores.size()):
		var relative := restores[index]
		var item := _prepare_file(rollback.path_join(relative), live.path_join(relative), index)
		var error: Error = item.error
		if error != OK:
			_clean_prepared(prepared)
			return error
		prepared.append(item)
	var error := AtomicFile.replace_all(prepared)
	_clean_prepared(prepared)
	if error != OK:
		return error
	# 旧HTMLを復元してから、旧公開物に存在しなかった追加fileを回収する。
	for relative in additions:
		var target := live.path_join(relative)
		if FileAccess.file_exists(target):
			error = DirAccess.remove_absolute(target)
			if error != OK:
				return error
	_remove_missing_dirs(live, directories)
	return OK

# 完成側にない空directoryを深い位置から回収する。
func _remove_missing_dirs(root: String, keep: Array[String]) -> void:
	var current := _tree_dirs(root)
	var kept := {}
	for relative in keep:
		kept[relative] = true
	current.reverse()
	for relative in current:
		if kept.has(relative):
			continue
		var directory := root.path_join(relative)
		var opened := DirAccess.open(directory)
		if opened and opened.get_files().is_empty() and opened.get_directories().is_empty():
			DirAccess.remove_absolute(directory)

# 作業directoryを中身から再帰的に回収する。
func _remove_tree(path: String) -> void:
	var directory := DirAccess.open(path)
	if directory == null:
		return
	for name in directory.get_files():
		DirAccess.remove_absolute(path.path_join(name))
	for name in directory.get_directories():
		var child := path.path_join(name)
		if directory.is_link(name):
			DirAccess.remove_absolute(child)
		else:
			_remove_tree(child)
	DirAccess.remove_absolute(path)

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

# Site生成に必要な値をpresetから複製する。
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

# presetが選んだlevelを返す。範囲外は2Dへ寄せる。
func _level(preset: EditorExportPreset) -> String:
	var index := int(preset.get("yweb/level"))
	return LEVELS[index] if index >= 0 and index < LEVELS.size() else "2d"

# 指定levelのmanifest項目を返す。
func _entry(level: String) -> Dictionary:
	return manifest.get("templates", {}).get(level, {})

# manifestが指すaddon内templateを返す。
func _template(level: String) -> String:
	var name := String(_entry(level).get("file", ""))
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
func _extract(directory: String, base: String, level: String) -> Error:
	var zip := ZIPReader.new()
	var error := zip.open(ProjectSettings.globalize_path(_template(level)))
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

# エンジンとサイト内容へ別hashを付け、scene更新時もWASMのURLを保つ。
func _version_runtime(directory: String, base: String, pack: String) -> Dictionary:
	var engine_files: Array[String] = [
		directory.path_join("%s.js" % base), directory.path_join("%s.wasm" % base),
		directory.path_join("%s.audio.worklet.js" % base), directory.path_join("%s.audio.position.worklet.js" % base),
	] # 同じ実行名で参照される共有エンジンfile。
	for file in engine_files:
		if not FileAccess.file_exists(file):
			return {}
	var engine: String = "yweb-%s" % _files_hash(engine_files)
	var site_pack: String = directory.path_join("site-%s.pck" % FileAccess.get_sha256(pack).substr(0, 12))
	for source: String in engine_files:
		var suffix: String = source.get_file().trim_prefix(base)
		for extra: String in ["", ".br"]:
			var current: String = source + extra
			if not FileAccess.file_exists(current):
				continue
			var target: String = directory.path_join(engine + suffix + extra)
			# 同じ内容は維持し、品質変更で圧縮内容が変われば同名fileを更新する。
			if FileAccess.file_exists(target):
				if FileAccess.get_sha256(current) == FileAccess.get_sha256(target):
					DirAccess.remove_absolute(current)
					continue
				if DirAccess.remove_absolute(target) != OK:
					return {}
			if DirAccess.rename_absolute(current, target) != OK:
				return {}
	if FileAccess.file_exists(site_pack):
		DirAccess.remove_absolute(pack)
	elif DirAccess.rename_absolute(pack, site_pack) != OK:
		return {}
	return {"engine": engine, "pack": site_pack}

# file内容のSHA-256を順番込みでまとめ、短い公開名へ使う。
func _files_hash(files: Array) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	for file in files:
		context.update(FileAccess.get_sha256(file).to_utf8_buffer())
	return context.finish().hex_encode().substr(0, 12)

# 成功した世代を残し、専用hash名の旧成果物を回収する。
func _clean_versions(directory: String, engine: String, pack: String) -> Error:
	var pattern := RegEx.new()
	pattern.compile("^(yweb-[0-9a-f]{12}\\.(js|wasm|audio\\.worklet\\.js|audio\\.position\\.worklet\\.js)(\\.br)?|site-[0-9a-f]{12}\\.pck)$")
	var dir := DirAccess.open(directory)
	if dir == null:
		return ERR_FILE_CANT_OPEN
	dir.list_dir_begin()
	var name := dir.get_next()
	while not name.is_empty():
		if not dir.current_is_dir() and pattern.search(name) and not name.begins_with(engine + ".") and name != pack:
			var error := DirAccess.remove_absolute(directory.path_join(name))
			if error != OK:
				dir.list_dir_end()
				return error
		name = dir.get_next()
	dir.list_dir_end()
	return OK

# テンプレートHTMLへ実行名、容量、Adaptive表示、WASM/PCK先行取得を設定する。
func _write_html(preset: EditorExportPreset, path: String, base: String, pack: String, flags: int) -> Error:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return _fail(I18n.t("topic_html"), I18n.t("html_read", [path]), ERR_FILE_CANT_READ)
	var html := file.get_as_text()
	var sizes := {
		pack.get_file(): _size(pack),
		"%s.wasm" % base: _size(path.get_base_dir().path_join("%s.wasm" % base)),
	}
	var config := {
		"canvasResizePolicy": 2,
		"experimentalVK": false,
		"focusCanvas": bool(preset.get("html/focus_canvas_on_start")),
		"gdextensionLibs": [],
		"executable": base,
		"mainPack": pack.get_file(),
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
		"$GODOT_HEAD_INCLUDE": "<link rel=\"preload\" href=\"%s.wasm\" as=\"fetch\" type=\"application/wasm\" crossorigin=\"anonymous\">\n\t\t<link rel=\"preload\" href=\"%s\" as=\"fetch\" crossorigin=\"anonymous\">" % [base, pack.get_file()],
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

# project固有licenseを専用directoryへ伝え、公開成果物との名前衝突を防ぐ。
func _copy_licenses(directory: String) -> Error:
	var source := ProjectSettings.globalize_path("res://web/licenses")
	var target := directory.path_join("licenses")
	if DirAccess.dir_exists_absolute(target):
		_remove_tree(target)
		if DirAccess.dir_exists_absolute(target):
			return _fail(I18n.t("topic_license"), I18n.t("license_copy", [target]), ERR_CANT_CREATE)
	var dir := DirAccess.open(source)
	if dir == null:
		return OK
	var made := DirAccess.make_dir_recursive_absolute(target)
	if made != OK:
		return _fail(I18n.t("topic_license"), I18n.t("license_copy", [target]), made)
	dir.list_dir_begin()
	var name := dir.get_next()
	while not name.is_empty():
		if not dir.current_is_dir() and not dir.is_link(name) and name == name.get_file() and name not in [".", ".."]:
			var error := DirAccess.copy_absolute(source.path_join(name), target.path_join(name))
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
