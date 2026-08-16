// metadataなしの標準フォーム、複数項目Control、Canvas継続をBrowserで一括検査する。
// Browserのcomposition確定値とGodot modelを往復させ、IMEを使える実DOMを保証する。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { ensure } = require('../build/fetch_webfont.cjs');

const root = require('./site.cjs').ensure(path.resolve(__dirname, '../examples/form_controls'), path.resolve(__dirname, '../tmp/form-controls/site')); // 検査対象site。
const out = path.resolve(__dirname, '../tmp/form-controls'); // 数値結果と画面画像。
const { browserPath } = require('./browser.cjs'); // 導入済みplaywright-coreの固定Chromium。
const delayedFont = ensure().woff2; // 遅延読込で幅補正を検査するfont。
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream' }; // Web起動に必要な応答型。

// 成果物だけを公開する短命server。
function serve() {
	return http.createServer((request, response) => {
		if (request.url === '/delayed-font.woff2') {
			setTimeout(() => {
				response.writeHead(200, { 'content-type': 'font/woff2' });
				fs.createReadStream(delayedFont).pipe(response);
			}, 400);
			return;
		}
		const name = request.url === '/' ? 'index.html' : request.url.slice(1).split('?')[0];
		const file = path.resolve(root, name);
		if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
			response.writeHead(404).end();
			return;
		}
		response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
		fs.createReadStream(file).pipe(response);
	});
}

// compositionを伴うBrowser確定入力を実DOMへ発生させる。
async function compose(page, selector, value) {
	await page.locator(selector).focus();
	await page.locator(selector).evaluate((node, text) => {
		node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
		node.value = text;
		node.setSelectionRange(text.length, text.length);
		node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', data: text, isComposing: true }));
		node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
	}, value);
}

// 390px幅の一画面で入力と標準Control文字を検査する。
(async () => {
	fs.mkdirSync(out, { recursive: true });
	const server = serve();
	let browser;
	const errors = [];
	try {
		await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
		browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
		const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
		const page = await context.newPage();
		page.setDefaultTimeout(12000);
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => document.querySelector('[data-gdweb-kind="LineEdit"]') && document.querySelector('[data-gdweb-kind="TextEdit"]'));

		const inventory = await page.evaluate(() => {
			const nodes = [...document.querySelectorAll('[data-gdweb-text]')];
			return {
				config: globalThis.GDWEB_TEXT_CONFIG,
				texts: nodes.map((node) => node.textContent || node.value),
				kinds: nodes.reduce((map, node) => ({ ...map, [node.dataset.gdwebKind]: (map[node.dataset.gdwebKind] || 0) + 1 }), {}),
				forms: nodes.filter((node) => ['INPUT', 'TEXTAREA'].includes(node.tagName)).map((node) => ({ tag: node.tagName, kind: node.dataset.gdwebKind, placeholder: node.placeholder, font: getComputedStyle(node).fontFamily, marked: node.hasAttribute('data-gdweb-text') })),
				webgl2: !!document.querySelector('canvas').getContext('webgl2'),
				canvas: document.querySelector('canvas').getBoundingClientRect().toJSON(),
			};
		});
		assert.equal(inventory.config.avoidCanvasThemeFont, true, 'Canvas Theme font回避の既定値');
		assert.ok(inventory.forms.some((item) => item.tag === 'INPUT' && item.placeholder === '日本語を入力'), 'LineEdit inputなし');
		assert.ok(inventory.forms.some((item) => item.tag === 'TEXTAREA' && item.placeholder === '複数行の日本語を入力'), 'TextEdit textareaなし');
		assert.ok(inventory.forms.every((item) => item.marked && item.font.includes('sans-serif')), 'Web fontなしのBrowser標準font');
		assert.equal(inventory.webgl2, true, 'Canvas WebGL2が停止');
		assert.equal(inventory.canvas.width, 390, 'Canvas表示幅');
		assert.ok(inventory.kinds.LineEdit >= 1, `LineEdit数: ${inventory.kinds.LineEdit}`);
		assert.ok(inventory.kinds.TextEdit >= 1, `TextEdit数: ${inventory.kinds.TextEdit}`);
		assert.ok(inventory.kinds.ControlText >= 10, `標準Control文字数: ${inventory.kinds.ControlText}`);
		for (const text of ['ホーム', '設定', '情報', 'りんご', 'おもち', 'お茶', '日本語ツリー', '子項目', '折りたたみ見出し', '64%', '省略表示のDOM代替文字']) {
			assert.ok(inventory.texts.includes(text), `DOM文字なし: ${text}`);
		}

		// 一行と複数行のIME確定値をGodot modelへ戻す。
		await compose(page, 'input[placeholder="日本語を入力"]', '日本語😀入力');
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-kind="Label"]')].some((node) => node.textContent === 'LINE:日本語😀入力:6:1:日本語😀入力'));
		await compose(page, 'textarea[placeholder="複数行の日本語を入力"]', '一行目\n二行目');
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-kind="Label"]')].some((node) => node.textContent === 'AREA:一行目|二行目:1:3'));
		const area = await page.locator('textarea[placeholder="複数行の日本語を入力"]').evaluate((node) => ({ value: node.value, wrap: node.wrap, whiteSpace: getComputedStyle(node).whiteSpace }));
		assert.deepEqual(area, { value: '一行目\n二行目', wrap: 'soft', whiteSpace: 'pre-wrap' });
		await page.locator('input[placeholder="日本語を入力"]').evaluate((node) => {
			node.value = '';
			node.setSelectionRange(0, 0);
			node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
		});
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-kind="Label"]')].some((node) => node.textContent === 'LINE::0:2:'));
		await compose(page, 'input[placeholder="日本語を入力"]', '消去対象');
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-kind="Label"]')].some((node) => node.textContent === 'LINE:消去対象:4:3:消去対象'));

		// input外のCanvas領域に残したclear iconを実pointerで操作する。
		const lineBox = await page.locator('input[placeholder="日本語を入力"]').boundingBox();
		assert.ok(lineBox.width < 350, `clear icon領域がDOMに覆われた: ${lineBox.width}`);
		await page.mouse.click(362, 112);
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-kind="Label"]')].some((node) => node.textContent === 'LINE::0:4:'));

		// Canvas経由のButton操作でThemeを変更し、同じ複数項目DOMへ反映する。
		const tabBefore = await page.evaluate(() => {
			const node = [...document.querySelectorAll('[data-gdweb-kind="ControlText"]')].find((item) => item.textContent === 'ホーム');
			return { id: node.id, size: getComputedStyle(node).fontSize, color: getComputedStyle(node).color };
		});
		const itemBefore = await page.evaluate(() => {
			const node = [...document.querySelectorAll('[data-gdweb-kind="ControlText"]')].find((item) => item.textContent === 'りんご');
			return { id: node.id, scale: Number(node.dataset.gdwebTextScale) };
		});
		await page.evaluate(() => {
			const style = document.createElement('style');
			style.textContent = '@font-face{font-family:GDWeb-Delayed;src:url("/delayed-font.woff2") format("woff2");font-display:block}';
			document.head.appendChild(style);
			globalThis.GDWEB_FONT_MAP = new Proxy({}, { get: () => ({ family: 'GDWeb-Delayed' }) });
		});
		await page.mouse.click(195, 704);
		await page.waitForFunction(() => {
			const node = [...document.querySelectorAll('[data-gdweb-kind="ControlText"]')].find((item) => item.textContent === 'ホーム');
			return node && getComputedStyle(node).fontSize === '22px';
		});
		const tabAfter = await page.evaluate(() => {
			const node = [...document.querySelectorAll('[data-gdweb-kind="ControlText"]')].find((item) => item.textContent === 'ホーム');
			return { id: node.id, size: getComputedStyle(node).fontSize, color: getComputedStyle(node).color };
		});
		assert.equal(tabAfter.id, tabBefore.id, 'Theme変更で項目DOMを再生成');
		assert.equal(tabAfter.size, '22px');
		assert.notEqual(tabAfter.color, tabBefore.color);
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-kind="ControlText"]')].some((node) => node.textContent === 'WWWWWWWW'));
		await page.waitForFunction(() => document.fonts.status === 'loading');
		const itemLoading = await page.evaluate(() => {
			const node = [...document.querySelectorAll('[data-gdweb-kind="ControlText"]')].find((item) => item.textContent === 'WWWWWWWW');
			return { scale: Number(node.dataset.gdwebTextScale), local: Number.parseFloat(node.style.width) };
		});
		await page.waitForFunction(() => document.fonts.check('15px GDWeb-Delayed', 'WWWWWWWW'));
		const itemAfter = await page.evaluate(() => {
			const node = [...document.querySelectorAll('[data-gdweb-kind="ControlText"]')].find((item) => item.textContent === 'WWWWWWWW');
			return { id: node.id, scale: Number(node.dataset.gdwebTextScale), width: node.scrollWidth, local: Number.parseFloat(node.style.width) };
		});
		assert.equal(itemAfter.id, itemBefore.id, '文字差替えで項目DOMを再生成');
		assert.equal(itemAfter.local, itemLoading.local, 'Web font読込中にGodot確定幅が変化');
		assert.notEqual(itemAfter.scale, itemLoading.scale, `Web font読込後の幅補正なし: ${JSON.stringify({ itemLoading, itemAfter })}`);
		assert.ok(Math.abs(itemAfter.scale - itemAfter.local / itemAfter.width) < 0.001, `文字差替え後の幅補正値: ${JSON.stringify(itemAfter)}`);

		// Web fontが壊れていてもBrowser標準fontでDOM表示を継続する。
		await page.evaluate(() => {
			const style = document.createElement('style');
			style.textContent = '@font-face{font-family:GDWeb-Missing;src:url("/missing-font.woff2") format("woff2")}';
			document.head.appendChild(style);
			globalThis.GDWEB_FONT_MAP = new Proxy({}, { get: () => ({ family: 'GDWeb-Missing' }) });
		});
		await page.mouse.click(70, 380);
		await page.waitForFunction(() => document.fonts.status === 'loaded');
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		const missingFont = await page.evaluate(() => {
			const node = [...document.querySelectorAll('[data-gdweb-kind="ControlText"]')].find((item) => item.textContent === 'おもち');
			return { dom: !!node, scale: Number(node?.dataset.gdwebTextScale) };
		});
		assert.equal(missingFont.dom, true, 'Web font失敗でDOM文字を削除');
		assert.equal(Number.isFinite(missingFont.scale), true, 'Web font失敗後の幅補正が不正');
		const controlRects = await page.evaluate(() => [...document.querySelectorAll('[data-gdweb-kind="ControlText"]')].map((node) => {
			const box = node.getBoundingClientRect();
			const style = getComputedStyle(node);
			const measure = document.createElement('canvas').getContext('2d');
			measure.font = `${style.fontSize} ${style.fontFamily}`;
			const glyph = measure.measureText(node.textContent); // Browserが実際に描く文字の上下端。
			return { text: node.textContent, box: { x: box.x, y: box.y, width: box.width, height: box.height }, local: { width: Number.parseFloat(node.style.width), height: Number.parseFloat(node.style.height) }, scroll: { width: node.scrollWidth, height: node.scrollHeight }, lineHeight: Number.parseFloat(style.lineHeight), ink: Number((glyph.actualBoundingBoxAscent + glyph.actualBoundingBoxDescent).toFixed(2)), whiteSpace: style.whiteSpace, fontSize: style.fontSize, transform: style.transform };
		}));
		assert.ok(controlRects.every((item) => item.whiteSpace === 'pre'), '標準Control文字が折返された');
		assert.ok(controlRects.every((item) => item.lineHeight === item.local.height), `DOM行ボックスがGodot確定高さと不一致: ${JSON.stringify(controlRects.filter((item) => item.lineHeight !== item.local.height))}`);
		assert.ok(controlRects.every((item) => item.ink <= item.local.height), `標準Control文字が縦にはみ出した: ${JSON.stringify(controlRects.filter((item) => item.ink > item.local.height))}`);
		await page.screenshot({ path: path.join(out, 'form-controls.png') });

		// option無効時だけ再現不能な文字をCanvas標準fontへ戻す。
		await page.evaluate(() => { globalThis.GDWEB_TEXT_CONFIG.avoidCanvasThemeFont = false; });
		await page.setViewportSize({ width: 389, height: 844 });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.waitForFunction(() => ![...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === '省略表示のDOM代替文字'));
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		assert.match(fs.readFileSync(path.join(__dirname, '../build/overlay/platform/web/gdweb_text_sync.cpp'), 'utf8'), /簡易DOM表示へ置き換えます/, '代替warningなし');

		const result = { ok: true, dom: inventory.kinds, forms: inventory.forms, lineClearCanvas: 350 - lineBox.width, lineEvents: 4, theme: { before: tabBefore, after: tabAfter }, itemTextScale: { before: itemBefore, loading: itemLoading, after: itemAfter }, missingFont, controlRects, fallbackOption: true, warningBoundary: true, errors };
		assert.deepEqual(errors, []);
		fs.writeFileSync(path.join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
		console.log(JSON.stringify(result));
		await context.close();
	} finally {
		if (browser) await browser.close().catch(() => {});
		await new Promise((resolve) => server.close(resolve));
	}
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
