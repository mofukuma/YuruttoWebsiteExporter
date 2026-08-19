// 3D版テンプレートの受け入れ境界を、通す例と拒む例の両方で確認する。
// 3Dは通し、GDExtensionだけを拒む状態を書き出し前の終了値で固定する。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..'); // 検査対象を含むproject root。
const checker = path.join(root, 'addons/yurutto_website_exporter/project_check.gd'); // 配布addonの受け入れ検査。
const runner = path.join(root, 'tests/project_check_runner.gd'); // Godot内で検査する入口。
const cases = path.join(root, 'tmp/project-boundary-cases'); // 動的生成用の短命fixture。
const godot = '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // fixture生成用Godot。

// projectを検査し、終了値と説明を返す。言語を渡すと拒否理由の言語も固定する。
function check(project, locale = 'en') {
	return spawnSync(godot, ['--headless', '--language', locale, '--path', project, '--script', runner, '--', checker, project], { encoding: 'utf8' });
}

// 3Dを含むprojectも、2D作品と同じように通ることを確かめる。
const flat = check(path.join(root, 'examples/text_lab'));
const scene3d = check(path.join(root, 'tests/fixtures/project_3d'));
assert.equal(flat.status, 0, flat.stderr);
assert.equal(scene3d.status, 0, `3D sceneを拒否: ${scene3d.stderr}`);

// 実行時に3Dを作るscriptも通ることを確かめる。
fs.mkdirSync(path.join(cases, 'dynamic'), { recursive: true });
fs.writeFileSync(path.join(cases, 'dynamic/project.godot'), '[application]\nconfig/name="Boundary Test"\n');
fs.writeFileSync(path.join(cases, 'dynamic/main.gd'), 'extends Node\nfunc _ready():\n\tvar body = Node3D.new()\n');
const dynamic = check(path.join(cases, 'dynamic'));
assert.equal(dynamic.status, 0, `動的3D生成を拒否: ${dynamic.stderr}`);

// GDExtensionは3D版でも動かないので、今も拒むことを確かめる。
fs.mkdirSync(path.join(cases, 'extension'), { recursive: true });
fs.writeFileSync(path.join(cases, 'extension/project.godot'), '[application]\nconfig/name="Boundary Test"\n');
fs.writeFileSync(path.join(cases, 'extension/addon.gdextension'), '[configuration]\nentry_symbol="test"\n[libraries]\nweb.wasm32="res://test.wasm"\n');
const extension = check(path.join(cases, 'extension'));
assert.equal(extension.status, 1, `GDExtensionを許可: ${extension.stderr}`);
assert.match(extension.stderr, /addon\.gdextension: GDExtension is not supported/);

// 同じ拒否を日本語Editorでも読めることを確かめる。
const extensionJa = check(path.join(cases, 'extension'), 'ja');
assert.equal(extensionJa.status, 1, `GDExtensionを許可: ${extensionJa.stderr}`);
assert.match(extensionJa.stderr, /addon\.gdextension: GDExtension非対応/);
console.log(JSON.stringify({ ok: true, allowed: 3, rejected: 2 }));
