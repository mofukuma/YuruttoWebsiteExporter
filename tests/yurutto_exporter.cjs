// ゆるっとWebが公式Webテンプレートなしで完結する構造を検査する。
// 登録点、内蔵runtime、preset境界、公開成果物を短い一括testへまとめる。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const addon = path.join(root, 'addons/gdweb_site'); // 配布単位のaddon。
const template = path.join(addon, 'templates/yurutto_web_4.7.1.zip'); // 内蔵runtime。
const work = path.join(root, 'tmp/yurutto-exporter'); // 検査専用directory。
const site = path.join(work, 'site'); // 実書き出し確認先。
const project = path.join(work, 'project'); // addonを導入するproject copy。
const fixture = path.join(root, 'tests/fixtures/site_runtime'); // 最小projectの正本。
const expectedHash = fs.readFileSync(`${template.replace(/\.zip$/, '')}.sha256`, 'utf8').trim(); // buildとplatformが共有する識別値。

const plugin = fs.readFileSync(path.join(addon, 'plugin.gd'), 'utf8');
const platform = fs.readFileSync(path.join(addon, 'platform.gd'), 'utf8');
assert.match(plugin, /add_export_platform\(platform\)/, '独立platform登録なし');
assert.match(platform, /extends EditorExportPlatformExtension/, '拡張platformではない');
assert.equal(platform.includes('EditorExportPlatformWeb'), false, '標準Web実装へ依存');
assert.equal(platform.includes('find_export_template'), false, '公式template探索へ依存');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(template)).digest('hex'), expectedHash, '内蔵runtime hash不一致');

const entries = child.execFileSync('unzip', ['-Z1', template], { encoding: 'utf8' }).trim().split('\n');
for (const name of ['godot.html', 'godot.js', 'godot.wasm', 'godot.audio.worklet.js', 'godot.audio.position.worklet.js', 'GODOT_LICENSE.txt', 'GODOT_COPYRIGHT.txt']) {
	assert.ok(entries.includes(name), `runtime entryなし: ${name}`);
}
fs.rmSync(work, { recursive: true, force: true });
fs.cpSync(fixture, project, { recursive: true });
child.execFileSync('sh', [path.join(root, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], { stdio: 'pipe' });
for (const name of ['index.html', 'index.js', 'index.wasm', 'index.pck', 'index.js.br', 'index.wasm.br', 'GODOT_LICENSE.txt', 'GODOT_COPYRIGHT.txt']) {
	assert.ok(fs.existsSync(path.join(site, name)), `公開成果物なし: ${name}`);
}
for (const [name, source] of [['GODOT_LICENSE.txt', 'GODOT-MIT.txt'], ['GODOT_COPYRIGHT.txt', 'GODOT-COPYRIGHT.txt']]) {
	const expected = fs.readFileSync(path.join(root, 'LICENSES', source));
	assert.deepEqual(child.execFileSync('unzip', ['-p', template, name]), expected, `runtime license不一致: ${name}`);
	assert.deepEqual(fs.readFileSync(path.join(site, name)), expected, `公開license不一致: ${name}`);
}
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
assert.match(html, /"canvasResizePolicy":2/, 'Browser全域表示なし');
assert.match(html, /"gdextensionLibs":\[\]/, 'GDExtension無効境界なし');
assert.equal(html.includes('$GODOT_'), false, 'HTML placeholder残留');
console.log(JSON.stringify({ ok: true, platform: 'ゆるっとWeb', templateBytes: fs.statSync(template).size, entries: entries.length, licenses: 2 }));
