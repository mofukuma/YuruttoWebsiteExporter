// DOM onlyの見た目が、Godotの画面とどれだけ一致するかを画素で測る。
// 同じsceneをGodotとBrowserで同じ寸法へ描き、平均(MAE)と二乗平均(RMSE)で差を数値にする。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { browserPath } = require('./browser.cjs');
const { createServer } = require('../build/serve_web.cjs');
const { install } = require('../build/fetch_webfont.cjs');
const { decode, meanAbsoluteError, rootMeanSquareError } = require('./png.cjs'); // 絵の食い違いを数で表す道具。

const repo = path.resolve(__dirname, '..'); // project root。
const work = path.join(repo, 'tmp/dom-only-match'); // 比較用projectと画像。
const project = path.join(work, 'project'); // 書き出す検査project。
const site = path.join(work, 'site'); // DOM only成果物。
const { godot } = require('./godot.cjs'); // 対応版のGodot。
const size = { width: 800, height: 600 }; // 両者で揃える画面寸法。
const limit = 0.0015; // node構成の画面へ許す正規化MAEの上限。
const limits = { omochi: 0.05 }; // 描画命令だけで作る画面は再現が届いていないため、現状値を上限として記録する。
const screens = ['main', 'widgets', 'motion', 'physics', 'omochi']; // 比べる画面。sceneとURIが対応する。
const settle = { physics: 320, omochi: 950 }; // 物理を速く回した画面で、形が決まるまで進めるframe数。

// 全画面をGodot側で順に撮る一度きりのscript。
const capture = `@tool
extends SceneTree

const SCREENS := ${JSON.stringify(screens)} # 撮る画面の名前。
const SETTLE := ${JSON.stringify(settle)} # 撮る前に進めるframe数。

# 画面ごとに2 frame進めてから撮り、名前を付けて保存する。
func _init() -> void:
	for name in SCREENS:
		# 前の画面が止めた状態を持ち越さない。
		paused = false
		var screen: Node = load("res://%s.tscn" % name).instantiate()
		root.add_child(screen)
		# 物理で形が決まる画面は物理frameを待つ。process frameでは物理時計が進まない。
		var steps: int = SETTLE.get(name, 2)
		var wait_physics: bool = SETTLE.has(name)
		for _index in range(steps):
			if wait_physics:
				await physics_frame
			else:
				await process_frame
		var image := root.get_texture().get_image()
		image.save_png("res://../godot-%s.png" % name)
		screen.queue_free()
		await process_frame
	quit()
`;

// 検査projectを組み立てる。
fs.rmSync(work, { recursive: true, force: true });
fs.mkdirSync(path.join(project, 'addons'), { recursive: true });
fs.cpSync(path.join(repo, 'addons/yurutto_website_exporter'), path.join(project, 'addons/yurutto_website_exporter'), { recursive: true });
fs.cpSync(path.join(repo, 'tests/fixtures/dom_only'), project, { recursive: true });
fs.appendFileSync(path.join(project, 'project.godot'), '\n[editor_plugins]\n\nenabled=PackedStringArray("res://addons/yurutto_website_exporter/plugin.cfg")\n');
fs.writeFileSync(path.join(project, 'export_presets.cfg'), '[preset.0]\n\nname="Web"\nplatform="Yurutto Website"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\nexport_path=""\n\n[preset.0.options]\n\nyweb/level=0\n');
fs.writeFileSync(path.join(project, 'capture.gd'), capture);
fs.writeFileSync(path.join(project, 'yweb-site.json'), `${JSON.stringify({ version: 1, scenes: Object.fromEntries(screens.map((name, index) => [name, { scene: `res://${name}.tscn`, uri: index === 0 ? '/' : `/${name}/` }])) }, null, 2)}\n`);
install(path.join(project, 'fonts'), 'Match'); // Godotとブラウザで同じ字形を使う。

// 画像を含むため、取り込みを終えてから撮る。未取り込みのtextureは寸法0で描かれない。
child.execFileSync(godot, ['--headless', '--path', project, '--import'], { stdio: 'pipe', timeout: 120000 });

// Godot側の基準画面を撮る。画面外へ出した窓で描き、結果だけを取り出す。
child.execFileSync(godot, ['--path', project, '--script', 'res://capture.gd', '--resolution', `${size.width}x${size.height}`, '--position', '10000,10000'], { stdio: 'pipe', timeout: 60000 });
for (const name of screens) {
	assert.ok(fs.existsSync(path.join(work, `godot-${name}.png`)), `Godot画面を撮れていない: ${name}`);
}

// 同じsceneをDOM onlyで書き出す。
fs.mkdirSync(site, { recursive: true });
child.execFileSync(godot, ['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], { stdio: 'pipe', timeout: 300000 });

// 透明を黒へ重ねて不透明にする。撮り手ごとのalphaの扱いの違いを、測る前に消す。
function flatten(image) {
	const pixels = Buffer.from(image.pixels);
	for (let index = 0; index < image.width * image.height; index += 1) {
		const at = index * 4;
		const alpha = pixels[at + 3] / 255;
		for (let channel = 0; channel < 3; channel += 1) pixels[at + channel] = Math.round(pixels[at + channel] * alpha);
		pixels[at + 3] = 255;
	}
	return { width: image.width, height: image.height, pixels };
}

// 描画が落ち着くまで待つ。物理で動く画面は、要素の位置が変わらなくなった時が形の決まった時。
// 実時間で待つと、機械の速さで撮る瞬間がずれ、Godotと違う状態を比べてしまう。
async function settleDom(page, name) {
	const quiet = settle[name] ? 3 : 1; // 動く画面は、変化なしがこの回数続くまで見る。
	// 前の画面の記録を持ち越すと、変わっていないと誤って判断する。
	await page.evaluate(() => { globalThis.ywebSeen = undefined; globalThis.ywebStill = 0; });
	await page.waitForFunction((need) => {
		const now = [...document.querySelectorAll('[data-yweb-transform]')].map((node) => node.dataset.ywebTransform).join('|');
		globalThis.ywebStill = now === globalThis.ywebSeen ? (globalThis.ywebStill || 0) + 1 : 0;
		globalThis.ywebSeen = now;
		return globalThis.ywebStill >= need;
	}, quiet, { timeout: 20000, polling: 'raf' });
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

// Browser側で画面ごとに撮り、Godotとの差を調和平均でまとめる。
(async () => {
	const server = createServer(site);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	const measured = {};
	try {
		// 起動は一度で済ませ、画面はURLの移動で回る。作品と同じ道筋を通り、起動の待ちも減る。
		const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
		await page.goto(`http://127.0.0.1:${server.address().port}/#/`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => document.querySelectorAll('[data-yweb-box]').length > 0, { timeout: 20000 });
		await page.evaluate(() => document.fonts.ready);
		for (const [index, name] of screens.entries()) {
			if (index > 0) {
				// URLを変えるとruntimeがGodotへ伝え、Godotがsceneを入れ替える。
				// 入れ替わりは、前の画面の文字が消えて次の画面の要素が出そろった時に終わる。
				const before = await page.evaluate(() => document.body.innerText);
				await page.evaluate((uri) => { location.hash = uri; }, `#/${name}/`);
				await page.waitForFunction((was) => document.body.innerText !== was
					&& document.querySelectorAll('[data-yweb-box]').length > 0, before, { timeout: 20000, polling: 'raf' });
			}
			await settleDom(page, name);
			const shot = path.join(work, `browser-${name}.png`);
			await page.screenshot({ path: shot });

			// Godot側はalphaを持つため、両方を黒へ重ねてから測る。透明画素が差から外れると値が実態より小さく出る。
			const reference = flatten(decode(fs.readFileSync(path.join(work, `godot-${name}.png`))));
			const compared = flatten(decode(fs.readFileSync(shot)));
			measured[name] = { mae: meanAbsoluteError(reference, compared), rmse: rootMeanSquareError(reference, compared) };
		}
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}

	// 画面ごとに上限を当てる。平均では、良い画面が悪い画面を隠してしまう。
	const over = Object.entries(measured).filter(([name, value]) => value.mae >= (limits[name] ?? limit));
	fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ measured, limit, limits }, null, 2)}\n`);
	console.log(JSON.stringify({ ok: over.length === 0, measured, limit, limits }));
	assert.deepEqual(over, [], `Godot画面との差が大きい: ${over.map(([name, value]) => `${name} 平均${value.mae} RMSE${value.rmse}`).join(', ')}`);
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
