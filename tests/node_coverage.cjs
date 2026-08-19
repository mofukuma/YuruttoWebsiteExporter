// Godotの全nodeを数え、文字をHTMLで出せる割合を報告する。
// 一覧をClassDBから作るので、Godotの版が上がって種類が増えても数え漏らさない。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const work = path.join(repo, 'tmp/node-coverage'); // 数えるための短命project。
const godot = process.env.GODOT_BIN || '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 固定Godot。
const script = 'node_coverage.gd'; // ClassDBを読む入口。
const need = 65; // 文字を持つControlのうち、対応していてほしい割合(%)。

// 数えるためだけの、空に近いprojectを用意する。
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.writeFileSync(path.join(work, 'project.godot'), '[application]\nconfig/name="Node Coverage"\n');
fs.copyFileSync(path.join(repo, 'tests', script), path.join(work, script));

const run = child.execFileSync(godot, ['--headless', '--path', work, '--script', script], { encoding: 'utf8', timeout: 180000 });
const found = /\{[\s\S]*\}/.exec(run);
assert.ok(found, `一覧を読めない: ${run.slice(-400)}`);
const data = JSON.parse(found[0]);

// 仕分けから漏れたControlがあれば、表が古くなった合図として止める。
assert.deepEqual(data.control.unknown, [], `仕分けていないControlがある: ${data.control.unknown.join(', ')}`);

const textControls = data.control.text_dom.length + data.control.pending.length; // 文字を持つControl。
const rate = (data.control.text_dom.length / textControls) * 100;
assert.ok(rate >= need, `文字を出せるControlの割合が下がった: ${rate.toFixed(1)}% (必要${need}%)`);

console.log(JSON.stringify({
	ok: true,
	nodes: { control: data.groups.control.length, node2d: data.groups.node2d.length, node3d: data.groups.node3d.length, other: data.groups.other.length },
	control: { textDom: data.control.text_dom.length, canvas: data.control.canvas.length, pending: data.control.pending.length },
	textControlRate: `${rate.toFixed(1)}%`,
	pending: data.control.pending,
}));
