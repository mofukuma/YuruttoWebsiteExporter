# 内部部品や標準_drawを持つControlを一画面へ並べ、共通DOM経路を検査する。
# 個別実装を増やさず、Godotが確定した子Controlと描画命令を拾う設計を確かめる。

extends Control

const TYPES := ["ColorPicker", "ColorPickerButton", "GraphEdit", "GraphElement", "GraphFrame", "GraphNode", "HSplitContainer", "MenuBar", "PanelContainer", "ReferenceRect", "RichTextLabel", "ScrollContainer", "SplitContainer", "VSplitContainer", "VirtualJoystick"] # 画面へ置く対象型。

# 見分けやすい共通面を作る。
func box(color: Color, border := Color("64748b")) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border
	style.set_border_width_all(1)
	style.set_corner_radius_all(5)
	return style

# 分割containerへ二色の子を入れる。
func split_children(node: SplitContainer) -> void:
	for color in [Color("0ea5e9"), Color("f97316")]:
		var child := ColorRect.new()
		child.color = color
		child.custom_minimum_size = Vector2(36, 30)
		node.add_child(child)

# 型ごとの最小表示内容を設定する。
func item(type: String) -> Control:
	var node: Control
	match type:
		"ColorPicker":
			node = ColorPicker.new()
			(node as ColorPicker).color = Color("ec4899")
		"ColorPickerButton":
			node = ColorPickerButton.new()
			(node as ColorPickerButton).color = Color("22d3ee")
		"GraphEdit":
			node = GraphEdit.new()
			var graph_node := GraphNode.new()
			graph_node.title = "GraphNode"
			graph_node.position_offset = Vector2(12, 8)
			graph_node.size = Vector2(120, 72)
			node.add_child(graph_node)
		"GraphElement":
			node = GraphElement.new()
		"GraphFrame":
			node = GraphFrame.new()
			(node as GraphFrame).title = "Frame"
		"GraphNode":
			node = GraphNode.new()
			(node as GraphNode).title = "Node"
		"HSplitContainer":
			node = HSplitContainer.new()
			split_children(node)
		"MenuBar":
			node = MenuBar.new()
			var menu := PopupMenu.new()
			menu.name = "FILE"
			menu.add_item("OPEN")
			node.add_child(menu)
		"PanelContainer":
			node = PanelContainer.new()
			node.add_theme_stylebox_override("panel", box(Color("1e293b")))
			var label := Label.new()
			label.text = "Panel"
			node.add_child(label)
		"ReferenceRect":
			node = ReferenceRect.new()
			(node as ReferenceRect).border_color = Color("facc15")
			(node as ReferenceRect).border_width = 4
		"RichTextLabel":
			node = RichTextLabel.new()
			(node as RichTextLabel).bbcode_enabled = true
			(node as RichTextLabel).text = "[b]Rich[/b] [color=#22d3ee]Text[/color]"
		"ScrollContainer":
			node = ScrollContainer.new()
			var content := ColorRect.new()
			content.color = Color("8b5cf6")
			content.custom_minimum_size = Vector2(260, 160)
			node.add_child(content)
		"SplitContainer":
			node = SplitContainer.new()
			split_children(node)
		"VSplitContainer":
			node = VSplitContainer.new()
			split_children(node)
		"VirtualJoystick":
			node = VirtualJoystick.new()
			node.add_theme_stylebox_override("normal_joystick", box(Color("334155"), Color("38bdf8")))
			node.add_theme_stylebox_override("normal_tip", box(Color("38bdf8"), Color("e0f2fe")))
	return node

# 対象を格子へまとめ、型名もDOM文字として出す。
func _ready() -> void:
	var background := ColorRect.new()
	background.color = Color("0f172a")
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	for index in TYPES.size():
		var column := index % 4
		var row := index / 4
		var at := Vector2(14 + column * 196, 14 + row * 145)
		var label := Label.new()
		label.text = TYPES[index]
		label.position = at
		label.size = Vector2(188, 24)
		label.add_theme_font_size_override("font_size", 13)
		label.add_theme_color_override("font_color", Color("f8fafc"))
		add_child(label)
		var node := item(TYPES[index])
		node.name = TYPES[index]
		node.position = at + Vector2(0, 25)
		node.size = Vector2(180, 108)
		add_child(node)
