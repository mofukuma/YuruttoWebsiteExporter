# CodeEditの入力、構文表示、設定差、minimapを白背景の一画面で検証するfixture。
# 上段はIME編集、下段は別設定とminimap操作を担当し、両DOMを同時に比較する。

extends Control

var editor: CodeEdit # Browser入力とIMEを検査する上段編集欄。
var mini_editor: CodeEdit # 設定差とminimapを検査する下段編集欄。
var result: Label # 上段の確定編集回数と内容。
var mini_result: Label # minimap操作後のGodot表示開始行。
var changes := 0 # 上段text_changedの発生回数。
var first_line := -1 # 表示済みminimap開始行。
var reattached := false # tree再追加時の本文復元を一度検査した状態。

# 二つの編集欄を同じ白背景へ配置する。
func _ready() -> void:
	var font := load("res://fonts/Match.ttf") as FontFile
	var background := ColorRect.new()
	background.color = Color("f8fafc")
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	editor = _make_editor("SourceEditor", Vector2(32, 24), Vector2(736, 180), font, 18, _source("value", 30))
	editor.set_line_numbers_min_digits(3)
	editor.set_line_numbers_zero_padded(true)
	editor.set_highlight_current_line(true)
	editor.set_draw_fold_gutter(true)
	editor.set_line_folding_enabled(true)
	editor.set_indent_size(4)
	editor.set_indent_using_spaces(true)
	editor.set_line_length_guidelines([32, 48])
	editor.add_theme_color_override("line_number_color", Color("2563eb"))
	editor.add_theme_color_override("current_line_color", Color("dbeafe"))
	editor.text_changed.connect(_text_changed)

	result = _make_label("EditResult", Vector2(32, 214), font)
	_update_result()

	mini_editor = _make_editor("MinimapEditor", Vector2(32, 286), Vector2(736, 238), font, 18, _source("light", 200))
	mini_editor.set_line_numbers_min_digits(2)
	mini_editor.set_line_numbers_zero_padded(false)
	mini_editor.set_highlight_current_line(false)
	mini_editor.set_draw_fold_gutter(false)
	mini_editor.set_line_folding_enabled(false)
	mini_editor.set_draw_breakpoints_gutter(true)
	mini_editor.set_line_as_breakpoint(2, true)
	mini_editor.set_tab_size(8)
	mini_editor.set_indent_size(8)
	mini_editor.set_indent_using_spaces(false)
	mini_editor.set_line_length_guidelines([24])
	mini_editor.set_draw_minimap(true)
	mini_editor.set_minimap_width(110)
	mini_editor.add_theme_color_override("line_number_color", Color("475569"))
	mini_editor.add_theme_color_override("breakpoint_color", Color("dc2626"))
	mini_editor.add_theme_color_override("line_length_guideline_color", Color("cbd5e1"))
	mini_editor.focus_entered.connect(_change_minimap_syntax)
	mini_editor.text_changed.connect(_update_minimap_result)

	mini_result = _make_label("MinimapResult", Vector2(32, 538), font)
	_update_minimap_result()

# 白Themeと共通入力条件を持つCodeEditを作る。
func _make_editor(node_name: String, at: Vector2, extent: Vector2, font: FontFile, font_size: int, source: String) -> CodeEdit:
	var value := CodeEdit.new()
	value.name = node_name
	value.position = at
	value.size = extent
	value.text = source
	value.set_draw_line_numbers(true)
	value.add_theme_font_size_override("font_size", font_size)
	if font != null:
		value.add_theme_font_override("font", font)
	value.add_theme_constant_override("line_spacing", 4)
	value.add_theme_color_override("font_color", Color("172033"))
	value.add_theme_color_override("selection_color", Color("bfdbfe"))
	value.add_theme_color_override("caret_color", Color("0f172a"))
	var panel := StyleBoxFlat.new()
	panel.bg_color = Color("ffffff")
	panel.border_color = Color("cbd5e1")
	panel.set_border_width_all(2)
	panel.set_corner_radius_all(6)
	panel.content_margin_left = 10
	panel.content_margin_top = 8
	panel.content_margin_right = 10
	panel.content_margin_bottom = 8
	value.add_theme_stylebox_override("normal", panel)
	value.set_syntax_highlighter(_highlighter())
	add_child(value)
	return value

# Godotへ戻った値を画面上のDOMから確認できるLabelを作る。
func _make_label(node_name: String, at: Vector2, font: FontFile) -> Label:
	var value := Label.new()
	value.name = node_name
	value.position = at
	value.size = Vector2(736, 28)
	value.add_theme_font_size_override("font_size", 17)
	if font != null:
		value.add_theme_font_override("font", font)
	value.add_theme_color_override("font_color", Color("172033"))
	add_child(value)
	return value

# 白背景で読み分けられるGDScriptの構文色を返す。
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

# 縦scrollとminimapの全体像が同時に分かる固定コードを作る。
func _source(prefix: String, count: int) -> String:
	var lines := PackedStringArray([
		"extends Node",
		"",
		"# 白背景の日本語コメント",
		"func ready() -> void:",
		"    print(\"light theme\")",
		"    return",
	])
	for index in range(count):
		lines.append("var %s_%02d := %d" % [prefix, index, index])
	return "\n".join(lines)

# Browserから確定した上段編集を一回ずつ数える。
func _text_changed() -> void:
	changes += 1
	_update_result()

# IME確定が文章単位で届いたことを表示する。
func _update_result() -> void:
	var comment := editor.get_line(1) if editor.get_line_count() > 1 else ""
	result.text = "CHANGES %d LINES %d COMMENT %s" % [changes, editor.get_line_count(), comment]

# 同じHighlighter instanceの設定変更をDOMへ同期する。
func _change_minimap_syntax() -> void:
	var highlighter := mini_editor.get_syntax_highlighter() as CodeHighlighter
	if highlighter != null:
		highlighter.add_keyword_color("extends", Color("ea580c"))
	if not reattached:
		reattached = true
		_reattach_editor()

# 一frame treeから外し、新規DOMへ全文を復元できる状態を作る。
func _reattach_editor() -> void:
	var index := editor.get_index()
	remove_child(editor)
	await get_tree().process_frame
	add_child(editor)
	move_child(editor, index)

# minimap操作でGodotの表示開始行が変化した時に表示を更新する。
func _process(_delta: float) -> void:
	var current := mini_editor.get_first_visible_line()
	if current != first_line:
		first_line = current
		_update_minimap_result()

# minimapのBrowser scrollとGodot状態の往復結果を表示する。
func _update_minimap_result() -> void:
	mini_result.text = "MINIMAP FIRST %d TAB %d" % [first_line, int("\t" in mini_editor.text)]
