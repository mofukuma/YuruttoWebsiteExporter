# 文字をDOMへ出す対応Controlを、ひととおり並べた画面。
# 一覧表の「対応」が本当かを、実際に置いて絵で確かめるためのもの。

extends Control

const BG := Color(0.118647, 0.118647, 0.142176) # 背景色。狙いは(30,30,36)。
const TEXT_COLOR := Color(0.95002, 0.95002, 0.95002) # 文字色。狙いは(242,242,242)。
const FONT_PATH := "res://fonts/LINESeedJP-Regular.ttf" # 書体。Web側も同じものを使う。
const SIZE := 21 # 文字の大きさ。GodotとBrowserで字の高さが揃う値を選ぶ。

var font: Font # 全Controlへ配る書体。

# 対応Controlを縦に並べ、それぞれに文字を持たせる。
func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	font = load(FONT_PATH) as Font
	var back := ColorRect.new()
	back.color = BG
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(back)
	_place(_label("LABEL text"), Vector2(16, 12), Vector2(200, 26))
	_place(_button("BUTTON"), Vector2(16, 46), Vector2(140, 30))
	_place(_check_box("CHECKBOX"), Vector2(16, 82), Vector2(170, 30))
	_place(_check_button("CHECKBUTTON"), Vector2(16, 118), Vector2(210, 30))
	_place(_link("LINKBUTTON"), Vector2(16, 156), Vector2(180, 26))
	_place(_option(), Vector2(16, 190), Vector2(190, 30))
	_place(_menu_button(), Vector2(16, 226), Vector2(190, 30))
	_place(_line_edit(), Vector2(16, 262), Vector2(220, 30))
	_place(_text_edit(), Vector2(16, 298), Vector2(220, 66))
	_place(_spin(), Vector2(16, 362), Vector2(150, 30))
	_place(_progress(), Vector2(16, 398), Vector2(220, 26))
	_place(_item_list(), Vector2(330, 12), Vector2(180, 74))
	_place(_tree(), Vector2(330, 94), Vector2(180, 78))
	_place(_tab_bar(), Vector2(330, 180), Vector2(280, 34))
	_place(_foldable(), Vector2(330, 258), Vector2(240, 40))
	_place(_code_edit(), Vector2(330, 306), Vector2(240, 54))
	_place(_tab_container(), Vector2(330, 368), Vector2(240, 56))

# 一つのControlを、決まった場所と大きさへ置く。
func _place(item: Control, at: Vector2, size: Vector2) -> void:
	item.position = at
	item.size = size
	item.add_theme_font_size_override("font_size", SIZE)
	if font != null:
		item.add_theme_font_override("font", font)
	add_child(item)

# 見出しの文字。
func _label(text: String) -> Label:
	var item := Label.new()
	item.text = text
	item.add_theme_color_override("font_color", TEXT_COLOR)
	return item

# 押せる文字。
func _button(text: String) -> Button:
	var item := Button.new()
	item.text = text
	return item

# 入り切りの四角。
func _check_box(text: String) -> CheckBox:
	var item := CheckBox.new()
	item.text = text
	item.button_pressed = true
	return item

# 入り切りのつまみ。
func _check_button(text: String) -> CheckButton:
	var item := CheckButton.new()
	item.text = text
	return item

# 別の場所へつながる文字。
func _link(text: String) -> LinkButton:
	var item := LinkButton.new()
	item.text = text
	item.uri = "https://example.com/"
	return item

# 選んで決める一覧。
func _option() -> OptionButton:
	var item := OptionButton.new()
	item.add_item("OPTION A")
	item.add_item("OPTION B")
	return item

# 押すと品書きが出るもの。
func _menu_button() -> MenuButton:
	var item := MenuButton.new()
	item.text = "MENUBUTTON"
	item.get_popup().add_item("ITEM")
	return item

# 一行の入力欄。
func _line_edit() -> LineEdit:
	var item := LineEdit.new()
	item.text = "LINEEDIT 123"
	return item

# 複数行の入力欄。
func _text_edit() -> TextEdit:
	var item := TextEdit.new()
	item.text = "TEXTEDIT\n日本語も入る"
	return item

# 数を上げ下げする欄。
func _spin() -> SpinBox:
	var item := SpinBox.new()
	item.max_value = 100
	item.value = 42
	return item

# 進み具合の帯。
func _progress() -> ProgressBar:
	var item := ProgressBar.new()
	item.value = 64
	return item

# 並んだ項目。
func _item_list() -> ItemList:
	var item := ItemList.new()
	item.add_item("LIST ONE")
	item.add_item("LIST TWO")
	return item

# 枝分かれした項目。
func _tree() -> Tree:
	var item := Tree.new()
	var root := item.create_item()
	root.set_text(0, "TREE ROOT")
	var child := item.create_item(root)
	child.set_text(0, "子項目")
	return item

# 切り替えの見出し。
func _tab_bar() -> TabBar:
	var item := TabBar.new()
	item.add_tab("TAB ONE")
	item.add_tab("TAB TWO")
	return item

# たたんだり開いたりする見出し。
func _foldable() -> FoldableContainer:
	var item := FoldableContainer.new()
	item.title = "FOLDABLE"
	return item

# 番号のつく入力欄。
func _code_edit() -> CodeEdit:
	var item := CodeEdit.new()
	item.text = "CODE 42"
	return item

# 中身を切り替える入れ物。
func _tab_container() -> TabContainer:
	var item := TabContainer.new()
	var page := Control.new()
	page.name = "PAGE"
	item.add_child(page)
	return item
