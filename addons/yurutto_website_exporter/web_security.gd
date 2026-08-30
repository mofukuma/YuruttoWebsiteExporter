# 生成HTMLへCSPを適用し、静的hostと同梱serverが共有できる防御headerを出力する。
# inline内容のhashを実生成物から算出し、許可していないscript実行をBrowserで止める設計。

extends RefCounted

const I18n := preload("i18n.gd") # 配信防御の失敗理由を利用者の言語へ揃える。
const HEADER_FILE := "_headers" # 対応する静的hostが読むheader設定。
const MANIFEST_FILE := "yweb-security.json" # 汎用serverが読むheader設定。

var error_message := "" # SiteBuilderへ返す失敗理由。

# 全物理pageへ同じCSPを適用し、配信設定と課金境界を記録する。
func finalize(root: String, data: Dictionary) -> Error:
	var files := _html_files(root)
	var size_error := _check_size(root, data)
	if size_error != OK:
		return size_error
	var hashes := _hashes(files)
	var policy := _policy(data, hashes, true)
	var meta_policy := _policy(data, hashes, false)
	var permissions := _permissions(data)
	if permissions.is_empty():
		error_message = I18n.t("production_permissions")
		return FAILED
	for path in files:
		var html := FileAccess.get_file_as_string(path)
		var tag := "<meta http-equiv=\"Content-Security-Policy\" content=\"%s\">" % _html(meta_policy)
		html = html.replace("<meta charset=\"utf-8\">", "<meta charset=\"utf-8\">\n\t\t%s" % tag)
		var error := _write(path, html)
		if error != OK:
			return error
	var headers := _headers(data, policy, permissions)
	var lines := ["/*"]
	for name in headers:
		lines.append("  %s: %s" % [name, headers[name]])
	var error := _write(root.path_join(HEADER_FILE), "\n".join(lines) + "\n")
	if error != OK:
		return error
	var commerce: Dictionary = data.get("commerce", {})
	var manifest := {
		"version": 1, "headers": headers,
		"clientTrust": "untrusted", "paymentConfirmation": "server-webhook",
		"legalReview": "operator",
		"commerce": {"enabled": bool(commerce.get("enabled", false)), "mode": commerce.get("mode", "")},
		"largestFiles": _largest(root),
	}
	return _write(root.path_join(MANIFEST_FILE), JSON.stringify(manifest, "\t") + "\n")

# 選んだhostの一file上限が設定済みなら、圧縮前成果物も含めて超過を止める。
func _check_size(root: String, data: Dictionary) -> Error:
	var limit := int(data.get("hosting", {}).get("max_file_bytes", 0))
	if limit <= 0:
		return OK
	for entry in _largest(root):
		if int(entry.bytes) > limit:
			error_message = I18n.t("production_host_size", [entry.file, entry.bytes, limit])
			return FAILED
	return OK

# 配信先選定に使える大きい成果物上位5件を記録する。
func _largest(root: String) -> Array[Dictionary]:
	var values: Array[Dictionary] = []
	var pending: Array[String] = [root]
	while not pending.is_empty():
		var current: String = pending.pop_back()
		var directory := DirAccess.open(current)
		if directory == null:
			continue
		for name in directory.get_files():
			var path := current.path_join(name)
			var file := FileAccess.open(path, FileAccess.READ)
			values.append({"file": path.trim_prefix(root.trim_suffix("/") + "/"), "bytes": file.get_length() if file else 0})
		for name in directory.get_directories():
			if not directory.is_link(name):
				pending.append(current.path_join(name))
	values.sort_custom(func(a: Dictionary, b: Dictionary): return int(a.bytes) > int(b.bytes))
	return values.slice(0, mini(5, values.size()))

# 成果物内のHTMLを一度ずつ列挙する。
func _html_files(root: String) -> Array[String]:
	var found: Array[String] = []
	var pending: Array[String] = [root]
	while not pending.is_empty():
		var current: String = pending.pop_back()
		var directory := DirAccess.open(current)
		if directory == null:
			continue
		for name in directory.get_files():
			if name.get_extension().to_lower() == "html":
				found.append(current.path_join(name))
		for name in directory.get_directories():
			if not directory.is_link(name):
				pending.append(current.path_join(name))
	found.sort()
	return found

# 実行されるinline scriptのSHA-256を重複なく集める。
func _hashes(files: Array[String]) -> Dictionary:
	var result := {"script": {}}
	for path in files:
		var html := FileAccess.get_file_as_string(path)
		_collect_hashes(html, "script", result.script)
	return result

# 一種のinline要素を正規表現で拾い、外部src付きscriptを除く。
func _collect_hashes(html: String, tag: String, values: Dictionary) -> void:
	var pattern := RegEx.new()
	pattern.compile("(?is)<%s([^>]*)>(.*?)</%s>" % [tag, tag])
	for found in pattern.search_all(html):
		if tag == "script":
			var attrs := found.get_string(1)
			if RegEx.create_from_string("(?i)\\ssrc\\s*=").search(attrs) or RegEx.create_from_string("(?i)\\stype\\s*=\\s*['\"]application/(?:ld\\+)?json['\"]").search(attrs):
				continue
		var value := found.get_string(2)
		var context := HashingContext.new()
		context.start(HashingContext.HASH_SHA256)
		context.update(value.to_utf8_buffer())
		values[Marshalls.raw_to_base64(context.finish())] = true

# 実行元と埋込hashを最小限に絞ったCSPを組み立てる。
func _policy(data: Dictionary, hashes: Dictionary, header: bool) -> String:
	var script := ["'self'", "'wasm-unsafe-eval'"]
	var style := ["'self'", "'unsafe-inline'"]
	for value in hashes.script:
		script.append("'sha256-%s'" % value)
	_origins(data, script, style)
	var security: Dictionary = data.get("security", {})
	var connect := ["'self'"]
	for value in security.get("connect_origins", []):
		var origin := _origin(String(value), true)
		if not origin.is_empty() and origin not in connect:
			connect.append(origin)
	var parts := [
		"default-src 'self'", "base-uri 'self'", "object-src 'none'",
		"script-src %s" % " ".join(script), "script-src-attr 'none'",
		"style-src-elem %s" % " ".join(style), "style-src-attr 'unsafe-inline'",
		"img-src 'self' data: blob:", "font-src 'self' data:",
		"connect-src %s" % " ".join(connect), "media-src 'self' data: blob:",
		"worker-src 'self' blob:", "frame-src 'none'", "form-action 'self'",
	]
	if header:
		parts.append("frame-ancestors 'none'")
	return "; ".join(parts)

# 設定済み外部assetのoriginをscript/styleへ分けて許可する。
func _origins(data: Dictionary, scripts: Array, styles: Array) -> void:
	var site: Dictionary = data.get("site", {})
	var groups := [[site.get("scripts", []), scripts], [site.get("styles", []), styles]]
	for scene in data.get("scenes", {}).values():
		if scene is Dictionary:
			groups.append_array([[scene.get("scripts", []), scripts], [scene.get("styles", []), styles]])
	for group in groups:
		for value in group[0]:
			var item: Dictionary = value if value is Dictionary else {}
			var url := String(item.get("src", item.get("href", value if value is String else "")))
			var origin := _origin(url)
			if not origin.is_empty() and origin not in group[1]:
				group[1].append(origin)

# HTTPS URLからCSPへ使うorigin部分を取り出す。
func _origin(value: String, exact := false) -> String:
	if RegEx.create_from_string("[\\s\\x00-\\x1f\\x7f\\\\@]").search(value):
		return ""
	var suffix := "/?$" if exact else "(?:[/?#]|$)"
	var found := RegEx.create_from_string("^https://([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::([0-9]{1,5}))?%s" % suffix).search(value)
	if found == null or not found.get_string(2).is_empty() and int(found.get_string(2)) > 65535:
		return ""
	return "https://%s%s" % [found.get_string(1).to_lower(), ":" + found.get_string(2) if not found.get_string(2).is_empty() else ""]

# 定義済みfeatureをdenyまたはselfへ限定したheader値へ整える。
func _permissions(data: Dictionary) -> String:
	var security: Dictionary = data.get("security", {})
	var value := String(security.get("permissions_policy", "camera=(), microphone=(), geolocation=()"))
	var pattern := RegEx.create_from_string("^[a-z][a-z0-9-]*=\\((?:self)?\\)(?:, [a-z][a-z0-9-]*=\\((?:self)?\\))*$")
	return value if pattern.search(value) else ""

# host向け防御headerを、必要なBrowser機能を壊さない範囲で返す。
func _headers(data: Dictionary, policy: String, permissions: String) -> Dictionary:
	var site: Dictionary = data.get("site", {})
	var headers := {
		"Content-Security-Policy": policy,
		"X-Content-Type-Options": "nosniff",
		"Referrer-Policy": "strict-origin-when-cross-origin",
		"X-Frame-Options": "DENY",
		"X-XSS-Protection": "0",
		"Cross-Origin-Resource-Policy": "same-origin",
		"Permissions-Policy": permissions,
	}
	if String(site.get("base_url", "")).begins_with("https://"):
		headers["Strict-Transport-Security"] = "max-age=31536000"
	return headers

# 属性へ安全に入る文字列へ変換する。
func _html(value: String) -> String:
	return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

# 防御成果物を書き、失敗理由を保持する。
func _write(path: String, value: String) -> Error:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		error_message = I18n.t("production_security_write", [path])
		return ERR_CANT_CREATE
	file.store_string(value)
	return OK
