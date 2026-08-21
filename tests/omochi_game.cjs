// Omochi捕獲ゲームの意味DOM、連続投下、落下物理、捕獲得点をBrowserで一括検査する。
// 1200物理frame後の状態をPlaywrightで固定し、表示と投下間隔を同じ成果物から観測する。

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { createServer } = require('../build/serve_web.cjs');

const root = path.resolve(__dirname, '..'); // yweb project root。
const project = path.join(root, 'examples/omochi_game'); // 検査対象Godot project。
const site = require('./site.cjs').ensure(path.join(root, 'examples/omochi_game'), path.join(root, 'tmp/omochi-game/site')); // Brotli済みWeb成果物。
const output = path.join(root, 'tmp/omochi-game'); // 数値結果と確認画像の保存先。
const { godot } = require('./godot.cjs'); // 対応版のGodot。
const { browserPath } = require('./browser.cjs'); // 導入済みplaywright-coreの固定Chromium。

// 表示文字を指定して現在の矩形とtransformを返す。
// 追従が終わって横位置が動かなくなるまで待ち、その時の状態を返す。
// 実時間で待つと、機械の速さで追従の途中を読んでしまい、移動量の判定が揺れる。
async function settledAt(page, text) {
	await page.evaluate(() => { globalThis.ywebAt = undefined; globalThis.ywebStill = 0; });
	await page.waitForFunction((value) => {
		const node = [...document.querySelectorAll('[data-yweb-text]')].find((entry) => entry.textContent === value);
		if (!node) return false;
		const now = node.getBoundingClientRect().x;
		globalThis.ywebStill = Math.abs(now - (globalThis.ywebAt ?? Infinity)) < 0.5 ? globalThis.ywebStill + 1 : 0;
		globalThis.ywebAt = now;
		return globalThis.ywebStill >= 5;
	}, text, { timeout: 20000, polling: 'raf' });
	return item(page, text);
}

async function item(page, text) {
	return page.evaluate((value) => {
		const node = [...document.querySelectorAll('[data-yweb-text]')].find((entry) => entry.textContent === value);
		if (!node) return null;
		const box = node.getBoundingClientRect();
		return {
			id: node.id,
			tag: node.tagName,
			kind: node.dataset.ywebKind,
			transform: getComputedStyle(node).transform,
			color: getComputedStyle(node).color,
			fontSize: getComputedStyle(node).fontSize,
			box: { x: box.x, y: box.y, width: box.width, height: box.height },
		};
	}, text);
}

// Headless構造検査後、BrowserでGodou-sanを動かしてOmochiを捕獲する。
(async () => {
	fs.mkdirSync(output, { recursive: true });
	const structure = childProcess.execFileSync(godot, ['--headless', '--path', project, '--script', path.join(root, 'tests/omochi_game_scene.gd')], { encoding: 'utf8' });
	assert.match(structure, /"circle_radius":31/, '丸い当たり判定の構造検査なし');
	let server = null;
	let browser = null;
	const errors = [];
	try {
		server = createServer(site);
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
		const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
		page.setDefaultTimeout(45000);
		page.on('pageerror', (error) => errors.push(error.stack || error.message));
		await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
		try {
			await page.waitForFunction(() => document.querySelector('[data-yweb-kind="LinkButton"]') && document.querySelector('[data-yweb-kind="Button"]'), null, { timeout: 12000 });
		} catch {
			const state = await page.evaluate(() => ({ url: location.href, title: document.title, text: document.body?.innerText || '', status: document.querySelector('#status-notice')?.textContent, labels: [...document.querySelectorAll('[data-yweb-text]')].map((node) => node.textContent) }));
			throw new Error(`Omochi起動失敗: ${JSON.stringify({ state, errors })}`);
		}
		await page.evaluate(() => document.fonts.ready);

		// 意味要素とObjectIDを確認する。
		const godouStart = await item(page, 'Godou-san');
		const omochiStart = await item(page, 'Omochi');
		assert.equal(godouStart.tag, 'A');
		assert.equal(godouStart.kind, 'LinkButton');
		assert.equal(omochiStart.tag, 'BUTTON');
		assert.equal(omochiStart.kind, 'Button');
		assert.match(godouStart.id, /^yweb-text-\d+$/);
		assert.match(omochiStart.id, /^yweb-text-\d+$/);
		assert.equal(await page.locator('[data-yweb-kind="LinkButton"]').getAttribute('href'), 'https://godotengine.org/');
		assert.equal(await page.locator('[data-yweb-kind="LinkButton"]').evaluate((node) => getComputedStyle(node).pointerEvents), 'none', 'LinkButtonがCanvas mouseを遮断');

		// 100物理frameでThemeと日本語を同じDOM IDへ反映する。
		await page.getByText('ゴドウさん', { exact: true }).waitFor();
		await page.getByText('おもち', { exact: true }).first().waitFor();
		const godouJapanese = await item(page, 'ゴドウさん');
		const omochiJapanese = await item(page, 'おもち');
		assert.equal(godouJapanese.id, godouStart.id, 'Theme変更でLinkButton DOMを再生成');
		assert.equal(omochiJapanese.id, omochiStart.id, 'Theme変更でButton DOMを再生成');
		assert.notEqual(godouJapanese.color, godouStart.color, 'LinkButton Theme色が未更新');
		assert.notEqual(godouJapanese.fontSize, godouStart.fontSize, 'LinkButton Theme文字サイズが未更新');
		assert.notEqual(omochiJapanese.color, omochiStart.color, 'Button Theme色が未更新');
		assert.notEqual(omochiJapanese.fontSize, omochiStart.fontSize, 'Button Theme文字サイズが未更新');
		assert.equal(await page.getByText('ゴドウさん × おもちマシン', { exact: true }).count(), 1, '日本語見出しなし');

		// 左右のmouse移動へ同じゴドウさんDOMが追従する。
		await page.mouse.move(130, 590);
		const godouLeft = await settledAt(page, 'ゴドウさん');
		await page.mouse.move(830, 590);
		const godouRight = await settledAt(page, 'ゴドウさん');
		assert.equal(godouLeft.id, godouStart.id, 'ゴドウさんIDが移動で変化');
		assert.equal(godouRight.id, godouStart.id, 'ゴドウさんIDが移動で変化');
		assert.ok(godouRight.box.x - godouLeft.box.x > 550, `ゴドウさん横移動不足: ${godouLeft.box.x} → ${godouRight.box.x}`);
		await page.mouse.click(godouRight.box.x + godouRight.box.width / 2, godouRight.box.y + godouRight.box.height / 2);
		await page.getByText('ゴドウリンク: CLICK', { exact: true }).waitFor();

		// 落下中のOmochi直下へmouseを追従させ、丸いsensorへの捕獲を待つ。
		const yValues = [];
		const transforms = [];
		const deadline = Date.now() + 7000;
		let caught = false;
		while (Date.now() < deadline) {
			const falling = await page.locator('[data-yweb-kind="Button"]').evaluateAll((nodes) => nodes.map((node) => {
				const box = node.getBoundingClientRect();
				return { x: box.x, y: box.y, width: box.width, transform: getComputedStyle(node).transform };
			}));
			if (falling.length) {
				yValues.push(...falling.map((entry) => entry.y));
				transforms.push(...falling.map((entry) => entry.transform));
				const current = falling.reduce((lower, entry) => entry.y > lower.y ? entry : lower);
				await page.mouse.move(current.x + current.width / 2, 590);
			}
			caught = Boolean(await page.getByText(/^捕獲 [1-9]\d*$/).count());
			if (caught && Math.max(...yValues) - Math.min(...yValues) > 180) break;
			await page.waitForTimeout(55);
		}
		assert.equal(caught, true, '丸いsensor捕獲なし');
		await page.getByText(/^捕獲 [1-9]\d*$/).waitFor();
		assert.ok(Math.max(...yValues) - Math.min(...yValues) > 180, 'Omochi落下量不足');
		assert.ok(new Set(transforms).size > 4, 'Omochi物理回転なし');
		const contacts = Number((await page.getByText(/^接触 \d+$/).textContent()).match(/\d+$/)[0]);
		assert.ok(contacts > 0, 'Omochiが坂またはピンへ未接触');
		assert.equal(await page.getByText(/^捕獲 [1-9]\d*$/).count(), 1, '丸いsensor捕獲なし');

		// 1200物理frameまで進め、30 frameにつき1個の投下を確認する。
		await page.waitForFunction(() => {
			const text = [...document.querySelectorAll('[data-yweb-text]')].find((node) => /^投下 \d+ \/ フレーム \d+$/.test(node.textContent))?.textContent;
			return text && Number(text.match(/フレーム (\d+)/)[1]) >= 1200;
		});
		const image = await page.screenshot({ path: path.join(output, 'omochi-japanese-theme.png') });
		const state = await page.evaluate(() => {
			const frameText = [...document.querySelectorAll('[data-yweb-text]')].find((node) => /^投下 \d+ \/ フレーム \d+$/.test(node.textContent)).textContent;
			const ids = [...document.querySelectorAll('[data-yweb-kind="Button"]')].map((node) => node.id);
			// _draw()のdraw_stringで書いた文字が、DOMへ漏れていないかを見る。
			const drawn = document.body.innerText.includes('CANVAS: PHYSICS');
			return { frameText, ids, drawn };
		});
		const [, dropText, frameValue] = state.frameText.match(/^投下 (\d+) \/ フレーム (\d+)$/);
		const dropCount = Number(dropText);
		const frameCount = Number(frameValue);
		assert.ok(frameCount >= 1200, `撮影frame不一致: ${state.frameText}`);
		assert.equal(dropCount, Math.floor(frameCount / 30), `30 frame間隔外: ${state.frameText}`);
		assert.ok(dropCount >= 40, `1200 frame分の投下不足: ${state.frameText}`);
		assert.equal(state.ids.length, dropCount, 'おもちの物理bodyとDOM数が不一致');
		assert.equal(new Set(state.ids).size, dropCount, 'おもちのObjectIDが重複');
		const nextOmochi = await item(page, 'おもち');
		const canvas = await page.locator('canvas').boundingBox();
		assert.ok(nextOmochi.box.x >= canvas.x && nextOmochi.box.x + nextOmochi.box.width <= canvas.x + canvas.width, 'OmochiがCanvas横外へ超過');
		// _draw()の中で描いた文字はGodotの絵のまま。Controlの文字だけがHTMLになる境界を固定する。
		assert.equal(state.drawn, false, '_draw()のdraw_stringがDOMへ出ている');
		assert.ok(image.length > 25000, `確認画像が小さすぎる: ${image.length}`);
		assert.deepEqual(errors, [], `Browser error: ${errors.join(' | ')}`);
		const result = {
			drawStringStaysOnCanvas: !state.drawn,
			ok: true,
			dom: { link: 'A', button: 'BUTTON', objectIds: true },
			mouse: { distance: godouRight.box.x - godouLeft.box.x },
			physics: { circleRadius: 31, machineContacts: contacts, fallDistance: Math.max(...yValues) - Math.min(...yValues), rotationFrames: new Set(transforms).size },
			theme: { frame: 100, sameIds: true, linkColor: godouJapanese.color, linkSize: godouJapanese.fontSize, buttonColor: omochiJapanese.color, buttonSize: omochiJapanese.fontSize },
			game: { linkClicked: true, caught: true, frameCount, dropCount, interval: 30 },
		};
		fs.writeFileSync(path.join(output, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
		console.log(JSON.stringify(result));
	} finally {
		if (browser) await browser.close().catch(() => {});
		if (server) await new Promise((resolve) => server.close(resolve));
	}
})().catch((error) => {
	console.error(error.stack || error);
	process.exitCode = 1;
});
