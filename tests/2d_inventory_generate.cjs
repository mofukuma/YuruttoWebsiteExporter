// N18の2D型manifestをGodot登録sourceから生成する。
// 設計思想：生成物はfixtureと検査で共有し、人手による型追加漏れを防ぐ。

const fs = require('node:fs');
const path = require('node:path');
const { enrich, readFacts, sourceRows } = require('./2d_inventory_lib.cjs');

const repo = path.resolve(__dirname, '..'); // project正本。
const project = path.join(repo, 'tmp/gdweb/normal-matrix/n18_2d_features/project'); // N18正常fixture。
const output = path.join(project, 'feature_manifest.json'); // 実行時も読む型表。
const classdbFile = path.join(repo, 'tmp/gdweb/normal-matrix/n18_2d_features/classdb-properties.json'); // native ClassDB証跡。
const proofFile = path.join(repo, 'tmp/gdweb/normal-matrix/n18_2d_features/runtime-result.json'); // Browser正常試験の証跡。
const register = fs.readFileSync(path.join(repo, 'tmp/godot-source/scene/register_scene_types.cpp'), 'utf8');
const moduleRegister = fs.readFileSync(path.join(repo, 'tmp/godot-source/modules/theora/register_types.cpp'), 'utf8');
const types = enrich(sourceRows(register, moduleRegister), readFacts(repo, classdbFile));
const proof = fs.existsSync(proofFile) ? JSON.parse(fs.readFileSync(proofFile, 'utf8')) : { groups: {} };
for (const type of types) if (proof.ok && proof.groups[type.normal_tested_by]) type.test_status = 'proven';
const manifest = {
	source: 'tmp/godot-source/scene/register_scene_types.cpp',
	build: 'build/build_runtime.sh + build/gdweb.build',
	types,
	modulate_cases: [
		{ name: 'alpha_zero', parent: 'ffffffff', self: 'ffffff00' },
		{ name: 'alpha_tiny', parent: 'ffffffff', self: 'ffffff01' },
		{ name: 'alpha_half', parent: 'ffffffff', self: 'ffffff80' },
		{ name: 'opaque', parent: 'ffffffff', self: 'ffffffff' },
		{ name: 'rgb', parent: 'ffffffff', self: '40a0e0ff' },
		{ name: 'parent_child', parent: '80c04080', self: 'c080ff80' },
	],
	godot_canvas_commands: [
		'TYPE_RECT', 'TYPE_NINEPATCH', 'TYPE_POLYGON', 'TYPE_PRIMITIVE', 'TYPE_MESH',
		'TYPE_MULTIMESH', 'TYPE_PARTICLES', 'TYPE_TRANSFORM', 'TYPE_CLIP_IGNORE', 'TYPE_ANIMATION_SLICE',
	],
	canvas_commands: [
		{ name: 'clip', operations: [0], godot: ['TYPE_CLIP_IGNORE', 'item_clip'], normal_tested_by: 'n18_clip' },
		{ name: 'rect', operations: [1], godot: ['TYPE_RECT'], normal_tested_by: 'n18_rect' },
		{ name: 'primitive', operations: [2], godot: ['TYPE_PRIMITIVE'], normal_tested_by: 'n18_primitive' },
		{ name: 'polygon', operations: [7], godot: ['TYPE_POLYGON'], normal_tested_by: 'n18_polygon' },
		{ name: 'texture', operations: [4], godot: ['TYPE_RECT'], normal_tested_by: 'n18_texture' },
		{ name: 'transform', operations: [], godot: ['TYPE_TRANSFORM'], normal_tested_by: 'n18_transform' },
		{ name: 'nine_patch', operations: [6], godot: ['TYPE_NINEPATCH'], normal_tested_by: 'n18_nine_patch' },
	],
	non_adopted_browser_operations: [{ operation: 3, reason: 'Mesh/MultiMesh構造的非採用' }],
};

fs.mkdirSync(project, { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, types: types.length }));
