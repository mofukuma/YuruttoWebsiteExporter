// 固定runtimeの3DとGDExtension拒否境界を2D作品とfixtureで確認する。
// 同じcheckerへ成功例と失敗例を渡し、書き出し前の終了値を固定する。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..'); // 検査対象を含むproject root。
const checker = path.join(root, 'addons/gdweb_site/check_project.cjs'); // 配布addonの3D境界検査。
const cases = path.join(root, 'tmp/minimum-3d-cases'); // 動的生成とbinary用の短命fixture。
const godot = '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // binary fixture生成用Godot。

// projectを検査し、終了値と説明を返す。
function check(project) {
	return spawnSync(process.execPath, [checker, project, godot], { encoding: 'utf8' });
}

const allowed = check(path.join(root, 'examples/daito_projects'));
const blocked = check(path.join(root, 'tests/fixtures/minimum_3d'));
fs.mkdirSync(path.join(cases, 'dynamic'), { recursive: true });
for (const name of ['allowed', 'scene_3d', 'resource_3d', 'curve_3d', 'extension']) {
	fs.mkdirSync(path.join(cases, name), { recursive: true });
	fs.writeFileSync(path.join(cases, name, 'project.godot'), '[application]\nconfig/name="Minimum Binary Test"\n');
}
fs.writeFileSync(path.join(cases, 'dynamic/main.gd'), 'extends Node\nfunc _ready():\n\tvar body = Node3D.new()\n');
fs.writeFileSync(path.join(cases, 'extension/addon.gdextension'), '[configuration]\nentry_symbol="test"\n[libraries]\nweb.wasm32="res://test.wasm"\n');
const generated = spawnSync(godot, ['--headless', '--path', path.join(cases, 'allowed'), '--script', path.join(root, 'tests/make_minimum_binary.gd'), '--', cases], { encoding: 'utf8' });
assert.equal(generated.status, 0, generated.stderr);
const dynamic = check(path.join(cases, 'dynamic'));
const allowedBinary = check(path.join(cases, 'allowed'));
const binaryScene = check(path.join(cases, 'scene_3d'));
const binaryResource = check(path.join(cases, 'resource_3d'));
const binaryCurve = check(path.join(cases, 'curve_3d'));
const extension = check(path.join(cases, 'extension'));
assert.equal(allowed.status, 0, allowed.stderr);
assert.equal(blocked.status, 1, `3D sceneを許可: ${blocked.stderr}`);
assert.match(blocked.stderr, /main\.tscn: 3D型/);
assert.equal(dynamic.status, 1, `動的3D生成を許可: ${dynamic.stderr}`);
assert.match(dynamic.stderr, /main\.gd: 動的3D型/);
assert.equal(allowedBinary.status, 0, `2D binaryを拒否: ${allowedBinary.stderr}`);
assert.equal(binaryScene.status, 1, `binary 3D sceneを許可: ${binaryScene.stderr}`);
assert.match(binaryScene.stderr, /scene\.scn: binary 3D型/);
assert.equal(binaryResource.status, 1, `binary 3D resourceを許可: ${binaryResource.stderr}`);
assert.match(binaryResource.stderr, /mesh\.res: binary 3D型/);
assert.equal(binaryCurve.status, 1, `Curve3D resourceを許可: ${binaryCurve.stderr}`);
assert.match(binaryCurve.stderr, /curve\.res: binary 3D型/);
assert.equal(extension.status, 1, `GDExtensionを許可: ${extension.stderr}`);
assert.match(extension.stderr, /addon\.gdextension: GDExtension非対応/);
console.log(JSON.stringify({ ok: true, allowed: 3, rejected: 6 }));
