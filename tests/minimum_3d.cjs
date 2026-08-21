// 固定テンプレートの3DとGDExtension拒否境界を2D作品とfixtureで確認する。
// 同じcheckerへ成功例と失敗例を渡し、書き出し前の終了値を固定する。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..'); // 検査対象を含むproject root。
const checker = path.join(root, 'addons/yurutto_website_exporter/project_check.gd'); // 配布addonの3D境界検査。
const runner = path.join(root, 'tests/project_check_runner.gd'); // Godot内で検査する入口。
const cases = path.join(root, 'tmp/minimum-3d-cases'); // 動的生成とbinary用の短命fixture。
const { godot } = require('./godot.cjs'); // 対応版のGodot。

// projectを検査し、終了値と説明を返す。言語を渡すと拒否理由の言語も固定する。
function check(project, locale = 'en') {
	return spawnSync(godot, ['--headless', '--language', locale, '--path', project, '--script', runner, '--', checker, project], { encoding: 'utf8' });
}

const allowed = check(path.join(root, 'examples/text_lab'));
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
assert.match(blocked.stderr, /main\.tscn: 3D type/);
assert.equal(dynamic.status, 1, `動的3D生成を許可: ${dynamic.stderr}`);
assert.match(dynamic.stderr, /main\.gd: 3D type created at runtime/);
assert.equal(allowedBinary.status, 0, `2D binaryを拒否: ${allowedBinary.stderr}`);
assert.equal(binaryScene.status, 1, `binary 3D sceneを許可: ${binaryScene.stderr}`);
assert.match(binaryScene.stderr, /scene\.scn: 3D type in a binary resource/);
assert.equal(binaryResource.status, 1, `binary 3D resourceを許可: ${binaryResource.stderr}`);
assert.match(binaryResource.stderr, /mesh\.res: 3D type in a binary resource/);
assert.equal(binaryCurve.status, 1, `Curve3D resourceを許可: ${binaryCurve.stderr}`);
assert.match(binaryCurve.stderr, /curve\.res: 3D type in a binary resource/);
assert.equal(extension.status, 1, `GDExtensionを許可: ${extension.stderr}`);
assert.match(extension.stderr, /addon\.gdextension: GDExtension is not supported/);
// 同じ拒否を日本語Editorでも読めることを確認する。
const blockedJa = check(path.join(root, 'tests/fixtures/minimum_3d'), 'ja');
assert.equal(blockedJa.status, 1, `3D sceneを許可: ${blockedJa.stderr}`);
assert.match(blockedJa.stderr, /main\.tscn: 3D型/);
console.log(JSON.stringify({ ok: true, allowed: 3, rejected: 6 }));
