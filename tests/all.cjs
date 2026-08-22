// tests配下の検査を一度にまとめて走らせる。
// 検査どうしは作業先もportも分けてあるため同時に走らせられる。重いものから先に始めて、
// 空いた枠へ軽いものを詰めると、全体の終わりが一番早くなる設計。
// 途中で止めず、全結果を出してから失敗をまとめて知らせる。

'use strict';

const child = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const here = __dirname; // 検査fileの置き場。
const helpers = new Set(['all.cjs', 'browser.cjs', 'godot.cjs', 'site.cjs', 'diff_image.cjs', 'png.cjs', 'nginx.cjs']); // 単体で走らない補助。
// 実測の所要秒。長いものから先に始めるための目安で、正確さは要らない。
const cost = {
	'omochi_game.cjs': 25, 'dom_only_match.cjs': 17, 'text_lab.cjs': 15, 'pixel_parity.cjs': 14,
	'webfont.cjs': 12, 'aa_invaders.cjs': 9, 'rotate_label.cjs': 9, 'site_export.cjs': 8,
	'scene_3d.cjs': 6, 'form_controls.cjs': 6, 'native_route.cjs': 6, 'first_export.cjs': 5, 'site_runtime.cjs': 5,
	'bbcode.cjs': 10,
	'project_boundary.cjs': 3, 'text_lab_compare.cjs': 3, 'yweb_exporter.cjs': 2, 'text_config.cjs': 2,
};
// GodotとChromiumはどちらも重い。さらにGodotは書き出し中に共有のeditor dataを触るため、
// 同時に走らせすぎると書き出し自体が失敗する。実測で安定する数へ抑える。
const lanes = Number(process.env.YWEB_LANES) || Math.max(1, Math.min(3, Math.floor(os.availableParallelism() / 4)));
// 描画の速さや残機を見る検査は、他と同時に走らせるとCPUを取り合って結果が変わる。
// 数える対象が「時間あたりに何が起きたか」なので、一つずつ最後に走らせる。
const alone = new Set(['text_lab.cjs', 'text_lab_compare.cjs', 'aa_invaders.cjs']);

// 補助を除いた検査fileを、重い順に並べて返す。
function targets() {
	const all = fs.readdirSync(here).filter((name) => name.endsWith('.cjs') && !helpers.has(name))
		.sort((left, right) => (cost[right] || 1) - (cost[left] || 1) || left.localeCompare(right));
	return { shared: all.filter((name) => !alone.has(name)), solo: all.filter((name) => alone.has(name)) };
}

// 一つの検査を走らせ、結果と出力をまとめて返す。
// 同時に走るので出力は混ぜず、終わってから名前つきで出す。
function run(name) {
	const started = Date.now();
	return new Promise((resolve) => {
		child.execFile(process.execPath, [path.join(here, name)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
			(error, stdout, stderr) => resolve({ name, ok: !error, seconds: ((Date.now() - started) / 1000).toFixed(1), stdout, stderr }));
	});
}

// 枠の数まで同時に走らせ、空いた枠へ次を入れる。
async function main() {
	const { shared, solo } = targets();
	const total = shared.length + solo.length;
	const failed = [];
	const started = Date.now();
	const report = (result) => {
		process.stdout.write(result.stdout);
		if (!result.ok) {
			failed.push(result.name);
			process.stderr.write(result.stderr);
		}
		console.log(`${result.ok ? 'OK  ' : 'FAIL'} ${result.name} (${result.seconds}s)`);
	};
	const queue = [...shared];
	const worker = async () => {
		while (queue.length) report(await run(queue.shift()));
	};
	await Promise.all(Array.from({ length: Math.min(lanes, queue.length) }, worker));
	// speed比べは他が終わってから、一つずつ走らせる。
	for (const name of solo) report(await run(name));
	const seconds = ((Date.now() - started) / 1000).toFixed(1);
	console.log(JSON.stringify({ ok: failed.length === 0, total, lanes, seconds, failed: failed.sort() }));
	process.exitCode = failed.length === 0 ? 0 : 1;
}

main();
