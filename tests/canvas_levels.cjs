#!/usr/bin/env node
// 3D版で2D・3Dの文字以外をCanvasへ残せることを実画面で確かめる。
// 同じfixtureをGodotとBrowserへ描き、Canvas表示、DOMの役割、画素差を一括で検査する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./browser.cjs');
const { createServer } = require('../build/serve_web.cjs');
const { install } = require('../build/fetch_webfont.cjs');
const { browserPath } = require('./browser.cjs');
const { exerciseUi } = require('./browser_ui.cjs');
const { godot } = require('./godot.cjs');

const repo = path.resolve(__dirname, '..'); // project root。
const source = path.join(repo, 'tests/fixtures/dom_only'); // 既存の描画fixture。
const work = path.join(repo, 'tmp/canvas-levels'); // 書き出しと比較画像。
const size = { width: 800, height: 600 }; // GodotとBrowserで揃える寸法。
const limit = 10; // 8bit RGBのRMSE。10は不合格にする。
const forbidden = '[data-yweb-box],[data-yweb-image],[data-yweb-image-region],[data-yweb-nine-patch],[data-yweb-polygon],[data-yweb-triangle3d],[data-yweb-plane3d],[data-yweb-gradient],[data-yweb-scroll]'; // Canvas版へ出してはいけない描画代替DOM。
const allCases = [
	{ level: '3d', option: 1, scene: 'nodes_2d_extended', text: 16 },
	{ level: '3d', option: 1, scene: 'canvas_inputs', text: 12 },
	{ level: '3d', option: 1, scene: 'mesh_3d', text: 0, assets: ['photo.png', 'white.svg'] },
]; // 3D構成が2D描画と入力も含むことを測る。
const selected = process.env.YWEB_LEVEL || '3d'; // 開発buildの対象level。
assert.equal(selected, '3d', `Canvas検査levelが不正: ${selected}`);
const cases = allCases; // 3D構成の2D・3D境界を一括検査する。

// Node型ごとの除外表を作らず、Canvas有無のbuild条件で描画経路を分けていることを確かめる。
const syncSource = fs.readFileSync(path.join(repo, 'build/overlay/platform/web/yweb_text_sync.cpp'), 'utf8');
const canvasSource = fs.readFileSync(path.join(repo, 'build/overlay/scene/main/canvas_item.cpp'), 'utf8');
const librarySource = fs.readFileSync(path.join(repo, 'build/overlay/platform/web/js/libs/library_yweb_text.js'), 'utf8');
assert.match(syncSource, /yweb_text_begin\(\);\n#ifndef GLES3_ENABLED\n\tif \(scene\) \{[\s\S]*?sync_boxes\(scene, order\);[\s\S]*?#endif/, '非文字DOM巡回がCanvas版にも入っている');
assert.match(syncSource, /#ifdef GLES3_ENABLED[\s\S]*?sync_label\(label\)[\s\S]*?sync_text_area\(edit\)[\s\S]*?#endif/, 'Canvas版の文字・入力DOM同期がない');
assert.match(canvasSource, /#define YWEB_DRAW\(m_call\) m_call\n#else\n#define YWEB_DRAW\(m_call\)/, 'Canvas版でDOM-only描画hookを無効にしていない');
const textBridge = librarySource.slice(librarySource.indexOf('yweb_text_sync__sig'), librarySource.indexOf('yweb_text_remove__sig'));
assert.ok(textBridge && !textBridge.includes('hideCanvas'), '文字DOM同期がCanvas全体を隠している');

// Godotの終了値と標準エラーを同時に検査する。
function runGodot(args, timeout, name) {
	const result = child.spawnSync(godot, args, { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
	const log = `${result.stdout || ''}\n${result.stderr || ''}`;
	assert.equal(result.status, 0, `${name}のGodot実行が失敗した: ${result.error || result.signal || ''}\n${log}`);
	assert.doesNotMatch(log, /ERROR:/, `${name}のresource読込または描画でErrorが出た`);
}

// 同じlevelのSceneを一つのprojectへ集め、重いGodot起動を三回へ抑える。
function prepareLevel(level, items) {
	const project = path.join(work, level, 'project');
	const site = path.join(work, level, 'site');
	fs.mkdirSync(project, { recursive: true });
	for (const item of items) {
		for (const suffix of ['gd', 'tscn']) fs.copyFileSync(path.join(source, `${item.scene}.${suffix}`), path.join(project, `${item.scene}.${suffix}`));
		for (const asset of item.assets || []) fs.copyFileSync(path.join(source, asset), path.join(project, asset));
	}
	let config = fs.readFileSync(path.join(source, 'project.godot'), 'utf8');
	config = config.replace('run/main_scene="res://main.tscn"', `run/main_scene="res://${items[0].scene}.tscn"`);
	const configFile = path.join(project, 'project.godot');
	fs.writeFileSync(configFile, config.replace(/^theme\/custom_font=.*\n/m, ''));
	install(path.join(project, 'fonts'), 'Match');
	// 初回走査を先に済ませ、未取込fontをproject themeが読む順序差をなくす。
	runGodot(['--headless', '--path', project, '--import'], 120000, `${level} import`);
	fs.writeFileSync(configFile, config);
	const dev = path.join(repo, `tmp/dev-template/${level}/yweb-${level}-template.zip`);
	const template = process.env.YWEB_LEVEL === level && process.env.YWEB_TEMPLATE ? process.env.YWEB_TEMPLATE : dev;
	const useDev = fs.existsSync(template); // 開発成果物がなければaddon内の配布templateを検査する。
	child.execFileSync(process.execPath, [path.join(repo, 'build/install_site_addon.cjs'), project], {
		env: useDev ? { ...process.env, YWEB_LEVEL: level, YWEB_TEMPLATE: template } : process.env, stdio: 'pipe',
	});
	fs.writeFileSync(path.join(project, 'export_presets.cfg'), `[preset.0]\nname="Web"\nplatform="Yurutto Website"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\n[preset.0.options]\nyweb/level=${items[0].option}\nyweb/site/enabled=true\nyweb/site/config="res://yweb-site.json"\nyweb/site/base_url="http://127.0.0.1"\nyweb/font/matching_webfont=true\nyweb/font/avoid_canvas_theme_font=true\nvram_texture_compression/for_desktop=true\n`);
	fs.writeFileSync(path.join(project, 'yweb-site.json'), `${JSON.stringify({ version: 1, scenes: Object.fromEntries(items.map((item, index) => [item.scene, { scene: `res://${item.scene}.tscn`, uri: index ? `/${item.scene}/` : '/' }])) }, null, 2)}\n`);
	const names = JSON.stringify(items.map(({ scene }) => scene));
	fs.writeFileSync(path.join(project, 'capture.gd'), `# Canvas版の全基準画面を一度の起動で撮る。\nextends SceneTree\nconst SCENES := ${names}\nfunc _init() -> void:\n\tfor name in SCENES:\n\t\tvar scene: Node = load("res://%s.tscn" % name).instantiate()\n\t\troot.add_child(scene)\n\t\tfor _index in 8:\n\t\t\tawait process_frame\n\t\troot.get_texture().get_image().save_png("res://../godot-%s.png" % name)\n\t\tscene.queue_free()\n\t\tawait process_frame\n\tquit()\n`);
	fs.mkdirSync(site, { recursive: true });
	runGodot(['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], 300000, level);
	runGodot(['--path', project, '--script', 'res://capture.gd', '--resolution', '800x600', '--position', '10000,10000'], 60000, level);
	return items.map((item, index) => ({ ...item, name: `${level}-${item.scene}`, project, site, uri: index ? `/${item.scene}/` : '/', reference: path.join(work, level, `godot-${item.scene}.png`) }));
}

// alphaを黒へ重ね、BrowserとGodotを同じRGB条件にする。
function flatten(sourceFile, target) {
	child.execFileSync('magick', [sourceFile, '-background', 'black', '-alpha', 'remove', '-alpha', 'off', target]);
	return target;
}

// 非文字Canvasの比較では、別試験が測るDOM文字帯を両画像から外す。
function maskText(item, sourceFile, target) {
	const bands = item.scene === 'nodes_2d_extended'
		? 'rectangle 8,16 792,40 rectangle 8,252 792,280 rectangle 8,300 792,324 rectangle 8,536 792,564'
		: item.scene === 'canvas_inputs'
			? 'rectangle 34,24 370,62 rectangle 48,102 350,138 rectangle 48,188 350,330 rectangle 34,394 398,446 rectangle 500,108 730,148 rectangle 414,204 760,490'
			: '';
	if (!bands) return sourceFile;
	child.execFileSync('magick', [sourceFile, '-fill', 'black', '-draw', bands, target]);
	return target;
}

// 指定領域に背景以外の画素があることを色数で確かめる。
function colors(file, area) {
	return Number(child.execFileSync('magick', [file, '-crop', area, '+repage', '-format', '%k', 'info:'], { encoding: 'utf8' }));
}

// ImageMagickの正規化RMSEを8bit値へ戻す。
function rmse(reference, actual, diff) {
	const result = child.spawnSync('magick', ['compare', '-metric', 'RMSE', reference, actual, diff], { encoding: 'utf8' });
	const found = /\(([0-9.eE+-]+)\)/.exec(result.stderr || '');
	assert.ok(found, `RMSEを測れない: ${result.stderr}`);
	return Number((Number(found[1]) * 255).toFixed(4));
}

fs.rmSync(work, { recursive: true, force: true });
const ready = [...new Set(cases.map(({ level }) => level))].flatMap((level) => prepareLevel(level, cases.filter((item) => item.level === level)));

(async () => {
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	const measured = {};
	const ui = []; // Browser操作を完走したlevel。
	try {
		for (const item of ready) {
			const result = path.join(work, item.name);
			fs.mkdirSync(result, { recursive: true });
			const server = createServer(item.site);
			await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
			try {
				const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
				const pageErrors = []; // Browser runtime例外を操作成功で隠さない。
				page.on('pageerror', (error) => pageErrors.push(error.message));
				// URLが選んだSceneへ切り替わった通知を待ち、起点Sceneの誤測定を防ぐ。
				await page.addInitScript(() => {
					let site;
					Object.defineProperty(globalThis, 'YWebSite', {
						configurable: true,
						get: () => site,
						set: (value) => {
							site = value;
							const notify = value.scene;
							value.scene = (scene) => {
								globalThis.__ywebScene = scene;
								return notify(scene);
							};
						},
					});
				});
				await page.goto(`http://127.0.0.1:${server.address().port}${item.uri}`, { waitUntil: 'domcontentloaded' });
				try {
					await page.waitForFunction((scene) => globalThis.__ywebScene === scene, `res://${item.scene}.tscn`, { timeout: 20000 });
				} catch (error) {
					const state = await page.evaluate(() => ({ scene: globalThis.__ywebScene || '', text: document.body.innerText.slice(0, 500) }));
					throw new Error(`${item.name}のscene起動通知がない: ${JSON.stringify({ state, pageErrors })}`, { cause: error });
				}
				await page.waitForFunction(() => document.querySelector('#canvas') && document.querySelector('#yweb-text-root'), { timeout: 20000 });
				page.setDefaultTimeout(3000);
				await page.evaluate(() => document.fonts.ready);
				await page.waitForTimeout(500);
				const state = await page.evaluate((selector) => {
					const canvas = document.querySelector('#canvas');
					return {
						hidden: canvas.dataset.ywebHidden || '',
						visibility: getComputedStyle(canvas).visibility,
						text: document.querySelectorAll('[data-yweb-text]').length,
						tags: [...document.querySelectorAll('[data-yweb-text]')].map((element) => element.tagName).sort(),
						forbidden: document.querySelectorAll(selector).length,
					};
				}, forbidden);
				assert.deepEqual([state.hidden, state.visibility], ['', 'visible'], `${item.name}でCanvasを隠している`);
				assert.equal(state.forbidden, 0, `${item.name}で文字以外をDOMへ移している`);
				assert.equal(state.text, item.text, `${item.name}の文字DOM数が違う`);
				if (item.scene === 'canvas_inputs') assert.deepEqual(state.tags, ['A', 'A', 'BUTTON', 'BUTTON', 'INPUT', 'INPUT', 'SPAN', 'SPAN', 'SPAN', 'SPAN', 'TEXTAREA', 'TEXTAREA'], `${item.name}で入力Controlを意味DOMへ分けていない`);
				await page.locator('#yweb-text-root').evaluate((root) => { root.style.display = 'none'; });
				const shot = path.join(result, 'browser.png');
				await page.screenshot({ path: shot });
				if (item.scene === 'canvas_inputs') {
					await page.locator('#yweb-text-root').evaluate((root) => { root.style.display = ''; });
					await exerciseUi(page, item.name, forbidden);
					ui.push(item.level);
				}
				assert.deepEqual(pageErrors, [], `${item.name}のBrowser runtimeで例外が出た`);
				await page.close();
				if (item.scene === 'mesh_3d') {
					assert.ok(colors(shot, '100x100+70+450') > 1, 'Sprite3Dの画像がCanvasへ描かれていない');
					assert.ok(colors(shot, '100x100+260+450') > 1, 'AnimatedSprite3Dの画像がCanvasへ描かれていない');
				}
				const flatReference = flatten(item.reference, path.join(result, 'flat-godot.png'));
				const flatActual = flatten(shot, path.join(result, 'flat-browser.png'));
				const reference = maskText(item, flatReference, path.join(result, 'masked-godot.png'));
				const actual = maskText(item, flatActual, path.join(result, 'masked-browser.png'));
				measured[item.name] = rmse(reference, actual, path.join(result, 'diff.png'));
			} finally {
				await new Promise((resolve) => server.close(resolve));
			}
		}
	} finally {
		await browser.close();
	}
	const failed = Object.entries(measured).filter(([, value]) => value >= limit);
	assert.deepEqual([...ui].sort(), [...new Set(cases.map(({ level }) => level))].sort(), 'Browser UI操作を対象levelで完走していない');
	fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ unit: 'RGB 0..255', measured, limit, ui }, null, 2)}\n`);
	console.log(JSON.stringify({ canvas: true, ui, measured, limit }));
	assert.deepEqual(failed, [], `Canvas画面との差が大きい: ${failed.map(([name, value]) => `${name} ${value}`).join(', ')}`);
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
