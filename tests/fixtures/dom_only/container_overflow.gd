# 実行時に使える全Container派生の切り抜きと重なりを一画面で確かめる。
# 各Containerの確定矩形を平坦DOMへ反映し、子のはみ出しを同じ範囲で隠す設計を検証する。

extends Control

const TILE := Vector2(138, 82) # 一種類へ割り当てる画面上の切り抜き寸法。
const STEP := Vector2(154, 106) # 重なりを観察できる種類間の間隔。

var types: Array[String] = [] # ClassDBと照合するContainer派生型。
var containers: Array[Container] = [] # Browser操作後に切り抜き寸法を変える対象。
var status: Label # 再配置完了をBrowserから待つための表示。

# 枠の位置を読み取りやすいPanelを作る。
func frame(at: Vector2) -> void:
	var panel := Panel.new()
	panel.position = at
	panel.size = TILE
	panel.z_index = -1
	var style := StyleBoxFlat.new()
	style.bg_color = Color("111827")
	style.border_color = Color("475569")
	style.set_border_width_all(2)
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)

# Containerの内側から右下へはみ出す面と文字を置く。
func overflow_content(parent: Node, type: String, scale_value: float) -> void:
	var layer := Node2D.new()
	layer.name = "OverflowLayer"
	parent.add_child(layer)

	var face := ColorRect.new()
	face.position = Vector2(6, 31) / scale_value
	face.size = Vector2(252, 70) / scale_value
	face.color = Color.from_hsv(types.find(type) / float(types.size()), 0.7, 0.85)
	layer.add_child(face)

	var title := Label.new()
	title.position = Vector2(5, 4) / scale_value
	title.size = Vector2(260, 24) / scale_value
	title.text = type
	title.add_theme_font_size_override("font_size", roundi(9.0 / scale_value))
	layer.add_child(title)

	var overflow := Label.new()
	overflow.position = Vector2(6, 35) / scale_value
	overflow.size = Vector2(252, 62) / scale_value
	overflow.text = "OVERFLOW %s" % type
	overflow.add_theme_font_size_override("font_size", roundi(10.0 / scale_value))
	layer.add_child(overflow)

# SubViewportContainerは表示先Viewportの中へ同じ検査内容を置く。
func viewport_content(container: SubViewportContainer, type: String, scale_value: float) -> void:
	container.stretch = true
	var viewport := SubViewport.new()
	viewport.size = Vector2i(roundi(TILE.x / scale_value), roundi(TILE.y / scale_value))
	viewport.disable_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	container.add_child(viewport)
	overflow_content(viewport, type, scale_value)

# 一種類のContainerと、その外側から重なる前面文字を組み立てる。
func add_type(type: String, index: int) -> void:
	var at := Vector2(16, 12) + Vector2(index % 5, index / 5) * STEP
	frame(at)
	var container := ClassDB.instantiate(type) as Container
	assert(container != null)
	container.name = type
	container.position = at
	add_child(container)
	var minimum := container.get_combined_minimum_size()
	var scale_value := minf(1.0, minf(TILE.x / maxf(TILE.x, minimum.x), TILE.y / maxf(TILE.y, minimum.y)))
	container.scale = Vector2.ONE * scale_value
	container.size = TILE / scale_value
	container.clip_contents = true
	containers.append(container)
	if container is SubViewportContainer:
		viewport_content(container, type, scale_value)
	else:
		overflow_content(container, type, scale_value)

	# 木の追加順に依存せず、枠をまたぐ前面文字が切り抜かれないことを確かめる。
	var front := Label.new()
	front.position = at + Vector2(132, 64)
	front.size = Vector2(22, 16)
	front.text = "F%02d" % index
	front.z_index = 20
	front.add_theme_font_size_override("font_size", 7)
	add_child(front)

# 全Containerの矩形を一度に変え、clipの追従を確かめる。
func reflow() -> void:
	for container in containers:
		container.size += Vector2(8, 6) / container.scale.x
	status.text = "REFLOW 1"

# 23種類を5列へ並べ、Browserから一括操作できる状態にする。
func _ready() -> void:
	var source: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://container_types.json"))
	assert(source is Array)
	for type in source:
		types.append(String(type))
	var background := ColorRect.new()
	background.color = Color("070b15")
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	background.z_index = -20
	add_child(background)
	for index in types.size():
		add_type(types[index], index)

	var action := Button.new()
	action.position = Vector2(520, 548)
	action.size = Vector2(126, 38)
	action.text = "REFLOW ALL"
	action.pressed.connect(reflow)
	add_child(action)

	status = Label.new()
	status.position = Vector2(658, 552)
	status.size = Vector2(122, 30)
	status.text = "REFLOW 0"
	status.add_theme_font_size_override("font_size", 16)
	add_child(status)
