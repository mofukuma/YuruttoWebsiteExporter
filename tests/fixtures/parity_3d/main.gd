# 3Dの機能をひととおり並べて、GodotとWebで同じ絵になるかを測る画面。
# meshの種類、材質、光、影、カメラの見え方を一枚へ収める。

extends Node3D

# 置くmeshの種類と場所と色。3Dの形が同じように出るかを見る。
const SHAPES := [
	["box", Vector3(-2.2, 0.6, 0), Color(0.85198, 0.25198, 0.25198)],
	["sphere", Vector3(0, 0.6, 0), Color(0.25198, 0.65198, 0.35002)],
	["cylinder", Vector3(2.2, 0.6, 0), Color(0.25198, 0.45198, 0.85198)],
	["prism", Vector3(-1.1, 0.6, -2.2), Color(0.85198, 0.65198, 0.25198)],
	["torus", Vector3(1.1, 0.6, -2.2), Color(0.65198, 0.25198, 0.85198)],
]

# 3Dの見えるもの一式を、動かない形で組み立てる。
func _ready() -> void:
	_add_camera()
	_add_lights()
	_add_ground()
	for shape in SHAPES:
		_add_shape(shape[0], shape[1], shape[2])

# 決まった場所から決まった向きで見るカメラを置く。
func _add_camera() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 3.2, 6.5)
	camera.rotation_degrees = Vector3(-18, 0, 0)
	camera.fov = 55.0
	add_child(camera)

# 向きのある光と、全体を持ち上げる環境光を置く。影の出かたも見る。
func _add_lights() -> void:
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

# 影の落ちる床を置く。
func _add_ground() -> void:
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(14, 14)
	ground.mesh = plane
	ground.material_override = _material(Color(0.45198, 0.45198, 0.50196))
	add_child(ground)

# 一つのmeshを、種類と場所と色から作る。
func _add_shape(kind: String, at: Vector3, color: Color) -> void:
	var item := MeshInstance3D.new()
	match kind:
		"box": item.mesh = BoxMesh.new()
		"sphere": item.mesh = SphereMesh.new()
		"cylinder": item.mesh = CylinderMesh.new()
		"prism": item.mesh = PrismMesh.new()
		"torus": item.mesh = TorusMesh.new()
	item.position = at
	# 向きを少し傾けて、面の陰影の出かたも比べられるようにする。
	item.rotation_degrees = Vector3(0, 30, 0)
	item.material_override = _material(color)
	add_child(item)

# 光の反射を抑えた、比べやすい材質を作る。
func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 1.0
	material.metallic = 0.0
	material.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	return material
