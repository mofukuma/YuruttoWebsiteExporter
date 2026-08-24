# 子の配置、可視性、描画環境を変える全NodeをWeb実行環境で生成する棚卸し画面。
# 生成できた実際のclass名をDOMへ出し、fixtureの名前記載と実行成功を分けずに確かめる。

extends Control

# 描画へ影響するNodeを全種類生成する。
func nodes() -> Array[Node]:
	return [
		AnimationPlayer.new(), AnimationTree.new(), AspectRatioContainer.new(), BackBufferCopy.new(), Bone2D.new(),
		BoxContainer.new(), Camera2D.new(), CanvasGroup.new(), CanvasLayer.new(), CanvasModulate.new(),
		CenterContainer.new(), Container.new(), DirectionalLight2D.new(), FlowContainer.new(), GridContainer.new(),
		HBoxContainer.new(), HFlowContainer.new(), LightOccluder2D.new(), MarginContainer.new(), Parallax2D.new(),
		ParallaxBackground.new(), ParallaxLayer.new(), PathFollow2D.new(), PointLight2D.new(), Popup.new(),
		RemoteTransform2D.new(), Skeleton2D.new(), SubViewport.new(), VBoxContainer.new(), VFlowContainer.new(),
		VisibleOnScreenEnabler2D.new(), Window.new(), AimModifier3D.new(), AreaLight3D.new(), BoneAttachment3D.new(),
		BoneConstraint3D.new(), BoneTwistDisperser3D.new(), CCDIK3D.new(), ConvertTransformModifier3D.new(), CopyTransformModifier3D.new(),
		DirectionalLight3D.new(), FABRIK3D.new(), GeometryInstance3D.new(), GPUParticlesAttractorBox3D.new(), GPUParticlesAttractorSphere3D.new(),
		GPUParticlesAttractorVectorField3D.new(), GPUParticlesCollisionBox3D.new(), GPUParticlesCollisionHeightField3D.new(), GPUParticlesCollisionSDF3D.new(), GPUParticlesCollisionSphere3D.new(),
		LightmapGI.new(), LightmapProbe.new(), LimitAngularVelocityModifier3D.new(), LookAtModifier3D.new(), ModifierBoneTarget3D.new(),
		OccluderInstance3D.new(), OmniLight3D.new(), PathFollow3D.new(), ReflectionProbe.new(), RemoteTransform3D.new(),
		RetargetModifier3D.new(), ShaderGlobalsOverride.new(), Skeleton3D.new(), SkeletonIK3D.new(), SkeletonModifier3D.new(),
		SplineIK3D.new(), SpotLight3D.new(), SpringArm3D.new(), SpringBoneSimulator3D.new(), TwoBoneIK3D.new(),
		VisibleOnScreenEnabler3D.new(), VoxelGI.new(), WorldEnvironment.new()
	]

# 全Nodeをscene treeへ置き、実行中に生成できた型を意味DOMへ報告する。
func _ready() -> void:
	var background := ColorRect.new()
	background.color = Color("0f172a")
	background.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(background)
	var holder := Node.new()
	holder.name = "AffectsInventory"
	add_child(holder)
	var made: Array[String] = []
	for node in nodes():
		node.name = node.get_class()
		if node is CanvasModulate:
			node.color = Color.WHITE
		holder.add_child(node)
		made.append(node.get_class())
	var label := Label.new()
	label.text = "AFFECTS " + ",".join(made)
	label.position = Vector2(12, 12)
	label.size = Vector2(776, 576)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 12)
	add_child(label)
