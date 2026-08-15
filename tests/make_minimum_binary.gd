# 2D許可と3D拒否に使う有効なGodot binary fixtureをtmpへ生成する。
# PackedSceneとResourceを公式ResourceSaverで作り、拡張子だけの試験を避ける。

extends SceneTree

# 2D scene・resourceと3D scene・resourceを別projectへ保存する。
func _init() -> void:
	var base := OS.get_cmdline_user_args()[0]
	var scene_2d := PackedScene.new()
	scene_2d.pack(Node2D.new())
	ResourceSaver.save(scene_2d, base.path_join("allowed/scene.scn"))
	var texture := GradientTexture2D.new()
	texture.gradient = Gradient.new()
	ResourceSaver.save(texture, base.path_join("allowed/texture.res"))
	var scene_3d := PackedScene.new()
	scene_3d.pack(Node3D.new())
	ResourceSaver.save(scene_3d, base.path_join("scene_3d/scene.scn"))
	ResourceSaver.save(BoxMesh.new(), base.path_join("resource_3d/mesh.res"))
	ResourceSaver.save(Curve3D.new(), base.path_join("curve_3d/curve.res"))
	quit()
