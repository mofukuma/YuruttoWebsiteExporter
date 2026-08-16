// OGP Autoと同じ独立processで指定frameを1200x630 PNGへ保存する。
// 正方形Sceneの円を測り、中央切り抜き後も縦横比が変わらないことを固定する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const work = path.join(repo, 'tmp/ogp-auto'); // 撮影専用projectと成果物。
const project = path.join(work, 'project'); // 独立実行するGodot project。
const godot = '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 固定Godot 4.7.1。

// Scene実行、frame番号、PNG寸法を一括検査する。
fs.rmSync(work, { recursive: true, force: true });
fs.cpSync(path.join(repo, 'tests/fixtures/ogp_aspect'), project, { recursive: true });
child.execFileSync('node', [path.join(repo, 'build/install_site_addon.cjs'), project], { stdio: 'ignore' });
const output = child.execFileSync(godot, [
	'--path', project, '--resolution', '600x600', '--position', '10000,10000',
	'--script', path.join(project, 'addons/yurutto_website_exporter/ogp_capture.gd'), '--',
	'--scene=res://main.tscn', '--output=res://web/ogp.png', '--frame=7',
], { encoding: 'utf8', timeout: 5000 });
const image = fs.readFileSync(path.join(project, 'web/ogp.png'));
assert.equal(image.subarray(1, 4).toString(), 'PNG');
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);
assert.match(output, /"frame":7/);
assert.match(output, /"source_width":600/);
assert.match(output, /"source_height":600/);
const bounds = child.execFileSync('magick', [path.join(project, 'web/ogp.png'), '-fuzz', '5%', '-trim', '-format', '%w %h', 'info:'], { encoding: 'utf8' }).trim().split(' ').map(Number);
assert.ok(bounds[0] > 300);
assert.ok(Math.abs(bounds[0] - bounds[1]) <= 2, `正円が変形: ${bounds.join('x')}`);
fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ frame: 7, source: '600x600', output: '1200x630', contentBounds: bounds.join('x') }, null, 2)}\n`);
