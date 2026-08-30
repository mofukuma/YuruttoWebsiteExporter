# Godot Web成果物をscene別SEO、route、Web font、配信設定付きsiteへ変換する。
# 3フレーム目のScene文字と画像を初期HTMLへ埋め、Browser起動前にも内容が伝わる設計。

extends RefCounted

const BEGIN := "<!-- YWEB_SITE_BEGIN -->" # 再生成headの開始印。
const END := "<!-- YWEB_SITE_END -->" # 再生成headの終了印。
const RUNTIME := "res://addons/yurutto_website_exporter/site_runtime.js" # Browser scene同期処理。
const WebSecurity := preload("web_security.gd") # CSPと配信headerの生成処理。
const ProductionCheck := preload("production_check.gd") # 公開LinkButtonの通信先を検査する処理。
const I18n := preload("i18n.gd") # 画面文言の言語選び。
const SiteConfig := preload("site_config.gd") # 画面とExportで共有する公開URI規則。
const OPTIONS := [
	"yweb/site/enabled", "yweb/site/config", "yweb/site/base_url", "yweb/site/title",
	"yweb/site/description", "yweb/site/locale", "yweb/site/favicon", "yweb/site/production",
	"yweb/font/matching_webfont", "yweb/font/avoid_canvas_theme_font", "yweb/ogp/image", "yweb/ogp/alt",
] # Site生成へ渡すExport設定名。
const STYLE_ATTRS := ["media", "integrity", "crossorigin", "referrerpolicy"] # styleで許可する属性。
const SCRIPT_ATTRS := ["type", "defer", "async", "integrity", "crossorigin", "referrerpolicy"] # scriptで許可する属性。
const PRERENDER_STYLE := "#yweb-site-summary{position:fixed;inset:0;z-index:3;overflow:auto;box-sizing:border-box;padding:clamp(24px,6vw,88px);background:#fff;color:#151b2d;font:16px/1.65 system-ui,sans-serif;touch-action:pan-y}#yweb-site-summary>*{max-width:72rem;margin:0 auto 1rem}#yweb-site-summary h1{font-size:clamp(2rem,6vw,4rem);line-height:1.1}#yweb-site-summary h2{margin-top:2.5rem;font-size:clamp(1.5rem,4vw,2.5rem);line-height:1.2}#yweb-site-summary h3{margin-top:2rem;font-size:1.3rem}#yweb-site-summary a{display:inline-block;margin:0 1rem 1rem 0;color:#244edb}#yweb-site-summary img{display:block;width:min(100%,72rem);height:auto;object-fit:contain}#yweb-site-summary[data-yweb-ready=true]{position:absolute;inset:auto;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0;background:transparent}" # Engine準備前は表示し、起動後も意味構造を読み上げと検索へ残す体裁。

var error_message := "" # Export画面へ返す失敗理由。
var project := "" # 現在projectの絶対path。
var output := "" # 起点HTMLの絶対path。
var out := "" # Site成果物directory。

# 設定、asset、route HTML、付属fileを一括生成する。
func build(options: Dictionary, target: String, snapshots := {}, runtime := "", quality := 0) -> Error:
	error_message = ""
	project = ProjectSettings.globalize_path("res://").trim_suffix("/")
	output = target
	out = target.get_base_dir()
	var old_pages := _published_pages()
	if not FileAccess.file_exists(output):
		return _fail(I18n.t("no_export_html", [output]))
	# site機能を切っていても、Canvas文字の扱いはBrowserへ伝える。
	var avoid := bool(options.get("yweb/font/avoid_canvas_theme_font", true))
	if not bool(options.get("yweb/site/enabled", true)):
		var error := _write_text_config(avoid, bool(options.get("yweb/site/production", true)))
		if error != OK:
			return error
		error = _clean_site(old_pages)
		return error if error != OK else _write_manifest(runtime, quality)
	var data := _configuration(options)
	if not error_message.is_empty():
		return FAILED
	data.avoid_canvas_theme_font = avoid
	_validate_links(data, snapshots)
	if not error_message.is_empty():
		return FAILED
	# 各sceneの公開URLを確定する。以後のcanonical、sitemap、route生成はこの値を使う。
	var url := _urls(data.site.base_url)
	if not error_message.is_empty():
		return FAILED
	for scene in data.scenes.values():
		scene.canonical = url.absolute.call(scene.uri.trim_prefix("/"))
	_copy_assets(data, url)
	if not error_message.is_empty():
		return FAILED
	var snapshot_images := _snapshot_images(snapshots, url.public_path)
	if not error_message.is_empty():
		return FAILED
	# Scene遷移後の意味文書を一fileへ集め、物理HTML間の重複を避ける。
	var semantics := {}
	for key in data.scenes:
		var scene: Dictionary = data.scenes[key]
		semantics[scene.scene] = _semantic(scene, snapshots.get(scene.scene, {}), url, snapshot_images)
	var font_map := _webfonts(bool(options.get("yweb/font/matching_webfont", true)), url.public_path)
	if not error_message.is_empty():
		return FAILED
	# 共有画像とfaviconを一箇所へ集め、どのpageからも同じURLで指せるようにする。
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
	# Godotが書いたHTMLを下地に、site rootへ出すsceneを選ぶ。
	var base := FileAccess.get_file_as_string(output)
	var scenes: Array = data.scenes.values()
	var first: Dictionary = scenes[0]
	for scene in scenes:
		if scene.uri == "/":
			first = scene
			break
	var rendered := _render(base, data, first, image, url, font_map, snapshots.get(first.scene, {}), snapshot_images)
	if not error_message.is_empty():
		return FAILED
	var error := _write(output, rendered)
	if error != OK:
		return error
	# 見つからないpage用に、起点sceneの体裁を借りた404を作る。検索には載せない。
	var missing := first.duplicate(true)
	missing.merge({
		"title": I18n.t("not_found_title", [data.site.name], data.site.locale),
		"description": I18n.t("not_found_text", [], data.site.locale),
		"summary": I18n.t("not_found_text", [], data.site.locale),
		"robots": "noindex,nofollow", "uri": "/404/", "meta": [], "styles": [], "scripts": [], "json_ld": {},
	}, true)
	error = _write(out.path_join("404.html"), _render(base, data, missing, image, url, font_map, {}, snapshot_images, true))
	if error != OK:
		return error
	# 全URLへ実HTMLを置き、静的hostへの直リンクを成立させる。
	for scene in scenes:
		if scene.uri == "/":
			continue
		var directory := out.path_join(scene.uri.trim_prefix("/").trim_suffix("/"))
		DirAccess.make_dir_recursive_absolute(directory)
		error = _write(directory.path_join("index.html"), _render(base, data, scene, image, url, font_map, snapshots.get(scene.scene, {}), snapshot_images))
		if error != OK:
			return error
	error = _clean_pages(old_pages, scenes)
	if error != OK:
		return error
	# Browser側のscene切替が読む設定を書き出す。
	data.webfonts = font_map
	error = _write(out.path_join("yweb-site.json"), JSON.stringify(data, "\t") + "\n")
	if error != OK:
		return error
	error = _write(out.path_join("yweb-semantics.json"), JSON.stringify(semantics) + "\n")
	if error != OK:
		return error
	# 検索へ知らせるため、全pageのURLを並べたsitemapとrobotsを出す。
	var pages := ""
	for scene in scenes:
		pages += "<url><loc>%s</loc></url>" % _html(scene.canonical)
	error = _write(out.path_join("sitemap.xml"), "<?xml version=\"1.0\" encoding=\"UTF-8\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">%s</urlset>\n" % pages)
	if error != OK:
		return error
	error = _write(out.path_join("robots.txt"), "User-agent: *\nAllow: /\nSitemap: %s\n" % url.absolute.call("sitemap.xml"))
	if error != OK:
		return error
	var security := WebSecurity.new()
	error = security.finalize(out, data)
	if error != OK:
		return _fail(security.error_message)
	return _write_manifest(runtime, quality)

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
		"production": bool(options.get("yweb/site/production", true)),
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
		if not bool(value.get("page", true)):
			continue
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
	if scenes.is_empty():
		_fail(I18n.t("need_page"))
		return {}
	return {
		"site": site, "scenes": scenes,
		"commerce": source.get("commerce", {}), "security": source.get("security", {}), "hosting": source.get("hosting", {}),
		"ogp": String(options.get("yweb/ogp/image", "res://web/ogp.png")),
		"alt": String(options.get("yweb/ogp/alt", I18n.t("ogp_alt"))),
	}

# 初期HTMLのLinkButtonを本番通信と課金pageの導線として検査する。
func _validate_links(data: Dictionary, snapshots: Dictionary) -> void:
	var production := bool(data.site.get("production", true))
	var checker := ProductionCheck.new()
	var commerce: Dictionary = data.get("commerce", {})
	var paid := bool(commerce.get("enabled", false))
	var required := [commerce.get("privacy", ""), commerce.get("terms", ""), commerce.get("refund", ""), commerce.get("contact", ""), commerce.get("disclosure", "")]
	var checkout := false
	for scene in data.scenes.values():
		var links: Array[String] = []
		for item in snapshots.get(scene.scene, {}).get("items", []):
			if item is Dictionary and item.get("tag", "") == "a":
				var href := String(item.get("href", "")).strip_edges()
				links.append(href)
				if production and href.begins_with("http://") and not checker._secure_url(href, true):
					_fail(I18n.t("production_link_https", [href]))
					return
				for host in commerce.get("checkout_hosts", []):
					checkout = checkout or href.begins_with(String(host).trim_suffix("/") + "/") or href == String(host).trim_suffix("/")
		if paid:
			for route in required:
				if String(route) not in links:
					_fail(I18n.t("production_legal_link", [route]))
					return
	if paid and not checkout:
		_fail(I18n.t("production_checkout_link"))

# URIをsite rootから始まるdirectory形式へ正規化する。
func _route(value: String) -> String:
	return SiteConfig.normalize_uri(value)

# 前回生成した物理pageのURIを、削除routeの判定へ使う。
func _published_pages() -> Array[String]:
	var file := out.path_join("yweb-site.json")
	if not FileAccess.file_exists(file):
		return []
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(file))
	if not data is Dictionary or not data.get("scenes", {}) is Dictionary:
		return []
	var saved: Dictionary = data
	var known: Dictionary = saved.scenes
	var pages: Array[String] = []
	for scene in known.values():
		if scene is Dictionary:
			var uri := _route(String(scene.get("uri", "")))
			if not uri.is_empty() and uri != "/":
				pages.append(uri)
	return pages

# 現設定から消えた生成HTMLを回収し、未知URLを404へ戻す。
func _clean_pages(old_pages: Array[String], scenes: Array) -> Error:
	var current := {}
	for scene in scenes:
		current[scene.uri] = true
	for uri in old_pages:
		if current.has(uri):
			continue
		var directory := out.path_join(uri.trim_prefix("/").trim_suffix("/"))
		var page := directory.path_join("index.html")
		if FileAccess.file_exists(page):
			var error := DirAccess.remove_absolute(page)
			if error != OK:
				return error
		var dir := DirAccess.open(directory)
		if dir and dir.get_files().is_empty() and dir.get_directories().is_empty():
			var error := DirAccess.remove_absolute(directory)
			if error != OK:
				return error
	return OK

# Site無効時に前回のrouteと検索向け付属物を回収する。
func _clean_site(old_pages: Array[String]) -> Error:
	var error := _clean_pages(old_pages, [])
	if error != OK:
		return error
	for name in ["yweb-site.json", "yweb-semantics.json", "yweb-security.json", "_headers", "sitemap.xml", "robots.txt", "404.html"]:
		var file := out.path_join(name)
		if FileAccess.file_exists(file):
			error = DirAccess.remove_absolute(file)
			if error != OK:
				return error
	var images := out.path_join("yweb-images")
	error = _clear_files(images)
	if error != OK:
		return error
	if DirAccess.dir_exists_absolute(images):
		error = DirAccess.remove_absolute(images)
		if error != OK:
			return error
	return OK

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

# Sceneで使う画像を内容hash付きURLへまとめ、古い生成画像を回収する。
func _snapshot_images(snapshots: Dictionary, public_path: Callable) -> Dictionary:
	var target := out.path_join("yweb-images")
	DirAccess.make_dir_recursive_absolute(target)
	var images := {}
	var keep := {}
	for snapshot in snapshots.values():
		if not snapshot is Dictionary:
			continue
		for value in snapshot.get("items", []):
			if not value is Dictionary or value.get("tag", "") != "img":
				continue
			var source := String(value.get("source", ""))
			if images.has(source):
				continue
			var file := _resource(source)
			if file.is_empty() or not FileAccess.file_exists(file):
				_fail(I18n.t("image_copy", [source]))
				return {}
			var extension := file.get_extension().to_lower()
			var stem := _file_name(file.get_file().get_basename())
			if stem.replace("-", "").replace("_", "").is_empty():
				stem = "image"
			var hash := FileAccess.get_sha256(file)
			var digest := hash.substr(0, 12)
			var name := "%s-%s.%s" % [stem, digest, extension]
			var destination := target.path_join(name)
			if (not FileAccess.file_exists(destination) or FileAccess.get_sha256(destination) != hash) and DirAccess.copy_absolute(file, destination) != OK:
				_fail(I18n.t("image_copy", [source]))
				return {}
			images[source] = public_path.call("yweb-images/%s" % name)
			keep[name] = true
	# 現Scene集合から参照されなくなった旧世代を成功後に回収する。
	var directory := DirAccess.open(target)
	if directory:
		for name in directory.get_files():
			if keep.has(name):
				continue
			if DirAccess.remove_absolute(target.path_join(name)) != OK:
				_fail(I18n.t("image_copy", [name]))
				return {}
	return images

# 生成専用directoryのfileを次の書き出し前に空にする。
func _clear_files(directory: String) -> Error:
	var opened := DirAccess.open(directory)
	if not opened:
		return OK
	for name in opened.get_files():
		var error := DirAccess.remove_absolute(directory.path_join(name))
		if error != OK:
			return error
	return OK

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
func _head(data: Dictionary, scene: Dictionary, image: Dictionary, url: Dictionary, font_map: Dictionary, not_found: bool) -> String:
	var canonical: String = scene.canonical
	var image_url: String = url.absolute.call("yweb-assets/%s" % image.file) if not image.is_empty() else ""
	var tags := [
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
	tags.append("<style id=\"yweb-prerender-style\">%s</style>" % PRERENDER_STYLE)
	tags.append(_metas(data.site.meta))
	tags.append(_metas(scene.meta, true))
	tags.append(_assets(data.site.styles, data.site.scripts))
	tags.append(_assets(scene.styles, scene.scripts, true))
	tags.append("<script id=\"yweb-json-ld\" type=\"application/ld+json\">%s</script>" % _json(scene.json_ld))
	tags.append("<script>window.YWEB_FONT_MAP=%s</script>" % _json(font_map))
	tags.append(_text_config(data.avoid_canvas_theme_font, bool(data.site.production)))
	tags.append("<script id=\"yweb-site-config\" type=\"application/json\">%s</script>" % _json({"root": url.root, "site": data.site, "scenes": data.scenes, "notFound": not_found}))
	var present: Array[String] = []
	for tag in tags:
		if not String(tag).is_empty():
			present.append(tag)
	return "%s\n%s\n%s" % [BEGIN, "\n".join(present), END]

# 設定済みstyleとscriptを許可属性に絞ってhead tagへ変換する。
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

# 許可した属性をhead tag用文字列へ変換する。
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

# Godot HTMLへtitle、head、初期文書、Browser同期処理を差し込む。
func _render(base: String, data: Dictionary, scene: Dictionary, image: Dictionary, url: Dictionary, font_map: Dictionary, snapshot: Dictionary, snapshot_images: Dictionary, not_found := false) -> String:
	var html := _remove_site(base)
	# 文字コードとbaseを先頭へ置き、後続の相対preloadを公開rootへ解決する。
	var charset := RegEx.new()
	charset.compile("(?i)<meta\\s+charset\\s*=\\s*['\"]?[^>]+>")
	html = charset.sub(html, "", true)
	var head := RegEx.new()
	head.compile("(?i)<head(?:\\s[^>]*)?>")
	html = head.sub(html, "$0\n\t\t<meta charset=\"utf-8\">\n\t\t<base href=\"%s\">" % _html(url.root), false)
	var viewport := RegEx.new()
	viewport.compile("(?i)<meta\\s+name=[\"']viewport[\"'][^>]*>")
	html = viewport.sub(html, "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">", true)
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
	html = html.replace("</head>", "%s\n</head>" % _head(data, scene, image, url, font_map, not_found))
	var summary := _semantic(scene, snapshot, url, snapshot_images)
	var body := RegEx.new()
	body.compile("(?i)<body([^>]*)>")
	html = body.sub(html, "<body$1>%s" % summary)
	# 404は検索情報を保った軽い静的pageとし、Engine起動による正常page化を防ぐ。
	if not_found:
		var full_body := RegEx.new()
		full_body.compile("(?is)<body([^>]*)>.*?</body>")
		html = full_body.sub(html, "<body$1>%s</body>" % summary, true)
		var scripts := RegEx.new()
		scripts.compile("(?is)<script(?:\\s[^>]*)?>.*?</script>")
		html = scripts.sub(html, "", true)
		var preloads := RegEx.new()
		preloads.compile("(?i)<link\\s+rel=[\"']preload[\"'][^>]*>")
		return preloads.sub(html, "", true)
	var runtime := FileAccess.get_file_as_string(RUNTIME)
	return html.replace("</body>", "<script id=\"yweb-site-runtime\">%s</script>\n</body>" % runtime)

# 採取した順序を保って、見出し、本文、LinkButton、画像を検索可能な要素へ変換する。
func _semantic(scene: Dictionary, snapshot: Dictionary, url: Dictionary, images: Dictionary) -> String:
	var tags: Array[String] = []
	var has_h1 := false
	var image_count := 0
	var seen_images := {}
	var items: Array = snapshot.get("items", [])
	for value in items:
		if not value is Dictionary:
			continue
		var item: Dictionary = value
		var tag := String(item.get("tag", "p"))
		if tag == "img":
			var source := String(item.get("source", ""))
			var key := "%s\n%s" % [source, item.get("alt", "")]
			if not images.has(source) or seen_images.has(key):
				continue
			seen_images[key] = true
			var priority := " loading=\"eager\" fetchpriority=\"high\"" if image_count == 0 else " loading=\"lazy\""
			tags.append("<img src=\"%s\" alt=\"%s\" width=\"%d\" height=\"%d\" decoding=\"async\"%s>" % [
				_html(images[source]), _html(item.get("alt", "")), maxi(int(item.get("width", 1)), 1),
				maxi(int(item.get("height", 1)), 1), priority,
			])
			image_count += 1
			continue
		if tag not in ["h1", "h2", "h3", "h4", "h5", "h6", "p", "a"]:
			tag = "p"
		var text := _html(item.get("text", "")).replace("\n", "<br>")
		if text.is_empty():
			continue
		has_h1 = has_h1 or tag == "h1"
		if tag == "a":
			tags.append("<a href=\"%s\">%s</a>" % [_html(_href(item.get("href", "#"), url)), text])
		else:
			tags.append("<%s>%s</%s>" % [tag, text, tag])
	if tags.is_empty():
		tags = ["<h1>%s</h1>" % _html(scene.title), "<p>%s</p>" % _html(scene.summary)]
	elif not has_h1:
		tags.push_front("<h1>%s</h1>" % _html(scene.title))
	return "<main id=\"yweb-site-summary\" data-yweb-prerender=\"true\" data-yweb-scene=\"%s\">%s</main>" % [_html(scene.scene), "".join(tags)]

# LinkButtonのURIを公開rootへ揃え、実行形式のURIを初期HTMLへ持ち込まない。
func _href(value: Variant, url: Dictionary) -> String:
	var href := String(value).strip_edges()
	if href.is_empty() or href == "#":
		return "#"
	if href.begins_with("/"):
		return url.public_path.call(href.trim_prefix("/"))
	if href.begins_with("https://") or href.begins_with("http://") or href.begins_with("mailto:") or href.begins_with("tel:"):
		return href
	if not href.contains(":") and not href.begins_with("//"):
		return url.public_path.call(href)
	return "#"

# 既存のsite生成範囲と概要を再生成前に除く。
func _remove_site(html: String) -> String:
	var head := RegEx.new()
	head.compile("(?s)%s.*?%s\\n?" % [BEGIN, END])
	html = head.sub(html, "", true)
	var summary := RegEx.new()
	summary.compile("(?s)<main id=\"yweb-site-summary\"[^>]*>.*?</main>(?:<noscript>.*?</noscript>)?")
	html = summary.sub(html, "", true)
	var runtime := RegEx.new()
	runtime.compile("(?s)<script id=\"yweb-site-runtime\">.*?</script>\\n?")
	return runtime.sub(html, "", true)

# Site無効時も文字所有設定をHTMLへ反映する。
func _write_text_config(avoid: bool, production: bool) -> Error:
	var html := FileAccess.get_file_as_string(output)
	var pattern := RegEx.new()
	pattern.compile("(?s)<script id=\"yweb-text-config\">.*?</script>\\n?")
	html = pattern.sub(html, "", true)
	html = html.replace("</head>", "%s\n</head>" % _text_config(avoid, production))
	return _write(output, html)

# DOM文字所有設定を一つのscriptへまとめる。
func _text_config(avoid: bool, production: bool) -> String:
	return "<script id=\"yweb-text-config\">window.YWEB_TEXT_CONFIG=%s</script>" % _json({"avoidCanvasThemeFont": avoid, "production": production})

# Brotliとraw成果物の対応を記録し、内蔵runtimeに限って既知の圧縮品質を示す。
func _write_manifest(runtime: String, quality: int) -> Error:
	var entries: Array[Dictionary] = []
	var has_js := false
	var has_wasm := false
	for encoded in _files(out, ["br"]):
		var raw := encoded.trim_suffix(".br")
		var extension := raw.get_extension().to_lower()
		if extension != "js" and extension != "wasm":
			continue
		if encoded.get_file().begins_with("yweb-") and not runtime.is_empty() and not encoded.get_file().begins_with(runtime + "."):
			continue
		if not FileAccess.file_exists(raw):
			return _fail(I18n.t("brotli_source", [encoded.get_file()]))
		var raw_size := _size(raw)
		var encoded_size := _size(encoded)
		if encoded_size >= raw_size:
			return _fail(I18n.t("brotli_size", [encoded.get_file()]))
		var relative := raw.trim_prefix(out.trim_suffix("/") + "/").replace("\\", "/")
		var entry := {
			"file": relative, "originalBytes": raw_size, "brotliBytes": encoded_size,
			"sha256": FileAccess.get_sha256(raw), "brotliSha256": FileAccess.get_sha256(encoded),
		}
		if encoded.get_file().begins_with(runtime + "."):
			entry["quality"] = quality
		entries.append(entry)
		has_js = has_js or extension == "js"
		has_wasm = has_wasm or extension == "wasm"
	if not has_js or not has_wasm:
		return _fail(I18n.t("brotli_template"))
	return _write(out.path_join("yweb-compression.json"), JSON.stringify({"encoding": "br", "templateQuality": quality, "entries": entries}, "\t") + "\n")

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
