# 描画を持つ3D Nodeを低polyの同一条件へ並べ、DOM面の生成と画面差をまとめて調べる。
# Camera、材質、寸法を固定し、Node型ごとの差を形の取り出し経路へ限定する設計。

extends Node3D

const TYPES := 15 # この画面で検査する描画Node型の数。
const CELL := Vector2(2.15, 1.6) # 各Nodeを分離する画面上の間隔。

# BrowserとGodotで同じ単色になる光なし材質を作る。
func flat(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return material

# 16種類を同じ格子へ置く位置を返す。
func spot(index: int) -> Vector3:
	var column := index % 4
	var row := index / 4
	return Vector3((column - 1.5) * CELL.x, (1.5 - row) * CELL.y, 0)

# Cameraを用意し、全Nodeを一度に作る。
func _ready() -> void:
	get_viewport().msaa_3d = Viewport.MSAA_4X
	var camera := Camera3D.new()
	camera.name = "Camera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 7.0
	camera.position = Vector3(0, 0, 12)
	camera.current = true
	add_child(camera)

	add_mesh_instance()
	add_multimesh()
	add_grid_map()
	add_csg_nodes()
	add_particles()
	add_planes()

# 通常Meshのsurfaceを検査する。
func add_mesh_instance() -> void:
	var node := MeshInstance3D.new()
	node.name = "MeshInstance"
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.95, 0.95, 0.28)
	mesh.material = flat(Color("38bdf8"))
	node.mesh = mesh
	node.position = spot(0)
	node.rotation = Vector3(0.18, -0.25, 0.08)
	add_child(node)

# 一つのMeshを複数Transformへ展開する経路を検査する。
func add_multimesh() -> void:
	var node := MultiMeshInstance3D.new()
	node.name = "MultiMesh"
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.42, 0.82, 0.24)
	mesh.material = flat(Color("a78bfa"))
	var group := MultiMesh.new()
	group.transform_format = MultiMesh.TRANSFORM_3D
	group.instance_count = 2
	group.mesh = mesh
	group.set_instance_transform(0, Transform3D(Basis(), Vector3(-0.27, 0, 0)))
	group.set_instance_transform(1, Transform3D(Basis(), Vector3(0.27, 0, -0.02)))
	node.multimesh = group
	node.position = spot(1)
	add_child(node)

# GridMapのcell TransformとMeshLibraryを検査する。
func add_grid_map() -> void:
	var node := GridMap.new()
	node.name = "GridMap"
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.78, 0.78, 0.22)
	mesh.material = flat(Color("34d399"))
	var library := MeshLibrary.new()
	library.create_item(0)
	library.set_item_name(0, "DOM Cell")
	library.set_item_mesh(0, mesh)
	node.mesh_library = library
	node.cell_size = Vector3.ONE
	node.set_cell_item(Vector3i.ZERO, 0)
	node.position = spot(2)
	add_child(node)

# CSG七種類を個別rootにし、生成後のsurface取得を検査する。
func add_csg_nodes() -> void:
	var shapes: Array[CSGShape3D] = []
	var box := CSGBox3D.new()
	box.size = Vector3(0.9, 0.9, 0.3)
	shapes.append(box)

	var combiner := CSGCombiner3D.new()
	var combined_box := CSGBox3D.new()
	combined_box.size = Vector3(0.85, 0.65, 0.3)
	combined_box.material = flat(Color("f59e0b"))
	combiner.add_child(combined_box)
	shapes.append(combiner)

	var cylinder := CSGCylinder3D.new()
	cylinder.radius = 0.42
	cylinder.height = 0.86
	cylinder.sides = 12
	cylinder.rotation.x = PI * 0.5
	shapes.append(cylinder)

	var csg_mesh := CSGMesh3D.new()
	var prism := PrismMesh.new()
	prism.size = Vector3(0.86, 0.78, 0.3)
	csg_mesh.mesh = prism
	shapes.append(csg_mesh)

	var polygon := CSGPolygon3D.new()
	polygon.mode = CSGPolygon3D.MODE_DEPTH
	polygon.depth = 0.28
	polygon.polygon = PackedVector2Array([Vector2(-0.45, -0.4), Vector2(0.45, -0.4), Vector2(0.32, 0.42), Vector2(-0.32, 0.42)])
	shapes.append(polygon)

	var sphere := CSGSphere3D.new()
	sphere.radius = 0.46
	sphere.radial_segments = 12
	sphere.rings = 6
	shapes.append(sphere)

	var torus := CSGTorus3D.new()
	torus.inner_radius = 0.18
	torus.outer_radius = 0.45
	torus.sides = 8
	torus.ring_sides = 12
	torus.rotation.x = PI * 0.5
	shapes.append(torus)

	var colors := ["fb7185", "f59e0b", "facc15", "84cc16", "2dd4bf", "60a5fa", "e879f9"]
	for index in shapes.size():
		var shape := shapes[index]
		shape.name = ["CSGBox", "CSGCombiner", "CSGCylinder", "CSGMesh", "CSGPolygon", "CSGSphere", "CSGTorus"][index]
		if shape is CSGPrimitive3D and not shape.material:
			shape.material = flat(Color(colors[index]))
		shape.position = spot(index + 3)
		add_child(shape)

# 固定seedのCPU粒子を三点へ発生させ、instance TransformとColorを使うDOM経路を検査する。
func add_particles() -> void:
	var quad := QuadMesh.new()
	quad.size = Vector2(0.34, 0.34)
	quad.material = flat(Color("f472b6"))

	var cpu := CPUParticles3D.new()
	cpu.name = "CPUParticles"
	cpu.amount = 3
	cpu.lifetime = 20
	cpu.preprocess = 0.1
	cpu.use_fixed_seed = true
	cpu.seed = 7
	cpu.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	cpu.emission_box_extents = Vector3(0.34, 0.34, 0)
	cpu.direction = Vector3.ZERO
	cpu.gravity = Vector3.ZERO
	cpu.initial_velocity_min = 0
	cpu.initial_velocity_max = 0
	cpu.mesh = quad
	cpu.position = spot(10)
	add_child(cpu)

# 画像平面、文字平面、animation平面とDecal投影を検査する。
func add_planes() -> void:
	var sprite := Sprite3D.new()
	sprite.name = "Sprite"
	sprite.texture = load("res://photo.png")
	sprite.pixel_size = 0.0032
	sprite.position = spot(12)
	add_child(sprite)

	var animated := AnimatedSprite3D.new()
	animated.name = "AnimatedSprite"
	var frames := SpriteFrames.new()
	frames.add_frame("default", load("res://photo.png"))
	animated.sprite_frames = frames
	animated.pixel_size = 0.0032
	animated.position = spot(13)
	add_child(animated)

	var label := Label3D.new()
	label.name = "Label"
	label.text = "DOM 3D"
	label.font = load("res://fonts/Match.ttf")
	label.font_size = 30
	label.pixel_size = 0.006
	label.modulate = Color("f8fafc")
	label.position = spot(14)
	add_child(label)

	var decal := Decal.new()
	decal.name = "Decal"
	decal.texture_albedo = load("res://white.svg")
	decal.size = Vector3(0.9, 0.18, 0.9)
	decal.rotation.x = PI * 0.5
	decal.position = spot(15)
	add_child(decal)
	var receiver := MeshInstance3D.new()
	receiver.name = "DecalReceiver"
	var plane := QuadMesh.new()
	plane.size = Vector2(0.9, 0.9)
	plane.material = flat(Color.WHITE)
	receiver.mesh = plane
	receiver.position = spot(15) + Vector3(0, 0, -0.08)
	add_child(receiver)
