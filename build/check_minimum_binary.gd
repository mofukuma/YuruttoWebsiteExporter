# binary sceneとresourceの3D型だけを検出する書き出し前検査。
# ResourceLoaderで実体化し、Node、Resource、配列の保存propertyを再帰走査する。
# 設計思想：2D binaryは許可し、3D型または読めないbinaryだけを明示拒否する。

extends SceneTree

var blocked: Array[String] = [] # 拒否理由付きのproject相対path。
const THREE_D_CLASSES := [
	"Mesh", "Shape3D", "BaseMaterial3D", "Occluder3D", "Environment", "Sky", "CameraAttributes",
	"NavigationMesh", "Skin", "SkeletonProfile", "MeshLibrary", "ImporterMesh", "LightmapGIData", "VoxelGIData",
	"FogMaterial", "ProceduralSkyMaterial", "PanoramaSkyMaterial", "PhysicalSkyMaterial", "Compositor", "CompositorEffect",
] # 名前が3Dで終わらない型を含む3D専用class系統。

# project内のbinary sceneとresourceを一括走査する。
func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.is_empty():
		printerr("binary検査対象がありません。")
		quit(2)
		return
	var root := args[0]
	for file in _files(root):
		var resource := ResourceLoader.load(file)
		if resource == null:
			blocked.append("%s: 検査不能binary resource" % file.trim_prefix(root + "/"))
			continue
		var value: Variant = resource.instantiate() if resource is PackedScene else resource
		if _has_3d(value, {}):
			blocked.append("%s: binary 3D型" % file.trim_prefix(root + "/"))
	for message in blocked:
		printerr(message)
	quit(1 if not blocked.is_empty() else 0)

# `.scn`と`.res`だけを再帰列挙する。
func _files(root: String) -> Array[String]:
	var found: Array[String] = []
	var pending: Array[String] = [root]
	while not pending.is_empty():
		var current: String = pending.pop_back()
		var dir: DirAccess = DirAccess.open(current)
		if dir == null:
			continue
		dir.list_dir_begin()
		var name := dir.get_next()
		while not name.is_empty():
			if name != ".godot" and name != ".git":
				var file: String = current.path_join(name)
				if dir.current_is_dir():
					pending.append(file)
				elif name.get_extension().to_lower() in ["scn", "res"]:
					found.append(file)
			name = dir.get_next()
	return found

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
