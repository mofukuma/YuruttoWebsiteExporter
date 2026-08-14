// Godot登録sourceからN18の2D母集団を機械抽出する。
// 設計思想：人手の型表を正本にせず、登録節と限定build設定から採否を一意に導く。

const fs = require('node:fs');
const path = require('node:path');

const extraNames = new Set([
	'AudioStreamPlayer2D', 'Curve2D', 'Path2D', 'PathFollow2D',
	'Shape2D', 'WorldBoundaryShape2D', 'SegmentShape2D', 'SeparationRayShape2D',
	'CircleShape2D', 'RectangleShape2D', 'CapsuleShape2D', 'ConvexPolygonShape2D', 'ConcavePolygonShape2D',
	'NavigationMesh', 'NavigationMeshSourceGeometryData2D', 'NavigationPolygon', 'NavigationRegion2D',
	'NavigationAgent2D', 'NavigationObstacle2D', 'NavigationLink2D', 'PolygonPathFinder',
]); // 2D登録節外に置かれた2D本体。

const deprecated = new Set(['ParallaxBackground', 'ParallaxLayer', 'TileMap']); // deprecated=noで除外する型。
const navigation = new Set([...extraNames].filter((name) => name.startsWith('Navigation') || name === 'PolygonPathFinder')); // navigation無効化の根拠。
const moduleNames = new Set(['VideoStreamTheora']); // 2D Controlが所有する動画Resource。
const physics = new Set([
	'CollisionObject2D', 'PhysicsBody2D', 'StaticBody2D', 'AnimatableBody2D', 'RigidBody2D', 'CharacterBody2D',
	'KinematicCollision2D', 'Area2D', 'CollisionShape2D', 'CollisionPolygon2D', 'RayCast2D', 'ShapeCast2D',
	'Joint2D', 'PinJoint2D', 'GrooveJoint2D', 'DampedSpringJoint2D', 'TouchScreenButton', 'PhysicalBone2D',
	'SkeletonModification2DJiggle', 'SkeletonModification2DPhysicalBones', 'Shape2D', 'WorldBoundaryShape2D',
	'SegmentShape2D', 'SeparationRayShape2D', 'CircleShape2D', 'RectangleShape2D', 'CapsuleShape2D',
	'ConvexPolygonShape2D', 'ConcavePolygonShape2D',
]); // physics有効化の照合対象。

const structuralExcluded = new Set([
	'CanvasGroup', 'CPUParticles2D', 'GPUParticles2D', 'MeshInstance2D', 'MultiMeshInstance2D', 'Skeleton2D', 'Bone2D',
	'Light2D', 'PointLight2D', 'DirectionalLight2D', 'LightOccluder2D', 'OccluderPolygon2D', 'BackBufferCopy', 'CanvasModulate', 'TouchScreenButton',
	'SkeletonModificationStack2D', 'SkeletonModification2D', 'SkeletonModification2DLookAt', 'SkeletonModification2DCCDIK', 'SkeletonModification2DFABRIK',
	'SkeletonModification2DTwoBoneIK', 'SkeletonModification2DStackHolder', 'PhysicalBone2D', 'SkeletonModification2DJiggle', 'SkeletonModification2DPhysicalBones',
	'Mesh', 'MeshConvexDecompositionSettings', 'ArrayMesh', 'PlaceholderMesh', 'ImmediateMesh', 'MultiMesh', 'SurfaceTool', 'MeshDataTool',
]); // Shader/GPU、backbuffer、mesh骨格へ依存する構造的非採用型。

function registrations(text, scope) {
	const pattern = /GDREGISTER_(ABSTRACT_|VIRTUAL_)?CLASS\(([^),]+)(?:,[^)]+)?\)/g;
	return [...text.matchAll(pattern)].map((match) => ({
		name: match[2].trim(),
		registration: match[1] ? match[1].slice(0, -1).toLowerCase() : 'concrete',
		scope,
	}));
}

// 指定された登録節と明示された支援Resourceだけを抽出する。
function sourceRows(register, moduleRegister = '') {
	const direct = register.split('/* REGISTER 2D */')[1].split('/* REGISTER RESOURCES */')[0];
	const meshStart = register.indexOf('\tGDREGISTER_VIRTUAL_CLASS(Mesh);');
	const meshEndText = '\tGDREGISTER_CLASS(MeshDataTool);';
	const mesh = register.slice(meshStart, register.indexOf(meshEndText, meshStart) + meshEndText.length);
	const extras = registrations(register, '2d-extra').filter((row) => extraNames.has(row.name));
	const modules = registrations(moduleRegister, '2d-module-resource').filter((row) => moduleNames.has(row.name));
	const rows = [...registrations(direct, '2d-register'), ...registrations(mesh, 'mesh-resource'), ...extras, ...modules];
	const names = rows.map((row) => row.name);
	if (new Set(names).size !== names.length) throw new Error('N18母集団に重複あり');
	return rows;
}

function snake(name) {
	return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/2_d/g, '2d').toLowerCase();
}

// 複数型を一つの正常画面へまとめ、試験件数の水増しを避ける。
function testedBy(name) {
	if (/VideoStream/.test(name)) return 'n18_i_video';
	if (/Navigation|PathFinder/.test(name)) return 'n18_g_navigation';
	if (/Skeleton|Bone/.test(name)) return 'n18_f_skeleton';
	if (/Tile/.test(name)) return 'n18_e_tile_parallax';
	if (/Parallax/.test(name)) return 'n18_e_tile_parallax';
	if (/CollisionObject|Shape|Body|Area|Joint|RayCast|TouchScreen|KinematicCollision/.test(name)) return 'n18_d_physics';
	if (/Particle|Mesh|SurfaceTool|Light|Occluder|CanvasGroup|BackBuffer|CanvasModulate/.test(name)) return 'n18_c_cpu_canvas';
	if (/Sprite|Line2D|Polygon2D/.test(name)) return 'n18_b_sprite_geometry';
	if (/Audio|Curve2D|Path2D|PathFollow2D/.test(name)) return 'n18_h_audio_path';
	return 'n18_a_transform_state';
}

// ResourceとNodeの更新責務を、現在の採否に関係なく明示する。
function owner(name, kind) {
	if (/VideoStream/.test(name)) return 'VideoStreamPlayer';
	if (name === 'SpriteFrames') return 'AnimatedSprite2D';
	if (/Mesh|SurfaceTool/.test(name)) return 'MeshInstance2D/MultiMeshInstance2D';
	if (name === 'KinematicCollision2D') return 'CharacterBody2D/PhysicsBody2D';
	if (/Shape2D/.test(name)) return 'CollisionShape2D/ShapeCast2D/PhysicsServer2D';
	if (name === 'OccluderPolygon2D') return 'LightOccluder2D';
	if (/TileSet|TileMapPattern|TileData/.test(name)) return 'TileMapLayer';
	if (/SkeletonModification/.test(name)) return 'Skeleton2D';
	if (name === 'Curve2D') return 'Path2D';
	if (/NavigationMesh|NavigationPolygon/.test(name)) return 'NavigationServer2D/NavigationRegion2D';
	if (/Audio/.test(name)) return 'Godot Audio状態/Web Audio';
	if (kind === 'node') return 'Godot SceneTree状態/Browser Canvas2D';
	if (kind === 'resource' || kind === 'refcounted' || kind === 'object') return '参照元Godot Node';
	return '具象派生型';
}

// GPU禁止時も型を消さず、CPU代替または明示排除を固定する。
function fallback(name) {
	if (/GPUParticles/.test(name)) return 'CPU粒子更新をCPUParticles相当へ変換し、texture/rect命令で描画';
	if (/CPUParticles/.test(name)) return 'Godot CPU粒子更新をtexture/rect命令へ転送';
	if (/MultiMesh/.test(name)) return 'CPUで各instance transformを展開し、triangles/texture命令へ転送';
	if (/Mesh/.test(name) || /Polygon/.test(name)) return 'CPUで2D三角形へ展開し、triangles命令へ転送';
	if (/Light|Occluder|CanvasModulate/.test(name)) return 'CPUで色と遮蔽を合成し、RGBA Canvas命令へ転送';
	if (/CanvasGroup|BackBuffer/.test(name)) return 'CPU offscreen Canvasへ合成し、render_target命令へ転送';
	if (/Tile/.test(name)) return 'Godot CPUで可視tileを選別し、texture命令へ転送';
	if (/Skeleton|Bone/.test(name)) return 'Godot CPUでbone transformを解決し、texture/triangles命令へ転送';
	if (/Navigation|PathFinder/.test(name)) return 'Godot NavigationServer2DのCPU結果だけを状態へ反映';
	if (/Shape|Body|Area|Joint|RayCast/.test(name)) return 'Godot PhysicsServer2DのCPU結果だけを状態とCanvasへ反映';
	if (/Audio/.test(name)) return 'Godot音声状態をWeb Audioへ転送し、描画を持たない';
	return 'Godot CPU状態を正本とし、rect/primitive/triangles/texture命令へ変換';
}

// build設定とExporter許可表から現在能力を分類する。
function enrich(rows, facts) {
	return rows.map((row) => {
		const currentBuildExcluded = facts.disabled.has(row.name) || deprecated.has(row.name) || (facts.navigationDisabled && navigation.has(row.name));
		const allowed = facts.allowedNodes.has(row.name) || facts.allowedResources.has(row.name);
		const abstractOwner = row.registration !== 'concrete';
		const kind = facts.classdb.get(row.name)?.kind || 'classdb-pending';
		let capacity = 'adopted-unimplemented';
		let implementation = currentBuildExcluded ? 'current build:excluded' : 'current exporter:unsupported';
		if (deprecated.has(row.name)) {
			capacity = 'deprecated-excluded';
			implementation = 'build:deprecated=no';
		} else if (structuralExcluded.has(row.name)) {
			capacity = 'structural-excluded';
			implementation = 'gdweb構造的非採用';
		} else if (abstractOwner) {
			capacity = 'adopted-owned';
			implementation = 'ClassDB抽象基底';
		} else if (allowed) {
			capacity = 'adopted-implemented';
			implementation = kind === 'node' ? 'Exporter構造検査 + Godot CPU/Canvas2D' : 'Exporter構造検査 + Godot CPU Resource';
		}
		const adopted = capacity.startsWith('adopted-');
		return {
			...row,
			kind,
			parent: facts.classdb.get(row.name)?.parent || '',
			implementation,
			owner: owner(row.name, kind),
			normal_tested_by: adopted ? testedBy(row.name) : '',
			test_status: 'unproven',
			capacity,
			cpu_fallback: adopted ? fallback(row.name) : 'なし。書き出し時に非採用warning',
			build_condition: deprecated.has(row.name) ? 'deprecated=no:X' : navigation.has(row.name) ? facts.navigationDisabled ? 'current:disable_navigation_2d=yes; target:no' : 'disable_navigation_2d=no' : row.name === 'VideoStreamTheora' ? 'module_ogg/vorbis/theora_enabled=yes' : physics.has(row.name) ? 'disable_physics_2d=no' : facts.disabled.has(row.name) ? 'current:disabled_classes; target:CPU実装時に解除' : 'always',
		};
	});
}

function readFacts(repo, classdbFile) {
	const source = path.join(repo, 'tmp/godot-source');
	const exporter = fs.readFileSync(path.join(source, 'modules/gdweb/editor_export_platform_gdweb.cpp'), 'utf8');
	const allowedMatch = exporter.match(/const bool allowed = ([\s\S]*?);\n\s*if \(!allowed\)/);
	const classdb = fs.existsSync(classdbFile) ? JSON.parse(fs.readFileSync(classdbFile, 'utf8')).classes : [];
	const buildRuntime = fs.readFileSync(path.join(repo, 'build/build_runtime.sh'), 'utf8');
	const registered = [
		...fs.readFileSync(path.join(source, 'scene/register_scene_types.cpp'), 'utf8').matchAll(/GDREGISTER_(?:ABSTRACT_|VIRTUAL_)?CLASS\(([^),]+)/g),
		...fs.readFileSync(path.join(source, 'modules/theora/register_types.cpp'), 'utf8').matchAll(/GDREGISTER_(?:ABSTRACT_|VIRTUAL_)?CLASS\(([^),]+)/g),
	].map((match) => match[1].trim()); // token拒否方式では限定runtimeの登録型を許可候補とする。
	return {
		disabled: new Set(JSON.parse(fs.readFileSync(path.join(repo, 'build/gdweb.build'), 'utf8')).disabled_classes),
		allowedNodes: new Set(allowedMatch ? [...allowedMatch[1].matchAll(/type == ([A-Za-z0-9_]+)::get_class_static/g)].map((match) => match[1]) : registered),
		allowedResources: new Set(['RectangleShape2D']),
		classdb: new Map(classdb.map((item) => [item.name, item])),
		navigationDisabled: /disable_navigation_2d=yes/.test(buildRuntime),
	};
}

module.exports = { enrich, extraNames, readFacts, sourceRows };
