// Godot全Nodeの描画責務を分類し、実装とfixtureの到達率を別々に集計する。
// ClassDBを唯一の母集団にし、一覧Markdownも同じ集計結果から作る。

'use strict';

const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { godot } = require('./godot.cjs');

const repo = path.resolve(__dirname, '..'); // 棚卸し対象のproject root。
const work = path.join(repo, 'tmp/node-coverage'); // ClassDB取得に使う短命project。
const out = path.join(repo, 'ログ/全ノード棚卸し一覧.md'); // 生成する人向け一覧。

// 空白区切りの定義を、比較しやすい名前一覧へ直す。
const names = (value) => value.trim().split(/\s+/).filter(Boolean);

// 自身または内部部品が画面へ画素を出すNode。
const render = names(`
AcceptDialog AnimatedSprite2D Button CheckBox CheckButton CodeEdit ColorPicker ColorPickerButton ColorRect
ConfirmationDialog CPUParticles2D FileDialog FoldableContainer GPUParticles2D GraphEdit GraphElement GraphFrame
GraphNode HScrollBar HSeparator HSlider HSplitContainer ItemList Label Line2D LineEdit LinkButton MenuBar
MenuButton MeshInstance2D MultiMeshInstance2D NinePatchRect OptionButton Panel PanelContainer Polygon2D PopupMenu
PopupPanel ProgressBar ReferenceRect RichTextLabel ScrollContainer SpinBox SplitContainer Sprite2D
SubViewportContainer TabBar TabContainer TextEdit TextureButton TextureProgressBar TextureRect TileMap TileMapLayer
TouchScreenButton Tree VideoStreamPlayer VirtualJoystick VScrollBar VSeparator VSlider VSplitContainer
AnimatedSprite3D CPUParticles3D CSGBox3D CSGCombiner3D CSGCylinder3D CSGMesh3D CSGPolygon3D CSGSphere3D
CSGTorus3D Decal FogVolume GPUParticles3D GridMap ImporterMeshInstance3D Label3D MeshInstance3D
MultiMeshInstance3D RootMotionView Sprite3D
`); // 描画対応率の分母。

// 子の配置、可視性、描画先、光などを変えて最終画面へ影響するNode。
const affects = names(`
AnimationPlayer AnimationTree AspectRatioContainer BackBufferCopy Bone2D BoxContainer Camera2D CanvasGroup CanvasLayer
CanvasModulate CenterContainer Container Control DirectionalLight2D FlowContainer GridContainer HBoxContainer
HFlowContainer LightOccluder2D MarginContainer Parallax2D ParallaxBackground ParallaxLayer PathFollow2D PointLight2D
Popup RemoteTransform2D Skeleton2D SubViewport VBoxContainer VFlowContainer VisibleOnScreenEnabler2D Window
AimModifier3D AreaLight3D BoneAttachment3D BoneConstraint3D BoneTwistDisperser3D Camera3D CCDIK3D
ConvertTransformModifier3D CopyTransformModifier3D DirectionalLight3D FABRIK3D GeometryInstance3D
GPUParticlesAttractorBox3D GPUParticlesAttractorSphere3D GPUParticlesAttractorVectorField3D
GPUParticlesCollisionBox3D GPUParticlesCollisionHeightField3D GPUParticlesCollisionSDF3D
GPUParticlesCollisionSphere3D LightmapGI LightmapProbe LimitAngularVelocityModifier3D LookAtModifier3D
ModifierBoneTarget3D OccluderInstance3D OmniLight3D PathFollow3D ReflectionProbe RemoteTransform3D
RetargetModifier3D ShaderGlobalsOverride Skeleton3D SkeletonIK3D SkeletonModifier3D SplineIK3D SpotLight3D
SpringArm3D SpringBoneSimulator3D TwoBoneIK3D VisibleOnScreenEnabler3D VoxelGI WorldEnvironment
`); // fixture率へ含める間接描画Node。

// DOM onlyビルドで機能を積んでいないため、現levelでは利用できないNode。
const unavailable = names(`
OpenXRCompositionLayerCylinder OpenXRCompositionLayerEquirect OpenXRCompositionLayerQuad OpenXRHand OpenXRRenderModel
OpenXRRenderModelManager OpenXRVisibilityMask StatusIndicator XRAnchor3D
XRBodyModifier3D XRCamera3D XRController3D XRFaceModifier3D XRHandModifier3D XRNode3D XROrigin3D
`); // 現levelの対象外を明示する一覧。

// 描画を持たず、入力、音、物理、通信などを担うNode。
const nonVisual = names(`
AnimatableBody2D Area2D AudioListener2D AudioStreamPlayer AudioStreamPlayer2D BaseButton CharacterBody2D
CollisionPolygon2D CollisionShape2D DampedSpringJoint2D GrooveJoint2D HTTPRequest Marker2D MissingNode MultiplayerSpawner
MultiplayerSynchronizer NavigationAgent2D NavigationLink2D NavigationObstacle2D NavigationRegion2D Node Node2D
Path2D PhysicalBone2D PinJoint2D Range RayCast2D ResourcePreloader RigidBody2D ShapeCast2D StaticBody2D Timer
VisibleOnScreenNotifier2D
AnimatableBody3D Area3D AudioListener3D AudioStreamPlayer3D CharacterBody3D CollisionPolygon3D CollisionShape3D
ConeTwistJoint3D Generic6DOFJoint3D HingeJoint3D JacobianIK3D Marker3D NavigationAgent3D NavigationLink3D
NavigationObstacle3D NavigationRegion3D Node3D Path3D PhysicalBone3D PhysicalBoneSimulator3D PinJoint3D RayCast3D
RigidBody3D ShapeCast3D SliderJoint3D SoftBody3D SpringBoneCollision3D SpringBoneCollisionCapsule3D
SpringBoneCollisionPlane3D SpringBoneCollisionSphere3D StaticBody3D VehicleBody3D VehicleWheel3D
VisibleOnScreenNotifier3D VisualInstance3D
`); // 描画対応率から除くNode。

// 現rendererにNode専用または継承先のDOM描画経路がある描画Node。
const supported = new Set(names(`
Button CheckBox CheckButton ColorRect FoldableContainer HSlider ItemList Label Line2D LineEdit LinkButton MenuBar
MenuButton NinePatchRect OptionButton Panel ProgressBar SpinBox Sprite2D TabBar TabContainer TextEdit TextureRect Tree VSlider
AnimatedSprite2D Polygon2D TextureButton TextureProgressBar Label3D Sprite3D
`)); // 描画対象率の分子。

// CanvasItemが公開する全描画命令。
const draw = names(`
draw_dashed_line draw_line draw_polyline draw_polyline_colors draw_ellipse_arc draw_arc draw_multiline
draw_multiline_colors draw_rect draw_ellipse draw_circle draw_texture draw_texture_rect draw_texture_rect_region
draw_msdf_texture_rect_region draw_lcd_texture_rect_region draw_style_box draw_primitive draw_set_transform
draw_set_transform_matrix draw_animation_slice draw_end_animation draw_polygon draw_colored_polygon draw_mesh
draw_multimesh draw_string draw_multiline_string draw_string_outline draw_multiline_string_outline draw_char
draw_char_outline
`); // 描画命令率の分母。

// 現overlayが引数をDOM同期へ渡す描画命令。
const drawSupported = new Set(names(`
draw_dashed_line draw_line draw_polyline draw_polyline_colors draw_multiline draw_multiline_colors draw_rect draw_ellipse
draw_ellipse_arc draw_arc draw_circle draw_texture draw_texture_rect draw_texture_rect_region draw_style_box draw_primitive
draw_set_transform draw_set_transform_matrix draw_polygon
draw_colored_polygon draw_string draw_multiline_string draw_string_outline draw_multiline_string_outline draw_char draw_char_outline
`)); // 描画命令率の分子。

const categories = { render, affects_render: affects, non_visual: nonVisual, unavailable }; // 四分類の正本。
const labels = { render: '描画', affects_render: '描画へ影響', non_visual: '非描画', unavailable: '現levelで利用不可' }; // 表示名。

// 分類の目的をNodeごとの理由として返す。
function reason(node, category) {
	if (category === 'render') return '自身または内部部品が画面へ画素を出す';
	if (category === 'affects_render') return '子の配置・可視性・描画環境を変える';
	if (category === 'unavailable') {
		if (node.name === 'StatusIndicator') return 'OSの状態表示で、Webページ内へ描画しない';
		if (node.name === 'ShaderGlobalsOverride') return '描画driverを持たないDOM onlyでは利用しない';
		return 'DOM onlyの共通設定でXRまたはOS固有表示を積んでいない';
	}
	return '自身は画素を出さず、入力・音・物理・通信などを担う';
}

// 対応率を丸め前の値と表示用の値へまとめる。
function metric(done, total) {
	const rate = total ? done / total * 100 : 100;
	return { done, total, rate: Number(rate.toFixed(4)), display: `${rate.toFixed(1)}%` };
}

// 既存fixtureへ明示的に置かれたNode型をsourceから集める。
function fixtures() {
	const root = path.join(repo, 'tests/fixtures');
	const found = new Set();
	const visit = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const file = path.join(dir, entry.name);
			if (entry.isDirectory()) visit(file);
			else if (entry.name.endsWith('.gd')) {
				const source = fs.readFileSync(file, 'utf8');
				for (const match of source.matchAll(/\b([A-Z][A-Za-z0-9]+)\.new\s*\(/g)) found.add(match[1]);
			} else if (entry.name.endsWith('.tscn')) {
				const source = fs.readFileSync(file, 'utf8');
				for (const match of source.matchAll(/^\[node[^\n]*\btype="([^"]+)"/gm)) found.add(match[1]);
			}
		}
	};
	visit(root);
	return found;
}

// 対応版Godotから実体化できる全Nodeを取得する。
function collect() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.mkdirSync(work, { recursive: true });
	fs.writeFileSync(path.join(work, 'project.godot'), '[application]\nconfig/name="Node Inventory"\n');
	fs.copyFileSync(path.join(repo, 'tests/node_coverage.gd'), path.join(work, 'node_coverage.gd'));
	const run = child.execFileSync(godot, ['--headless', '--path', work, '--script', 'node_coverage.gd'], { encoding: 'utf8', timeout: 180000 });
	const found = /\{[\s\S]*\}/.exec(run);
	if (!found) throw new Error(`ClassDB一覧を読めない: ${run.slice(-400)}`);
	return JSON.parse(found[0]);
}

// ClassDB一覧を分類の正本と突き合わせ、独立した三指標を作る。
function inspect(data) {
	const byName = new Map(data.nodes.map((node) => [node.name, node]));
	const slots = new Map();
	for (const [category, list] of Object.entries(categories)) {
		for (const name of list) {
			const values = slots.get(name) || [];
			values.push(category);
			slots.set(name, values);
		}
	}
	const unknown = data.nodes.filter((node) => !slots.has(node.name)).map((node) => node.name);
	const stale = [...slots.keys()].filter((name) => !byName.has(name));
	const duplicates = [...slots].filter(([, value]) => value.length !== 1).map(([name]) => name);
	if (stale.length) unknown.push(...stale.map((name) => `削除済み:${name}`));
	const tested = fixtures();
	const nodes = data.nodes.map((node) => {
		const category = slots.get(node.name)?.[0] || 'unknown';
		return { ...node, category, reason: reason(node, category), supported: supported.has(node.name), fixture: tested.has(node.name) };
	});
	const targets = nodes.filter((node) => node.category === 'render');
	const fixtureTargets = nodes.filter((node) => node.category === 'render' || node.category === 'affects_render');
	const classified = nodes.filter((node) => node.category !== 'unknown').length;
	const available = nodes.filter((node) => node.category !== 'unavailable');
	const constructed = new Set(data.constructed || []);
	return {
		nodes, unknown, duplicates,
		counts: {
			groups: Object.fromEntries(Object.entries(data.groups).map(([name, value]) => [name, value.length])),
			categories: Object.fromEntries(Object.keys(categories).map((name) => [name, nodes.filter((node) => node.category === name).length])),
		},
		metrics: {
			inventory: metric(classified, nodes.length),
			instantiation: metric(available.filter((node) => constructed.has(node.name)).length, available.length),
			drawing: metric(targets.filter((node) => node.supported).length, targets.length),
			drawCommands: metric(draw.filter((name) => drawSupported.has(name)).length, draw.length),
			fixture: metric(fixtureTargets.filter((node) => node.fixture).length, fixtureTargets.length),
		},
		draw: draw.map((name) => ({ name, supported: drawSupported.has(name) })),
	};
}

// 同じ監査結果から、人が確認できる全Node一覧を作る。
function markdown(report) {
	const m = report.metrics;
	const lines = [
		'# 全ノード棚卸し一覧', '',
		'## 何のための一覧か', '',
		'Godot 4.7.1で実体化できる全Nodeを漏れなく見渡し、DOM onlyで描く対象と検査の不足を確認しよう。非描画Nodeは描画対応率へ混ぜず、未対応の見た目を隠さない集計にしているよ。', '',
		'## 集計', '',
		'| 指標 | 達成 | 分母 | 率 |', '|---|---:|---:|---:|',
		`| 棚卸し | ${m.inventory.done} | ${m.inventory.total} | ${m.inventory.display} |`,
		`| 利用対象Nodeの生成 | ${m.instantiation.done} | ${m.instantiation.total} | ${m.instantiation.display} |`,
		`| 描画Node対応 | ${m.drawing.done} | ${m.drawing.total} | ${m.drawing.display} |`,
		`| \`_draw()\`命令対応 | ${m.drawCommands.done} | ${m.drawCommands.total} | ${m.drawCommands.display} |`,
		`| 描画関係Nodeのfixture配置 | ${m.fixture.done} | ${m.fixture.total} | ${m.fixture.display} |`, '',
		`内訳はControl ${report.counts.groups.control}、Node2D ${report.counts.groups.node2d}、Node3D ${report.counts.groups.node3d}、その他 ${report.counts.groups.other}。分類は描画 ${report.counts.categories.render}、描画へ影響 ${report.counts.categories.affects_render}、非描画 ${report.counts.categories.non_visual}、現levelで利用不可 ${report.counts.categories.unavailable}だよ。`, '',
		'「現levelで利用不可」は達成扱いにしていない。DOM onlyでは3D座標を利用できるが、共通設定で外したXRとOS固有表示は分母へ含めていないよ。', '',
		'## 全Node', '',
		'| Node | 親 | 系統 | 分類 | 理由 | DOM描画 | fixture |', '|---|---|---|---|---|---|---|',
	];
	for (const node of report.nodes) {
		const dom = node.category === 'render' ? node.supported ? '対応' : '未対応' : '対象外';
		lines.push(`| ${node.name} | ${node.parent} | ${node.group} | ${labels[node.category] || '未分類'} | ${node.reason} | ${dom} | ${node.fixture ? 'あり' : 'なし'} |`);
	}
	lines.push('', '## `_draw()`命令', '', '| 命令 | DOM描画 |', '|---|---|');
	for (const item of report.draw) lines.push(`| \`${item.name}\` | ${item.supported ? '対応' : '未対応'} |`);
	return `${lines.join('\n')}\n`;
}

// 明示的に生成を頼まれたときは、ClassDBの現在値から一覧を更新する。
if (require.main === module) {
	if (process.argv.includes('--write')) {
		const report = inspect(collect());
		if (report.unknown.length || report.duplicates.length) {
			throw new Error(`分類を直してから一覧を作って: 未分類=${report.unknown.join(',')} 重複=${report.duplicates.join(',')}`);
		}
		fs.writeFileSync(out, markdown(report));
		console.log(JSON.stringify({ ok: true, file: path.relative(repo, out), metrics: report.metrics }));
	}
}

module.exports = { collect, inspect, markdown };
