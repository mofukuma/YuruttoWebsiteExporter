# 固定seedのCPU粒子を2Dと3Dで八枚のカードへ並べ、Transformと色の再現を比較する。
# GPU粒子は乱数系列を両描画先で共有できないため、画面一致の検査対象へ含めない。

extends Node

const CARD_SIZE := Vector2(188, 280) # 各条件を分離する表示領域。
const CARD_AT := [Vector2(8, 8), Vector2(204, 8), Vector2(400, 8), Vector2(596, 8), Vector2(8, 292), Vector2(204, 292), Vector2(400, 292), Vector2(596, 292)] # 二行四列の左上座標。

# 回転方向を見分けられる右向き画像を作る。
func particle_texture() -> ImageTexture:
	var image := Image.create(24, 18, false, Image.FORMAT_RGBA8)
	image.fill(Color.TRANSPARENT)
	image.fill_rect(Rect2i(2, 6, 12, 6), Color.WHITE)
	for x in range(12, 22):
		var half := int((21 - x) * 0.55)
		image.fill_rect(Rect2i(x, 9 - half, 1, half * 2 + 1), Color.WHITE)
	image.fill_rect(Rect2i(4, 7, 4, 2), Color("0f172a"))
	return ImageTexture.create_from_image(image)

# 3Dでも回転と縦横比を判断できる板Meshを作る。
func particle_mesh() -> QuadMesh:
	var material := StandardMaterial3D.new()
	material.albedo_color = Color.WHITE
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.vertex_color_use_as_albedo = true
	var mesh := QuadMesh.new()
	mesh.size = Vector2(0.48, 0.24)
	mesh.material = material
	return mesh

# 位置以外を共通化し、条件差を各カードの設定へ限定する。
func cpu_2d(name: String, at: Vector2, seed_value: int, color: Color) -> CPUParticles2D:
	var node := CPUParticles2D.new()
	node.name = name
	node.position = at
	node.amount = 3
	node.lifetime = 20
	node.preprocess = 15
	node.use_fixed_seed = true
	node.seed = seed_value
	node.direction = Vector2.ZERO
	node.gravity = Vector2.ZERO
	node.initial_velocity_min = 0
	node.initial_velocity_max = 0
	node.color = color
	node.texture = particle_texture()
	return node

# 3D粒子も同じ停止条件と個数へ揃える。
func cpu_3d(name: String, at: Vector3, seed_value: int, color: Color) -> CPUParticles3D:
	var node := CPUParticles3D.new()
	node.name = name
	node.position = at
	node.amount = 3
	node.lifetime = 20
	node.preprocess = 15
	node.use_fixed_seed = true
	node.seed = seed_value
	node.direction = Vector3.ZERO
	node.gravity = Vector3.ZERO
	node.initial_velocity_min = 0
	node.initial_velocity_max = 0
	node.color = color
	node.mesh = particle_mesh()
	return node

# 条件名と設定値を同じ枠へ表示する。
func card(index: int, title: String, note: String) -> void:
	var at: Vector2 = CARD_AT[index]
	for rect in [Rect2(at, Vector2(CARD_SIZE.x, 2)), Rect2(at + Vector2(0, CARD_SIZE.y - 2), Vector2(CARD_SIZE.x, 2)), Rect2(at, Vector2(2, CARD_SIZE.y)), Rect2(at + Vector2(CARD_SIZE.x - 2, 0), Vector2(2, CARD_SIZE.y))]:
		var edge := ColorRect.new()
		edge.position = rect.position
		edge.size = rect.size
		edge.color = Color("475569")
		add_child(edge)

	var heading := Label.new()
	heading.text = title
	heading.position = at + Vector2(12, 10)
	heading.add_theme_font_override("font", load("res://fonts/Match.ttf"))
	heading.add_theme_font_size_override("font_size", 14)
	heading.add_theme_color_override("font_color", Color("f8fafc"))
	add_child(heading)

	var detail := Label.new()
	detail.text = note
	detail.position = at + Vector2(12, 250)
	detail.add_theme_font_override("font", load("res://fonts/Match.ttf"))
	detail.add_theme_font_size_override("font_size", 12)
	detail.add_theme_color_override("font_color", Color("94a3b8"))
	add_child(detail)

# 上段へ2Dの四条件を置く。
func add_2d() -> void:
	var baseline := cpu_2d("Cpu2dPoint", Vector2(102, 145), 101, Color("38bdf8"))
	add_child(baseline)

	var node_scale := cpu_2d("Cpu2dNodeScale", Vector2(298, 145), 102, Color("f59e0b"))
	node_scale.local_coords = true
	node_scale.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	node_scale.emission_rect_extents = Vector2(26, 28)
	node_scale.scale = Vector2(1.45, 0.70)
	add_child(node_scale)

	var particle_scale := cpu_2d("Cpu2dParticleScale", Vector2(494, 145), 103, Color("34d399"))
	particle_scale.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	particle_scale.emission_rect_extents = Vector2(34, 28)
	particle_scale.scale_amount_min = 0.45
	particle_scale.scale_amount_max = 1.55
	add_child(particle_scale)

	var alpha_rotate := cpu_2d("Cpu2dAlphaRotate", Vector2(690, 145), 104, Color(0.96, 0.45, 0.71, 0.42))
	alpha_rotate.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	alpha_rotate.emission_rect_extents = Vector2(34, 28)
	alpha_rotate.angle_min = 25
	alpha_rotate.angle_max = 65
	add_child(alpha_rotate)

# 下段へ3Dの四条件を投影する。
func add_3d() -> void:
	var baseline := cpu_3d("Cpu3dPoint", Vector3(-2.98, -1.35, 0), 105, Color("60a5fa"))
	add_child(baseline)

	var node_scale := cpu_3d("Cpu3dNodeScale", Vector3(-1.02, -1.35, 0), 106, Color("fbbf24"))
	node_scale.local_coords = true
	node_scale.scale = Vector3(1.5, 0.7, 1)
	add_child(node_scale)

	var particle_scale := cpu_3d("Cpu3dParticleScale", Vector3(0.94, -1.35, 0), 107, Color("2dd4bf"))
	particle_scale.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	particle_scale.emission_box_extents = Vector3(0.34, 0.28, 0)
	particle_scale.scale_amount_min = 0.5
	particle_scale.scale_amount_max = 1.5
	add_child(particle_scale)

	var alpha_rotate := cpu_3d("Cpu3dAlphaRotate", Vector3(2.90, -1.35, 0), 108, Color("e879f9"))
	var alpha_material := alpha_rotate.mesh.material as StandardMaterial3D
	alpha_material.albedo_color = Color(1, 1, 1, 0.42)
	alpha_rotate.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
	alpha_rotate.emission_box_extents = Vector3(0.34, 0.28, 0.35)
	alpha_rotate.particle_flag_rotate_y = true
	alpha_rotate.angle_min = 25
	alpha_rotate.angle_max = 65
	add_child(alpha_rotate)

# Camera、八条件、説明枠を一度に組み立てる。
func _ready() -> void:
	var camera := Camera3D.new()
	camera.name = "ParticleCamera"
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 6.0
	camera.position = Vector3(0, 0, 10)
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color.BLACK
	camera.environment = environment
	camera.current = true
	add_child(camera)

	add_2d()
	add_3d()

	var labels := [
		["2D POINT SEED", "3 STATIC ARROWS"], ["2D NODE SCALE", "X 1.45 / Y 0.70"],
		["2D PARTICLE SCALE", "0.45 TO 1.55"], ["2D ALPHA + ROTATE", "42% / 25 TO 65 DEG"],
		["3D POINT SEED", "3 STATIC QUADS"], ["3D NODE SCALE", "X 1.50 / Y 0.70"],
		["3D PARTICLE SCALE", "0.50 TO 1.50"], ["3D ALPHA + DEPTH", "42% / Z + ROTATE"],
	]
	for index in labels.size():
		card(index, labels[index][0], labels[index][1])
