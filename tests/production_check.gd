# 本番公開検査のHTTPS、SRI、課金境界、秘密情報検出を短く検証する。
# PCK生成前の拒否条件を実Exportから分離し、一つのGodot起動で網羅する設計。

extends SceneTree

const Check := preload("res://addons/yurutto_website_exporter/production_check.gd") # 公開前検査の対象。
const Builder := preload("res://addons/yurutto_website_exporter/site_builder.gd") # 課金導線検査の対象。
const Security := preload("res://addons/yurutto_website_exporter/web_security.gd") # 配信容量検査の対象。
const SECRET_FILE := "res://tmp/production-check/secret.env" # 秘密検出用の一時file。
const LARGE_FILE := "res://tmp/production-check/large.bin" # 配信上限検査用の一時file。

# 条件を満たさない場合に終了codeへ失敗を反映する。
func need(value: bool, message: String) -> void:
	if value:
		return
	push_error(message)
	quit(1)

# 外部入力ごとの拒否理由を同じ検査instanceで確認する。
func _init() -> void:
	var check := Check.new()
	need(check._secure_url("https://service.example.jp/path", true), "HTTPSを拒否した")
	need(check._secure_url("http://127.0.0.1:4173/path", true), "loopback開発URLを拒否した")
	need(not check._secure_url("http://service.example", true), "本番HTTPを許可した")
	need(not check._secure_url("http://localhost.evil.example/", true), "loopback偽装を許可した")
	need(not check._secure_url("https://example.com", true), "仮base URLを許可した")
	check._check_assets({"site": {"scripts": [{"src": "http://cdn.example/app.js"}]}, "scenes": {}})
	need(check.errors.size() == 1, "HTTP assetを検出できない")
	check.errors.clear()
	check._check_assets({"site": {"scripts": [{"src": "javascript:alert(1)"}]}, "scenes": {}})
	need(check.errors.size() == 1, "実行scheme assetを検出できない")
	check.errors.clear()
	check._check_assets({"site": {"scripts": [{"src": "res://web/app.js"}]}, "scenes": {}})
	need(check.errors.is_empty(), "project内assetを拒否した")
	check.errors.clear()
	check._check_assets({"site": {"scripts": [{"src": "https://cdn.example/app.js", "integrity": "sha384-YWJj", "crossorigin": "anonymous"}]}, "scenes": {}})
	need(check.errors.is_empty(), "SRI付きHTTPS assetを拒否した")
	var scenes := {
		"Privacy": {"uri": "/privacy/"}, "Terms": {"uri": "/terms/"},
		"Refund": {"uri": "/refund/"}, "Contact": {"uri": "/contact/"}, "Disclosure": {"uri": "/disclosure/"},
	}
	check._check_commerce({"commerce": {
		"enabled": true, "mode": "hosted", "checkout_hosts": ["https://buy.stripe.com"],
		"privacy": "/privacy/", "terms": "/terms/", "refund": "/refund/", "contact": "/contact/", "disclosure": "/disclosure/",
	}, "scenes": scenes})
	need(check.errors.is_empty(), "完全な課金境界を拒否した")
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://tmp/production-check"))
	var file := FileAccess.open(SECRET_FILE, FileAccess.WRITE)
	file.store_string("STRIPE_KEY=s" + "k_live_1234567890abcdef1234")
	file.close()
	check._scan_file(ProjectSettings.globalize_path("res://" ).trim_suffix("/"), ProjectSettings.globalize_path(SECRET_FILE))
	need(check.errors.any(func(value): return "Stripe secret key" in value), "秘密情報を検出できない")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SECRET_FILE))
	# 全pageから法務情報とHosted Checkoutへ辿れる構成を確認する。
	var builder := Builder.new()
	var commerce := {"enabled": true, "checkout_hosts": ["https://buy.stripe.com"], "privacy": "/privacy/", "terms": "/terms/", "refund": "/refund/", "contact": "/contact/", "disclosure": "/disclosure/"}
	var data := {"site": {"production": true}, "commerce": commerce, "scenes": {"Home": {"scene": "res://main.tscn"}}}
	var links := ["/privacy/", "/terms/", "/refund/", "/contact/", "/disclosure/", "https://buy.stripe.com/test"]
	var items := links.map(func(href): return {"tag": "a", "href": href})
	builder._validate_links(data, {"res://main.tscn": {"items": items}})
	need(builder.error_message.is_empty(), "完全な課金導線を拒否した")
	builder.error_message = ""
	builder._validate_links(data, {"res://main.tscn": {"items": items.slice(1)}})
	need(not builder.error_message.is_empty(), "法務導線不足を許可した")
	# 選択したhostの一file上限を超えた成果物を止める。
	var large := FileAccess.open(LARGE_FILE, FileAccess.WRITE)
	large.store_buffer(PackedByteArray([1, 2]))
	large.close()
	var security := Security.new()
	need(security._check_size(ProjectSettings.globalize_path("res://tmp/production-check"), {"hosting": {"max_file_bytes": 1}}) != OK, "配信上限超過を許可した")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(LARGE_FILE))
	# snapshot後の生成HTMLへ混じった秘密も最終成果物検査で止める。
	var generated := "res://tmp/production-check/generated.html"
	var leaked := FileAccess.open(generated, FileAccess.WRITE)
	leaked.store_string("<p>s" + "k_live_1234567890abcdef1234</p>")
	leaked.close()
	need(check.inspect_output(ProjectSettings.globalize_path("res://tmp/production-check")).any(func(value): return "Stripe secret key" in value), "生成HTMLの秘密を検出できない")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(generated))
	need(security._origin("https://cdn.example 'unsafe-eval'", true).is_empty(), "CSP token注入を許可した")
	need(security._permissions({"security": {"permissions_policy": "camera=()\nX-Test: yes"}}).is_empty(), "header改行を許可した")
	# 実行されないJSON dataをCSPへ列挙せず、実行scriptのみhash化する。
	var hashes := {}
	security._collect_hashes("<script type=\"application/json\">{}</script><script>run()</script>", "script", hashes)
	need(hashes.size() == 1, "JSON dataまでCSP hashへ含めた")
	quit()
