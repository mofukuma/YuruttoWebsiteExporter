// 書き出しlevelごとの受け入れ境界を、通す例と拒む例の両方で確認する。
// 境界は二段で決まる。project_check.gdが違反を数え、platform.gdがlevelで検査の要否を決める。
// 3Dは3D levelで通し、GDExtensionはどのlevelでも通さない状態を終了値で固定する。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { godot } = require('./godot.cjs'); // 対応版のGodot。

const root = path.resolve(__dirname, '..'); // 検査対象を含むproject root。
const addon = path.join(root, 'addons/yurutto_website_exporter'); // 配布addon。
const checker = path.join(addon, 'project_check.gd'); // 配布addonの受け入れ検査。
const runner = path.join(root, 'tests/project_check_runner.gd'); // Godot内で検査する入口。
const cases = path.join(root, 'tmp/project-boundary-cases'); // 動的生成とbinary用の短命fixture。

// projectを検査し、終了値と説明を返す。言語を渡すと拒否理由の言語も固定する。
function check(project, locale = 'en') {
	return spawnSync(godot, ['--headless', '--language', locale, '--path', project, '--script', runner, '--', checker, project], { encoding: 'utf8' });
}

// project.godotと渡されたfileから短命projectを用意する。
function makeCase(name, files = {}) {
	const dir = path.join(cases, name);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, 'project.godot'), '[application]\nconfig/name="Boundary Test"\n');
	for (const [file, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), body);
	return dir;
}

fs.rmSync(cases, { recursive: true, force: true });

// 文字fileで書かれた3DとGDExtensionを、checkerが違反として数えることを見る。
const flat = check(path.join(root, 'examples/text_lab'));
const scene3d = check(path.join(root, 'tests/fixtures/project_3d'));
assert.equal(flat.status, 0, `2D作品を拒否: ${flat.stderr}`);
assert.equal(scene3d.status, 1, `3D sceneを見逃し: ${scene3d.stderr}`);
assert.match(scene3d.stderr, /main\.tscn: 3D type/);

const dynamic = check(makeCase('dynamic', { 'main.gd': 'extends Node\nfunc _ready():\n\tvar body = Node3D.new()\n' }));
assert.equal(dynamic.status, 1, `動的3D生成を見逃し: ${dynamic.stderr}`);
assert.match(dynamic.stderr, /main\.gd: 3D type created at runtime/);

// binary resourceの中身も、拡張子ではなく実体の型で数えることを見る。
for (const name of ['allowed', 'scene_3d', 'resource_3d', 'curve_3d']) makeCase(name);
const generated = spawnSync(godot, ['--headless', '--path', path.join(cases, 'allowed'), '--script', path.join(root, 'tests/make_minimum_binary.gd'), '--', cases], { encoding: 'utf8' });
assert.equal(generated.status, 0, generated.stderr);
const allowedBinary = check(path.join(cases, 'allowed'));
const binaryScene = check(path.join(cases, 'scene_3d'));
const binaryResource = check(path.join(cases, 'resource_3d'));
const binaryCurve = check(path.join(cases, 'curve_3d'));
assert.equal(allowedBinary.status, 0, `2D binaryを拒否: ${allowedBinary.stderr}`);
assert.equal(binaryScene.status, 1, `binary 3D sceneを見逃し: ${binaryScene.stderr}`);
assert.match(binaryScene.stderr, /scene\.scn: 3D type in a binary resource/);
assert.equal(binaryResource.status, 1, `binary 3D resourceを見逃し: ${binaryResource.stderr}`);
assert.match(binaryResource.stderr, /mesh\.res: 3D type in a binary resource/);
assert.equal(binaryCurve.status, 1, `Curve3D resourceを見逃し: ${binaryCurve.stderr}`);
assert.match(binaryCurve.stderr, /curve\.res: 3D type in a binary resource/);

// GDExtensionはlevelに関わらず動かないので、常に拒むことを見る。
const extension = check(makeCase('extension', { 'addon.gdextension': '[configuration]\nentry_symbol="test"\n[libraries]\nweb.wasm32="res://test.wasm"\n' }));
assert.equal(extension.status, 1, `GDExtensionを許可: ${extension.stderr}`);
assert.match(extension.stderr, /addon\.gdextension: GDExtension is not supported/);

// 同じ拒否を日本語Editorでも読めることを見る。
const extensionJa = check(path.join(cases, 'extension'), 'ja');
assert.equal(extensionJa.status, 1, `GDExtensionを許可: ${extensionJa.stderr}`);
assert.match(extensionJa.stderr, /addon\.gdextension: GDExtension非対応/);
const scene3dJa = check(path.join(root, 'tests/fixtures/project_3d'), 'ja');
assert.equal(scene3dJa.status, 1, `3D sceneを見逃し: ${scene3dJa.stderr}`);
assert.match(scene3dJa.stderr, /main\.tscn: 3D型/);

// checkerが数えた違反を、どのlevelで書き出しへ効かせるかはplatform.gdが決める。
// 3Dは検査を飛ばし、domと2dは3Dを描けないため検査を通す形を固定する。
const platform = fs.readFileSync(path.join(addon, 'platform.gd'), 'utf8');
const gate = /if _level\(preset\) != "3d":\n\t\tblocked = ProjectCheck\.new\(\)\.inspect\(/;
assert.match(platform, gate, '3D以外で境界検査を通す形になっていない');
const levels = /const LEVELS := \["dom", "2d", "3d"\]/;
assert.match(platform, levels, 'levelの並びがmanifestのkeyと違う');

console.log(JSON.stringify({ ok: true, allowed: 2, rejected: 7 }));
