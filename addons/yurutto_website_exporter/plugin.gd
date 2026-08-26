# ゆるっとWebをEditorへ登録する入口。
# 独立Export、ページ編集画面、OGP撮影ボタンを同じ寿命で管理する。

@tool
extends EditorPlugin

const PLATFORM := preload("res://addons/yurutto_website_exporter/platform.gd") # 独立Export処理。
const OGP := preload("res://addons/yurutto_website_exporter/ogp_plugin.gd") # OGP Autoボタン。
const SiteConfig := preload("res://addons/yurutto_website_exporter/site_config.gd") # Export presetのJSON path取得。
const PAGES := preload("res://addons/yurutto_website_exporter/site_pages_panel.gd") # ページ設定画面。
const CONFIG_PATH := "res://yweb-site.json" # Scene情報JSONの既定位置。
const MENU := "Yurutto Pages" # ProjectのTools menuへ出す名称。

var platform: EditorExportPlatform # 登録中の独立プラットフォーム。
var ogp: EditorExportPlugin # 登録中の撮影ボタン。
var pages # 下部へ登録中のページ設定画面。

# ゆるっとWebと補助機能を有効化する。
func _enter_tree() -> void:
	platform = PLATFORM.new(self)
	ogp = OGP.new(self)
	add_export_platform(platform)
	add_export_plugin(ogp)
	pages = PAGES.new()
	pages.setup(SiteConfig.paths(CONFIG_PATH))
	add_control_to_bottom_panel(pages, MENU)
	add_tool_menu_item(MENU, _show_pages)

# Editor終了時に登録物を回収する。
func _exit_tree() -> void:
	remove_tool_menu_item(MENU)
	if pages:
		remove_control_from_bottom_panel(pages)
		pages.queue_free()
	if ogp:
		remove_export_plugin(ogp)
	if platform:
		remove_export_platform(platform)
	ogp = null
	platform = null
	pages = null

# Tools menuからページ設定画面を開く。
func _show_pages() -> void:
	make_bottom_panel_item_visible(pages)
