// DOM onlyの見た目とGodot画面の一致度を画素で測る。
// 同じsceneをGodotとBrowserで同じ寸法へ描き、8bit RGBのRMSEで差を数値にする。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { browserPath } = require('./browser.cjs');
const { createServer } = require('../build/serve_web.cjs');
const { install } = require('../build/fetch_webfont.cjs');

const repo = path.resolve(__dirname, '..'); // project root。
const work = path.join(repo, 'tmp/dom-only-match'); // 比較用projectと画像。
const project = path.join(work, 'project'); // 書き出す検査project。
const site = path.join(work, 'site'); // DOM only成果物。
const { godot } = require('./godot.cjs'); // 対応版のGodot。
const size = { width: 800, height: 600 }; // 両者で揃える画面寸法。
const limit = 1; // 各画面へ許す8bit RGBのRMSE上限。
const screens = ['main', 'widgets', 'motion', 'physics', 'omochi', 'draw_all', 'plane_3d']; // 比べる画面。sceneとURIが対応する。
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
		var steps: int = SETTLE.get(name, 6)
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
fs.cpSync(path.join(repo, 'tests/fixtures/dom_only'), project, { recursive: true });
child.execFileSync(process.execPath, [path.join(repo, 'build/install_site_addon.cjs'), project], { stdio: 'pipe' });
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

// Browser側で画面ごとに撮り、Godotとの差を個別にまとめる。
(async () => {
	const server = createServer(site);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	const measured = {};
	try {
		for (const [index, name] of screens.entries()) {
			const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
			const uri = index === 0 ? '/' : `/${name}/`;
			await page.goto(`http://127.0.0.1:${server.address().port}/#${uri}`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction(() => document.querySelectorAll('[data-yweb-box]').length > 0, { timeout: 20000 });
			await page.evaluate(() => document.fonts.ready);
			await page.waitForTimeout(settle[name] ? 2500 : 400);
			if (name === 'draw_all') {
				const dom = await page.evaluate(() => ({
					polygons: document.querySelectorAll('[data-yweb-polygon]').length,
					regions: document.querySelectorAll('[data-yweb-image-region]').length,
					transient: [...document.querySelectorAll('[data-yweb-box]')].filter((element) => getComputedStyle(element).backgroundColor === 'rgb(255, 0, 255)').length,
				}));
				assert.ok(dom.polygons >= 2, '描画命令とPolygon2DをDOMへ置けていない');
				assert.ok(dom.regions >= 1, '画像領域をDOMへ置けていない');
				assert.equal(dom.transient, 0, '解放済みCanvasItemの描画がDOMへ残っている');
				await page.waitForTimeout(250);
				assert.equal(await page.locator('[data-yweb-polygon]').count(), dom.polygons, 'Polygon2DのDOM要素がframeごとに増えている');
			}
			if (name === 'plane_3d') {
				const planes = await page.evaluate(() => [...document.querySelectorAll('[data-yweb-plane3d]')].map((element) => element.style.transform));
				assert.equal(planes.length, 2, '3D平面を2件DOMへ置けていない');
				assert.ok(planes.every((value) => value.startsWith('matrix3d(')), '3D平面へmatrix3dを設定できていない');
			}
			const shot = path.join(work, `browser-${name}.png`);
			await page.screenshot({ path: shot });
			await page.close();

			// Godot側はalphaを持つため、両方を不透明にしてから測る。透明画素が差から外れると値が実態より小さく出る。
			const flat = (source, target) => {
				child.execFileSync('magick', [source, '-background', 'black', '-alpha', 'remove', '-alpha', 'off', target]);
				return target;
			};
			const reference = flat(path.join(work, `godot-${name}.png`), path.join(work, `flat-godot-${name}.png`));
			const compared = flat(shot, path.join(work, `flat-browser-${name}.png`));

			// 画素差をRMSEで測る。compareは差があると終了値1を返すため出力を読む。
			const measure = child.spawnSync('magick', ['compare', '-metric', 'RMSE', reference, compared, path.join(work, `diff-${name}.png`)], { encoding: 'utf8' });
			const matched = /\(([0-9.eE+-]+)\)/.exec(measure.stderr || '');
			assert.ok(matched, `RMSEを測れない: ${name} ${measure.stderr}`);
			measured[name] = Number((Number(matched[1]) * 255).toFixed(4));
		}
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}

	// 画面ごとに上限を当てる。平均では、良い画面が悪い画面を隠してしまう。
	const over = Object.entries(measured).filter(([, value]) => value > limit);
	fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ unit: 'RGB 0..255', measured, limit }, null, 2)}\n`);
	console.log(JSON.stringify({ ok: over.length === 0, unit: 'RGB 0..255', measured, limit }));
	assert.deepEqual(over, [], `Godot画面との差が大きい: ${over.map(([name, value]) => `${name} ${value}`).join(', ')}`);
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
