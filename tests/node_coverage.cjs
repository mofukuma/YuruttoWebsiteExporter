// Godotの全Node棚卸しがClassDBと一致し、分類と検査指標に漏れがないことを確かめる。
// 描画対応、描画命令、fixtureを別々に測り、非描画Nodeによる率の水増しを防ぐ。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { collect, inspect, markdown } = require('./node_inventory.cjs');

const repo = path.resolve(__dirname, '..'); // 棚卸し対象のproject root。
const list = path.join(repo, 'ログ/全ノード棚卸し一覧.md'); // 人が確認する棚卸し表。
const data = collect(); // 実行中GodotのClassDB一覧。
const report = inspect(data); // 分類と独立指標の検査結果。

// 全Nodeが一度ずつ分類され、固定版の件数と一致することを必須にする。
assert.equal(report.metrics.inventory.total, 240, `全Node数が変わった: ${report.metrics.inventory.total}`);
assert.equal(report.metrics.inventory.done, report.metrics.inventory.total, `未分類Nodeがある: ${report.unknown.join(', ')}`);
assert.equal(report.metrics.inventory.rate, 100, '棚卸し率が100%でない');
assert.equal(report.metrics.instantiation.rate, 100, '利用対象Nodeの生成率が100%でない');
assert.deepEqual(report.duplicates, [], `分類が重複している: ${report.duplicates.join(', ')}`);
assert.deepEqual(data.constructed, report.nodes.filter((node) => node.category !== 'unavailable').map((node) => node.name), '利用対象で生成できないNodeがある');

// 描画達成率は丸め前で98%以上を求め、生成成功や非描画Nodeで水増しさせない。
for (const name of ['drawing', 'drawCommands', 'fixture']) {
	const value = report.metrics[name];
	assert.ok(value.rate >= 98, `${name}が98%未満: ${value.done}/${value.total} (${value.display})`);
}

// ClassDBか分類を変えたとき、人向け一覧も同じ内容へ更新させる。
assert.ok(fs.existsSync(list), '全ノード棚卸し一覧.mdがない');
assert.equal(fs.readFileSync(list, 'utf8'), markdown(report), '棚卸し一覧が古い: node tests/node_inventory.cjs --write を実行して更新して');

console.log(JSON.stringify({
	ok: true,
	nodes: report.counts.groups,
	categories: report.counts.categories,
	metrics: report.metrics,
}));
