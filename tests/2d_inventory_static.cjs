// N18 manifestをGodot登録、ClassDB、限定build、Exporter、Canvas実装と照合する。
// 設計思想：母集団の完全性と現在の未実装を分離し、未実証を合格へ数えない。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { enrich, readFacts, sourceRows } = require('./2d_inventory_lib.cjs');

const repo = path.resolve(__dirname, '..'); // project正本。
const source = path.join(repo, 'tmp/godot-source'); // Godot同期source。
const project = path.join(repo, 'tmp/gdweb/normal-matrix/n18_2d_features/project'); // N18正常fixture。
const manifestFile = path.join(project, 'feature_manifest.json'); // sourceから生成した母集団。
const classdbFile = path.join(repo, 'tmp/gdweb/normal-matrix/n18_2d_features/classdb-properties.json'); // native ClassDB証跡。
const proofFile = path.join(repo, 'tmp/gdweb/normal-matrix/n18_2d_features/runtime-result.json'); // Browser正常試験の証跡。
const resultFile = path.resolve(process.argv[2] || path.join(repo, 'tmp/gdweb/normal-matrix/n18_2d_features/inventory-static-result.json')); // 静的証跡。

const register = fs.readFileSync(path.join(source, 'scene/register_scene_types.cpp'), 'utf8');
const moduleRegister = fs.readFileSync(path.join(source, 'modules/theora/register_types.cpp'), 'utf8');
const canvas = fs.readFileSync(path.join(source, 'platform/web/js/libs/library_gdweb_canvas2d.js'), 'utf8');
const canvasHeader = fs.readFileSync(path.join(source, 'servers/rendering/renderer_canvas_render.h'), 'utf8');
const facts = readFacts(repo, classdbFile);
const expected = enrich(sourceRows(register, moduleRegister), facts);
const proof = fs.existsSync(proofFile) ? JSON.parse(fs.readFileSync(proofFile, 'utf8')) : { groups: {} };
for (const type of expected) if (proof.ok && proof.groups[type.normal_tested_by]) type.test_status = 'proven';
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const classdb = JSON.parse(fs.readFileSync(classdbFile, 'utf8'));

const names = (rows) => rows.map((row) => row.name);
const expectedNames = names(expected);
const actualNames = names(manifest.types);
const missing = {
	manifest: expectedNames.filter((name) => !actualNames.includes(name)),
	extra: actualNames.filter((name) => !expectedNames.includes(name)),
	classdb: expectedNames.filter((name) => !classdb.classes.some((item) => item.name === name && item.exists)),
	kind: manifest.types.filter((item) => item.kind === 'classdb-pending' || item.kind !== facts.classdb.get(item.name)?.kind).map((item) => item.name),
	metadata: manifest.types.filter((item) => !item.implementation || !item.owner || !item.capacity || !item.cpu_fallback || (item.capacity.startsWith('adopted-') && !item.normal_tested_by)).map((item) => item.name),
	tested: manifest.types.filter((item) => item.capacity.startsWith('adopted-') && item.test_status !== 'proven').map((item) => item.name),
	canvas: manifest.canvas_commands.flatMap((item) => item.operations).filter((operation) => !new RegExp(`operation === ${operation}(?:\\D|$)`).test(canvas)),
};
const pendingBuild = missing.classdb.length === 1 && missing.classdb[0] === 'VideoStreamTheora' && /module_theora_enabled=yes/.test(fs.readFileSync(path.join(repo, 'build/build_runtime.sh'), 'utf8'));
const commandEnum = canvasHeader.match(/struct Command \{\s*enum Type \{([\s\S]*?)\};/);
assert.ok(commandEnum, 'Godot Canvas command enumを読めない');
const godotCommands = [...commandEnum[1].matchAll(/TYPE_[A-Z_]+/g)].map((item) => item[0]);
const mismatched = manifest.types.filter((item, index) => JSON.stringify(item) !== JSON.stringify(expected[index]));
const counts = {
	total: manifest.types.length,
	direct2d: manifest.types.filter((item) => item.scope === '2d-register').length,
	meshResources: manifest.types.filter((item) => item.scope === 'mesh-resource').length,
	extras: manifest.types.filter((item) => item.scope === '2d-extra').length,
	moduleResources: manifest.types.filter((item) => item.scope === '2d-module-resource').length,
	nodes: manifest.types.filter((item) => item.kind === 'node').length,
	resources: manifest.types.filter((item) => item.kind === 'resource').length,
	refcounted: manifest.types.filter((item) => item.kind === 'refcounted').length,
	adopted: manifest.types.filter((item) => item.capacity.startsWith('adopted-')).length,
	implemented: manifest.types.filter((item) => item.capacity === 'adopted-implemented').length,
	owned: manifest.types.filter((item) => item.capacity === 'adopted-owned').length,
	unimplemented: manifest.types.filter((item) => item.capacity === 'adopted-unimplemented').length,
	structuralExcluded: manifest.types.filter((item) => item.capacity === 'structural-excluded').length,
	deprecatedExcluded: manifest.types.filter((item) => item.capacity === 'deprecated-excluded').length,
	properties: classdb.classes.reduce((sum, item) => sum + item.properties.length, 0),
	propertyEquivalence: Object.keys(classdb.property_equivalence).length,
};
const inventoryOk = actualNames.length === new Set(actualNames).size
	&& expectedNames.length === actualNames.length
	&& missing.manifest.length === 0
	&& missing.extra.length === 0
	&& (missing.classdb.length === 0 || pendingBuild)
	&& (missing.kind.length === 0 || pendingBuild)
	&& missing.metadata.length === 0
	&& missing.canvas.length === 0
	&& manifest.canvas_commands.length === 7
	&& JSON.stringify(manifest.godot_canvas_commands) === JSON.stringify(godotCommands)
	&& manifest.modulate_cases.map((item) => item.name).join(',') === 'alpha_zero,alpha_tiny,alpha_half,opaque,rgb,parent_child'
	&& mismatched.length === 0;
const result = {
	inventoryOk,
	implementationReady: inventoryOk && counts.unimplemented === 0 && missing.tested.length === 0,
	classdbPendingBuild: pendingBuild,
	counts,
	missing,
	mismatched: mismatched.map((item) => item.name),
	buildEvidence: {
		physics: 'disable_physics_2d=no',
		navigation: facts.navigationDisabled ? 'disable_navigation_2d=yes' : 'disable_navigation_2d=no',
		deprecated: 'deprecated=no',
		gpu: 'opengl3=no vulkan=no',
		video: 'module_ogg/vorbis/theora_enabled=yes',
	},
};

assert.equal(manifest.types.length, 94, '指定母集団94型から増減あり');
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
if (!inventoryOk) process.exitCode = 1;
