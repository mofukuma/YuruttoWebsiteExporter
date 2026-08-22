# 画面へ何かを描く全nodeを、DOM onlyでの扱いごとに仕分ける。
# ClassDBから一覧を作るので、Godotが増えれば数も自動で増える。
# 「描く」の判定はCanvasItemかNode3Dかで行い、それ以外は画面へ出ないものとして数えない。

extends SceneTree

# 文字をDOM要素として出すControl。
const TEXT_DOM := [
	"Label", "Button", "ColorPickerButton", "CheckBox", "CheckButton", "LinkButton", "OptionButton", "MenuButton",
	"LineEdit", "TextEdit", "CodeEdit", "ItemList", "Tree", "TabBar", "TabContainer",
	"ProgressBar", "MenuBar", "FoldableContainer", "SpinBox", "RichTextLabel",
]
# 面や枠をDOMの箱として出すControl。文字を持たないので箱で足りる。
const BOX_DOM := [
	"ColorRect", "Panel", "PanelContainer", "ReferenceRect", "NinePatchRect",
	"HSeparator", "VSeparator", "HScrollBar", "VScrollBar", "HSlider", "VSlider",
	"TextureProgressBar", "VirtualJoystick",
]
# 絵をDOMのimgとして出すもの。
const IMAGE_DOM := ["TextureRect", "TextureButton", "Sprite2D", "AnimatedSprite2D"]
# 位置を決めるのが役目で、自分では描かないもの。DOMは子の位置で足りる。
const LAYOUT_ONLY := [
	"Control", "Container", "BoxContainer", "HBoxContainer", "VBoxContainer", "GridContainer",
	"CenterContainer", "MarginContainer", "AspectRatioContainer", "FlowContainer",
	"HFlowContainer", "VFlowContainer", "ScrollContainer", "SplitContainer",
	"HSplitContainer", "VSplitContainer", "SubViewportContainer", "BaseButton", "Range",
	"Node2D", "CanvasGroup", "CanvasLayer", "CanvasModulate", "ParallaxLayer", "Parallax2D",
	"RemoteTransform2D", "Camera2D", "AudioListener2D", "Marker2D", "Path2D", "PathFollow2D",
	"Node3D", "Marker3D", "RemoteTransform3D", "Path3D", "PathFollow3D", "AudioListener3D",
	"XRNode3D", "XRAnchor3D", "XROrigin3D", "XRCamera3D", "XRController3D", "XRHandModifier3D",
	"XRBodyModifier3D", "XRFaceModifier3D",
]
# _draw()の命令をDOMへ写せるもの。自分でCanvasへ描くnode。
const DRAW_DOM := ["Line2D", "Polygon2D", "TouchScreenButton", "TileMapLayer", "TileMap", "MeshInstance2D", "MultiMeshInstance2D"]
# 当たり判定や補助の見た目で、書き出した作品には出ないもの。
const EDITOR_ONLY := [
	"CollisionShape2D", "CollisionPolygon2D", "CollisionShape3D", "CollisionPolygon3D",
	"NavigationRegion2D", "NavigationLink2D", "NavigationRegion3D", "NavigationLink3D",
	"NavigationObstacle2D", "NavigationObstacle3D",
	"Area2D", "Area3D", "StaticBody2D", "StaticBody3D", "RigidBody2D", "RigidBody3D",
	"CharacterBody2D", "CharacterBody3D", "AnimatableBody2D", "AnimatableBody3D",
	"PhysicalBone2D", "PhysicalBone3D", "PhysicsBody2D", "PhysicsBody3D", "CollisionObject2D", "CollisionObject3D",
	"Joint2D", "Joint3D", "PinJoint2D", "PinJoint3D", "GrooveJoint2D", "DampedSpringJoint2D",
	"HingeJoint3D", "SliderJoint3D", "ConeTwistJoint3D", "Generic6DOFJoint3D",
	"RayCast2D", "RayCast3D", "ShapeCast2D", "ShapeCast3D", "SpringArm3D", "SpringBoneSimulator3D",
	"VisibleOnScreenNotifier2D", "VisibleOnScreenEnabler2D", "VisibleOnScreenNotifier3D", "VisibleOnScreenEnabler3D",
	"Skeleton2D", "Bone2D", "Skeleton3D", "BoneAttachment3D", "SkeletonModifier3D",
	"SkeletonIK3D", "LookAtModifier3D", "RetargetModifier3D", "ShapeCast3D",
	# 骨を動かす補助。自分では何も描かない。
	"AimModifier3D", "BoneConstraint3D", "BoneTwistDisperser3D", "CCDIK3D", "FABRIK3D",
	"JacobianIK3D", "SplineIK3D", "TwoBoneIK3D", "ConvertTransformModifier3D",
	"CopyTransformModifier3D", "LimitAngularVelocityModifier3D", "ModifierBoneTarget3D",
	"PhysicalBoneSimulator3D", "SpringBoneCollision3D", "SpringBoneCollisionCapsule3D",
	"SpringBoneCollisionPlane3D", "SpringBoneCollisionSphere3D",
	# 音。位置は持つが絵は無い。
	"AudioStreamPlayer2D", "AudioStreamPlayer3D",
	# 粒子の当たりや引き寄せ。粒子そのものではない。
	"GPUParticlesAttractorBox3D", "GPUParticlesAttractorSphere3D", "GPUParticlesAttractorVectorField3D",
	"GPUParticlesCollisionBox3D", "GPUParticlesCollisionHeightField3D",
	"GPUParticlesCollisionSDF3D", "GPUParticlesCollisionSphere3D",
	# 乗り物の物理。車輪の絵は子のMeshInstance3Dが出す。
	"VehicleBody3D", "VehicleWheel3D", "SoftBody3D",
	# XRの装置まわり。書き出したWebページには出ない。
	"OpenXRCompositionLayerCylinder", "OpenXRCompositionLayerEquirect", "OpenXRCompositionLayerQuad",
	"OpenXRHand", "OpenXRRenderModel", "OpenXRRenderModelManager", "OpenXRVisibilityMask",
	# 取り込みや編集の途中で使うもの。
	"ImporterMeshInstance3D", "RootMotionView", "GeometryInstance3D", "VisualInstance3D",
	# 描画の下ごしらえ。見た目そのものではない。
	"BackBufferCopy", "OccluderInstance3D", "LightmapProbe",
]

# 3Dの見た目。matrix3dで写す対象と、写せないものへ分ける。
const MESH_3D := ["MeshInstance3D", "MultiMeshInstance3D", "CSGBox3D", "CSGCylinder3D", "CSGSphere3D", "CSGTorus3D", "CSGPolygon3D", "CSGMesh3D", "CSGCombiner3D", "AnimatedSprite3D", "GridMap"]
# 画面全体の見えかたを決めるもの。DOMでは背景や影として近づける。
const ENV_3D := ["WorldEnvironment", "Camera3D", "DirectionalLight3D", "OmniLight3D", "SpotLight3D", "LightmapGI", "VoxelGI", "ReflectionProbe", "FogVolume", "Compositor", "AreaLight3D", "Decal", "DirectionalLight2D", "PointLight2D", "LightOccluder2D"]
# 今は写せないもの。理由を添える。
const PENDING := {
	"ColorPicker": "色見本の並びが細かく、DOMで作り直す価値が薄い",
	"GraphEdit": "編集器向けで作品には出ない",
	"GraphElement": "編集器向けで作品には出ない",
	"GraphFrame": "編集器向けで作品には出ない",
	"GraphNode": "編集器向けで作品には出ない",
	"VideoStreamPlayer": "動画の再生はDOMのvideoが要る",
	"GPUParticles2D": "粒子はGPUで動くため位置を取り出せない",
	"CPUParticles2D": "粒子は数が多く、DOMでは重くなる",
	"GPUParticles3D": "粒子はGPUで動くため位置を取り出せない",
	"CPUParticles3D": "粒子は数が多く、DOMでは重くなる",
	"SubViewport": "別の画面を中へ描くため入れ子になる",
	"Sprite3D": "3Dの中の板をまだ写していない",
	"Label3D": "3Dの中の文字をまだ写していない",
}

# DOM onlyはdisable_3d=yesで組むため、3Dのnodeはそもそも入っていない。
# 数える時はCanvasItemの系統を母数にする。3Dは3D levelの話として別に数える。
func _is_2d(name: String) -> bool:
	return ClassDB.is_parent_class(name, "CanvasItem")

# 画面へ描くnodeを集めて仕分け、数と一覧を出す。
func _initialize() -> void:
	var buckets := {
		"text_dom": [], "box_dom": [], "image_dom": [], "draw_dom": [],
		"mesh_3d": [], "env_3d": [], "layout_only": [], "editor_only": [],
		"pending": [], "unknown": [],
	}
	for name in ClassDB.get_class_list():
		if not ClassDB.can_instantiate(name):
			continue
		# 画面へ出るのはCanvasItemかNode3Dの系統。それ以外は音や仕組みなので数えない。
		if not ClassDB.is_parent_class(name, "CanvasItem") and not ClassDB.is_parent_class(name, "Node3D"):
			continue
		if name in TEXT_DOM: buckets["text_dom"].append(name)
		elif name in BOX_DOM: buckets["box_dom"].append(name)
		elif name in IMAGE_DOM: buckets["image_dom"].append(name)
		elif name in DRAW_DOM: buckets["draw_dom"].append(name)
		elif name in MESH_3D: buckets["mesh_3d"].append(name)
		elif name in ENV_3D: buckets["env_3d"].append(name)
		elif name in LAYOUT_ONLY: buckets["layout_only"].append(name)
		elif name in EDITOR_ONLY: buckets["editor_only"].append(name)
		elif PENDING.has(name): buckets["pending"].append(name)
		else: buckets["unknown"].append(name)
	for key in buckets:
		buckets[key].sort()
	# DOM onlyの達成率は、CanvasItem系のうち作品へ出るものを母数にする。
	var dom_done := 0
	var dom_pending := 0
	for key in ["text_dom", "box_dom", "image_dom", "draw_dom", "layout_only"]:
		for name in buckets[key]:
			if _is_2d(name):
				dom_done += 1
	for name in buckets["pending"]:
		if _is_2d(name):
			dom_pending += 1
	print(JSON.stringify({
		"buckets": buckets,
		"dom_only": {"covered": dom_done, "pending": dom_pending},
		"pending_reasons": PENDING,
	}))
	quit(0)
