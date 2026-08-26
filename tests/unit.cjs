// 単体検査をまとめて走らせ、分かれ道をすべて通れているかも確かめる。
// 通っていない分かれ道が残ると、そこが壊れても気づけないので、割合で足切りする。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const files = ['tests/png_unit.cjs']; // 単体検査の一覧。
const covered = ['png.cjs']; // 分かれ道を全部通したい対象。
const need = 100; // 求める到達の割合(%)。

// 単体検査を、通った割合の報告つきで走らせる。
const run = child.spawnSync(process.execPath,
	['--test', '--experimental-test-coverage', ...files],
	{ cwd: repo, encoding: 'utf8', timeout: 180000 });
process.stdout.write(run.stdout.split('\n').filter((line) => line.startsWith('✖')).join('\n'));
assert.equal(run.status, 0, `単体検査が失敗した:\n${run.stdout.slice(-2000)}`);

// 報告の表から、対象moduleの行と割合を読む。
const report = {};
for (const line of run.stdout.split('\n')) {
	const found = /^ℹ\s+(\S+\.cjs)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/.exec(line);
	if (found) report[found[1]] = { line: Number(found[2]), branch: Number(found[3]), func: Number(found[4]) };
}

// 対象それぞれが、行と分かれ道と関数のすべてで足切りを超えることを確かめる。
for (const name of covered) {
	const found = report[name];
	assert.ok(found, `${name}の到達報告がない`);
	for (const kind of ['line', 'branch', 'func']) {
		assert.ok(found[kind] >= need, `${name}の${kind}到達が足りない: ${found[kind]}% (必要${need}%)`);
	}
}

const tests = /^ℹ pass (\d+)/m.exec(run.stdout);
console.log(JSON.stringify({ ok: true, passed: Number(tests?.[1] || 0), coverage: report, need: `${need}%` }));
