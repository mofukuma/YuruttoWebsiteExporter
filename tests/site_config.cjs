// Scene情報JSONの自動生成が、書く人の値を壊さずに不足だけ埋めることを検査する。
// 空projectからの生成、容量順の並び、既存値の保護をGodot headlessで一度に確かめる。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // project root。
const work = path.join(repo, 'tmp/site-config'); // 検査用projectの置き場。
const godot = process.env.GODOT_BIN || '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 固定Godot。

// addonとmain sceneだけを持つ最小projectを作る。
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(work, 'addons'), { recursive: true });
fs.cpSync(path.join(repo, 'addons/yurutto_website_exporter'), path.join(work, 'addons/yurutto_website_exporter'), { recursive: true });
fs.writeFileSync(path.join(work, 'project.godot'), '[application]\nconfig/name="Site Config Test"\nrun/main_scene="res://main.tscn"\n');
fs.writeFileSync(path.join(work, 'main.tscn'), '[gd_scene format=3]\n\n[node name="Main" type="Node"]\n');
fs.writeFileSync(path.join(work, 'export_presets.cfg'), '[preset.0]\n\nname="Web"\nplatform="Yurutto Website"\n\n[preset.0.options]\n\nyweb/site/config="res://web/pages.json"\n');

const output = child.execFileSync(godot, ['--headless', '--path', work, '--script', path.join(repo, 'tests/site_config_scene.gd')], { encoding: 'utf8', timeout: 20000 });
const result = JSON.parse(output.trim().split('\n').filter((line) => line.startsWith('{')).pop());

assert.equal(result.version, 1, 'versionが1でない');
assert.deepEqual(result.first_keys, ['Main'], 'main sceneのkeyがfile名由来でない');
assert.equal(result.first_uri, '/', 'main sceneがsite rootでない');
assert.deepEqual([...result.minimal].sort(), ['scene', 'uri'], '既定値で足りる項目まで書いている');
assert.deepEqual(result.order, ['Main', 'Big', 'NewsList', 'Small'], `main scene優先とfile容量順が崩れた: ${result.order}`);
assert.deepEqual(result.uris, ['/', '/big/', '/news-list/', '/small/'], `URIの割り当てが崩れた: ${result.uris}`);
assert.deepEqual(result.custom_keys, ['Main', 'Big', 'NewsList', 'Small'], `preset指定pathへ生成されない: ${result.custom_keys}`);
assert.equal(result.kept_title, '手書きの題名', '手で書いた値が消えた');
assert.equal(result.stable, true, '再実行でkeyが変わった');

const written = JSON.parse(fs.readFileSync(path.join(work, 'yweb-site.json'), 'utf8'));
console.log(JSON.stringify({ ok: true, version: written.version, scenes: Object.keys(written.scenes), order: result.order, kept: true }));
