// ゆるっとWebが公式Webテンプレートなしで完結する構造を検査する。
// 登録点、内蔵runtime、preset境界、公開成果物を短い一括testへまとめる。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..'); // yweb project root。
const addon = path.join(root, 'addons/yurutto_website_exporter'); // 配布単位のaddon。
const runtime = JSON.parse(fs.readFileSync(path.join(addon, 'templates/runtime.json'))); // 対応版とruntime由来。
const template = path.join(addon, 'templates', runtime.template.file); // manifestが指す内蔵runtime。
const work = path.join(root, 'tmp/yweb-exporter'); // 検査専用directory。
const site = path.join(work, 'site'); // 実書き出し確認先。
const project = path.join(work, 'project'); // addonを導入するproject copy。
const fixture = path.join(root, 'tests/fixtures/site_runtime'); // 最小projectの正本。
const godot = '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 固定Godot 4.7.1。
const expectedHash = runtime.template.sha256; // buildとplatformが共有する識別値。

const plugin = fs.readFileSync(path.join(addon, 'plugin.gd'), 'utf8');
const platform = fs.readFileSync(path.join(addon, 'platform.gd'), 'utf8');
assert.match(plugin, /add_export_platform\(platform\)/, '独立platform登録なし');
assert.match(platform, /extends EditorExportPlatformExtension/, '拡張platformではない');
assert.equal(platform.includes('EditorExportPlatformWeb'), false, '標準Web実装へ依存');
assert.equal(platform.includes('find_export_template'), false, '公式template探索へ依存');
assert.match(platform, /templates\/runtime\.json/, 'runtime manifest参照なし');
assert.equal(platform.includes('Godot 4.7.1専用'), false, '対応版をcodeへ固定');
assert.equal(platform.includes('OS.execute'), false, '外部processへ依存');
assert.equal(platform.includes('yweb/tools/node'), false, 'Node.js設定が残存');
assert.equal(fs.readdirSync(addon).some((name) => name.endsWith('.cjs')), false, '実行時CJSが残存');
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(template)).digest('hex'), expectedHash, '内蔵runtime hash不一致');

const entries = child.execFileSync('unzip', ['-Z1', template], { encoding: 'utf8' }).trim().split('\n');
for (const name of ['godot.html', 'godot.js', 'godot.wasm', 'godot.audio.worklet.js', 'godot.audio.position.worklet.js', 'GODOT_LICENSE.txt']) {
	assert.ok(entries.includes(name), `runtime entryなし: ${name}`);
}
for (const name of ['godot.js.br', 'godot.wasm.br', 'godot.audio.worklet.js.br', 'godot.audio.position.worklet.js.br']) {
	assert.ok(entries.includes(name), `内蔵Brotliなし: ${name}`);
	const buffer = { maxBuffer: 32 * 1024 * 1024 };
	const encoded = child.execFileSync('unzip', ['-p', template, name], buffer);
	const raw = child.execFileSync('unzip', ['-p', template, name.slice(0, -3)], buffer);
	assert.deepEqual(zlib.brotliDecompressSync(encoded), raw, `内蔵Brotli内容不一致: ${name}`);
}
fs.rmSync(work, { recursive: true, force: true });
fs.cpSync(fixture, project, { recursive: true });
fs.cpSync(addon, path.join(project, 'addons/yurutto_website_exporter'), { recursive: true });
fs.appendFileSync(path.join(project, 'project.godot'), '\n[editor_plugins]\n\nenabled=PackedStringArray("res://addons/yurutto_website_exporter/plugin.cfg")\n');
const emptyPath = path.join(work, 'empty-path');
fs.mkdirSync(emptyPath, { recursive: true });
fs.mkdirSync(site, { recursive: true });
child.execFileSync(godot, ['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], {
	stdio: 'pipe', env: { ...process.env, PATH: emptyPath },
});
for (const name of ['index.html', 'index.js', 'index.wasm', 'index.pck', 'index.js.br', 'index.wasm.br', 'index.audio.worklet.js.br', 'index.audio.position.worklet.js.br', 'GODOT_LICENSE.txt']) {
	assert.ok(fs.existsSync(path.join(site, name)), `公開成果物なし: ${name}`);
}
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'yweb-compression.json')));
assert.equal(manifest.entries.length, 4, '固定runtimeのBrotli対応数不一致');
for (const entry of manifest.entries) assert.ok(entry.brotliBytes < entry.originalBytes, `圧縮率不正: ${entry.file}`);
const notice = ['GODOT-MIT.txt', 'GODOT-COPYRIGHT.txt'].map((file) => fs.readFileSync(path.join(root, 'LICENSES', file), 'utf8').replace(/\n*$/, '\n')).join('\n');
assert.equal(child.execFileSync('unzip', ['-p', template, 'GODOT_LICENSE.txt'], { encoding: 'utf8' }), notice, 'runtime license不一致');
assert.equal(fs.readFileSync(path.join(site, 'GODOT_LICENSE.txt'), 'utf8'), notice, '公開license不一致');
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
assert.match(html, /"canvasResizePolicy":2/, 'Browser全域表示なし');
assert.match(html, /"gdextensionLibs":\[\]/, 'GDExtension無効境界なし');
assert.equal(html.includes('$GODOT_'), false, 'HTML placeholder残留');
const result = { ok: true, platform: 'ゆるっとWebサイト', godot: runtime.godot.version, profile: runtime.profile, nodeRequired: false, templateBytes: fs.statSync(template).size, entries: entries.length, compressed: manifest.entries.length, licenses: 1 };
fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
