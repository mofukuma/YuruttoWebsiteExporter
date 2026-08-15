# 標準Controlの文字だけをDOMへ渡し、フォームと非文字Canvasを一画面で検証する。
# 入力値はGodotを正本とし、BrowserのIME確定値を公開Controlへ戻す。

extends Control

const BG := Color("101522") # Canvas背景色。
const PANEL := Color("253148") # 非文字Canvas領域の識別色。
const CYAN := Color("27e6d5") # Theme変更後の文字色。

var line: LineEdit # 一行IME入力。
var area: TextEdit # 複数行IME入力。
var line_state: Label # Browser試験へ公開する一行model値。
var area_state: Label # Browser試験へ公開する複数行model値。
var item_list: ItemList # 動的文字幅を検証する複数項目Control。
var ui_theme: Theme # 標準Controlへ継承する動的Theme。
var themed := false # Theme変更状態。
var line_events := 0 # LineEditのtext_changed発火数。
var line_payload := "" # LineEditの直近text_changed値。

# 入力と標準Control一覧を構築する。
func _ready() -> void:
	ui_theme = Theme.new()
	ui_theme.set_font_size("font_size", "LineEdit", 19)
	ui_theme.set_font_size("font_size", "TextEdit", 17)
	ui_theme.set_font_size("font_size", "TabBar", 16)
	ui_theme.set_font_size("font_size", "ItemList", 15)
	theme = ui_theme
	_build_forms()
	_build_controls()
	queue_redraw()

# 背景とDOM化対象外の色面をCanvasへ描く。
func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), BG)
	draw_rect(Rect2(12, 76, 366, 190), PANEL)
	draw_rect(Rect2(12, 278, 366, 546), Color(PANEL, 0.72))

# 入力値と選択位置を毎frame観測可能にする。
func _process(_delta: float) -> void:
	line_state.text = "LINE:%s:%d:%d:%s" % [line.text, line.caret_column, line_events, line_payload]
	area_state.text = "AREA:%s:%d:%d" % [area.text.replace("\n", "|"), area.get_caret_line(), area.get_caret_column()]

# metadataなしのLineEditとTextEditを作る。
func _build_forms() -> void:
	line = LineEdit.new()
	line.name = "ImeLine"
	line.position = Vector2(20, 88)
	line.size = Vector2(350, 48)
	line.text = "初期"
	line.placeholder_text = "日本語を入力"
	line.clear_button_enabled = true
	line.max_length = 24
	line.text_changed.connect(_line_changed)
	add_child(line)

	area = TextEdit.new()
	area.name = "ImeArea"
	area.position = Vector2(20, 148)
	area.size = Vector2(350, 106)
	area.placeholder_text = "複数行の日本語を入力"
	area.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	add_child(area)

	line_state = _label("LineState", Vector2(18, 20), Vector2(354, 22))
	area_state = _label("AreaState", Vector2(18, 44), Vector2(354, 22))

# 複数文字を持つ標準Controlを一覧化する。
func _build_controls() -> void:
	var tabs := TabBar.new()
	tabs.name = "Sections"
	tabs.position = Vector2(18, 288)
	tabs.size = Vector2(354, 44)
	for title in ["ホーム", "設定", "情報"]:
		tabs.add_tab(title)
	add_child(tabs)

	item_list = ItemList.new()
	item_list.name = "Items"
	item_list.position = Vector2(18, 340)
	item_list.size = Vector2(170, 150)
	for title in ["りんご", "おもち", "お茶"]:
		item_list.add_item(title)
	add_child(item_list)

	var tree := Tree.new()
	tree.name = "DataTree"
	tree.position = Vector2(200, 340)
	tree.size = Vector2(172, 150)
	tree.columns = 1
	var root := tree.create_item()
	root.set_text(0, "日本語ツリー")
	var child := tree.create_item(root)
	child.set_text(0, "子項目")
	add_child(tree)

	var fold := FoldableContainer.new()
	fold.name = "Fold"
	fold.position = Vector2(18, 502)
	fold.size = Vector2(354, 54)
	fold.title = "折りたたみ見出し"
	fold.folded = true
	add_child(fold)

	var progress := ProgressBar.new()
	progress.name = "Progress"
	progress.position = Vector2(18, 568)
	progress.size = Vector2(354, 42)
	progress.value = 64
	progress.show_percentage = true
	add_child(progress)

	var menu := MenuBar.new()
	menu.name = "Menu"
	menu.position = Vector2(18, 622)
	menu.size = Vector2(170, 42)
	var file := PopupMenu.new()
	file.name = "ファイル"
	file.add_item("保存")
	menu.add_child(file)
	add_child(menu)

	var option := OptionButton.new()
	option.name = "Option"
	option.position = Vector2(200, 622)
	option.size = Vector2(172, 42)
	option.add_item("選択してください")
	option.add_item("日本語")
	add_child(option)

	var button := Button.new()
	button.name = "ThemeButton"
	button.position = Vector2(18, 680)
	button.size = Vector2(354, 48)
	button.text = "テーマを変更"
	button.pressed.connect(_change_theme)
	add_child(button)

	var alternative := Label.new()
	alternative.name = "AlternativeLabel"
	alternative.position = Vector2(18, 744)
	alternative.size = Vector2(190, 30)
	alternative.text = "省略表示のDOM代替文字"
	alternative.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	add_child(alternative)

# 状態公開用Labelを作る。
func _label(node_name: String, pos: Vector2, extent: Vector2) -> Label:
	var label := Label.new()
	label.name = node_name
	label.position = pos
	label.size = extent
	label.add_theme_font_size_override("font_size", 13)
	add_child(label)
	return label

# 継承Themeだけを書き換え、同じDOM要素へ反映させる。
func _change_theme() -> void:
	if themed:
		return
	themed = true
	ui_theme.set_color("font_selected_color", "TabBar", CYAN)
	ui_theme.set_color("font_unselected_color", "TabBar", CYAN)
	ui_theme.set_font_size("font_size", "TabBar", 22)
	item_list.set_item_text(0, "WWWWWWWW")

# LineEdit変更通知の回数と空文字payloadを公開する。
func _line_changed(value: String) -> void:
	line_events += 1
	line_payload = value
