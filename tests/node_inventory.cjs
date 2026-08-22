// 画面へ描く全nodeの棚卸しを作り、DOM onlyの達成率を出す。
// 一覧はClassDBから作るので、Godotが増えれば数も増える。書き足し忘れは数へ現れる。
// 棚卸し表もここから書き出し、コードと文書が食い違わないようにする。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runGodot } = require('./godot.cjs'); // 異常終了を吸収するGodot起動。

const repo = path.resolve(__dirname, '..'); // project root。
const work = path.join(repo, 'tmp/node-inventory'); // 走らせる場所。
const doc = path.join(repo, 'ログ/全nodeの棚卸し.md'); // 書き出す棚卸し表。
const need = 90; // DOM onlyで到達していたい達成率(%)。下がったら気づけるようにする。

// 一覧を作るscriptを、addon入りの短命projectで走らせる。
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
fs.writeFileSync(path.join(work, 'project.godot'), '[application]\nconfig/name="Node Inventory"\n');
fs.copyFileSync(path.join(repo, 'tests/node_inventory.gd'), path.join(work, 'inventory.gd'));
const output = runGodot(['--headless', '--path', work, '--script', 'res://inventory.gd'], { encoding: 'utf8', timeout: 300000 });
const line = output.split('\n').find((text) => text.trimStart().startsWith('{'));
assert.ok(line, `一覧を読めない: ${output.slice(-400)}`);
const data = JSON.parse(line);
const buckets = data.buckets;

// 仕分けから漏れたnodeがあれば、棚卸しが追いついていない。
assert.deepEqual(buckets.unknown, [], `仕分けていないnodeがある: ${buckets.unknown.join(' ')}`);

// DOM onlyの母数はCanvasItem系。3Dはdisable_3dで組むため入っていない。
const covered = data.dom_only.covered;
const pending = data.dom_only.pending;
const rate = (covered / (covered + pending)) * 100;
assert.ok(rate >= need, `DOM onlyの達成率が下がった: ${rate.toFixed(1)}% (必要${need}%)`);

// 3D levelのみが持つnodeを、表から外して読みやすくする。
const twoD = (name) => !/3D$/.test(name) && !['GridMap', 'Decal'].includes(name);
const groups = [
	['text_dom', '文字をDOMへ出す'],
	['box_dom', '面と枠をDOMの箱へ出す'],
	['image_dom', '絵をDOMのimgへ出す'],
	['draw_dom', '描画命令や形をDOMへ写す'],
	['layout_only', '位置を決めるのが役目で自分は描かない'],
];

// 棚卸し表を書き出す。数は毎回ClassDBから取り直す。
const lines = ['# 全nodeの棚卸し', '',
	'画面へ何かを描くGodotのnodeを、DOM onlyでの扱いごとに並べる。',
	'一覧は`tests/node_inventory.gd`がClassDBから作り、`tests/node_inventory.cjs`が確かめる。', '',
	'## DOM onlyの達成率', '',
	'DOM onlyは`disable_3d=yes`で組むため、3Dのnodeはそもそも入っていない。',
	'母数はCanvasItemの系統のうち、書き出した作品へ実際に出るものとする。', '',
	'| 区分 | 数 |', '| --- | --- |',
	`| 対応済 | ${covered} |`, `| 未対応 | ${pending} |`,
	`| **達成率** | **${rate.toFixed(1)}%** |`, '', '## 対応済の内訳', ''];
for (const [key, title] of groups) {
	const list = buckets[key].filter(twoD);
	if (list.length === 0) continue;
	lines.push(`### ${title} (${list.length})`, '', list.map((name) => `\`${name}\``).join(' '), '');
}
lines.push('## 未対応と、その理由', '', '| node | なぜ出せていないか |', '| --- | --- |');
for (const name of buckets.pending.filter(twoD)) lines.push(`| \`${name}\` | ${data.pending_reasons[name] || ''} |`);
lines.push('', '## 作品には出ないもの', '',
	'当たり判定、骨、音、XRの装置など。Editorでは見えるが、書き出したページには出ない。',
	`数は${buckets.editor_only.length}種。達成率の母数には入れない。`, '',
	'## 3Dのnode', '', '3D levelのみが持つ。DOM onlyには入らない。', '',
	'| 区分 | 数 | node |', '| --- | --- | --- |',
	`| 形 | ${buckets.mesh_3d.length} | ${buckets.mesh_3d.map((name) => `\`${name}\``).join(' ')} |`,
	`| 光と環境 | ${buckets.env_3d.length} | ${buckets.env_3d.map((name) => `\`${name}\``).join(' ')} |`, '');
fs.writeFileSync(doc, `${lines.join('\n')}\n`);

const total = Object.values(buckets).reduce((sum, list) => sum + list.length, 0);
console.log(JSON.stringify({ ok: true, total, domOnly: { covered, pending, rate: `${rate.toFixed(1)}%` }, pending: buckets.pending.filter(twoD) }));
