# 3Dの絵の上に文字を重ねた画面。この作りが、このアドオンの一番よくある形。
# 3Dの描画と、HTMLになった文字が、同じ場所へ同じように出るかを見る。

extends Node3D

# 3Dで置くmeshの場所と色。
const SHAPES := [
	[Vector3(-1.8, 0.6, 0), Color(0.85198, 0.25198, 0.25198)],
	[Vector3(0, 0.6, -1.4), Color(0.25198, 0.65198, 0.35002)],
	[Vector3(1.8, 0.6, 0), Color(0.25198, 0.45198, 0.85198)],
]
# 上に重ねる文字。位置と大きさを決め打ちする。
const LABELS := [
	[Vector2(24, 24), "MIXED SCENE", 22],
	[Vector2(24, 54), "3Dの上に文字を重ねる", 21],
	[Vector2(24, 84), "overlay 0123456789", 16],
]
const TEXT_COLOR := Color(0.95002, 0.95002, 0.95002) # 文字色。狙いは(242,242,242)。
const FONT_PATH := "res://fonts/LINESeedJP-Regular.ttf" # 書体。隣の同じ書体のwoff2をWeb側が使う。

# 3Dのものと、その上の文字を組み立てる。
func _ready() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 2.6, 5.5)
	camera.rotation_degrees = Vector3(-16, 0, 0)
	camera.fov = 55.0
	add_child(camera)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -35, 0)
	sun.light_energy = 1.1
	sun.shadow_enabled = true
	add_child(sun)
	var environment := WorldEnvironment.new()
	var settings := Environment.new()
	settings.background_mode = Environment.BG_COLOR
	settings.background_color = Color(0.118647, 0.118647, 0.142176)
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color(0.35002, 0.35002, 0.45198)
	settings.ambient_light_energy = 0.6
	environment.environment = settings
	add_child(environment)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(14, 14)
	ground.mesh = plane
	ground.material_override = _material(Color(0.45198, 0.45198, 0.50196))
	add_child(ground)
	for shape in SHAPES:
		var item := MeshInstance3D.new()
		item.mesh = BoxMesh.new()
		item.position = shape[0]
		item.rotation_degrees = Vector3(0, 25, 0)
		item.material_override = _material(shape[1])
		add_child(item)
	_add_overlay()

# 3Dの上へ、HTMLになる文字を重ねる。
func _add_overlay() -> void:
	var layer := Control.new()
	layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(layer)
	var font := load(FONT_PATH) as Font
	for item in LABELS:
		var label := Label.new()
		label.position = item[0]
		label.text = item[1]
		label.add_theme_font_size_override("font_size", item[2])
		label.add_theme_color_override("font_color", TEXT_COLOR)
		if font != null:
			label.add_theme_font_override("font", font)
		layer.add_child(label)

# 光の反射を抑えた、比べやすい材質を作る。
func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 1.0
	material.metallic = 0.0
	material.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	return material
