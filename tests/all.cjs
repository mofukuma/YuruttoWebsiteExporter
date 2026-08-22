// tests配下の検査を一度にまとめて走らせる。
// 重いものほど後ろへ回し、途中で止めずに全結果を出してから失敗をまとめて知らせる設計。

'use strict';

const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const here = __dirname; // 検査fileの置き場。
const helpers = new Set([
	'all.cjs', 'browser.cjs', 'godot.cjs', 'site.cjs',
	'nginx.cjs', 'png.cjs', 'nginx_unit.cjs', 'png_unit.cjs',
	'template_output.cjs',
]); // 単体で走らない補助と、unit.cjsがまとめる検査。
const heavy = ['site_export.cjs', 'dom_only_match.cjs']; // Dockerや多画面比較を伴う重いもの。
const groups = {
	dom: ['build_selective.cjs', 'node_coverage.cjs', 'dom_only_match.cjs'],
	'2d': ['build_selective.cjs', 'rotate_label.cjs'],
	'3d': ['build_selective.cjs', 'scene_3d.cjs'],
}; // 書き出しlevelへ直接関係する検査。

// 補助を除いた検査fileを、軽い順に並べて返す。
function targets() {
	const group = process.argv[2];
	if (group) {
		if (!groups[group]) throw new Error(`検査levelが不正: ${group}`);
		return groups[group];
	}
	const all = fs.readdirSync(here).filter((name) => name.endsWith('.cjs') && !helpers.has(name)).sort();
	return [...all.filter((name) => !heavy.includes(name)), ...all.filter((name) => heavy.includes(name))];
}

const failed = [];
const list = targets(); // 今回走らせる検査一覧。
for (const name of list) {
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

console.log(JSON.stringify({ ok: failed.length === 0, total: list.length, failed }));
process.exitCode = failed.length === 0 ? 0 : 1;
