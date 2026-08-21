// tests配下の検査を一度にまとめて走らせる。
// 重いものほど後ろへ回し、途中で止めずに全結果を出してから失敗をまとめて知らせる設計。

'use strict';

const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const here = __dirname; // 検査fileの置き場。
const helpers = new Set(['all.cjs', 'browser.cjs', 'godot.cjs', 'site.cjs']); // 単体で走らない補助。
const heavy = ['site_export.cjs', 'dom_only_match.cjs']; // Dockerや多画面比較を伴う重いもの。

// 補助を除いた検査fileを、軽い順に並べて返す。
function targets() {
	const all = fs.readdirSync(here).filter((name) => name.endsWith('.cjs') && !helpers.has(name)).sort();
	return [...all.filter((name) => !heavy.includes(name)), ...all.filter((name) => heavy.includes(name))];
}

const failed = [];
for (const name of targets()) {
	const started = Date.now();
	const result = child.spawnSync(process.execPath, [path.join(here, name)], { stdio: 'inherit' });
	const seconds = ((Date.now() - started) / 1000).toFixed(1);
	if (result.status === 0) {
		console.log(`OK   ${name} (${seconds}s)`);
	} else {
		failed.push(name);
		console.log(`FAIL ${name} (${seconds}s)`);
	}
}

console.log(JSON.stringify({ ok: failed.length === 0, total: targets().length, failed }));
process.exitCode = failed.length === 0 ? 0 : 1;
