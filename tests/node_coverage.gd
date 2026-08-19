# Godotの全nodeを、文字をDOMへ出す対象かどうかで仕分ける。
# 対応状況を数で示すために、実際のClassDBから一覧を作る。

extends SceneTree

# 文字をDOMへ出せることを確かめたControl。
const COVERED := [
	"Label", "Button", "CheckBox", "CheckButton", "LinkButton", "OptionButton", "MenuButton",
	"LineEdit", "TextEdit", "CodeEdit", "ItemList", "Tree", "TabBar", "TabContainer",
	"ProgressBar", "MenuBar", "FoldableContainer", "SpinBox",
]
# 文字を持たないので、絵のまま出るのが正しいControl。
const CANVAS_ONLY := [
	"ColorRect", "TextureRect", "NinePatchRect", "Panel", "PanelContainer", "ReferenceRect",
	"TextureButton", "TextureProgressBar", "HSeparator", "VSeparator",
	"HScrollBar", "VScrollBar", "HSlider", "VSlider", "Range", "Control", "Container",
	"BoxContainer", "HBoxContainer", "VBoxContainer", "GridContainer", "CenterContainer",
	"MarginContainer", "AspectRatioContainer", "FlowContainer", "HFlowContainer", "VFlowContainer",
	"ScrollContainer", "SplitContainer", "HSplitContainer", "VSplitContainer",
	"SubViewportContainer", "BaseButton", "VirtualJoystick",
]
# 今は文字をDOMへ出さないControl。理由も添える。
const PENDING := {
	"RichTextLabel": "BBCodeの一部が再現できない",
	"ColorPicker": "見た目が複雑で対応していない",
	"ColorPickerButton": "見た目が複雑で対応していない",
	"GraphEdit": "編集器向けで対応していない",
	"GraphElement": "編集器向けで対応していない",
	"GraphFrame": "編集器向けで対応していない",
	"GraphNode": "編集器向けで対応していない",
	"VideoStreamPlayer": "動画は対応していない",
}

# 全nodeを仕分けて、数と一覧をまとめて返す。
func _initialize() -> void:
	var groups := {"control": [], "node2d": [], "node3d": [], "other": []}
	for name in ClassDB.get_class_list():
		if not ClassDB.can_instantiate(name):
			continue
		if ClassDB.is_parent_class(name, "Control"):
			groups["control"].append(name)
		elif ClassDB.is_parent_class(name, "Node2D"):
			groups["node2d"].append(name)
		elif ClassDB.is_parent_class(name, "Node3D"):
			groups["node3d"].append(name)
		elif ClassDB.is_parent_class(name, "Node"):
			groups["other"].append(name)
	for key in groups:
		groups[key].sort()
	# Controlを、文字を出すもの、絵のままのもの、未対応のものへ分ける。
	var text_dom: Array[String] = []
	var canvas: Array[String] = []
	var pending: Array[String] = []
	var unknown: Array[String] = []
	for name in groups["control"]:
		if name in COVERED:
			text_dom.append(name)
		elif name in CANVAS_ONLY:
			canvas.append(name)
		elif PENDING.has(name):
			pending.append(name)
		else:
			unknown.append(name)
	print(JSON.stringify({
		"groups": groups,
		"control": {"text_dom": text_dom, "canvas": canvas, "pending": pending, "unknown": unknown},
		"pending_reasons": PENDING,
	}))
	quit(0)
