// DOM onlyの見た目とGodot画面の一致度を画素で測る。
// 同じsceneをGodotとBrowserで同じ寸法へ描き、8bit RGBのRMSEで差を数値にする。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./browser.cjs');
const { browserPath } = require('./browser.cjs');
const { exerciseHover, exerciseUi } = require('./browser_ui.cjs');
const { createServer } = require('../build/serve_web.cjs');
const { install } = require('../build/fetch_webfont.cjs');
const { matchBrowser } = require('./helpers/font_import.cjs');

const repo = path.resolve(__dirname, '..'); // project root。
const work = path.join(repo, 'tmp/dom-only-match'); // 比較用projectと画像。
const project = path.join(work, 'project'); // 書き出す検査project。
const site = path.join(work, 'site'); // DOM only成果物。
const importCache = path.join(repo, 'tmp/dom-only-import-cache'); // 同じ素材の再importと既知の初回import不安定を避けるGodot cache。
const godotCache = path.join(importCache, 'godot'); // import済みGodot内部状態。
const fontCache = path.join(importCache, 'fonts'); // fontとimport成果物を結ぶ対応表。
const { godot } = require('./godot.cjs'); // 対応版のGodot。
const size = { width: 800, height: 600 }; // 両者で揃える画面寸法。
const limit = 10; // 各画面へ許す8bit RGBのRMSE上限。10は不合格にする。
const containerTypes = JSON.parse(fs.readFileSync(path.join(repo, 'tests/fixtures/dom_only/container_types.json'), 'utf8')); // ClassDBとfixtureで共有するContainer派生型。
const allScreens = ['main', 'widgets', 'motion', 'physics', 'omochi', 'draw_all', 'plane_3d', 'animated_sprite', 'mesh_3d', 'themes', 'particles_2d', 'controls_extended', 'nodes_2d_extended', 'windows_media', 'font_metrics', 'affects_extended', 'scroll_layout', 'container_overflow', 'input_3d', 'code_edit', 'canvas_inputs', 'hover_scroll']; // 比べられる全画面。
const selected = (process.env.YWEB_SCREEN || '').split(',').filter(Boolean); // 変更箇所へ絞る画面名。
const screens = selected.length ? selected : allScreens; // 未指定時は全画面を一括検査する。
const comparedScreens = screens.filter((name) => !['canvas_inputs', 'hover_scroll', 'affects_extended'].includes(name)); // 画素比較する画面。操作と副作用型のfixtureは構造検査へ専念する。
const structureOnly = process.env.YWEB_STRUCTURE_ONLY === '1'; // DOM構造の開発検査ではRMSE結果を記録して終了値から外す。
const settle = { physics: 320, omochi: 950, particles_2d: 30 }; // 物理と粒子を速く回した画面で、形が決まるまで進めるframe数。

// 全画面をGodot側で順に撮る一度きりのscript。
const capture = `@tool
extends SceneTree

const SCREENS := ${JSON.stringify(comparedScreens)} # 撮る画面の名前。
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
fs.cpSync(path.join(repo, 'tests/fixtures/dom_only'), project, { recursive: true, filter: (source) => path.basename(source) !== '.godot' });
if (fs.existsSync(godotCache)) fs.cpSync(godotCache, path.join(project, '.godot'), { recursive: true });
child.execFileSync(process.execPath, [path.join(repo, 'build/install_site_addon.cjs'), project], { stdio: 'pipe' });
fs.writeFileSync(path.join(project, 'export_presets.cfg'), '[preset.0]\n\nname="Web"\nplatform="Yurutto Website"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\nexport_path=""\n\n[preset.0.options]\n\nyweb/level=0\nyweb/site/production=false\n');
fs.writeFileSync(path.join(project, 'capture.gd'), capture);
fs.writeFileSync(path.join(project, 'yweb-site.json'), `${JSON.stringify({ version: 1, scenes: Object.fromEntries(screens.map((name, index) => [name, { scene: `res://${name}.tscn`, uri: index === 0 ? '/' : `/${name}/` }])) }, null, 2)}\n`);
const matchFont = install(path.join(project, 'fonts'), 'Match'); // Godotとブラウザで同じ字形を使う。
if (fs.existsSync(fontCache)) fs.cpSync(fontCache, path.join(project, 'fonts'), { recursive: true });
matchBrowser(matchFont.ttf);

// 書き出し時の取込を撮影と次回へ共有し、不安定な独立import起動を省く。
fs.mkdirSync(site, { recursive: true });
// 初回はfont対応表を先に確定し、export中の並行importを避ける。次回から保存済み対応表を使う。
if (!fs.existsSync(path.join(project, 'fonts/Match.ttf.import'))) child.execFileSync(godot, ['--headless', '--path', project, '--editor', '--quit-after', '2'], { stdio: 'pipe', timeout: 60000 });
child.execFileSync(godot, ['--headless', '--path', project, '--export-release', 'Web', path.join(site, 'index.html')], { stdio: 'pipe', timeout: 300000 });
fs.rmSync(importCache, { recursive: true, force: true });
fs.mkdirSync(importCache, { recursive: true });
fs.cpSync(path.join(project, '.godot'), godotCache, { recursive: true });
fs.mkdirSync(fontCache, { recursive: true });
for (const name of fs.readdirSync(path.join(project, 'fonts')).filter((name) => name.endsWith('.import'))) fs.copyFileSync(path.join(project, 'fonts', name), path.join(fontCache, name));

// Godot側の基準画面を撮る。画面外へ出した窓で描き、結果を取り出す。
if (comparedScreens.length) child.execFileSync(godot, ['--path', project, '--script', 'res://capture.gd', '--resolution', `${size.width}x${size.height}`, '--position', '10000,10000'], { stdio: 'pipe', timeout: 60000 });
for (const name of comparedScreens) {
	assert.ok(fs.existsSync(path.join(work, `godot-${name}.png`)), `Godot画面を撮れていない: ${name}`);
}

// Browser側で画面ごとに撮り、Godotとの差を個別にまとめる。
(async () => {
	const server = createServer(site);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	const measured = {};
	const regions = {}; // 複合画面内で独立した部品の合格値を残す領域。
	const fontRows = {}; // フォント寸法ごとの画素範囲とRMSE。
	const ui = []; // Browser操作を完走したlevel。
	try {
		for (const [index, name] of screens.entries()) {
			const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
			page.setDefaultTimeout(5000);
			const uri = index === 0 ? '/' : `/${name}/`;
			// URL切替前の起点sceneを誤って測らず、Godotが確定したscene通知を待つ。
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
				await page.goto(`http://127.0.0.1:${server.address().port}${uri}`, { waitUntil: 'domcontentloaded' });
			await page.waitForFunction((scene) => globalThis.__ywebScene === scene, `res://${name}.tscn`, { timeout: 20000 });
			await page.evaluate(() => document.fonts.ready);
			if (name === 'code_edit') await page.waitForFunction(() => {
				const editors = [...document.querySelectorAll('div[data-yweb-kind="CodeEdit"]')];
				return editors.length === 2 && editors.every((element) => element.dataset.ywebCodeFontReady === '1');
			});
			await page.waitForTimeout(settle[name] ? 2500 : 400);
			const shot = path.join(work, `browser-${name}.png`);
			const shotBeforeInteraction = name === 'themes' || name === 'windows_media' || name === 'scroll_layout' || name === 'container_overflow' || name === 'input_3d' || name.startsWith('code_edit'); // 操作前の初期画面をGodot基準と比べる。
			if (shotBeforeInteraction) await page.screenshot({ path: shot });
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
			if (name === 'animated_sprite') {
				const sprites = await page.evaluate(() => [...document.querySelectorAll('[data-yweb-image-region$="-animated"]')].map((element) => ({
					overflow: element.style.overflow,
					children: element.children.length,
					left: element.firstElementChild?.style.left || '',
					top: element.firstElementChild?.style.top || '',
					transform: element.firstElementChild?.style.transform || '',
				})));
				assert.equal(sprites.length, 5, 'AnimatedSprite2Dを5件DOMへ置けていない');
				assert.ok(sprites.every((sprite) => sprite.overflow === 'hidden' && sprite.children === 1), 'AnimatedSprite2Dを2層の切り抜きDOMにできていない');
				assert.ok(sprites.some((sprite) => Number.parseFloat(sprite.left) < 0), '横frameへ子画像を移動できていない');
				assert.ok(sprites.some((sprite) => Number.parseFloat(sprite.top) < 0), '縦frameへ子画像を移動できていない');
				assert.ok(sprites.some((sprite) => sprite.transform.includes('-1')), '反転frameを子画像へ反映できていない');
				const movingFrame = () => page.evaluate(() => {
					const element = [...document.querySelectorAll('[data-yweb-image-region$="-animated"]')].find((item) => item.getBoundingClientRect().left >= 800);
					return element ? `${element.firstElementChild.style.left}/${element.firstElementChild.style.top}` : '';
				});
				const before = await movingFrame();
				await page.waitForTimeout(180);
				assert.notEqual(await movingFrame(), before, '再生中のframeへ子画像が追従していない');
				assert.equal(await page.locator('[data-yweb-image-region$="-animated"]').count(), 5, 'frame更新で親DOM要素が増えている');
			}
			if (name === 'mesh_3d') {
				const expected = ['AnimatedSprite3D', 'CPUParticles3D', 'CSGBox3D', 'CSGCombiner3D', 'CSGCylinder3D', 'CSGMesh3D', 'CSGPolygon3D', 'CSGSphere3D', 'CSGTorus3D', 'Decal', 'GridMap', 'Label3D', 'MeshInstance3D', 'MultiMeshInstance3D', 'Sprite3D'];
				const actual = await page.evaluate(() => [...new Set([...document.querySelectorAll('[data-yweb-node3d]')].map((element) => element.dataset.ywebNode3d))].sort());
				assert.deepEqual(actual, expected, '固定比較できる描画3D NodeをDOMへ15種類置けていない');
				const triangles = await page.evaluate(() => [...document.querySelectorAll('[data-yweb-triangle3d]')].reduce((sum, element) => sum + Number(element.dataset.ywebTriangleCount), 0));
				assert.ok(triangles >= 40, 'Meshを投影三角形へ分けられていない');
				assert.equal(await page.locator('[data-yweb-plane3d]').count(), 4, '画像、文字、animation、Decalを平面DOMへ置けていない');
			}
			if (name === 'themes') {
				assert.equal(await page.locator('#yweb-text-root').getByText('CHANGE THEME', { exact: true }).count(), 1, '通常Buttonの文字を複数DOMへ分解している');
				// 同じDOM要素のまま三Themeへ切り替わり、全描画層が変わることを確かめる。
				const readTheme = () => page.evaluate(() => ({
					status: [...document.querySelectorAll('[data-yweb-text]')].map((element) => element.textContent).find((text) => text.startsWith('THEME ')),
					boxes: [...document.querySelectorAll('[data-yweb-box]')].map((element) => `${element.dataset.ywebBox}:${element.dataset.ywebStyle}`).sort(),
					icons: [...document.querySelectorAll('[data-yweb-image]')].map((element) => `${element.dataset.ywebImage}:${element.dataset.ywebImageKey}`).sort(),
					texts: [...document.querySelectorAll('[data-yweb-text]')].map((element) => element.dataset.ywebText).sort(),
				}));
				const states = [await readTheme()];
				assert.equal(states[0].status, 'THEME WHITE', '白系Themeから開始していない');
				assert.ok(states[0].boxes.length >= 18, 'Themeの面、枠、track、grabberをDOMへ置けていない');
				assert.ok(states[0].icons.length >= 8, 'Themeのcheck、arrow、grabber、scroll iconをDOMへ置けていない');
				const button = page.getByRole('button', { name: 'BUTTON', exact: true });
				const buttonStyle = () => button.evaluate((element) => document.querySelector(`[data-yweb-box="${element.dataset.ywebText}-box"]`)?.dataset.ywebStyle || '');
				const normalStyle = await buttonStyle();
				await button.hover();
				await page.waitForFunction((before) => {
					const text = [...document.querySelectorAll('[data-yweb-text]')].find((element) => element.textContent === 'BUTTON');
					return text && document.querySelector(`[data-yweb-box="${text.dataset.ywebText}-box"]`)?.dataset.ywebStyle !== before;
				}, normalStyle);
				await page.mouse.move(790, 590);
				for (const expected of ['THEME COLORFUL', 'THEME MANGA', 'THEME WHITE']) {
					await page.getByRole('button', { name: 'CHANGE THEME', exact: true }).click();
					await page.mouse.move(790, 590);
					await page.waitForFunction((text) => [...document.querySelectorAll('[data-yweb-text]')].some((element) => element.textContent === text), expected);
					await page.waitForTimeout(80);
					states.push(await readTheme());
				}
				const stableBoxes = (state) => state.boxes.map((entry) => entry.split(':', 1)[0]).filter((uid) => /-(box|fill|grabber)$/.test(uid));
				assert.deepEqual(states[0].texts, states[1].texts, 'Theme切替で意味DOMを作り直している');
				assert.deepEqual(stableBoxes(states[0]), stableBoxes(states[1]), 'Theme切替で主要box DOMを作り直している');
				assert.notDeepEqual(states[0].boxes, states[1].boxes, 'カラフルThemeの面と枠へ変わっていない');
				assert.notDeepEqual(states[1].boxes, states[2].boxes, '漫画風Themeの面と枠へ変わっていない');
				assert.notDeepEqual(states[0].icons, states[1].icons, 'Theme iconへ変更が反映されていない');
			}
			if (name === 'particles_2d') {
				const titles = [
					['2D POINT SEED', 20, 18], ['2D NODE SCALE', 216, 18], ['2D PARTICLE SCALE', 412, 18], ['2D ALPHA + ROTATE', 608, 18],
					['3D POINT SEED', 20, 302], ['3D NODE SCALE', 216, 302], ['3D PARTICLE SCALE', 412, 302], ['3D ALPHA + DEPTH', 608, 302],
				];
				const titleBoxes = await page.evaluate((items) => items.map(([text, x, y]) => {
					const element = [...document.querySelectorAll('[data-yweb-text]')].find((item) => item.textContent === text);
					return { text, x, y, box: element?.getBoundingClientRect().toJSON() || null };
				}), titles);
				assert.ok(titleBoxes.every(({ x, y, box }) => box && Math.abs(box.x - x) <= 1 && Math.abs(box.y - y) <= 1), `粒子八条件の題名をカードへ置いていない: ${JSON.stringify(titleBoxes)}`);

				const particles2d = () => page.evaluate(() => [...document.querySelectorAll('[data-yweb-image*="-cpu-particle"]')].map((element) => {
					const box = element.getBoundingClientRect();
					return {
						uid: element.dataset.ywebImage,
						x: Number(box.x.toFixed(2)), y: Number(box.y.toFixed(2)), width: Number(box.width.toFixed(2)), height: Number(box.height.toFixed(2)),
						centerX: Number((box.x + box.width * 0.5).toFixed(2)), centerY: Number((box.y + box.height * 0.5).toFixed(2)),
						opacity: Number(getComputedStyle(element).opacity), transform: element.style.transform, filter: getComputedStyle(element).filter,
					};
				}));
				const particles3d = () => page.evaluate(() => [...document.querySelectorAll('[data-yweb-triangle3d][data-yweb-node3d="CPUParticles3D"]')].map((element) => {
					const path = element.firstElementChild;
					const box = path.getBBox();
					const triangles = path.getAttribute('d').match(/M[^Z]+Z/g) || [];
					const parts = [];
					for (let index = 0; index + 1 < triangles.length; index += 2) {
						const points = `${triangles[index]}${triangles[index + 1]}`.match(/-?[0-9.]+/g).map(Number);
						const xs = points.filter((_value, at) => at % 2 === 0);
						parts.push(Number((Math.max(...xs) - Math.min(...xs)).toFixed(2)));
					}
					return {
						uid: element.dataset.ywebTriangle3d, count: Number(element.dataset.ywebTriangleCount), fill: getComputedStyle(path).fill,
						x: Number(box.x.toFixed(2)), y: Number(box.y.toFixed(2)), width: Number(box.width.toFixed(2)), height: Number(box.height.toFixed(2)),
						centerX: Number((box.x + box.width * 0.5).toFixed(2)), centerY: Number((box.y + box.height * 0.5).toFixed(2)), parts,
					};
				}));
				const before2d = await particles2d();
				const before3d = await particles3d();
				assert.equal(before2d.length, 12, 'CPU 2D粒子の四条件を各三instanceへ展開できていない');
				assert.equal(before3d.length, 6, 'CPU 3Dの不透明三条件を統合し、半透明粒子を三枚へ分離できていない');
				assert.equal(await page.locator('[data-yweb-image*="-gpu-particle"],[data-yweb-node3d="GPUParticles3D"]').count(), 0, '固定seedを持たないGPU粒子を画面一致試験へ混ぜている');
				const columns2d = Array.from({ length: 4 }, (_, column) => before2d.filter(({ centerX }) => Math.floor(centerX / 200) === column));
				const columns3d = Array.from({ length: 4 }, (_, column) => before3d.filter(({ centerX }) => Math.floor(centerX / 200) === column));
				assert.deepEqual(columns2d.map((items) => items.length), [3, 3, 3, 3], 'CPU 2D粒子を上段四カードへ三個ずつ置いていない');
				assert.deepEqual(columns3d.map((items) => items.length), [1, 1, 1, 3], 'CPU 3Dの不透明粒子と半透明粒子を適切な単位で分けていない');
				assert.ok(before2d.every(({ centerY, filter }) => centerY >= 70 && centerY <= 225 && filter !== 'none'), 'CPU 2D粒子の位置または色変調がGodot情報に追従していない');
				assert.ok(before3d.every(({ centerY }) => centerY >= 340 && centerY <= 515), 'CPU 3D粒子を下段カードへ投影していない');
				assert.ok(columns2d[1].every(({ width, height }) => width > 30 && height < 15), `2D Nodeの非等方scaleを粒子画像へ反映していない: ${JSON.stringify(columns2d[1])}`);
				assert.ok(new Set(columns2d[2].map(({ width }) => Math.round(width))).size >= 2, '2D粒子ごとのscale差を反映していない');
				assert.ok(columns2d[3].every(({ opacity, transform }) => opacity > 0.4 && opacity < 0.44 && !/^matrix\([^,]+,0,0,[^,]+,/.test(transform)), '2D粒子の半透明または回転を反映していない');
				assert.ok(columns3d[1][0].width > columns3d[0][0].width * 1.3 && columns3d[1][0].height < columns3d[0][0].height, `3D Nodeの非等方scaleを投影へ反映していない: ${JSON.stringify(columns3d.slice(0, 2))}`);
				assert.ok(new Set(columns3d[2][0].parts.map((width) => Math.round(width))).size >= 2, '統合したSVG内で3D粒子ごとのscale差を反映していない');
				assert.ok(columns3d[3].every(({ fill }) => /rgba\(.+, 0\.42\)/.test(fill)), `3D粒子の半透明を粒子別SVGへ反映していない: ${JSON.stringify(columns3d[3])}`);
				assert.equal(before3d.reduce((sum, item) => sum + item.count, 0), 24, 'CPU 3D粒子三個分のQuadを三角形へ展開していない');
				const filterCount = await page.locator('filter[id^="yweb-tint-"]').count();
				assert.equal(filterCount, before2d.length, '色変調filterがCPU 2D画像数を超えて増えている');
				await page.waitForTimeout(120);
				assert.deepEqual(await particles2d(), before2d, '速度0のCPU 2D粒子が時間経過で変化している');
				assert.deepEqual(await particles3d(), before3d, '速度0のCPU 3D粒子が時間経過で変化している');
				assert.equal(await page.locator('filter[id^="yweb-tint-"]').count(), filterCount, '動的色でfilterが増えている');
			}
			if (name === 'controls_extended') {
				const expected = ['ColorPicker', 'ColorPickerButton', 'GraphEdit', 'GraphElement', 'GraphFrame', 'GraphNode', 'HSplitContainer', 'MenuBar', 'PanelContainer', 'ReferenceRect', 'RichTextLabel', 'ScrollContainer', 'SplitContainer', 'VSplitContainer', 'VirtualJoystick'];
				const text = await page.locator('[data-yweb-text]').allTextContents();
				assert.ok(expected.every((type) => text.includes(type)), '拡張Controlの型名をDOMへ置けていない');
				assert.ok(text.includes('Rich Text [ bracket'), 'RichTextLabelの整形後本文をDOMへ置けていない');
				const richText = page.locator('[data-yweb-text]', { hasText: /^Rich Text \[ bracket$/ });
				const rich = await richText.locator('span').evaluateAll((parts) => parts.filter((part) => part.textContent === 'Rich' || part.textContent === 'Text').map((part) => ({ text: part.textContent, color: getComputedStyle(part).color, weight: getComputedStyle(part).fontWeight })));
				assert.deepEqual(rich.map(({ text }) => text), ['Rich', 'Text'], 'RichTextLabelの装飾範囲が本文と一致しない');
				assert.equal(rich[1].color, 'rgb(34, 211, 238)', 'RichTextLabelの文字色をDOMへ反映できていない');
				assert.ok(Number(rich[0].weight) >= 700, 'RichTextLabelの太字をDOMへ反映できていない');
				const stable = await richText.evaluate(async (owner) => {
					const content = owner.ywebGlyph || owner;
					const first = content.firstChild;
					await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
					return content.firstChild === first;
				});
				assert.ok(stable, '変化のないRichTextLabelを毎frame再生成している');
				assert.ok(await page.locator('[data-yweb-box]').count() >= 24, '拡張Controlの面と内部部品をDOMへ置けていない');
				assert.ok(await page.locator('[data-yweb-image]').count() >= 6, 'ColorPickerやGraph系の内部iconをDOMへ置けていない');
				assert.equal(await page.locator('[data-yweb-gradient]').count(), 2, 'ColorPickerの色面とhue帯をDOMへ置けていない');
			}
			if (name === 'nodes_2d_extended') {
				const captions = [
					['MESH INSTANCE 2D', 20, 18], ['MULTIMESH 2D', 216, 18], ['TOUCH SCREEN BUTTON', 412, 18], ['NINE PATCH RECT', 608, 18],
					['TILEMAP LAYER', 20, 302], ['TILEMAP', 216, 302], ['TEXTURE BUTTON', 412, 302], ['TEXTURE PROGRESS BAR', 608, 302],
				];
				const captionBoxes = await page.evaluate((items) => items.map(([text, x, y]) => {
					const element = [...document.querySelectorAll('[data-yweb-text]')].find((item) => item.textContent === text);
					const glyph = element?.querySelector('[data-yweb-glyph]');
					return { text, x, y, box: element?.getBoundingClientRect().toJSON() || null, children: element?.childElementCount, glyph: glyph ? getComputedStyle(glyph).transform : '' };
				}), captions);
				assert.ok(captionBoxes.every(({ box }) => box), 'Mesh2D画面の項目名を個別DOMへ置いていない');
				assert.ok(captionBoxes.every(({ x, y, box }) => Math.abs(box.x - x) <= 1 && Math.abs(box.y - y) <= 1), `Mesh2D画面の項目名をGodot確定座標へ置いていない: ${JSON.stringify(captionBoxes)}`);
				assert.ok(captionBoxes.every(({ children, glyph }) => children === 1 && glyph.startsWith('matrix(')), '各項目名を一文字ずつ分解せず、一つの内側DOMへ字形補正していない');
				assert.ok(captionBoxes.slice(0, 4).every(({ box }, index, row) => index === 0 || row[index - 1].box.x < box.x), '2D画像画面の上段順がGodot座標と違う');
				assert.ok(captionBoxes.slice(4, 8).every(({ box }, index, row) => index === 0 || row[index - 1].box.x < box.x), '2D画像画面の下段順がGodot座標と違う');
				const polygons = await page.evaluate(() => [...document.querySelectorAll('[data-yweb-polygon]')].map((element) => ({ uid: element.dataset.ywebPolygon, box: element.getBoundingClientRect().toJSON(), transform: element.style.transform })));
				const meshPolygons = polygons.filter(({ uid }) => uid.includes('-mesh-'));
				const multiPolygons = polygons.filter(({ uid }) => uid.includes('-multimesh-'));
				assert.equal(meshPolygons.length, 1, 'MeshInstance2Dを三角形へ展開できていない');
				assert.equal(multiPolygons.length, 3, 'MultiMeshInstance2Dのinstanceを展開できていない');
				assert.ok(Math.abs(meshPolygons[0].box.x - 47) <= 1 && Math.abs(meshPolygons[0].box.y - 90) <= 1, `MeshInstance2DをGodot確定位置へ置いていない: ${JSON.stringify(meshPolygons)}`);
				const pictures = await page.evaluate(async () => {
					const images = [...document.querySelectorAll('img[data-yweb-image],img[data-yweb-region-image]')];
					await Promise.all(images.map((image) => image.decode()));
					return images.map((image) => {
						const canvas = document.createElement('canvas');
						canvas.width = image.naturalWidth;
						canvas.height = image.naturalHeight;
						const context = canvas.getContext('2d');
						context.drawImage(image, 0, 0);
						const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
						const colors = new Set();
						for (let at = 0; at < pixels.length; at += 16) if (pixels[at + 3]) colors.add(`${pixels[at]},${pixels[at + 1]},${pixels[at + 2]}`);
						return { uid: image.dataset.ywebImage || image.dataset.ywebRegionImage, width: image.naturalWidth, height: image.naturalHeight, colors: colors.size };
					});
				});
				assert.ok(pictures.length >= 15 && pictures.every(({ width, height, colors }) => width > 0 && height > 0 && colors >= 4), '画像Nodeへ判定可能な多色画像を読み込めていない');
				assert.deepEqual(pictures.filter(({ uid }) => uid.endsWith('-img')).map(({ width, height }) => [width, height]), [[150, 70]], 'TextureButtonの模様画像寸法が違う');
				assert.deepEqual(pictures.filter(({ uid }) => uid.endsWith('-touch')).map(({ width, height }) => [width, height]), [[110, 80]], 'TouchScreenButtonの模様画像寸法が違う');
				const touch = await page.locator('[data-yweb-image$="-touch"]').evaluate((element) => {
					const box = element.getBoundingClientRect();
					const style = getComputedStyle(element);
					return { box: box.toJSON(), display: style.display, opacity: style.opacity, visibility: style.visibility, clip: style.clipPath };
				});
				assert.ok(Math.abs(touch.box.x - 439) <= 1 && Math.abs(touch.box.y - 105) <= 1 && touch.box.width === 110 && touch.box.height === 80 && touch.display !== 'none' && touch.visibility === 'visible' && Number(touch.opacity) > 0 && touch.clip === 'none', `TouchScreenButton画像をGodot確定位置へ表示していない: ${JSON.stringify(touch)}`);
				const nine = await page.locator('[data-yweb-nine-patch]').evaluate((element) => ({ slice: element.style.borderImageSlice, repeat: element.style.borderImageRepeat, source: element.style.borderImageSource, box: element.getBoundingClientRect().toJSON() }));
				assert.ok(nine.source.includes('data:image/png') && nine.slice.includes('8') && nine.slice.includes('fill') && nine.repeat.split(' ').every((value) => value === 'stretch'), `NinePatchの四隅、中央、軸stretchを画像DOMへ反映していない: ${JSON.stringify(nine)}`);
				assert.ok(Math.abs(nine.box.width - 150) <= 1 && Math.abs(nine.box.height - 70) <= 1, 'NinePatchの表示寸法が150x70と違う');
				assert.equal(await page.locator('[data-yweb-image-region$="-progress"]').count(), 1, 'TextureProgressBarの進捗画像をDOMへ置けていない');
				const progress = await page.locator('[data-yweb-image-region$="-progress"]').evaluate((element) => ({ source: element.dataset.ywebSource.split(',').map(Number), box: element.getBoundingClientRect().toJSON(), imageWidth: Number.parseFloat(element.firstElementChild.style.width) }));
				assert.deepEqual(progress.source, [0, 0, 96, 28], 'TextureProgressの64%を画像左端から切り抜いていない');
				assert.ok(Math.abs(progress.box.width - 96) <= 1 && progress.imageWidth === 150, 'TextureProgress画像を切り抜かず縮小している');
				const tiles = await page.locator('[data-yweb-image-region*="-tile-"]').evaluateAll((elements) => elements.map((element) => {
					const box = element.getBoundingClientRect();
					return { at: `${Math.round(box.x)},${Math.round(box.y)}`, source: element.dataset.ywebSource.split(',').map(Number) };
				}));
				assert.equal(tiles.length, 12, 'TileMap二種のcellを全てDOMへ置けていない');
				assert.equal(new Set(tiles.map(({ at }) => at)).size, 12, 'TileMapのcell位置が重なっている');
				assert.deepEqual([...new Set(tiles.map(({ source }) => source[0]))].sort((left, right) => left - right), [1, 35, 69], 'TileMap runtime atlasの三cell領域を切り替えていない');
				assert.ok(tiles.every(({ source }) => source[2] === 32 && source[3] === 32), 'TileMap cellを32x32で切り抜いていない');
			}
			if (name === 'windows_media') {
				// Window装飾が内容矩形で途切れず、Themeの外側余白まで覆うことを確認する。
				const text = await page.locator('[data-yweb-text]').allTextContents();
				const expected = ['AcceptDialog', 'ConfirmationDialog', 'FileDialog', 'PopupMenu', 'Disabled Item', 'OPTIONS', 'Checked Item', 'Icon Item', 'Submenu', 'PopupPanel', 'SUBVIEWPORT', 'VideoStreamPlayer'];
				assert.ok(expected.every((type) => text.includes(type)), 'Window、Viewport、Videoの型名をDOMへ置けていない');
				assert.ok(!text.includes('HIDDEN MENU ITEM') && !text.includes('HIDDEN PANEL ITEM'), '閉じたPopupの内蔵ControlがDOMへ残っている');
				const frames = await page.evaluate(() => {
					const box = (title) => {
						const text = [...document.querySelectorAll('[data-yweb-text]')].find((element) => element.textContent === title && element.id.endsWith('-window-title'));
						return text ? document.getElementById(text.id.replace(/-window-title$/, '-window'))?.getBoundingClientRect().toJSON() : null;
					};
					const at = (x, y) => [...document.querySelectorAll('[data-yweb-box]')].find((element) => {
						const rect = element.getBoundingClientRect();
						return rect.x === x && rect.y === y;
					})?.getBoundingClientRect().toJSON();
					return { accept: box('Accept'), confirm: box('Confirm'), files: box('Files'), menu: at(544, 52), popup: at(544, 284) };
				});
				assert.deepEqual(Object.fromEntries(Object.entries(frames).map(([key, value]) => [key, value && [value.x, value.y, value.width, value.height]])), {
					accept: [10, 198, 246, 163],
					confirm: [262, 198, 266, 163],
					files: [10, 338, 540, 248],
					menu: [544, 52, 212, 182],
					popup: [544, 284, 212, 142],
				}, 'WindowのTheme枠がGodotの描画範囲と一致しない');
				const fileFocus = await page.locator('[data-yweb-text]', { hasText: /^Save$/ }).evaluate((button) => {
					const style = getComputedStyle(document.getElementById(`${button.id}-focus`));
					return { background: style.backgroundColor, border: style.borderColor };
				});
				assert.deepEqual(fileFocus, { background: 'rgba(0, 0, 0, 0)', border: 'rgb(204, 204, 204)' }, 'FileDialogのfocus枠でdraw_center=falseを守れていない');
				const popupTheme = await page.locator('[data-yweb-box]').evaluateAll((elements) => {
					const panel = elements.find((element) => {
						const rect = element.getBoundingClientRect();
						return rect.x === 544 && rect.y === 284;
					});
					if (!panel) return null;
					const style = getComputedStyle(panel);
					return { background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius };
				});
				assert.deepEqual(popupTheme, { background: 'rgba(41, 50, 65, 0.8)', border: 'rgb(251, 113, 133)', radius: '7px' }, 'PopupPanelのTheme背景、枠色、角丸をDOMへ反映できていない');
				const menuRows = await page.locator('[data-yweb-text]').evaluateAll((elements) => elements.filter((element) => ['PopupMenu', 'Disabled Item', 'OPTIONS', 'Checked Item', 'Icon Item', 'Submenu'].includes(element.textContent)).map((element) => {
					const rect = element.getBoundingClientRect();
					return { text: element.textContent, x: rect.x, y: rect.y, color: getComputedStyle(element).color };
				}));
				assert.deepEqual(menuRows.map(({ text }) => text), ['PopupMenu', 'Disabled Item', 'OPTIONS', 'Checked Item', 'Icon Item', 'Submenu'], 'PopupMenuの項目順をGodotの描画順から取得できていない');
				assert.ok(menuRows.every(({ x, y }) => x >= 540 && x < 760 && y >= 48 && y < 238), 'PopupMenu項目を実際の項目領域へ置けていない');
				assert.notEqual(menuRows[0].color, menuRows[1].color, 'PopupMenuの無効色をThemeから取得できていない');
				const menuDecorations = await page.evaluate(() => ({
					images: [...document.querySelectorAll('[data-yweb-image]')].map((element) => element.getBoundingClientRect()).filter((rect) => rect.x >= 540 && rect.x < 760 && rect.y >= 48 && rect.y < 238).map((rect) => [rect.width, rect.height]),
					lines: [...document.querySelectorAll('[data-yweb-box]')].map((element) => element.getBoundingClientRect()).filter((rect) => rect.x >= 540 && rect.x < 760 && rect.y >= 100 && rect.y <= 112 && rect.height === 1).map((rect) => rect.width),
				}));
				assert.deepEqual(menuDecorations.images, [[16, 16], [14, 14], [8, 16]], 'PopupMenuのcheck、項目画像、submenu矢印を実描画から取得できていない');
				assert.deepEqual(menuDecorations.lines, [64, 64], 'PopupMenuの見出し区切り線を実描画から取得できていない');
				const menuItem = (text) => page.locator('[data-yweb-text]').filter({ hasText: new RegExp(`^${text}$`) });
				await menuItem('PopupMenu').hover();
				await page.waitForFunction(() => [...document.querySelectorAll('[data-yweb-box]')].some((element) => {
					const rect = element.getBoundingClientRect();
					return rect.x >= 540 && rect.x < 760 && rect.y < 80 && rect.height >= 20;
				}));
				const disabledMenu = menuItem('Disabled Item');
				assert.ok(await disabledMenu.isDisabled(), 'PopupMenuの無効項目がBrowserで有効になっている');
				await disabledMenu.dispatchEvent('click');
				assert.equal(await page.locator('[data-yweb-text]').filter({ hasText: /^MENU STATUS / }).textContent(), 'MENU STATUS idle', 'PopupMenuの無効項目を選択している');
				await menuItem('Icon Item').click();
				await page.locator('[data-yweb-text]').filter({ hasText: /^MENU STATUS 4$/ }).waitFor();
				assert.equal(await page.locator('[data-yweb-image$="-video"]').count(), 1, 'Video frameを画像DOMへ置けていない');
				const sub = await page.locator('#yweb-text-root').getByText('SUBVIEWPORT', { exact: true }).boundingBox();
				assert.ok(sub && sub.x >= 18 && sub.x + sub.width <= 268 && sub.y >= 48 && sub.y + sub.height <= 198, 'SubViewportの最終座標または切り抜きがContainerと合っていない');
			}
			if (name === 'affects_extended') {
				const expected = 'AnimationPlayer AnimationTree AspectRatioContainer BackBufferCopy Bone2D BoxContainer Camera2D CanvasGroup CanvasLayer CanvasModulate CenterContainer Container DirectionalLight2D FlowContainer GridContainer HBoxContainer HFlowContainer LightOccluder2D MarginContainer Parallax2D ParallaxBackground ParallaxLayer PathFollow2D PointLight2D Popup RemoteTransform2D Skeleton2D SubViewport VBoxContainer VFlowContainer VisibleOnScreenEnabler2D Window AimModifier3D AreaLight3D BoneAttachment3D BoneConstraint3D BoneTwistDisperser3D CCDIK3D ConvertTransformModifier3D CopyTransformModifier3D DirectionalLight3D FABRIK3D GeometryInstance3D GPUParticlesAttractorBox3D GPUParticlesAttractorSphere3D GPUParticlesAttractorVectorField3D GPUParticlesCollisionBox3D GPUParticlesCollisionHeightField3D GPUParticlesCollisionSDF3D GPUParticlesCollisionSphere3D LightmapGI LightmapProbe LimitAngularVelocityModifier3D LookAtModifier3D ModifierBoneTarget3D OccluderInstance3D OmniLight3D PathFollow3D ReflectionProbe RemoteTransform3D RetargetModifier3D ShaderGlobalsOverride Skeleton3D SkeletonIK3D SkeletonModifier3D SplineIK3D SpotLight3D SpringArm3D SpringBoneSimulator3D TwoBoneIK3D VisibleOnScreenEnabler3D VoxelGI WorldEnvironment'.split(' ');
				const report = (await page.locator('#yweb-text-root').getByText(/^AFFECTS /).textContent()).slice('AFFECTS '.length).split(',');
				assert.deepEqual(report, expected, '描画へ影響する全NodeをWeb実行環境で生成できていない');
			}
			if (name === 'scroll_layout') {
				await page.locator('#yweb-text-root').getByText('GODOT OFFSET 0 0 NESTED 0 0', { exact: true }).waitFor();
				const read = () => page.evaluate(() => {
					const text = (value) => [...document.querySelectorAll('[data-yweb-text]')].find((element) => element.textContent === value);
					const info = (value) => {
						const element = text(value);
						const box = element?.getBoundingClientRect();
						return { x: box?.x, y: box?.y, z: Number(element?.style.zIndex), clip: element ? getComputedStyle(element).clipPath : '' };
					};
					return {
						rows: ['ROW 2', 'ROW 3', 'ROW 7', 'TAIL 2'].map(info),
						overlay: info('OVERLAY FRONT'),
						grabbers: [...document.querySelectorAll('[data-yweb-box$="-grabber"]')].map((element) => `${element.dataset.ywebBox}:${element.style.transform}`),
						scrolls: [...document.querySelectorAll('[data-yweb-scroll]')].map((element) => ({ uid: element.dataset.ywebScroll, box: element.getBoundingClientRect().toJSON(), clip: getComputedStyle(element).clipPath, left: element.scrollLeft, top: element.scrollTop, maxX: element.scrollWidth - element.clientWidth, maxY: element.scrollHeight - element.clientHeight, overflowX: getComputedStyle(element).overflowX, overflowY: getComputedStyle(element).overflowY })),
						gradients: [...document.querySelectorAll('[data-yweb-gradient]')].map((element) => element.getBoundingClientRect().toJSON()),
						polygons: [...document.querySelectorAll('[data-yweb-polygon]')].map((element) => ({ box: element.getBoundingClientRect().toJSON(), clip: getComputedStyle(element).clipPath, shape: getComputedStyle(element.firstElementChild).clipPath })),
					};
				});
				const before = await read();
				const outerBefore = before.scrolls.reduce((left, right) => left.maxY > right.maxY ? left : right);
				const nestedBefore = before.scrolls.find(({ uid }) => uid !== outerBefore.uid);
				assert.ok([before.rows[0], before.rows[1], before.rows[3]].every(({ clip }) => clip.startsWith('polygon(')), '表示中の行へScrollContainerと行の切り抜きを適用していない');
				assert.equal(before.rows[2].clip, 'inset(100%)', '表示範囲外の行をBrowser側で隠していない');
				assert.ok(Math.abs(before.rows[1].y - before.rows[0].y - 76) <= 1, 'VBoxContainerの行配置またはseparationがGodot値と違う');
				assert.ok(before.overlay.z > before.rows[0].z, '木の追加順よりGodotのz-indexを優先できていない');
				assert.equal(before.grabbers.length, 0, 'ScrollContainer内蔵barをGodot描画から作っている');
				assert.equal(before.scrolls.length, 2, '外側と入れ子へBrowserスクロール領域を一つずつ結び付けていない');
				assert.ok(before.scrolls.every((scroll) => `${scroll.overflowX}/${scroll.overflowY}` === 'scroll/scroll'), 'Browser native scrollbarを縦横に設定していない');
				assert.ok(outerBefore.maxX >= 44 && outerBefore.maxY >= 152, '外側Browserスクロール領域の内容量が不足している');
				assert.equal(before.gradients.length, 2, '入れ子ScrollContainer内のColorPicker色面をDOMへ置いていない');
				assert.equal(before.polygons.length, 1, '行内のPolygon2DをDOMへ置いていない');
				assert.ok(before.polygons[0].clip.startsWith('polygon(') && before.polygons[0].shape.startsWith('polygon('), 'Polygon2Dの形と親clipを二層で交差していない');
				await page.mouse.move(180, 180);
				await page.mouse.wheel(44, 152);
				await page.waitForFunction(() => {
					const scroll = [...document.querySelectorAll('[data-yweb-scroll]')].sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight))[0];
					return scroll && scroll.scrollLeft === 44 && scroll.scrollTop === 152;
				});
				const after = await read();
				const outerAfter = after.scrolls.find(({ uid }) => uid === outerBefore.uid);
				const nestedAfter = after.scrolls.find(({ uid }) => uid === nestedBefore.uid);
				assert.ok(Math.abs((after.rows[0].x - before.rows[0].x) + 44) <= 1, 'Browserの横scroll量を中身へ反映していない');
				assert.ok(Math.abs((after.rows[0].y - before.rows[0].y) + 152) <= 1, 'Browserの縦scroll量を中身へ反映していない');
				assert.ok(Math.abs((nestedAfter.box.x - nestedBefore.box.x) + 44) <= 1 && Math.abs((nestedAfter.box.y - nestedBefore.box.y) + 152) <= 1, '外側scroll後に入れ子の操作領域が追従していない');
				assert.ok(nestedAfter.clip.startsWith('polygon('), '入れ子のnative scroll領域へ外側の親clipを適用していない');
				assert.ok(after.gradients.every((box, index) => Math.abs((box.x - before.gradients[index].x) + 44) <= 1 && Math.abs((box.y - before.gradients[index].y) + 152) <= 1), 'ColorPicker色面が外側scrollへ追従していない');
				assert.ok(Math.abs((after.polygons[0].box.x - before.polygons[0].box.x) + 44) <= 1 && Math.abs((after.polygons[0].box.y - before.polygons[0].box.y) + 152) <= 1, 'Polygon2DがBrowser scrollへ追従していない');
				assert.deepEqual(after.grabbers, before.grabbers, 'Browser scrollをGodot ScrollBarの再描画で処理している');
				assert.ok([after.rows[0], after.rows[1], after.rows[3]].every(({ clip }) => clip.startsWith('polygon(')), 'scroll後に表示中の行の切り抜き範囲を失っている');
				assert.equal(after.rows[2].clip, 'inset(100%)', 'scroll後も表示範囲外の行が見えている');
				await page.mouse.move(350, 180);
				await page.mouse.wheel(0, 30);
				await page.waitForTimeout(100);
				const blocked = await read();
				assert.deepEqual(blocked.scrolls.map(({ left, top }) => [left, top]), after.scrolls.map(({ left, top }) => [left, top]), '前面overlay上のwheelが背面ScrollContainerへ届いている');
				await page.mouse.move(nestedAfter.box.x + nestedAfter.box.width / 2, nestedAfter.box.y + nestedAfter.box.height / 2);
				await page.mouse.wheel(30, 40);
				await page.waitForFunction((uid) => {
					const scroll = [...document.querySelectorAll('[data-yweb-scroll]')].find((element) => element.dataset.ywebScroll === uid);
					return scroll && scroll.scrollLeft === 30 && scroll.scrollTop === 40;
				}, nestedBefore.uid);
				const nestedMoved = await read();
				const outerStill = nestedMoved.scrolls.find(({ uid }) => uid === outerBefore.uid);
				assert.equal(`${outerStill.left},${outerStill.top}`, '44,152', '入れ子scrollを外側へ誤って適用している');
				assert.ok(nestedMoved.gradients.every((box, index) => box.x < after.gradients[index].x && box.y < after.gradients[index].y), '入れ子scrollをColorPicker色面へ反映していない');
				await page.mouse.wheel(1000, 1000);
				await page.mouse.wheel(0, 30);
				await page.waitForFunction((uid) => {
					const scroll = [...document.querySelectorAll('[data-yweb-scroll]')].find((element) => element.dataset.ywebScroll === uid);
					return scroll && scroll.scrollTop > 152;
				}, outerBefore.uid);
				await page.waitForTimeout(100);
				await page.locator('#yweb-text-root').getByText('GODOT OFFSET 0 0 NESTED 0 0', { exact: true }).waitFor();
				await page.screenshot({ path: path.join(work, 'browser-scroll_layout-scrolled.png') });
			}
			if (name === 'container_overflow') {
				const expected = containerTypes;
				const read = () => page.evaluate(() => {
					const values = (prefix) => [...document.querySelectorAll('[data-yweb-text]')]
						.filter((element) => element.textContent.startsWith(prefix))
						.map((element) => {
							const matrix = new DOMMatrix(getComputedStyle(element).transform);
							return {
								type: element.textContent.slice(prefix.length),
								clip: getComputedStyle(element).clipPath,
								z: Number(element.style.zIndex),
								scale: Math.hypot(matrix.a, matrix.b),
							};
						});
					const gradients = [...document.querySelectorAll('[data-yweb-gradient]')].map((element) => ({ box: element.getBoundingClientRect().toJSON(), transform: getComputedStyle(element).transform }));
					const clippedBoxes = [...document.querySelectorAll('[data-yweb-box]')].filter((element) => getComputedStyle(element).clipPath.startsWith('polygon(')).length;
					const front = [...document.querySelectorAll('[data-yweb-text]')]
						.filter((element) => /^F\d\d$/.test(element.textContent))
						.map((element) => ({ index: Number(element.textContent.slice(1)), clip: getComputedStyle(element).clipPath, z: Number(element.style.zIndex) }));
					return { overflow: values('OVERFLOW '), front, gradients, clippedBoxes };
				});
				const before = await read();
				const identity = await page.evaluate(() => {
					const elements = [...document.querySelectorAll('#yweb-text-root > [data-yweb-uid]')];
					globalThis.__ywebContainerElements = new Map(elements.map((element) => [element.id, element]));
					return { count: elements.length, ids: elements.map((element) => element.id) };
				});
				assert.ok(identity.count >= expected.length * 4, 'Container画面の描画DOMへUID由来idを付けていない');
				assert.equal(new Set(identity.ids).size, identity.ids.length, '描画DOMのUID由来idが重複している');
				assert.deepEqual(before.overflow.map(({ type }) => type).sort(), [...expected].sort(), '全Container派生のはみ出し文字をDOMへ置けていない');
				assert.deepEqual(before.front.map(({ index }) => index).sort((left, right) => left - right), expected.map((_type, index) => index), '全Container派生へ重なる前面文字をDOMへ置けていない');
				assert.ok(before.overflow.every(({ clip }) => clip.startsWith('polygon(')), 'Containerの子へ切り抜きpolygonを適用していない');
				assert.ok(before.clippedBoxes >= expected.length, 'Containerからはみ出す色面を切り抜いていない');
				assert.ok(before.front.every(({ clip }) => clip === 'none'), 'Container外の前面兄弟まで切り抜いている');
				assert.equal(before.gradients.length, 2, 'ColorPickerの内部色面を2面DOMへ置けていない');
				assert.ok(before.gradients.every(({ box, transform }) => transform.startsWith('matrix(') && box.x >= 478 && box.y >= 12 && box.right <= 624 && box.bottom <= 100), 'ColorPickerの内部色面がContainer範囲から漏れている');
				const clipBounds = (item) => {
					const numbers = [...item.clip.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
					const xs = numbers.filter((_value, index) => index % 2 === 0);
					const ys = numbers.filter((_value, index) => index % 2 === 1);
					return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
				};
				const clipMatches = (item, expectedSize) => {
					const expected = [-6 / item.scale, -35 / item.scale, (expectedSize.x - 6) / item.scale, (expectedSize.y - 35) / item.scale];
					return clipBounds(item).every((value, index) => Math.abs(value - expected[index]) <= 1);
				};
				for (const item of before.overflow) {
					assert.ok(clipMatches(item, { x: 138, y: 82 }), `${item.type}の切り抜きが初期矩形138x82と一致していない: ${clipBounds(item)}`);
					assert.ok(before.front.find(({ index }) => index === expected.indexOf(item.type)).z > item.z, `${item.type}の前面兄弟が子より後ろにある`);
				}
				await page.getByRole('button', { name: 'REFLOW ALL', exact: true }).click();
				await page.locator('#yweb-text-root').getByText('REFLOW 1', { exact: true }).waitFor();
				const after = await read();
				const stability = await page.evaluate(() => {
					const current = [...document.querySelectorAll('#yweb-text-root > [data-yweb-uid]')];
					const ids = new Set(current.map((element) => element.id));
					return {
						added: current.filter((element) => !globalThis.__ywebContainerElements.has(element.id)).map((element) => element.id),
						replaced: current.filter((element) => globalThis.__ywebContainerElements.has(element.id) && globalThis.__ywebContainerElements.get(element.id) !== element).map((element) => element.id),
						removed: [...globalThis.__ywebContainerElements.keys()].filter((id) => !ids.has(id)),
					};
				});
				assert.deepEqual(stability.replaced, [], `再配置で同じUIDの描画DOMを再生成している: ${JSON.stringify(stability)}`);
				assert.ok(after.clippedBoxes >= expected.length, '再配置後に色面の切り抜きを失っている');
				assert.ok(after.gradients.every(({ box, transform }) => transform.startsWith('matrix(') && box.x >= 478 && box.y >= 12 && box.right <= 624 && box.bottom <= 100), '再配置直後にColorPickerの内部色面がContainer範囲から漏れている');
				for (const item of before.overflow) {
					const resized = after.overflow.find(({ type }) => type === item.type);
					assert.ok(clipMatches(resized, { x: 146, y: 88 }), `${item.type}の切り抜きが再配置矩形146x88と一致していない: ${clipBounds(resized)}`);
				}
				await page.screenshot({ path: path.join(work, 'browser-container_overflow-reflow.png') });
			}
			if (name === 'input_3d') {
				const line3d = page.getByPlaceholder('3D LINE', { exact: true });
				const area3d = page.getByPlaceholder('3D AREA', { exact: true });
				const line2d = page.getByPlaceholder('2D LINE', { exact: true });
				const area2d = page.getByPlaceholder('2D AREA', { exact: true });
				const projected = await line3d.evaluate((element) => ({ transform: element.style.transform, pointer: getComputedStyle(element).pointerEvents, projected: element.dataset.ywebProjected }));
				assert.ok(projected.transform.startsWith('matrix3d(') && projected.pointer === 'auto' && projected.projected === '1', '3D入力をmatrix3d上の操作可能DOMへ射影していない');
				assert.ok((await line2d.getAttribute('style')).includes('matrix('), '2D入力の確定行列を失っている');

				await line3d.fill('alpha');
				await area3d.fill('one\ntwo');
				await page.locator('#yweb-text-root').getByText('3D VALUE:alpha|one/two|0|set0', { exact: true }).waitFor();
				const button3d = page.getByRole('button', { name: 'APPLY 3D', exact: true });
				assert.equal(await button3d.evaluate((element) => element.tagName), 'BUTTON', '3D Button文字の上がnative buttonになっていない');
				await button3d.click();
				await page.locator('#yweb-text-root').getByText('3D VALUE:alpha|one/two|1|set0', { exact: true }).waitFor();

				await line2d.fill('beta');
				await area2d.fill('left\nright');
				await page.locator('#yweb-text-root').getByText('2D VALUE:beta|left/right|0|set0', { exact: true }).waitFor();
				const button2d = page.getByRole('button', { name: 'APPLY 2D', exact: true });
				assert.equal(await button2d.evaluate((element) => element.tagName), 'BUTTON', '2D Button文字の上がnative buttonになっていない');
				await button2d.click();
				await page.locator('#yweb-text-root').getByText('2D VALUE:beta|left/right|1|set0', { exact: true }).waitFor();
				assert.deepEqual(await Promise.all([line3d.inputValue(), area3d.inputValue(), line2d.inputValue(), area2d.inputValue()]), ['alpha', 'one\ntwo', 'beta', 'left\nright'], 'Godotへ渡した入力値をDOM表示へ戻せていない');
				await page.screenshot({ path: path.join(work, 'browser-input_3d-filled.png') });
			}
			if (name === 'code_edit') {
				const editors = page.locator('textarea[data-yweb-code-input]');
				const wrappers = page.locator('div[data-yweb-kind="CodeEdit"][data-yweb-text]');
				await editors.first().waitFor();
				assert.equal(await editors.count(), 2, '上下二つのCodeEditを同じ白背景画面へ置いていない');
				const editor = editors.nth(0);
				const wrapper = wrappers.nth(0);
				const miniWrapper = wrappers.nth(1);
				const editorUid = await wrapper.getAttribute('data-yweb-uid');
				const miniUid = await miniWrapper.getAttribute('data-yweb-uid');
				const miniInput = page.locator(`textarea[data-yweb-uid="${miniUid}-input"]`);
				const miniOwner = page.locator(`div[data-yweb-uid="${miniUid}"]`);
				const initial = await wrapper.evaluate((element) => {
					const input = element.querySelector('textarea');
					const rows = [...element.querySelectorAll('[data-yweb-code-line]')];
					globalThis.__ywebCodeRefs = { wrapper: element, input, rows: new Map(rows.map((row) => [row.dataset.ywebCodeLine, row])) };
					return {
						tag: element.tagName, input: input?.tagName, layer: element.querySelector('[data-yweb-code-layer]')?.tagName,
						kind: input?.dataset.ywebKind, rows: rows.length, numbers: rows.map((row) => row.querySelector('[data-yweb-code-number]')?.textContent),
						text: rows.map((row) => row.querySelector('code')?.textContent), colors: [...new Set([...element.querySelectorAll('code span')].map((span) => getComputedStyle(span).color))],
						guides: element.querySelectorAll('[data-yweb-column]').length, fill: getComputedStyle(input).webkitTextFillColor,
						scrollable: input.scrollHeight > input.clientHeight, value: input.value,
					};
				});
				assert.deepEqual([initial.tag, initial.input, initial.layer, initial.kind], ['DIV', 'TEXTAREA', 'PRE', 'CodeEdit'], 'CodeEditの表示層と入力層を二層DOMにできていない');
				assert.ok(initial.rows >= 6 && initial.rows < 36, `CodeEditを可視行へ絞れていない: ${initial.rows}`);
				assert.ok(initial.text.includes('extends Node') && initial.text.includes('# 白背景の日本語コメント'), 'CodeEditの可視本文を構文DOMへ置けていない');
				assert.ok(initial.colors.length >= 4, `SyntaxHighlighterの色区分が不足: ${initial.colors}`);
				assert.ok(initial.numbers.some((value) => value.endsWith('001')) && initial.guides === 2, '行番号または行長guideを表示していない');
				assert.equal(initial.fill, 'rgba(0, 0, 0, 0)', '確定時のtextarea文字が構文DOMへ重なっている');
				assert.ok(initial.scrollable && initial.value.includes('var value_29 := 29'), 'CodeEdit全文をnative textareaへ保持していない');

				const options = await miniWrapper.evaluate((element) => {
					const input = element.ywebInput;
					const rows = [...element.querySelectorAll('[data-yweb-code-line]')];
					const current = rows.find((row) => row.dataset.ywebCodeLine === '0');
					const box = document.querySelector(`[data-yweb-box="${element.dataset.ywebUid}-box"]`);
					const minimap = element.ywebMinimap;
					globalThis.__ywebMiniRefs = {
						minimap,
						rows: new Map([...minimap.ywebRows]),
						blocks: new Map([...minimap.ywebRows].map(([key, row]) => [key, [...row.children]])),
					};
					return {
						indent: input.dataset.ywebIndent, tab: input.style.tabSize,
						numbers: rows.map((row) => row.querySelector('[data-yweb-code-number]').textContent),
						numberColor: getComputedStyle(rows[0].querySelector('[data-yweb-code-number]')).color,
						syntax: [...new Set([...element.querySelectorAll('code span')].map((span) => getComputedStyle(span).color))],
						folds: [...element.querySelectorAll('[data-yweb-code-fold]')].filter((mark) => mark.textContent).length,
						breakpoints: [...element.querySelectorAll('[data-yweb-code-breakpoint]')].filter((mark) => mark.textContent).map((mark) => getComputedStyle(mark).color),
						guides: [...element.querySelectorAll('[data-yweb-column]')].map((guide) => ({ column: guide.dataset.ywebColumn, color: getComputedStyle(guide).borderLeftColor, opacity: getComputedStyle(guide).opacity })),
						current: getComputedStyle(current).backgroundColor,
						panel: box ? [getComputedStyle(box).backgroundColor, getComputedStyle(box).borderColor, box.getBoundingClientRect().width, box.getBoundingClientRect().height] : [],
						scroll: element.ywebBar ? [element.ywebBar.getBoundingClientRect().width, element.ywebBar.getBoundingClientRect().height] : [],
						caret: getComputedStyle(element).getPropertyValue('--yweb-caret').trim(), selection: getComputedStyle(element).getPropertyValue('--yweb-selection').trim(),
						minimap: minimap ? { box: minimap.getBoundingClientRect().toJSON(), total: Number(minimap.dataset.ywebMinimapTotal), rows: minimap.ywebRows.size, blocks: minimap.querySelectorAll('[data-yweb-minimap-line] > i').length, text: minimap.textContent, viewport: minimap.ywebViewport.getBoundingClientRect().height } : null,
					};
				});
				assert.equal(options.indent, '\t', '下段CodeEditのtab indentを反映していない');
				assert.equal(options.tab, '8', '下段CodeEditのtab幅を反映していない');
				assert.ok(options.numbers.includes('  1') && options.folds === 0, `空白埋め行番号またはfold gutter無効を反映していない: ${JSON.stringify(options)}`);
				assert.equal(options.numberColor, 'rgb(71, 85, 105)', '下段CodeEditの行番号色を反映していない');
				assert.ok(options.syntax.includes('rgb(4, 120, 87)') && options.syntax.includes('rgb(126, 34, 206)'), '下段CodeEditの構文色を反映していない');
				assert.deepEqual(options.breakpoints, ['rgb(220, 38, 38)'], 'breakpointとTheme色を反映していない');
				assert.deepEqual(options.guides, [{ column: '24', color: 'rgb(203, 213, 225)', opacity: '1' }], '下段CodeEditの行長guideを反映していない');
				assert.equal(options.current, 'rgba(0, 0, 0, 0)', '現在行highlight無効を反映していない');
				assert.deepEqual(options.panel, ['rgb(255, 255, 255)', 'rgb(203, 213, 225)', 736, 238], '下段CodeEditの白Themeまたは比較領域が違う');
				assert.deepEqual(options.scroll, [8, 214], '下段CodeEdit内蔵scrollbarの確定範囲を表示していない');
				assert.deepEqual([options.caret, options.selection], ['#0f172aff', '#bfdbfeff'], '下段CodeEditのcaretまたは選択色を反映していない');
				assert.ok(options.minimap && options.minimap.total === 206 && options.minimap.rows === 74 && options.minimap.blocks >= 140 && options.minimap.text === '', `minimapを文字でなく表示範囲の色矩形へ展開していない: ${JSON.stringify(options.minimap)}`);
				assert.ok(Math.abs(options.minimap.box.x - 650) <= 1 && Math.abs(options.minimap.box.y - 286) <= 1 && options.minimap.box.width === 110 && options.minimap.box.height >= 210, `minimapをGodot確定範囲へ置いていない: ${JSON.stringify(options.minimap)}`);

				// Browser scrollで表示行を入れ替え、編集本文とNode DOMを作り直さない。
				await editor.evaluate((input) => {
					input.scrollTop = 220;
					input.dispatchEvent(new Event('scroll', { bubbles: true }));
				});
				await page.waitForFunction((uid) => {
					const owner = document.querySelector(`[data-yweb-uid="${uid}"]`);
					const lines = [...owner.querySelectorAll('[data-yweb-code-line]')].map((row) => Number(row.dataset.ywebCodeLine));
					return lines.length > 0 && Math.min(...lines) > 0;
				}, await wrapper.getAttribute('data-yweb-uid'));
				await page.locator('#yweb-text-root').getByText(/^CHANGES 0 /).waitFor();
				await editor.evaluate((input) => {
					input.scrollTop = 0;
					input.dispatchEvent(new Event('scroll', { bubbles: true }));
				});

				const japanese = 'func greet():\n    # 日本語のコメントを確定\n    print("こんにちは😀")';
				await editor.focus();
				await editor.evaluate((input, value) => {
					input.setSelectionRange(0, input.value.length);
					input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
					input.value = value;
					input.setSelectionRange(value.length, value.length);
					input.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: '日本語のコメントを確定' }));
					input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: '日本語のコメントを確定', isComposing: true }));
				}, japanese);
				await page.waitForTimeout(40);
				await page.locator('#yweb-text-root').getByText(/^CHANGES 0 /).waitFor();
				assert.deepEqual(await editor.evaluate((input) => [getComputedStyle(input).webkitTextFillColor, input.ywebOwner.ywebLayer.style.visibility]), ['rgb(23, 32, 51)', 'hidden'], 'IME変換中の平文表示へ切り替えていない');

				// compositionend後にinputが来る順でも、確定文章を一回にまとめる。
				await editor.evaluate((input) => {
					input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本語のコメントを確定' }));
					input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromComposition', data: '日本語のコメントを確定' }));
				});
				await page.locator('#yweb-text-root').getByText('CHANGES 1 LINES 3 COMMENT     # 日本語のコメントを確定', { exact: true }).waitFor();
				await page.waitForFunction(() => [...document.querySelectorAll('[data-yweb-code-text]')].some((row) => row.textContent.includes('日本語のコメントを確定')));
				assert.equal(await editor.evaluate((input) => getComputedStyle(input).webkitTextFillColor), 'rgba(0, 0, 0, 0)', 'IME確定後に平文層が残っている');
				assert.equal(await wrapper.locator('[data-yweb-code-layer]').evaluate((layer) => layer.style.visibility), 'visible', 'IME確定後に構文層が戻っていない');

				// 貼り付け相当の文章入力とCodeEditの空白indentを全文同期へ流す。
				await editor.evaluate((input) => {
					input.value += '\n# 貼り付け文章';
					input.setSelectionRange(input.value.length, input.value.length);
					input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: '# 貼り付け文章' }));
				});
				await page.locator('#yweb-text-root').getByText('CHANGES 2 LINES 4 COMMENT     # 日本語のコメントを確定', { exact: true }).waitFor();
				await editor.press('Tab');
				await page.locator('#yweb-text-root').getByText('CHANGES 3 LINES 4 COMMENT     # 日本語のコメントを確定', { exact: true }).waitFor();
				assert.ok((await editor.inputValue()).endsWith('    '), 'CodeEditのspaces indentをBrowser Tabへ反映していない');

				const stable = await wrapper.evaluate((element) => ({
					wrapper: globalThis.__ywebCodeRefs.wrapper === element,
					input: globalThis.__ywebCodeRefs.input === element.querySelector('textarea'),
					connected: globalThis.__ywebCodeRefs.wrapper.isConnected && globalThis.__ywebCodeRefs.input.isConnected,
					value: element.querySelector('textarea').value,
				}));
				assert.deepEqual({ wrapper: stable.wrapper, input: stable.input, connected: stable.connected }, { wrapper: true, input: true, connected: true }, 'CodeEditのNode UID DOMを入力やscrollで再生成している');

				// 下段のTab設定とminimap clickをBrowserからGodotへ往復させる。
				await miniInput.focus();
				await page.waitForFunction(({ uid, value }) => {
					const owner = document.querySelector(`div[data-yweb-uid="${uid}"]`);
					return owner && owner !== globalThis.__ywebCodeRefs.wrapper && owner.querySelector('textarea')?.value === value;
				}, { uid: editorUid, value: stable.value });
				await page.waitForFunction((uid) => [...document.querySelectorAll(`[data-yweb-uid="${uid}"] [data-yweb-code-text] span`)].some((span) => span.textContent === 'extends' && getComputedStyle(span).color === 'rgb(234, 88, 12)'), miniUid);
				await miniInput.evaluate((input) => input.setSelectionRange(0, 0));
				await miniInput.press('Tab');
				await page.locator('#yweb-text-root').getByText('MINIMAP FIRST 0 TAB 1', { exact: true }).waitFor();
				assert.ok((await miniInput.inputValue()).startsWith('\t'), '下段CodeEditのTab入力をGodotへ返していない');
				const minimap = page.locator('[data-yweb-code-minimap]');
				const miniBox = await minimap.boundingBox();
				await page.mouse.move(miniBox.x + miniBox.width / 2, miniBox.y + miniBox.height * 0.2);
				await page.mouse.down();
				assert.equal(await minimap.evaluate((element) => getComputedStyle(element.ywebViewport).backgroundColor), 'rgba(15, 23, 42, 0.25)', 'minimap drag中のTheme表示へ切り替えていない');
				await page.mouse.move(miniBox.x + miniBox.width / 2, miniBox.y + miniBox.height * 0.82);
				await page.mouse.up();
				await page.locator('#yweb-text-root').getByText(/^MINIMAP FIRST ([1-9]|[1-9][0-9]+) TAB 1$/).waitFor();
				const miniMoved = await miniOwner.evaluate((element) => {
					const previous = globalThis.__ywebMiniRefs;
					const rows = element.ywebMinimap.ywebRows;
					const lines = [...rows.values()].map((row) => Number(row.dataset.ywebMinimapLine));
					return {
						scroll: element.ywebInput.scrollTop,
						viewport: element.ywebMinimap.ywebViewport.offsetTop,
						stable: previous.minimap === element.ywebMinimap && [...previous.rows].every(([key, row]) => rows.get(key) === row && row.isConnected),
						blocks: [...previous.blocks].every(([key, old]) => {
							const current = [...rows.get(key).children];
							return old.every((block, index) => current[index] === block && block.isConnected);
						}),
						rows: rows.size,
						first: Math.min(...lines),
					};
				});
				assert.ok(miniMoved.scroll > 0 && miniMoved.viewport > 0 && miniMoved.stable && miniMoved.blocks && miniMoved.rows === 74 && miniMoved.first >= 74, `minimap操作、表示行上限、全描画DOM再利用が成立していない: ${JSON.stringify(miniMoved)}`);
				await page.screenshot({ path: path.join(work, 'browser-code_edit-ime.png') });
			}
			if (name === 'canvas_inputs') {
				await exerciseUi(page, 'dom-canvas_inputs');
				ui.push('dom');
				await page.close();
				continue; // 操作fixtureは画素比較画面へ混ぜず、signal往復を独立判定する。
			}
			if (name === 'hover_scroll') {
				await exerciseHover(page, 'dom-hover_scroll');
				ui.push('hover');
				await page.close();
				continue; // hover fixtureはBrowser scrollとsignal往復へ専念する。
			}
			if (!comparedScreens.includes(name)) {
				await page.close();
				continue; // 副作用型は生成一覧の構造検査で判定し、描画先のないNodeを画素値へ混ぜない。
			}
			if (!shotBeforeInteraction) await page.screenshot({ path: shot });
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

			// Popup系は他のWindow差分から切り離し、各部品が上限を満たすことを保証する。
			if (name === 'windows_media') {
				for (const [part, x, y, width, height] of [['PopupMenu', 544, 52, 212, 182], ['PopupPanel', 544, 284, 212, 142]]) {
					const referenceCrop = path.join(work, `flat-godot-${part}.png`);
					const comparedCrop = path.join(work, `flat-browser-${part}.png`);
					child.execFileSync('magick', [reference, '-crop', `${width}x${height}+${x}+${y}`, '+repage', referenceCrop]);
					child.execFileSync('magick', [compared, '-crop', `${width}x${height}+${x}+${y}`, '+repage', comparedCrop]);
					const partMeasure = child.spawnSync('magick', ['compare', '-metric', 'RMSE', referenceCrop, comparedCrop, path.join(work, `diff-${part}.png`)], { encoding: 'utf8' });
					const partMatched = /\(([0-9.eE+-]+)\)/.exec(partMeasure.stderr || '');
					assert.ok(partMatched, `RMSEを測れない: ${part} ${partMeasure.stderr}`);
					regions[part] = Number((Number(partMatched[1]) * 255).toFixed(4));
					assert.ok(regions[part] < limit, `${part}の差が大きい: ${regions[part]}`);
				}
			}
			// 同一フォントの実画素範囲を行単位で測り、縦横のずれを数値へ残す。
			if (name === 'font_metrics') {
				for (const [index, size] of [10, 12, 14, 16, 18, 20, 24, 32, 48].entries()) {
					const rowReference = path.join(work, `flat-godot-font-${size}.png`);
					const rowCompared = path.join(work, `flat-browser-font-${size}.png`);
					const crop = `800x64+0+${index * 64}`;
					child.execFileSync('magick', [reference, '-crop', crop, '+repage', rowReference]);
					child.execFileSync('magick', [compared, '-crop', crop, '+repage', rowCompared]);
					const bounds = (file) => child.execFileSync('magick', [file, '-trim', '-format', '%X,%Y,%w,%h', 'info:'], { encoding: 'utf8' }).trim();
					const rowMeasure = child.spawnSync('magick', ['compare', '-metric', 'RMSE', rowReference, rowCompared, path.join(work, `diff-font-${size}.png`)], { encoding: 'utf8' });
					const rowMatched = /\(([0-9.eE+-]+)\)/.exec(rowMeasure.stderr || '');
					assert.ok(rowMatched, `RMSEを測れない: font ${size} ${rowMeasure.stderr}`);
					fontRows[size] = { godot: bounds(rowReference), browser: bounds(rowCompared), rmse: Number((Number(rowMatched[1]) * 255).toFixed(4)) };
				}
				const values = Object.values(fontRows).map(({ godot, browser }) => ({ godot: godot.split(',').map(Number), browser: browser.split(',').map(Number) }));
				assert.ok(values.every(({ godot, browser }) => Math.abs(godot[0] - browser[0]) <= 1 && Math.abs(godot[1] - browser[1]) <= 1), 'Label字形の左端または上端が1pxを超えてずれている');
				assert.ok(values.every(({ godot, browser }) => Math.abs(godot[2] - browser[2]) <= 1 && Math.abs(godot[3] - browser[3]) <= 1), 'Label字形の横幅または縦幅が1pxを超えてずれている');
			}
		}
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}

	// 画面ごとに上限を当てる。平均では、良い画面が悪い画面を隠してしまう。
	const over = Object.entries(measured).filter(([, value]) => value >= limit);
	if (screens.includes('canvas_inputs')) assert.ok(ui.includes('dom'), 'DOM onlyのBrowser UI操作を完走していない');
	if (screens.includes('hover_scroll')) assert.ok(ui.includes('hover'), 'DOM onlyのhover操作を完走していない');
	fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ unit: 'RGB 0..255', measured, regions, fontRows, limit, ui }, null, 2)}\n`);
	console.log(JSON.stringify({ structural: true, ui, rmseOk: over.length === 0, unit: 'RGB 0..255', measured, regions, fontRows, limit }));
	if (!structureOnly) assert.deepEqual(over, [], `Godot画面との差が大きい: ${over.map(([name, value]) => `${name} ${value}`).join(', ')}`);
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
