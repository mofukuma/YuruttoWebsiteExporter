# native ClassDBからN18型と全propertyをJSONへ抽出する。
# 非既定値試験は型・hint・既定値が同じpropertyを同値類へ圧縮する。
# 設計思想：C++名の推測を避け、実際に起動するEditorの公開APIを棚卸し正本とする。

extends SceneTree

const MANIFEST := "tmp/gdweb/normal-matrix/n18_2d_features/project/feature_manifest.json" # source抽出済み母集団。
const OUTPUT := "tmp/gdweb/normal-matrix/n18_2d_features/classdb-properties.json" # native API証跡。

func _init() -> void:
	var root := ProjectSettings.globalize_path("res://").trim_suffix("/")
	var manifest := _json(root.path_join(MANIFEST))
	var classes: Array[Dictionary] = []
	for item in manifest.get("types", []):
		classes.append(_class_row(StringName(item.name)))
	var groups := _groups(classes)
	var output := _arg("--output=", root.path_join(OUTPUT))
	_write(output, {"classes": classes, "property_equivalence": groups})
	print(JSON.stringify({"output": output, "classes": classes.size(), "properties": groups.values().reduce(func(sum, names): return sum + names.size(), 0), "groups": groups.size()}))
	quit()

# 抽象型も親関係からNode/Resource/RefCountedへ分類する。
func _kind(name: StringName) -> String:
	if ClassDB.is_parent_class(name, &"Node"):
		return "node"
	if ClassDB.is_parent_class(name, &"Resource"):
		return "resource"
	if ClassDB.is_parent_class(name, &"RefCounted"):
		return "refcounted"
	return "object"

# ClassDBが返す全継承propertyへ宣言元と同値類を付与する。
func _class_row(name: StringName) -> Dictionary:
	if not ClassDB.class_exists(name):
		return {"name": String(name), "exists": false, "kind": "missing", "parent": "", "can_instantiate": false, "properties": []}
	var properties: Array[Dictionary] = []
	for property in ClassDB.class_get_property_list(name, false):
		if int(property.usage) & PROPERTY_USAGE_CATEGORY or int(property.usage) & PROPERTY_USAGE_GROUP or int(property.usage) & PROPERTY_USAGE_SUBGROUP:
			continue
		var owner := _owner(name, property.name)
		var value = ClassDB.class_get_property_default_value(name, property.name)
		properties.append({
			"name": String(property.name),
			"declared_by": String(owner),
			"type": int(property.type),
			"type_name": type_string(int(property.type)),
			"class_name": String(property.class_name),
			"hint": int(property.hint),
			"hint_string": String(property.hint_string),
			"usage": int(property.usage),
			"default": var_to_str(value),
			"equivalence": _equivalence(property),
		})
	return {
		"name": String(name),
		"exists": ClassDB.class_exists(name),
		"kind": _kind(name),
		"parent": String(ClassDB.get_parent_class(name)),
		"can_instantiate": ClassDB.can_instantiate(name),
		"properties": properties,
	}

func _owner(name: StringName, property: StringName) -> StringName:
	var current := name
	while current != &"":
		for own in ClassDB.class_get_property_list(current, true):
			if own.name == property:
				return current
		current = ClassDB.get_parent_class(current)
	return &""

# 値そのものではなく正常な非既定値の境界群へまとめる。
func _equivalence(property: Dictionary) -> String:
	if int(property.hint) == PROPERTY_HINT_ENUM or int(property.hint) == PROPERTY_HINT_FLAGS:
		return "enum:first-middle-last"
	if int(property.hint) == PROPERTY_HINT_RANGE:
		return "range:min-interior-max"
	match int(property.type):
		TYPE_BOOL: return "bool:opposite"
		TYPE_INT, TYPE_FLOAT: return "number:zero-negative-positive"
		TYPE_STRING, TYPE_STRING_NAME: return "text:empty-ascii-unicode"
		TYPE_VECTOR2, TYPE_VECTOR2I, TYPE_RECT2, TYPE_RECT2I: return "2d:zero-negative-positive-edge"
		TYPE_TRANSFORM2D: return "transform:identity-translate-rotate-scale-negative"
		TYPE_COLOR: return "color:alpha0-tiny-half-opaque-rgb"
		TYPE_OBJECT: return "resource:null-compatible"
		TYPE_ARRAY, TYPE_PACKED_BYTE_ARRAY, TYPE_PACKED_INT32_ARRAY, TYPE_PACKED_INT64_ARRAY, TYPE_PACKED_FLOAT32_ARRAY, TYPE_PACKED_FLOAT64_ARRAY, TYPE_PACKED_STRING_ARRAY, TYPE_PACKED_VECTOR2_ARRAY, TYPE_PACKED_VECTOR3_ARRAY, TYPE_PACKED_COLOR_ARRAY, TYPE_PACKED_VECTOR4_ARRAY: return "array:empty-one-many"
		_: return "value:alternate"

func _groups(classes: Array[Dictionary]) -> Dictionary:
	var groups := {}
	for item in classes:
		for property in item.properties:
			var key := "%s|%s|%s|%s|%s" % [property.declared_by, property.type, property.hint, property.hint_string, property.equivalence]
			if not groups.has(key):
				groups[key] = []
			groups[key].append("%s.%s" % [item.name, property.name])
	return groups

func _json(path: String) -> Dictionary:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("manifestを読めない: %s" % path)
		return {}
	return JSON.parse_string(file.get_as_text())

func _arg(prefix: String, fallback: String) -> String:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with(prefix):
			return arg.trim_prefix(prefix)
	return fallback

func _write(path: String, value: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		push_error("結果を書けない: %s" % path)
		return
	file.store_string(JSON.stringify(value, "\t") + "\n")
