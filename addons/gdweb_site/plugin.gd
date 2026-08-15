# ゆるっとWebをEditorへ登録する入口。
# 独立ExportプラットフォームとOGP撮影ボタンを同じ寿命で管理する。

@tool
extends EditorPlugin

const PLATFORM := preload("res://addons/gdweb_site/platform.gd") # 独立Export処理。
const OGP := preload("res://addons/gdweb_site/ogp_plugin.gd") # OGP Autoボタン。

var platform: EditorExportPlatform # 登録中の独立プラットフォーム。
var ogp: EditorExportPlugin # 登録中の撮影ボタン。

# ゆるっとWebと補助機能を有効化する。
func _enter_tree() -> void:
	platform = PLATFORM.new(self)
	ogp = OGP.new(self)
	add_export_platform(platform)
	add_export_plugin(ogp)

# Editor終了時に登録物を回収する。
func _exit_tree() -> void:
	if ogp:
		remove_export_plugin(ogp)
	if platform:
		remove_export_platform(platform)
	ogp = null
	platform = null
