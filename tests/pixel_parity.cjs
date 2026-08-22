// Godotがそのまま描いた絵と、Webへ書き出した絵を、同じ条件で撮って重ねる。
// 画素ごとの食い違いの平均(MAE)で、見た目がどれだけ揃っているかを検査ごとに一つの数にする。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { createServer } = require('../build/serve_web.cjs');
const { install } = require('../build/fetch_webfont.cjs');
const { decode, meanAbsoluteError, rootMeanSquareError } = require('./png.cjs');
const { browserPath } = require('./browser.cjs');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const { runGodot } = require('./godot.cjs'); // 異常終了を吸収するGodot起動。
const width = 640; // 両方で揃える画面の横。
const height = 480; // 両方で揃える画面の縦。
const frame = 12; // 撮影する描画frame。動きが落ち着くまで待つ。
const limit = Number(process.env.YWEB_MAE_LIMIT || 0.7); // 一画面ごとに許す食い違いの上限(%)。
const overall = Number(process.env.YWEB_MAE_HARMONIC || 0.05); // 全画面をまとめた調和平均の上限(%)。
const capture = 'pixel_capture.gd'; // project内へ置くGodot側の撮影入口。
// 何を確かめる画面かと、起動を待つ目印。
const SCENES = [
	{ name: 'text', fixture: 'pixel_parity', work: 'pixel-parity', port: 49191, ready: { text: 'PIXEL PARITY' } },
	{ name: 'shapes3d', fixture: 'parity_3d', work: 'parity-3d', port: 49192, ready: { pixels: true } },
	{ name: 'mixed3d', fixture: 'parity_mixed', work: 'parity-mixed', port: 49193, ready: { text: 'MIXED SCENE' } },
	{ name: 'nodes', fixture: 'parity_nodes', work: 'parity-nodes', port: 49194, ready: { text: 'LABEL text' } },
	{ name: 'rotate', fixture: 'rotate_label', work: 'rotate-label', port: 49195, ready: { text: 'Y' } },
];
// 書体の取り込みかた。hintingを切り位置を細かく取ると、Browserの字形へ近づく。
const IMPORT = [
	'[remap]', '', 'importer="font_data_dynamic"', 'type="FontFile"', '',
	'[params]', '',
	'antialiasing=1', 'generate_mipmaps=false', 'disable_embedded_bitmaps=true',
	'multichannel_signed_distance_field=false', 'msdf_pixel_range=8', 'msdf_size=48',
	'allow_system_fallback=true', 'force_autohinter=false', 'modulate_color_glyphs=false',
	'hinting=0', 'subpixel_positioning=3', 'keep_rounding_remainders=true', 'Fallbacks/fallbacks=[]', '',
].join('\n');

// 見本と書き出しを、同じ書体と同じ大きさで用意する。
function build(scene) {
	const work = path.join(repo, 'tmp', scene.work);
	const project = path.join(work, 'project');
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures', scene.fixture), project, { recursive: true });
	fs.cpSync(path.join(repo, 'addons/yurutto_website_exporter'), path.join(project, 'addons/yurutto_website_exporter'), { recursive: true });
	fs.copyFileSync(path.join(repo, 'tests', capture), path.join(project, capture));
	// GodotのTTFとBrowserのWOFF2を同じ書体で揃える。ここが揃わないと字形が別物になる。
	const font = install(path.join(project, 'fonts'));
	// 字の描きかたをBrowser側へ寄せる。格子への寄せを切り、位置を細かく取る。
	fs.writeFileSync(`${font.ttf}.import`, IMPORT);
	runGodot(['--headless', '--path', project, '--import'], { stdio: 'pipe', timeout: 600000 });
	return { work, project, site: path.join(work, 'site') };
}

// Godotの画面をそのままPNGへ写し取る。
function reference(place) {
	const out = path.join(place.work, 'godot.png');
	runGodot(['--path', place.project, '--resolution', `${width}x${height}`, '--position', '10000,10000',
		'--script', capture, '--', '--scene=res://main.tscn', `--output=${out}`, `--frame=${frame}`], { stdio: 'pipe', timeout: 600000 });
	return decode(fs.readFileSync(out));
}

// 書き出したsiteをBrowserで開き、同じ大きさでPNGへ写し取る。
async function exported(scene, place) {
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), place.project, path.join(place.site, 'index.html')], { stdio: 'pipe', timeout: 600000 });
	const server = createServer(place.site);
	await new Promise((done) => server.listen(scene.port, '127.0.0.1', done));
	// 画面の倍率と拡大を1へ固定し、Godotと同じ画素数で撮る。
	const browser = await chromium.launch({ executablePath: browserPath, headless: true,
		args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-device-scale-factor=1', '--hide-scrollbars'] });
	try {
		const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${scene.port}/`, { waitUntil: 'domcontentloaded' });
		// 文字のある画面は文字の出現で、3Dだけの画面は絵が塗られたことで起動を判断する。
		if (scene.ready.text) await page.getByText(scene.ready.text, { exact: true }).waitFor({ timeout: 90000 });
		else await page.waitForFunction(() => {
			const canvas = document.querySelector('canvas');
			if (!canvas) return false;
			const probe = document.createElement('canvas');
			probe.width = canvas.width; probe.height = canvas.height;
			probe.getContext('2d').drawImage(canvas, 0, 0);
			const middle = probe.getContext('2d').getImageData(canvas.width >> 1, (canvas.height * 3) >> 2, 1, 1).data;
			return middle[0] + middle[1] + middle[2] > 30;
		}, { timeout: 90000 });
		await page.evaluate(() => document.fonts.ready); // 書体が届く前に撮らない。
		// 絵が変わらなくなるまで待つ。実時間で置くと、機械の速さで撮る瞬間がずれる。
		await page.waitForFunction(() => {
			const canvas = document.querySelector('canvas');
			const probe = document.createElement('canvas');
			probe.width = canvas.width; probe.height = canvas.height;
			probe.getContext('2d').drawImage(canvas, 0, 0);
			const now = probe.toDataURL();
			globalThis.ywebStill = now === globalThis.ywebSeen ? (globalThis.ywebStill || 0) + 1 : 0;
			globalThis.ywebSeen = now;
			return globalThis.ywebStill >= 3;
		}, undefined, { timeout: 90000, polling: 'raf' });
		const shot = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
		fs.writeFileSync(path.join(place.work, 'web.png'), shot);
		assert.deepEqual(errors, [], `${scene.name}でBrowser errorが出た: ${errors.join(' / ')}`);
		return decode(shot);
	} finally {
		await browser.close();
		server.close();
	}
}

// 一つの画面について、二枚を重ねて食い違いを測る。
async function compare(scene) {
	const place = build(scene);
	const left = reference(place);
	const right = await exported(scene, place);
	assert.equal(left.width, width, `${scene.name}の見本の横が違う: ${left.width}`);
	assert.equal(right.width, width, `${scene.name}の書き出しの横が違う: ${right.width}`);
	// 合否は平均で決め、RMSEは狭い範囲の大崩れを見つけるための記録として並べて出す。
	return { mae: meanAbsoluteError(left, right) * 100, rmse: rootMeanSquareError(left, right) * 100 };
}

// 全部の画面を順に測り、一枚ごとと全体のまとまりの両方で確かめる。
async function main() {
	const results = {};
	const values = [];
	for (const scene of SCENES) {
		const { mae, rmse } = await compare(scene);
		results[scene.name] = { mae: `${mae.toFixed(4)}%`, rmse: `${rmse.toFixed(4)}%` };
		values.push(mae);
		assert.ok(mae < limit, `${scene.name}の見た目の食い違いが大きい: 平均${mae.toFixed(4)}% RMSE${rmse.toFixed(4)}% (上限${limit}%)`);
	}
	// 調和平均は悪い一枚に引きずられにくく、良い画面の効きを素直に映す。
	const harmonic = values.length / values.reduce((sum, value) => sum + 1 / value, 0);
	assert.ok(harmonic < overall, `全画面をまとめた食い違いが大きい: ${harmonic.toFixed(4)}% (上限${overall}%)`);
	console.log(JSON.stringify({ ok: true, limit: `${limit}%`, harmonic: harmonic.toFixed(4), harmonicLimit: `${overall}%`, size: `${width}x${height}`, scenes: results }));
}

main();
