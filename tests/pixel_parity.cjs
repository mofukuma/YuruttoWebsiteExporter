// Godotがそのまま描いた絵と、Webへ書き出した絵を、同じ条件で撮って重ねる。
// 画素ごとの食い違いの平均(MAE)で、見た目がどれだけ揃っているかを一つの数にする。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { createServer } = require('../build/serve_web.cjs');
const { install } = require('../build/fetch_webfont.cjs');
const { decode, meanAbsoluteError } = require('./png.cjs');
const { browserPath } = require('./browser.cjs');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const work = path.join(repo, 'tmp/pixel-parity'); // 検査用projectと成果物。
const project = path.join(work, 'project'); // 書き出すGodot project。
const site = path.join(work, 'site'); // 書き出したWeb成果物。
const godot = process.env.GODOT_BIN || '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 固定Godot。
const port = 49191; // 固定検査port。
const width = 640; // 両方で揃える画面の横。
const height = 480; // 両方で揃える画面の縦。
const frame = 12; // 撮影する描画frame。動きが落ち着くまで待つ。
const limit = 0.8; // 許す食い違いの上限(%)。
const capture = 'pixel_capture.gd'; // project内へ置くGodot側の撮影入口。
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
function build() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/pixel_parity'), project, { recursive: true });
	fs.cpSync(path.join(repo, 'addons/yurutto_website_exporter'), path.join(project, 'addons/yurutto_website_exporter'), { recursive: true });
	fs.copyFileSync(path.join(repo, 'tests', capture), path.join(project, capture));
	// GodotのTTFとBrowserのWOFF2を同じ書体で揃える。ここが揃わないと字形が別物になる。
	const font = install(path.join(project, 'fonts'));
	// 字の描きかたをBrowser側へ寄せる。格子への寄せを切り、位置を細かく取る。
	fs.writeFileSync(`${font.ttf}.import`, IMPORT);
	child.execFileSync(godot, ['--headless', '--path', project, '--import'], { stdio: 'pipe', timeout: 180000 });
}

// Godotの画面をそのままPNGへ写し取る。
function reference() {
	const out = path.join(work, 'godot.png');
	child.execFileSync(godot, ['--path', project, '--resolution', `${width}x${height}`, '--position', '10000,10000',
		'--script', capture, '--', `--scene=res://main.tscn`, `--output=${out}`, `--frame=${frame}`], { stdio: 'pipe', timeout: 180000 });
	return decode(fs.readFileSync(out));
}

// 書き出したsiteをBrowserで開き、同じ大きさでPNGへ写し取る。
async function exported() {
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], { stdio: 'pipe', timeout: 400000 });
	const server = createServer(site);
	await new Promise((done) => server.listen(port, '127.0.0.1', done));
	// 画面の倍率と拡大を1へ固定し、Godotと同じ画素数で撮る。
	const browser = await chromium.launch({ executablePath: browserPath, headless: true,
		args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-device-scale-factor=1', '--hide-scrollbars'] });
	try {
		const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
		await page.getByText('PIXEL PARITY', { exact: true }).waitFor({ timeout: 60000 });
		await page.evaluate(() => document.fonts.ready); // 書体が届く前に撮らない。
		await page.waitForTimeout(1500); // 最初の描画が落ち着くまで置く。
		const shot = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
		fs.writeFileSync(path.join(work, 'web.png'), shot);
		assert.deepEqual(errors, [], `Browser errorが出た: ${errors.join(' / ')}`);
		return decode(shot);
	} finally {
		await browser.close();
		server.close();
	}
}

// 二枚を重ね、食い違いが上限より小さいことを確かめる。
async function main() {
	build();
	const left = reference();
	const right = await exported();
	assert.equal(left.width, width, `見本の横が違う: ${left.width}`);
	assert.equal(right.width, width, `書き出しの横が違う: ${right.width}`);
	const mae = meanAbsoluteError(left, right) * 100;
	assert.ok(mae < limit, `見た目の食い違いが大きい: ${mae.toFixed(4)}% (上限${limit}%)`);
	console.log(JSON.stringify({ ok: true, mae: `${mae.toFixed(4)}%`, limit: `${limit}%`, size: `${width}x${height}` }));
}

main();
