# ゆるっとWebへ渡すprojectから非対応の3DとGDExtensionを検出する。
# 文字fileとbinary resourceを同じGodot processで走査する設計。

extends RefCounted

const TEXT_TYPES := ["tscn", "tres", "gd", "gdshader"] # 内容を検査する文字形式。
const MODEL_TYPES := ["blend", "dae", "fbx", "glb", "gltf", "obj"] # 拒否する3D model形式。
const BINARY_TYPES := ["scn", "res"] # 実体を型走査するbinary形式。
const THREE_D_CLASSES := [
	"Mesh", "Shape3D", "BaseMaterial3D", "Occluder3D", "Environment", "Sky", "CameraAttributes",
	"NavigationMesh", "Skin", "SkeletonProfile", "MeshLibrary", "ImporterMesh", "LightmapGIData", "VoxelGIData",
	"FogMaterial", "ProceduralSkyMaterial", "PanoramaSkyMaterial", "PhysicalSkyMaterial", "Compositor", "CompositorEffect",
] # 名前が3Dで終わらない3D専用class系統。
const RULES := [
	["\\btype\\s*=\\s*\"[^\"]*3D\"", "3D型"],
	["\\btype\\s*=\\s*\"(?:ArrayMesh|BoxMesh|CapsuleMesh|CylinderMesh|PlaneMesh|PrismMesh|QuadMesh|SphereMesh|TextMesh|TubeTrailMesh|Environment|Sky|CameraAttributes\\w*)\"", "3D resource"],
	["(?m)^\\s*extends\\s+\\w*3D\\b", "3D script"],
	["\\b\\w*3D\\s*\\.\\s*new\\s*\\(", "動的3D型"],
	["\\b(?:PhysicsServer3D|NavigationServer3D|RenderingServer\\s*\\.\\s*(?:camera|environment|scenario|instance|light|mesh)_)", "3D server"],
	["(?m)^\\s*shader_type\\s+spatial\\b", "spatial shader"],
] # 文字resource内で拒否する3D表現。

var patterns: Array[RegEx] = [] # 一度だけcompileした検査式。

# 文字検査式を一度だけ準備する。
func _init() -> void:
	for rule in RULES:
		var pattern := RegEx.new()
		pattern.compile(rule[0])
		patterns.append(pattern)

# 一つのprojectから境界違反を集める。
func inspect(root: String) -> Array[String]:
	var blocked: Array[String] = []
	for file in _files(root):
		var extension := file.get_extension().to_lower()
		var relative := file.trim_prefix(root.trim_suffix("/") + "/")
		if relative.begins_with("addons/yurutto_website_exporter/"):
			continue
		if extension == "gdextension":
			blocked.append("%s: GDExtension非対応" % relative)
			continue
		if extension == "mesh":
			blocked.append("%s: 3D mesh resource" % relative)
			continue
		if extension in MODEL_TYPES:
			blocked.append("%s: 3D asset" % relative)
			continue
		if extension in BINARY_TYPES:
			_check_binary(file, relative, blocked)
			continue
		if extension in TEXT_TYPES:
			_check_text(file, relative, blocked)
	return blocked

# 隠し生成物を除きproject fileを再帰列挙する。
func _files(root: String) -> Array[String]:
	var found: Array[String] = []
	var pending: Array[String] = [root.trim_suffix("/")]
	while not pending.is_empty():
		var current: String = pending.pop_back()
		var directory := DirAccess.open(current)
		if directory == null:
			continue
		directory.list_dir_begin()
		var name := directory.get_next()
		while not name.is_empty():
			if name != ".godot" and name != ".git":
				var file := current.path_join(name)
				if directory.current_is_dir():
					pending.append(file)
				else:
					found.append(file)
			name = directory.get_next()
		directory.list_dir_end()
	found.sort()
	return found

# 一つの文字fileへ全3D表現を適用する。
func _check_text(file: String, relative: String, blocked: Array[String]) -> void:
	var source := FileAccess.get_file_as_string(file)
	for index in RULES.size():
		if patterns[index].search(source):
			blocked.append("%s: %s" % [relative, RULES[index][1]])

# binary resourceを読込み、保存propertyまで再帰検査する。
func _check_binary(file: String, relative: String, blocked: Array[String]) -> void:
	var resource := ResourceLoader.load(file)
	if resource == null:
		blocked.append("%s: 検査不能binary resource" % relative)
		return
	var value: Variant = resource.instantiate() if resource is PackedScene else resource
	if _has_3d(value, {}):
		blocked.append("%s: binary 3D型" % relative)
	if value is Node:
		value.free()

# Variantの実体と保存propertyから3D型の混入を判断する。
func _has_3d(value: Variant, seen: Dictionary) -> bool:
	if value == null:
		return false
	if value is Shader and "shader_type spatial" in value.code:
		return true
	if value is Array:
		for item in value:
			if _has_3d(item, seen):
				return true
		return false
	if value is Dictionary:
		for key in value:
			if _has_3d(key, seen) or _has_3d(value[key], seen):
				return true
		return false
	if not value is Object:
		return false
	var object: Object = value
	if _is_3d_class(object):
		return true
	var id := object.get_instance_id()
	if seen.has(id):
		return false
	seen[id] = true
	if object is Node:
		for child in object.get_children():
			if _has_3d(child, seen):
				return true
	for property in object.get_property_list():
		if property.usage & PROPERTY_USAGE_STORAGE and _has_3d(object.get(property.name), seen):
			return true
	return false

# ClassDBの継承関係と3D suffixから3D専用classを判断する。
func _is_3d_class(object: Object) -> bool:
	var type_name := object.get_class()
	if type_name.ends_with("3D"):
		return true
	for base in THREE_D_CLASSES:
		if ClassDB.is_parent_class(type_name, base):
			return true
	return false
