# Godot Web成果物をscene別SEO、route、Web font、配信設定付きsiteへ変換する。
# Editor内だけで完結し、外部processを起動しない設計。

extends RefCounted

const BEGIN := "<!-- YWEB_SITE_BEGIN -->" # 再生成headの開始印。
const END := "<!-- YWEB_SITE_END -->" # 再生成headの終了印。
const RUNTIME := "res://addons/yurutto_website_exporter/site_runtime.js" # Browser scene同期処理。
const I18n := preload("i18n.gd") # 画面文言の言語選び。
const NGINX := "res://addons/yurutto_website_exporter/nginx-yweb.conf" # 直接配信用設定。
const NGINX_PROXY := "res://addons/yurutto_website_exporter/nginx-yweb-proxy.conf" # reverse proxy設定。
const OPTIONS := [
	"yweb/site/enabled", "yweb/site/config", "yweb/site/base_url", "yweb/site/title",
	"yweb/site/description", "yweb/site/locale", "yweb/site/favicon", "yweb/routing/mode",
	"yweb/font/matching_webfont", "yweb/font/avoid_canvas_theme_font", "yweb/ogp/image", "yweb/ogp/alt",
] # Site生成へ渡すExport設定名。
const STYLE_ATTRS := ["media", "integrity", "crossorigin", "referrerpolicy"] # styleで許可する属性。
const SCRIPT_ATTRS := ["type", "defer", "async", "integrity", "crossorigin", "referrerpolicy"] # scriptで許可する属性。

var error_message := "" # Export画面へ返す失敗理由。
var project := "" # 現在projectの絶対path。
var output := "" # 起点HTMLの絶対path。
var out := "" # Site成果物directory。

# 設定、asset、route HTML、付属fileを一括生成する。
func build(options: Dictionary, target: String) -> Error:
	error_message = ""
	project = ProjectSettings.globalize_path("res://").trim_suffix("/")
	output = target
	out = target.get_base_dir()
	if not FileAccess.file_exists(output):
		return _fail(I18n.t("no_export_html", [output]))
	var avoid := bool(options.get("yweb/font/avoid_canvas_theme_font", true))
	if not bool(options.get("yweb/site/enabled", true)):
		var error := _write_text_config(avoid)
		return error if error != OK else _write_manifest()
	var data := _configuration(options)
	if not error_message.is_empty():
		return FAILED
	data.avoid_canvas_theme_font = avoid
	data.mode = "History" if int(options.get("yweb/routing/mode", 0)) == 1 else "Hash"
	var url := _urls(data.site.base_url)
	if not error_message.is_empty():
		return FAILED
	for scene in data.scenes.values():
		scene.canonical = url.absolute.call(scene.uri.trim_prefix("/"))
	_copy_assets(data, url)
	if not error_message.is_empty():
		return FAILED
	var font_map := _webfonts(bool(options.get("yweb/font/matching_webfont", true)), url.public_path)
	if not error_message.is_empty():
		return FAILED
	var asset_dir := out.path_join("yweb-assets")
	DirAccess.make_dir_recursive_absolute(asset_dir)
	var image := _ogp(data.ogp, asset_dir)
	if not error_message.is_empty():
		return FAILED
	if not String(data.site.favicon).is_empty():
		var icon := _resource(data.site.favicon)
		if icon.is_empty() or not FileAccess.file_exists(icon):
			return _fail(I18n.t("favicon_missing", [data.site.favicon]))
		var icon_name := "favicon.%s" % icon.get_extension().to_lower()
		var copied := DirAccess.copy_absolute(icon, asset_dir.path_join(icon_name))
		if copied != OK:
			return _fail(I18n.t("favicon_copy"))
	var base := FileAccess.get_file_as_string(output)
	var scenes: Array = data.scenes.values()
	var first: Dictionary = scenes[0]
	for scene in scenes:
		if scene.uri == "/":
			first = scene
			break
	var rendered := _render(base, data, first, image, url, font_map)
	if not error_message.is_empty():
		return FAILED
	var error := _write(output, rendered)
	if error != OK:
		return error
	var missing := first.duplicate(true)
	missing.merge({
		"title": I18n.t("not_found_title", [data.site.name], data.site.locale),
		"description": I18n.t("not_found_text", [], data.site.locale),
		"summary": I18n.t("not_found_text", [], data.site.locale),
		"robots": "noindex,nofollow", "uri": "/404/",
	}, true)
	error = _write(out.path_join("404.html"), _render(base, data, missing, image, url, font_map))
	if error != OK:
		return error
	if data.mode == "History":
		for scene in scenes:
			if scene.uri == "/":
				continue
			var directory := out.path_join(scene.uri.trim_prefix("/").trim_suffix("/"))
			DirAccess.make_dir_recursive_absolute(directory)
			error = _write(directory.path_join("index.html"), _render(base, data, scene, image, url, font_map))
			if error != OK:
				return error
	data.webfonts = font_map
	error = _write(out.path_join("yweb-site.json"), JSON.stringify(data, "\t") + "\n")
	if error != OK:
		return error
	error = _write_nginx(NGINX, out.path_join("nginx-yweb.conf.example"), url.root)
	if error != OK:
		return error
	error = _write_nginx(NGINX_PROXY, out.path_join("nginx-yweb-proxy.conf.example"), url.root)
	if error != OK:
		return error
	var pages := ""
	for scene in scenes:
		pages += "<url><loc>%s</loc></url>" % _html(scene.canonical)
	error = _write(out.path_join("sitemap.xml"), "<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">%s</urlset>\n" % pages)
	if error != OK:
		return error
	error = _write(out.path_join("robots.txt"), "User-agent: *\nAllow: /\nSitemap: %s\n" % url.absolute.call("sitemap.xml"))
	return error if error != OK else _write_manifest()

# Project情報とJSONから既定値込みのsite設定を構築する。
func _configuration(options: Dictionary) -> Dictionary:
	var info := {
		"title": String(ProjectSettings.get_setting("application/config/name", "Godot Web Site")),
		"scene": String(ProjectSettings.get_setting("application/run/main_scene", "")),
	}
	var config_path := String(options.get("yweb/site/config", "res://yweb-site.json"))
	var file := _resource(config_path)
	var source: Dictionary = {}
	if not file.is_empty() and FileAccess.file_exists(file):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(file))
		if not parsed is Dictionary:
			_fail(I18n.t("site_json_object"))
			return {}
		source = parsed
	if int(source.get("version", 1)) != 1:
		_fail(I18n.t("site_json_version"))
		return {}
	var source_site: Dictionary = source.get("site", {})
	var site := {
		"name": String(options.get("yweb/site/title", source_site.get("name", info.title))),
		"base_url": String(options.get("yweb/site/base_url", source_site.get("base_url", "https://example.com"))),
		"description": String(options.get("yweb/site/description", source_site.get("description", I18n.t("site_description")))),
		"locale": String(options.get("yweb/site/locale", source_site.get("locale", "ja_JP"))),
		"favicon": String(options.get("yweb/site/favicon", source_site.get("favicon", ""))),
		"meta": source_site.get("meta", []), "styles": source_site.get("styles", []), "scripts": source_site.get("scripts", []),
	}
	var entries: Dictionary = source.get("scenes", {})
	if entries.is_empty():
		var key := String(info.scene).get_file().get_basename()
		if key.is_empty():
			key = "Main"
		entries[key] = {
			"scene": info.scene, "uri": "/", "title": site.name,
			"description": site.description, "summary": site.description,
		}
	var scenes := {}
	var seen := {}
	for key in entries:
		if not entries[key] is Dictionary:
			_fail(I18n.t("scene_json_object", [key]))
			return {}
		var value: Dictionary = entries[key]
		var scene_file := _resource(String(value.get("scene", "")))
		if scene_file.is_empty() or not FileAccess.file_exists(scene_file):
			_fail(I18n.t("scene_missing", [key]))
			return {}
		var uri := _route(String(value.get("uri", "/")))
		if uri.is_empty() or seen.has(uri):
			_fail(I18n.t("uri_invalid", [value.get("uri", "")]))
			return {}
		seen[uri] = true
		var title := String(value.get("title", site.name))
		var description := String(value.get("description", site.description))
		scenes[key] = {
			"scene": value.scene, "uri": uri, "title": title, "description": description,
			"summary": String(value.get("summary", description)), "robots": String(value.get("robots", "index,follow")),
			"meta": value.get("meta", []), "styles": value.get("styles", []), "scripts": value.get("scripts", []),
			"json_ld": value.get("json_ld", {"@context": "https://schema.org", "@type": "WebPage", "name": title}),
		}
	return {
		"site": site, "scenes": scenes,
		"ogp": String(options.get("yweb/ogp/image", "res://web/ogp.png")),
		"alt": String(options.get("yweb/ogp/alt", I18n.t("ogp_alt"))),
	}

# URIをsite rootから始まるdirectory形式へ正規化する。
func _route(value: String) -> String:
	var uri := value.strip_edges()
	if not uri.begins_with("/") or uri.contains("..") or uri.contains("?") or uri.contains("#"):
		return ""
	while uri.contains("//"):
		uri = uri.replace("//", "/")
	return uri if uri.ends_with("/") else uri + "/"

# 公開URLをbase URL配下へ組み立てる関数群を返す。
func _urls(base: String) -> Dictionary:
	if base.contains("?") or base.contains("#"):
		_fail(I18n.t("url_query", [base]))
		return {}
	var marker := base.find("://")
	if marker < 1:
		_fail(I18n.t("url_scheme", [base]))
		return {}
	var scheme := base.substr(0, marker).to_lower()
	if scheme != "http" and scheme != "https":
		_fail(I18n.t("url_scheme", [base]))
		return {}
	var rest := base.substr(marker + 3)
	var slash := rest.find("/")
	var host := rest if slash < 0 else rest.substr(0, slash)
	if host.is_empty():
		_fail(I18n.t("url_host", [base]))
		return {}
	var root := "/" if slash < 0 else rest.substr(slash)
	root = "/" + root.trim_prefix("/").trim_suffix("/") + "/"
	while root.contains("//"):
		root = root.replace("//", "/")
	var safe := RegEx.new()
	safe.compile("^/[a-zA-Z0-9._~/-]*$")
	if not safe.search(root):
		_fail(I18n.t("url_path", [root]))
		return {}
	var origin := "%s://%s" % [scheme, host]
	return {
		"root": root,
		"public_path": func(file := ""): return root + String(file).trim_prefix("/"),
		"absolute": func(file := ""): return origin + root + String(file).trim_prefix("/"),
	}

# Project内fileを拡張子で再帰列挙する。
func _files(root: String, extensions: Array) -> Array[String]:
	var found: Array[String] = []
	var pending: Array[String] = [root]
	while not pending.is_empty():
		var current: String = pending.pop_back()
		var directory := DirAccess.open(current)
		if directory == null:
			continue
		directory.list_dir_begin()
		var name := directory.get_next()
		while not name.is_empty():
			if name != ".godot" and name != ".git":
				var file := current.path_join(name)
				if directory.current_is_dir():
					pending.append(file)
				elif name.get_extension().to_lower() in extensions:
					found.append(file)
			name = directory.get_next()
		directory.list_dir_end()
	found.sort()
	return found

# 同じpathとbasenameのwoff2をTheme font pathへ対応付ける。
func _webfonts(enabled: bool, public_path: Callable) -> Dictionary:
	var map := {}
	if not enabled:
		return map
	var target := out.path_join("yweb-fonts")
	for font in _files(project, ["woff2"]):
		var stem := font.trim_suffix(".woff2")
		for extension in ["ttf", "otf"]:
			var source := "%s.%s" % [stem, extension]
			if not FileAccess.file_exists(source):
				continue
			DirAccess.make_dir_recursive_absolute(target)
			var digest := FileAccess.get_sha256(font).substr(0, 12)
			var clean := _file_name(stem.get_file())
			var name := "%s-%s.woff2" % [clean, digest]
			var error := DirAccess.copy_absolute(font, target.path_join(name))
			if error != OK:
				_fail(I18n.t("font_copy", [font]))
				return {}
			var relative := source.trim_prefix(project + "/").replace("\\", "/")
			var key := "res://%s" % relative
			map[key] = {"family": "YWeb-%s" % _sha_text(key), "url": public_path.call("yweb-fonts/%s" % name)}
	return map

# 公開file名に使える英数字へ変換する。
func _file_name(value: String) -> String:
	var pattern := RegEx.new()
	pattern.compile("[^a-zA-Z0-9_-]")
	return pattern.sub(value, "-", true)

# 文字列の短いSHA-256を返す。
func _sha_text(value: String) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(value.to_utf8_buffer())
	return context.finish().hex_encode().substr(0, 12)

# Project内参照のstyleとscriptを公開directoryへ複製する。
func _copy_assets(data: Dictionary, url: Dictionary) -> void:
	var lists := [[data.site.styles, "href"], [data.site.scripts, "src"]]
	for scene in data.scenes.values():
		lists.append([scene.styles, "href"])
		lists.append([scene.scripts, "src"])
	for pair in lists:
		var list: Array = pair[0]
		var fallback: String = pair[1]
		for index in list.size():
			var item: Dictionary = {fallback: list[index]} if list[index] is String else list[index]
			var key := "href" if item.has("href") else "src"
			var value := String(item.get(key, ""))
			if value.is_empty() or value.begins_with("http://") or value.begins_with("https://"):
				continue
			var relative := value.trim_prefix("res://").trim_prefix("/")
			var source := project.path_join(relative).simplify_path()
			if not source.begins_with(project + "/") or not FileAccess.file_exists(source):
				continue
			var target := out.path_join(relative).simplify_path()
			if not target.begins_with(out + "/"):
				_fail(I18n.t("asset_path", [value]))
				return
			DirAccess.make_dir_recursive_absolute(target.get_base_dir())
			if DirAccess.copy_absolute(source, target) != OK:
				_fail(I18n.t("asset_copy", [value]))
				return
			if FileAccess.file_exists(source + ".br"):
				if DirAccess.copy_absolute(source + ".br", target + ".br") != OK:
					_fail(I18n.t("asset_brotli", [value]))
					return
			elif FileAccess.file_exists(target + ".br"):
				DirAccess.remove_absolute(target + ".br")
			item[key] = url.public_path.call(relative.replace("\\", "/"))
			list[index] = item

# OGP画像を元の比率のまま外部assetへ複製する。
func _ogp(value: String, asset_dir: String) -> Dictionary:
	var file := _resource(value)
	if file.is_empty() or not FileAccess.file_exists(file):
		return {}
	var image := Image.new()
	if image.load(file) != OK:
		_fail(I18n.t("ogp_read", [value]))
		return {}
	var extension := file.get_extension().to_lower()
	var types := {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}
	var name := "ogp.%s" % extension
	if DirAccess.copy_absolute(file, asset_dir.path_join(name)) != OK:
		_fail(I18n.t("ogp_copy"))
		return {}
	return {"file": name, "type": types.get(extension, "application/octet-stream"), "width": image.get_width(), "height": image.get_height()}

# 一sceneの静的SEO headを生成する。
func _head(data: Dictionary, scene: Dictionary, image: Dictionary, url: Dictionary, font_map: Dictionary) -> String:
	var canonical: String = scene.canonical
	var image_url: String = url.absolute.call("yweb-assets/%s" % image.file) if not image.is_empty() else ""
	var tags := [
		"<meta charset=\"utf-8\">", "<base href=\"%s\">" % _html(url.root),
		"<meta name=\"description\" content=\"%s\">" % _html(scene.description),
		"<meta name=\"robots\" content=\"%s\">" % _html(scene.robots),
		"<link rel=\"canonical\" href=\"%s\">" % _html(canonical),
		"<meta property=\"og:title\" content=\"%s\">" % _html(scene.title),
		"<meta property=\"og:type\" content=\"website\">", "<meta property=\"og:url\" content=\"%s\">" % _html(canonical),
		"<meta property=\"og:description\" content=\"%s\">" % _html(scene.description),
		"<meta property=\"og:site_name\" content=\"%s\">" % _html(data.site.name),
		"<meta property=\"og:locale\" content=\"%s\">" % _html(data.site.locale),
		"<meta name=\"twitter:card\" content=\"summary_large_image\">",
		"<meta name=\"twitter:title\" content=\"%s\">" % _html(scene.title),
		"<meta name=\"twitter:description\" content=\"%s\">" % _html(scene.description),
	]
	if not image.is_empty():
		tags.append_array([
			"<meta property=\"og:image\" content=\"%s\">" % _html(image_url),
			"<meta property=\"og:image:url\" content=\"%s\">" % _html(image_url),
			"<meta property=\"og:image:type\" content=\"%s\">" % image.type,
			"<meta property=\"og:image:alt\" content=\"%s\">" % _html(data.alt),
			"<meta name=\"twitter:image\" content=\"%s\">" % _html(image_url),
			"<meta name=\"twitter:image:alt\" content=\"%s\">" % _html(data.alt),
			"<meta property=\"og:image:width\" content=\"%d\">" % image.width,
			"<meta property=\"og:image:height\" content=\"%d\">" % image.height,
		])
		if image_url.begins_with("https:"):
			tags.append("<meta property=\"og:image:secure_url\" content=\"%s\">" % _html(image_url))
	if not String(data.site.favicon).is_empty():
		tags.append("<link rel=\"icon\" href=\"%s\">" % _html(url.public_path.call("yweb-assets/favicon.%s" % String(data.site.favicon).get_extension().to_lower())))
	else:
		tags.append("<link rel=\"icon\" href=\"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=\">")
	var faces := ""
	for font in font_map.values():
		faces += "@font-face{font-family:%s;src:url('%s') format('woff2');font-display:swap}" % [font.family, font.url]
	tags.append("<style id=\"yweb-font-faces\">%s</style>" % faces)
	tags.append(_metas(data.site.meta))
	tags.append(_metas(scene.meta, true))
	tags.append(_assets(data.site.styles, data.site.scripts))
	tags.append(_assets(scene.styles, scene.scripts, true))
	tags.append("<script id=\"yweb-json-ld\" type=\"application/ld+json\">%s</script>" % _json(scene.json_ld))
	tags.append("<script>window.YWEB_FONT_MAP=%s</script>" % _json(font_map))
	tags.append(_text_config(data.avoid_canvas_theme_font))
	tags.append("<script id=\"yweb-site-config\" type=\"application/json\">%s</script>" % _json({"mode": data.mode, "root": url.root, "site": data.site, "scenes": data.scenes}))
	var present: Array[String] = []
	for tag in tags:
		if not String(tag).is_empty():
			present.append(tag)
	return "%s\n%s\n%s" % [BEGIN, "\n".join(present), END]

# 設定済みstyleとscriptを許可属性だけでhead tagへ変換する。
func _assets(styles: Array, scripts: Array, scene := false) -> String:
	var tags: Array[String] = []
	for entry in styles:
		var item: Dictionary = {"href": entry} if entry is String else entry
		tags.append("<link rel=\"stylesheet\" href=\"%s\"%s%s>" % [_html(item.get("href", "")), _attrs(item, STYLE_ATTRS), " data-yweb-scene-asset=\"true\"" if scene else ""])
	for entry in scripts:
		var item: Dictionary = {"src": entry} if entry is String else entry
		var marker := " data-yweb-asset=\"%s\"" % _html(item.get("src", "")) if scene else ""
		tags.append("<script src=\"%s\"%s%s></script>" % [_html(item.get("src", "")), _attrs(item, SCRIPT_ATTRS), marker])
	return "\n".join(tags)

# 許可した属性だけをhead tag用文字列へ変換する。
func _attrs(item: Dictionary, names: Array) -> String:
	var result := ""
	for name in names:
		if not item.has(name) or item[name] == false:
			continue
		result += " %s" % name if item[name] == true else " %s=\"%s\"" % [name, _html(item[name])]
	return result

# 任意metaをnameまたはpropertyの一方へ限定して生成する。
func _metas(items: Array, scene := false) -> String:
	var tags: Array[String] = []
	for item in items:
		if not item is Dictionary or (not item.has("name") and not item.has("property")) or not item.has("content"):
			_fail(I18n.t("meta_fields"))
			return ""
		var key := "name" if item.has("name") else "property"
		tags.append("<meta %s=\"%s\" content=\"%s\"%s>" % [key, _html(item[key]), _html(item.content), " data-yweb-scene-meta=\"true\"" if scene else ""])
	return "\n".join(tags)

# Godot HTMLへtitle、head、概要、Browser同期処理を差し込む。
func _render(base: String, data: Dictionary, scene: Dictionary, image: Dictionary, url: Dictionary, font_map: Dictionary) -> String:
	var html := _remove_site(base)
	var title := RegEx.new()
	title.compile("(?is)<title>.*?</title>")
	html = title.sub(html, "<title>%s</title>" % _html(scene.title), true)
	var language := String(data.site.locale).split("_")[0]
	var opening := RegEx.new()
	opening.compile("(?i)<html(?:\\s[^>]*)?>")
	var found := opening.search(html)
	if found:
		var tag := found.get_string()
		var lang := RegEx.new()
		lang.compile("lang=\"[^\"]*\"")
		tag = lang.sub(tag, "lang=\"%s\"" % _html(language)) if lang.search(tag) else tag.trim_suffix(">") + " lang=\"%s\">" % _html(language)
		html = html.substr(0, found.get_start()) + tag + html.substr(found.get_end())
	html = html.replace("</head>", "%s\n</head>" % _head(data, scene, image, url, font_map))
	var summary := "<main id=\"yweb-site-summary\"><h1>%s</h1><p>%s</p></main><noscript>%s</noscript>" % [_html(scene.title), _html(scene.summary), _html(scene.summary)]
	var body := RegEx.new()
	body.compile("(?i)<body([^>]*)>")
	html = body.sub(html, "<body$1>%s" % summary)
	var runtime := FileAccess.get_file_as_string(RUNTIME)
	return html.replace("</body>", "<script id=\"yweb-site-runtime\">%s</script>\n</body>" % runtime)

# 既存のsite生成範囲と概要を再生成前に除く。
func _remove_site(html: String) -> String:
	var head := RegEx.new()
	head.compile("(?s)%s.*?%s\\n?" % [BEGIN, END])
	html = head.sub(html, "", true)
	var summary := RegEx.new()
	summary.compile("(?s)<main id=\"yweb-site-summary\">.*?</main><noscript>.*?</noscript>")
	html = summary.sub(html, "", true)
	var runtime := RegEx.new()
	runtime.compile("(?s)<script id=\"yweb-site-runtime\">.*?</script>\\n?")
	return runtime.sub(html, "", true)

# Site無効時も文字所有設定だけをHTMLへ反映する。
func _write_text_config(avoid: bool) -> Error:
	var html := FileAccess.get_file_as_string(output)
	var pattern := RegEx.new()
	pattern.compile("(?s)<script id=\"yweb-text-config\">.*?</script>\\n?")
	html = pattern.sub(html, "", true)
	html = html.replace("</head>", "%s\n</head>" % _text_config(avoid))
	return _write(output, html)

# DOM文字所有設定を一つのscriptへまとめる。
func _text_config(avoid: bool) -> String:
	return "<script id=\"yweb-text-config\">window.YWEB_TEXT_CONFIG=%s</script>" % _json({"avoidCanvasThemeFont": avoid})

# 内蔵Brotliとraw成果物の対応をmanifestへ記録する。
func _write_manifest() -> Error:
	var entries: Array[Dictionary] = []
	var has_js := false
	var has_wasm := false
	for encoded in _files(out, ["br"]):
		var raw := encoded.trim_suffix(".br")
		var extension := raw.get_extension().to_lower()
		if extension != "js" and extension != "wasm":
			continue
		if not FileAccess.file_exists(raw):
			return _fail(I18n.t("brotli_source", [encoded.get_file()]))
		var raw_size := _size(raw)
		var encoded_size := _size(encoded)
		if encoded_size >= raw_size:
			return _fail(I18n.t("brotli_size", [encoded.get_file()]))
		var relative := raw.trim_prefix(out.trim_suffix("/") + "/").replace("\\", "/")
		entries.append({
			"file": relative, "originalBytes": raw_size, "brotliBytes": encoded_size,
			"sha256": FileAccess.get_sha256(raw), "brotliSha256": FileAccess.get_sha256(encoded),
		})
		has_js = has_js or extension == "js"
		has_wasm = has_wasm or extension == "wasm"
	if not has_js or not has_wasm:
		return _fail(I18n.t("brotli_template"))
	return _write(out.path_join("yweb-compression.json"), JSON.stringify({"encoding": "br", "quality": 6, "entries": entries}, "\t") + "\n")

# res:// pathをproject外へ出さず絶対pathへ変換する。
func _resource(value: String) -> String:
	if value.is_empty():
		return ""
	if not value.begins_with("res://"):
		_fail(I18n.t("not_res_path", [value]))
		return ""
	var file := project.path_join(value.trim_prefix("res://")).simplify_path()
	if file != project and not file.begins_with(project + "/"):
		_fail(I18n.t("outside_project", [value]))
		return ""
	return file

# JSONをscript終了文字列の影響なくHTMLへ埋め込む。
func _json(value: Variant) -> String:
	return JSON.stringify(value).replace("<", "\\u003c")

# HTML属性と本文へ安全に埋め込む文字列へ変換する。
func _html(value: Variant) -> String:
	return String(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

# 公開subpathを内部rewriteするnginx設定を生成する。
func _write_nginx(source: String, target: String, root: String) -> Error:
	var text := FileAccess.get_file_as_string(source)
	var rule := ""
	if root != "/":
		var prefix := root.trim_suffix("/")
		rule = "location = %s { return 308 %s; }\n    location ^~ %s { rewrite ^%s(.*)$ /$1 last; }" % [prefix, root, root, root]
	text = text.replace("# YWEB_BASE_PATH", rule)
	return _write(target, text)

# 文字列をfileへ確実に保存する。
func _write(path: String, text: String) -> Error:
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		return _fail(I18n.t("write_failed", [path]))
	file.store_string(text)
	return OK

# fileのbyte数を返す。
func _size(path: String) -> int:
	var file := FileAccess.open(path, FileAccess.READ)
	return file.get_length() if file else 0

# 最初の失敗理由を保持してErrorを返す。
func _fail(message: String) -> Error:
	if error_message.is_empty():
		error_message = message
	return FAILED
