# CodeEditの構文表示とBrowser入力を一画面で検証するfixture。
# 可視行、行番号、Theme、scroll、日本語IMEの確定回数を同じNodeで観測する。

extends Control

var editor: CodeEdit # Browser textareaと同期する編集本体。
var result: Label # Godotへ届いた確定編集の回数と内容。
var changes := 0 # text_changedが発生した回数。

# CodeEditと観測表示を固定位置へ構成する。
func _ready() -> void:
	# GodotとBrowserへ同じ字形を渡し、CodeEditの配置精度を独立して測る。
	var font := load("res://fonts/Match.ttf") as FontFile
	var background := ColorRect.new()
	background.color = Color("111827")
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	editor = CodeEdit.new()
	editor.name = "SourceEditor"
	editor.position = Vector2(32, 32)
	editor.size = Vector2(736, 170)
	editor.text = _source()
	editor.set_draw_line_numbers(true)
	editor.set_line_numbers_min_digits(3)
	editor.set_line_numbers_zero_padded(true)
	editor.set_highlight_current_line(true)
	editor.set_draw_fold_gutter(true)
	editor.set_line_folding_enabled(true)
	editor.set_indent_size(4)
	editor.set_indent_using_spaces(true)
	editor.set_line_length_guidelines([40, 64])
	editor.add_theme_font_size_override("font_size", 18)
	if font != null:
		editor.add_theme_font_override("font", font)
	editor.add_theme_constant_override("line_spacing", 4)
	editor.add_theme_color_override("font_color", Color("e5e7eb"))
	editor.add_theme_color_override("line_number_color", Color("93c5fd"))
	editor.add_theme_color_override("current_line_color", Color("24324a"))
	editor.add_theme_color_override("selection_color", Color("365f9d"))
	editor.add_theme_color_override("caret_color", Color("f9fafb"))
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color("172033")
	panel.border_color = Color("475569")
	panel.set_border_width_all(2)
	panel.set_corner_radius_all(6)
	panel.content_margin_left = 10
	panel.content_margin_top = 8
	panel.content_margin_right = 10
	panel.content_margin_bottom = 8
	editor.add_theme_stylebox_override("normal", panel)
	editor.set_syntax_highlighter(_highlighter())
	editor.text_changed.connect(_text_changed)
	add_child(editor)

	result = Label.new()
	result.name = "EditResult"
	result.position = Vector2(32, 222)
	result.size = Vector2(736, 34)
	result.add_theme_font_size_override("font_size", 17)
	if font != null:
		result.add_theme_font_override("font", font)
	result.add_theme_color_override("font_color", Color("f8fafc"))
	add_child(result)
	_update_result()

# GDScriptの主要な色区分をCodeHighlighterへ設定する。
func _highlighter() -> CodeHighlighter:
	var value := CodeHighlighter.new()
	value.add_keyword_color("extends", Color("c084fc"))
	value.add_keyword_color("func", Color("c084fc"))
	value.add_keyword_color("var", Color("c084fc"))
	value.add_keyword_color("return", Color("c084fc"))
	value.add_color_region("#", "", Color("6ee7b7"), true)
	value.add_color_region("\"", "\"", Color("fbbf24"))
	value.number_color = Color("fb7185")
	value.symbol_color = Color("94a3b8")
	value.function_color = Color("67e8f9")
	return value

# 縦scrollで可視行が入れ替わる長さの固定コードを作る。
func _source() -> String:
	var lines := PackedStringArray([
		"extends Node",
		"",
		"# 日本語のコメントも構文色で表示する",
		"func greet(name: String) -> String:",
		"    var message := \"こんにちは、%s\" % name",
		"    return message",
	])
	for index in range(30):
		lines.append("var value_%02d := %d" % [index, index])
	return "\n".join(lines)

# Browserから確定した編集を一回ずつ数える。
func _text_changed() -> void:
	changes += 1
	_update_result()

# IME確定が文章単位で届いたことを画面上のDOMから検査可能にする。
func _update_result() -> void:
	var comment := editor.get_line(1) if editor.get_line_count() > 1 else ""
	result.text = "CHANGES %d LINES %d COMMENT %s" % [changes, editor.get_line_count(), comment]
