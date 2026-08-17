# エクスポート画面へ出す文言を、使う人の言語で選ぶ。
# 対応は英語と日本語。code側にはkeyと差し込み値だけを残す設計。

@tool
extends RefCounted

# 文言表。keyごとに英語と日本語を並べる。%sの数と順番は両方で揃える。
const TEXTS := {
	# 既定値としてsiteへ入る文。
	"site_description": ["A website made with Godot.", "Godotで作成したWebサイトです。"],
	"ogp_alt": ["Site preview image", "サイトのプレビュー画像"],
	"not_found_title": ["Page not found | %s", "ページが見つかりません | %s"],
	"not_found_text": ["The page you asked for was not found.", "指定されたページは見つかりませんでした。"],
	# 設定への助言。
	"warn_no_config": ["No scene JSON. Exporting with the main scene as the only page.", "Scene情報JSONがありません。main sceneの既定値で書き出します。"],
	"warn_https": ["Use an HTTPS URL for the public base URL.", "公開用base URLにはHTTPS URLを指定してください。"],
	"warn_no_ogp": ["No social image yet. OGP Auto can make one from the current scene.", "OGP画像がありません。OGP Autoで現在Sceneから生成できます。"],
	"need_main_scene": ["Set a main scene.", "main sceneを設定してください。"],
	# 導入状態の不一致。
	"no_manifest": ["Template manifest is missing. Install the addon again.", "テンプレートmanifestがありません。アドオンを再導入してください。"],
	"godot_mismatch": ["The bundled template is for Godot %s. Install the addon built for this Godot.", "内蔵テンプレートはGodot %s専用です。対応addonを導入してください。"],
	"no_csharp": ["A C# project cannot be exported to the web with Godot %s.", "Godot %sのC# projectはWebへ書き出せません。"],
	"no_template": ["The bundled web template is missing. Install the addon again.", "内蔵Webテンプレートがありません。アドオンを再導入してください。"],
	"template_changed": ["The bundled web template does not match its recorded hash.", "内蔵Webテンプレートの内容が一致しません。"],
	# 書き出し中の失敗。
	"need_html": ["Give the output a name ending in .html.", "出力先は.htmlを指定してください。"],
	"no_out_dir": ["Cannot create the output directory: %s", "出力directoryを作成できません: %s"],
	"no_pck": ["Cannot build the PCK: %s", "PCKを生成できません: %s"],
	"no_gdextension": ["GDExtension cannot be used with this fixed web template.", "GDExtensionは固定Webテンプレートで使用できません。"],
	"template_open": ["Cannot open the bundled web template.", "内蔵Webテンプレートを開けません。"],
	"template_path": ["Unsafe path inside the template: %s", "不正なテンプレートpathです: %s"],
	"template_write": ["Cannot write the template out: %s", "テンプレートを書き込めません: %s"],
	"html_read": ["Cannot read the template HTML: %s", "テンプレートHTMLを読めません: %s"],
	"html_write": ["Cannot write the template HTML: %s", "テンプレートHTMLを書けません: %s"],
	"license_copy": ["Cannot place a license file: %s", "licenseを配置できません: %s"],
	"exported": ["Exported with the bundled template: %s", "内蔵テンプレートで書き出しました: %s"],
	# 失敗の見出し。
	"topic_export": ["Export", "Export"],
	"topic_project": ["Project check", "Project検査"],
	"topic_pck": ["PCK", "PCK"],
	"topic_template": ["Template", "Template"],
	"topic_html": ["HTML", "HTML"],
	"topic_license": ["License", "License"],
	"topic_site": ["Site", "Site生成"],
	# site設定の読み取り。
	"no_export_html": ["No exported HTML: %s", "Export HTMLがありません: %s"],
	"site_json_object": ["yweb-site.json must be a JSON object.", "yweb-site.jsonはJSON objectで指定してください。"],
	"site_json_version": ["yweb-site.json supports version 1.", "yweb-site.json versionは1へ対応します。"],
	"scene_json_object": ["A scene entry must be a JSON object: %s", "scene設定はJSON objectで指定してください: %s"],
	"scene_missing": ["Scene not found: %s", "sceneがありません: %s"],
	"uri_invalid": ["URI is invalid or duplicated: %s", "URIが不正または重複しています: %s"],
	"meta_fields": ["A meta entry needs content plus name or property.", "metaにはnameまたはpropertyとcontentが必要です。"],
	# base URLの決まり。
	"url_query": ["The base URL cannot carry a query or fragment: %s", "base URLにqueryとfragmentは使用できません: %s"],
	"url_scheme": ["Not an HTTP URL: %s", "HTTP URLではありません: %s"],
	"url_host": ["The base URL has no host: %s", "base URLにhostがありません: %s"],
	"url_path": ["The base URL path has characters that cannot be used: %s", "base URLのpathに使用できない文字があります: %s"],
	# fileの受け渡し。
	"favicon_missing": ["Favicon not found: %s", "faviconがありません: %s"],
	"favicon_copy": ["Cannot place the favicon.", "faviconを配置できません。"],
	"font_copy": ["Cannot place the web font: %s", "Web fontを配置できません: %s"],
	"asset_path": ["Public asset path is invalid: %s", "公開asset pathが不正です: %s"],
	"asset_copy": ["Cannot place the public asset: %s", "公開assetを配置できません: %s"],
	"asset_brotli": ["Cannot place the Brotli asset: %s", "Brotli assetを配置できません: %s"],
	"ogp_read": ["Cannot read the social image: %s", "OGP画像を読めません: %s"],
	"ogp_copy": ["Cannot place the social image.", "OGP画像を配置できません。"],
	"not_res_path": ["Not a res:// path: %s", "res:// pathではありません: %s"],
	"outside_project": ["Path is outside the project: %s", "project外pathです: %s"],
	"write_failed": ["Cannot write the file: %s", "fileを書けません: %s"],
	"brotli_source": ["The file behind a Brotli copy is missing: %s", "Brotli元fileがありません: %s"],
	"brotli_size": ["The Brotli copy did not get smaller: %s", "Brotli成果物が縮んでいません: %s"],
	"brotli_template": ["The bundled template is missing its Brotli copies.", "内蔵Brotli付きテンプレートが不足しています。"],
	# OGP Auto。
	"ogp_need_saved_scene": ["OGP Auto needs a saved scene.", "OGP Autoには保存済みsceneが必要です。"],
	"ogp_failed": ["OGP Auto failed: %s", "OGP Auto失敗: %s"],
	"ogp_bad_args": ["The capture arguments are invalid.", "OGP撮影引数が不正です。"],
	# 3DとGDExtensionの拒否理由。
	"block_gdextension": ["GDExtension is not supported", "GDExtension非対応"],
	"block_mesh": ["3D mesh resource", "3D mesh resource"],
	"block_model": ["3D asset", "3D asset"],
	"block_type_3d": ["3D type", "3D型"],
	"block_resource_3d": ["3D resource", "3D resource"],
	"block_script_3d": ["3D script", "3D script"],
	"block_dynamic_3d": ["3D type created at runtime", "動的3D型"],
	"block_server_3d": ["3D server", "3D server"],
	"block_spatial_shader": ["spatial shader", "spatial shader"],
	"block_binary_3d": ["3D type in a binary resource", "binary resource内の3D型"],
	"block_binary_unreadable": ["binary resource that cannot be inspected", "検査不能binary resource"],
}

# 使う人の言語を、日本語かそれ以外かで選ぶ。
# Editor上ではEditorの言語、それ以外では起動時の言語を見る。
static func japanese(locale := "") -> bool:
	var value := locale
	if value.is_empty():
		value = TranslationServer.get_tool_locale() if Engine.is_editor_hint() else TranslationServer.get_locale()
	return value.begins_with("ja")

# keyの文言へ差し込み値を入れて返す。
static func t(key: StringName, args := [], locale := "") -> String:
	var pair: Array = TEXTS.get(key, [])
	if pair.is_empty():
		return String(key)
	var text: String = pair[1] if japanese(locale) else pair[0]
	return text % args if not args.is_empty() else text
