# 本番公開前に、通信条件、外部資源、秘密情報、課金導線の境界を検査する。
# Browserへ渡してはいけない情報をPCK生成前に止め、静的frontと信頼できるserverを分離する設計。

extends RefCounted

const I18n := preload("i18n.gd") # 公開前の拒否理由を利用者の言語へ揃える。
const SKIP_DIRS := [".git", ".godot", "tmp"] # 生成物と履歴を公開前検査から外すdirectory。
const MAX_SCAN_BYTES := 2 * 1024 * 1024 # 非文字fileを検査対象から外す容量境界。
const INTEGRITY := "^sha(256|384|512)-[A-Za-z0-9+/]+={0,2}$" # Browserが受理するSRI形式。
const TEXT_EXTENSIONS := ["cfg", "css", "env", "gd", "gdshader", "html", "ini", "js", "json", "md", "svg", "toml", "tscn", "tres", "txt", "xml", "yaml", "yml"] # 大容量でも検査する文字file。
const OUTPUT_EXTENSIONS := ["css", "html", "js", "json", "pck", "txt", "xml"] # snapshot後に秘密を再検査する成果物。
const SECRET_PATTERNS := {
	"Stripe secret key": "s" + "k_(live|test)_[A-Za-z0-9]{16,}",
	"Stripe restricted key": "r" + "k_(live|test)_[A-Za-z0-9]{16,}",
	"Stripe webhook secret": "w" + "hsec_[A-Za-z0-9]{16,}",
	"private key": "-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----",
	"AWS access key": "A" + "KIA[0-9A-Z]{16}",
} # Browserへ渡してはいけない代表的な秘密形式。

var errors: Array[String] = [] # Exportを止める理由。
var secret_patterns := {} # 大きい成果物でも正規表現を再compileしない検査器。

# 本番設定とproject全体を一度に検査し、公開可能なら空配列を返す。
func inspect(options: Dictionary) -> Array[String]:
	errors.clear()
	if not bool(options.get("yweb/site/production", true)):
		return errors
	if not bool(options.get("yweb/site/enabled", true)):
		errors.append(I18n.t("production_site_enabled"))
	else:
		var base := String(options.get("yweb/site/base_url", "")).strip_edges()
		if not _secure_url(base, true):
			errors.append(I18n.t("production_https", [base]))
		var source := _config(String(options.get("yweb/site/config", "res://yweb-site.json")))
		if not source.is_empty():
			_check_assets(source)
			_check_commerce(source)
	_scan(ProjectSettings.globalize_path("res://").trim_suffix("/"))
	return errors

# snapshotとPCK生成後の最終成果物を再検査する。
func inspect_output(root: String) -> Array[String]:
	errors.clear()
	_scan(root, false, OUTPUT_EXTENSIONS)
	return errors

# JSON設定をproject外へ出さず読み込む。
func _config(value: String) -> Dictionary:
	if not value.begins_with("res://") or value.contains(".."):
		errors.append(I18n.t("production_config_path", [value]))
		return {}
	var file := ProjectSettings.globalize_path(value)
	if not FileAccess.file_exists(file):
		return {}
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(file))
	if not parsed is Dictionary:
		errors.append(I18n.t("production_config_object", [value]))
		return {}
	return parsed

# 外部scriptとstyleをHTTPS、SRI、匿名CORS付きに限定する。
func _check_assets(source: Dictionary) -> void:
	var groups: Array = []
	var site: Dictionary = source.get("site", {})
	groups.append_array([site.get("styles", []), site.get("scripts", [])])
	for scene in source.get("scenes", {}).values():
		if scene is Dictionary:
			groups.append_array([scene.get("styles", []), scene.get("scripts", [])])
	var pattern := RegEx.new()
	pattern.compile(INTEGRITY)
	for group in groups:
		if not group is Array:
			continue
		for value in group:
			var item: Dictionary = value if value is Dictionary else {}
			var url := String(item.get("href", item.get("src", value if value is String else ""))).strip_edges()
			var scheme := RegEx.create_from_string("^[A-Za-z][A-Za-z0-9+.-]*:").search(url)
			if url.begins_with("//") or scheme != null and not url.begins_with("https://") and not url.begins_with("res://"):
				errors.append(I18n.t("production_asset_https", [url]))
				continue
			if not url.begins_with("https://"):
				continue
			if pattern.search(String(item.get("integrity", ""))) == null or String(item.get("crossorigin", "")) != "anonymous":
				errors.append(I18n.t("production_asset_sri", [url]))

# 課金を有効にした設定へ、Hosted Checkoutと法務pageの境界を要求する。
func _check_commerce(source: Dictionary) -> void:
	var commerce: Dictionary = source.get("commerce", {})
	if not bool(commerce.get("enabled", false)):
		return
	if String(commerce.get("mode", "")) != "hosted":
		errors.append(I18n.t("production_commerce_mode"))
	var hosts: Array = commerce.get("checkout_hosts", [])
	if hosts.is_empty():
		errors.append(I18n.t("production_checkout_hosts"))
	for host in hosts:
		if not _secure_url(String(host), false):
			errors.append(I18n.t("production_checkout_origin", [host]))
	var routes := {}
	for scene in source.get("scenes", {}).values():
		if scene is Dictionary and bool(scene.get("page", true)):
			routes[String(scene.get("uri", ""))] = true
	for key in ["privacy", "terms", "refund", "contact", "disclosure"]:
		var route := String(commerce.get(key, ""))
		if route.is_empty() or not routes.has(route):
			errors.append(I18n.t("production_commerce_page", [key]))

# HTTPS URLを確認し、開発時のloopback HTTPのみ例外にする。
func _secure_url(value: String, loopback: bool) -> bool:
	if RegEx.create_from_string("[\\s\\x00-\\x1f\\x7f\\\\@]").search(value):
		return false
	var secure := RegEx.create_from_string("^https://([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?|localhost)(?::([0-9]{1,5}))?(?:[/?#]|$)").search(value)
	if secure:
		var host := secure.get_string(1).to_lower()
		var port := secure.get_string(2)
		return (host.contains(".") or host == "localhost") and host != "example.com" and not host.ends_with(".example") and (port.is_empty() or int(port) <= 65535)
	if not loopback:
		return false
	var local := RegEx.create_from_string("^http://(localhost|127\\.0\\.0\\.1|\\[::1\\])(?::([0-9]{1,5}))?(?:/|$)").search(value)
	return local != null and (local.get_string(2).is_empty() or int(local.get_string(2)) <= 65535)

# project内の公開候補文字fileを列挙する。
func _scan(root: String, skip := true, extensions: Array = []) -> void:
	var pending: Array[String] = [root]
	while not pending.is_empty():
		var current: String = pending.pop_back()
		var directory := DirAccess.open(current)
		if directory == null:
			continue
		directory.list_dir_begin()
		var name := directory.get_next()
		while not name.is_empty():
			var file := current.path_join(name)
			if directory.current_is_dir():
				if (not skip or name not in SKIP_DIRS) and not directory.is_link(name):
					pending.append(file)
			elif not directory.is_link(name) and (extensions.is_empty() or file.get_extension().to_lower() in extensions):
				_scan_file(root, file)
			name = directory.get_next()
		directory.list_dir_end()

# 代表的な本番秘密形式を値を表示せず検出する。
func _scan_file(root: String, path: String) -> void:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null or file.get_length() > MAX_SCAN_BYTES and path.get_extension().to_lower() not in TEXT_EXTENSIONS and path.get_extension().to_lower() not in OUTPUT_EXTENSIONS:
		return
	var found := {}
	var tail := ""
	while file.get_position() < file.get_length():
		var size := mini(64 * 1024, file.get_length() - file.get_position())
		var text := tail + file.get_buffer(size).get_string_from_ascii()
		_scan_text(root, path, text, found)
		tail = text.right(256)

# 一つの文字chunkから秘密形式を値を表示せず検出する。
func _scan_text(root: String, path: String, text: String, found: Dictionary) -> void:
	for label in SECRET_PATTERNS:
		if found.has(label):
			continue
		if not secret_patterns.has(label):
			var compiled := RegEx.new()
			compiled.compile(SECRET_PATTERNS[label])
			secret_patterns[label] = compiled
		var pattern: RegEx = secret_patterns[label]
		if pattern.search(text):
			found[label] = true
			errors.append(I18n.t("production_secret", [label, path.trim_prefix(root + "/")]))
