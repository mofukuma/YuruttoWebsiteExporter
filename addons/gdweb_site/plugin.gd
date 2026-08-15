# Web export設定をEditorへ登録する。
# 標準Godot 4.7.1へ追加でき、改変Editor binaryを要求しない設計。

@tool
extends EditorPlugin

const EXPORTER := preload("res://addons/gdweb_site/export_plugin.gd") # Web preset拡張。

var exporter: EditorExportPlugin # 登録中のexport処理。

# Exporter設定を有効化する。
func _enter_tree() -> void:
	exporter = EXPORTER.new(self)
	add_export_plugin(exporter)

# Editor終了時に登録物を回収する。
func _exit_tree() -> void:
	remove_export_plugin(exporter)
	exporter = null
