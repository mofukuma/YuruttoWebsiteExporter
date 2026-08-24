# 白背景Themeと異なるCodeEdit設定を比較するfixture。
# 暗色版と同じ同期経路へ、gutter、guide、tab設定の別条件を与える。

extends "res://code_edit.gd"

# 明色Themeと別の編集オプションへ切り替える。
func _ready() -> void:
	super._ready()
	(editor.get_parent().get_child(0) as ColorRect).color = Color("f8fafc")
	editor.size.y = 170
	editor.set_line_numbers_min_digits(2)
	editor.set_line_numbers_zero_padded(false)
	editor.set_highlight_current_line(false)
	editor.set_draw_fold_gutter(false)
	editor.set_line_folding_enabled(false)
	editor.set_draw_breakpoints_gutter(true)
	editor.set_line_as_breakpoint(2, true)
	editor.set_tab_size(8)
	editor.set_indent_size(8)
	editor.set_indent_using_spaces(false)
	editor.set_line_length_guidelines([24])
	editor.add_theme_color_override("font_color", Color("172033"))
	editor.add_theme_color_override("line_number_color", Color("475569"))
	editor.add_theme_color_override("selection_color", Color("bfdbfe"))
	editor.add_theme_color_override("caret_color", Color("0f172a"))
	editor.add_theme_color_override("breakpoint_color", Color("dc2626"))
	editor.add_theme_color_override("line_length_guideline_color", Color("cbd5e1"))
	var panel := editor.get_theme_stylebox("normal") as StyleBoxFlat
	panel.bg_color = Color("ffffff")
	panel.border_color = Color("cbd5e1")
	result.position.y = 222
	result.add_theme_color_override("font_color", Color("172033"))

# tab文字と日本語を含む明色向けのコードを作る。
func _source() -> String:
	var lines := PackedStringArray([
		"extends Node",
		"",
		"# 白背景の日本語コメント",
		"func ready() -> void:",
		"\tprint(\"light theme\")",
		"\treturn",
	])
	for index in range(24):
		lines.append("var light_%02d := %d" % [index, index])
	return "\n".join(lines)

# 白背景でも構文区分が読める色を返す。
func _highlighter() -> CodeHighlighter:
	var value := CodeHighlighter.new()
	value.add_keyword_color("extends", Color("7e22ce"))
	value.add_keyword_color("func", Color("7e22ce"))
	value.add_keyword_color("var", Color("7e22ce"))
	value.add_keyword_color("return", Color("7e22ce"))
	value.add_color_region("#", "", Color("047857"), true)
	value.add_color_region("\"", "\"", Color("a16207"))
	value.number_color = Color("be123c")
	value.symbol_color = Color("64748b")
	value.function_color = Color("0369a1")
	return value
