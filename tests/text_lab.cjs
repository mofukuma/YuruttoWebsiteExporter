// 意味DOMの対応範囲、IME入力、Theme、transform、物理、動的寿命を一括検査する。
// 多数Labelのゲーム更新を含め、Godotの毎frame状態とObjectID対応をBrowserで観測する。
// 設計思想：文字と入力だけをDOMが所有し、背景、icon、物理、ShaderはCanvasへ残す。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');

const root = path.resolve(__dirname, '../tmp/text-lab/site'); // 全機能ラボのWeb成果物。
const out = path.resolve(__dirname, '../tmp/text-lab'); // 数値結果と確認画像の保存先。
const { browserPath } = require('./browser.cjs'); // 導入済みplaywright-coreの固定Chromium。
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm', '.pck': 'application/octet-stream', '.woff2': 'font/woff2' }; // 配信に必要な応答型。

// 成果物だけを公開する検査用配信。
const server = http.createServer((request, response) => {
	const name = request.url === '/' ? 'index.html' : request.url.slice(1).split('?')[0];
	const file = path.resolve(root, name);
	if (!file.startsWith(`${root}${path.sep}`) || !fs.existsSync(file)) {
		response.writeHead(404).end();
		return;
	}
	response.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
	fs.createReadStream(file).pipe(response);
});

// 表示文字を一意に選び、DOM IDと表示状態を返す。
async function item(page, text) {
	return page.evaluate((value) => {
		const node = [...document.querySelectorAll('[data-gdweb-text]')].find((entry) => entry.textContent === value);
		if (!node) return null;
		const box = node.getBoundingClientRect();
		const style = getComputedStyle(node);
		return {
			id: node.id,
			uid: node.dataset.gdwebText,
			kind: node.dataset.gdwebKind,
			box: { x: box.x, y: box.y, width: box.width, height: box.height },
			fontSize: Number.parseFloat(style.fontSize),
			color: style.color,
			stroke: style.webkitTextStroke,
			shadow: style.textShadow,
			decoration: style.textDecorationLine,
			underlineOffset: style.textUnderlineOffset,
			underlineThickness: style.textDecorationThickness,
			transform: style.transform,
			display: style.display,
		};
	}, text);
}

// Control種別から入力要素の値、tag、位置、Theme状態を返す。
async function control(page, kind) {
	return page.evaluate((type) => {
		const node = document.querySelector(`[data-gdweb-kind="${type}"]`);
		if (!node) return null;
		const box = node.getBoundingClientRect();
		const style = getComputedStyle(node);
		return {
			id: node.id,
			tag: node.tagName,
			value: node.value,
			placeholder: node.placeholder,
			maxLength: node.maxLength,
			logicalMaxLength: Number(node.dataset.gdwebMaxLength || 0),
			selectionStart: node.selectionStart,
			selectionEnd: node.selectionEnd,
			fontSize: Number.parseFloat(style.fontSize),
			color: style.color,
			placeholderColor: getComputedStyle(node, '::placeholder').color,
			scroll: { left: node.scrollLeft, top: node.scrollTop, height: node.scrollHeight, clientHeight: node.clientHeight },
			focused: document.activeElement === node,
			box: { x: box.x, y: box.y, width: box.width, height: box.height },
		};
	}, kind);
}

// 動く文字の位置とIDを連続採取する。
async function samples(page, text, count, gap) {
	const values = [];
	for (let index = 0; index < count; index++) {
		values.push(await item(page, text));
		await page.waitForTimeout(gap);
	}
	return values;
}

// 確認画像の指定範囲からCanvas Shader固有色の画素数を数える。
async function cyanPixels(page, image, rect) {
	return page.evaluate(async ({ source, area }) => {
		const blob = await (await fetch(`data:image/png;base64,${source}`)).blob();
		const bitmap = await createImageBitmap(blob);
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const context = canvas.getContext('2d');
		context.drawImage(bitmap, 0, 0);
		const scale = devicePixelRatio;
		const data = context.getImageData(area.x * scale, area.y * scale, area.width * scale, area.height * scale).data;
		let count = 0;
		for (let index = 0; index < data.length; index += 4) {
			if (data[index] < 50 && data[index + 1] > 180 && data[index + 2] > 200 && data[index + 3] > 200) count++;
		}
		return count;
	}, { source: image.toString('base64'), area: rect });
}

// 100件超の文字を動かす一画面で全境界をまとめて確認する。
(async () => {
	fs.mkdirSync(out, { recursive: true });
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	const browserErrors = [];
	try {
		const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
		const page = await context.newPage();
		page.setDefaultTimeout(12000);
		page.on('pageerror', (error) => browserErrors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => document.querySelectorAll('[data-gdweb-text]').length >= 114);
		await page.evaluate(() => document.fonts.ready);

		// ObjectID、Control種別、DOM所有範囲を棚卸しする。
		const inventory = await page.evaluate(() => {
			const nodes = [...document.querySelectorAll('[data-gdweb-text]')];
			const kinds = nodes.reduce((groups, node) => {
				const key = node.dataset.gdwebKind;
				(groups[key] ||= []).push(node);
				return groups;
			}, {});
			const canvas = document.querySelector('canvas').getBoundingClientRect();
			const visible = nodes.filter((node) => getComputedStyle(node).display !== 'none').map((node) => node.getBoundingClientRect());
			return {
				count: nodes.length,
				kinds: Object.fromEntries(Object.entries(kinds).map(([key, values]) => [key, values.length])),
				ids: nodes.map((node) => ({ id: node.id, uid: node.dataset.gdwebText, kind: node.dataset.gdwebKind, tag: node.tagName })),
				texts: nodes.map((node) => node.textContent),
				canvas: { left: canvas.left, top: canvas.top, right: canvas.right, bottom: canvas.bottom },
				bounds: {
					left: Math.min(...visible.map((box) => box.left)),
					right: Math.max(...visible.map((box) => box.right)),
					top: Math.min(...visible.map((box) => box.top)),
					bottom: Math.max(...visible.map((box) => box.bottom)),
				},
			};
		});
		assert.ok(inventory.kinds.Label >= 114, `Label数: ${inventory.kinds.Label}`);
		assert.equal(inventory.kinds.Button, 6, `Button数: ${inventory.kinds.Button}`);
		assert.equal(inventory.kinds.LinkButton, 1, `LinkButton数: ${inventory.kinds.LinkButton}`);
		assert.equal(inventory.kinds.LineEdit, 1, `LineEdit数: ${inventory.kinds.LineEdit}`);
		assert.equal(inventory.kinds.TextEdit, 1, `TextEdit数: ${inventory.kinds.TextEdit}`);
		assert.equal(new Set(inventory.ids.map((entry) => entry.id)).size, inventory.count, 'DOM IDが重複');
		const expectedTags = { Label: 'SPAN', Button: 'BUTTON', LinkButton: 'A', LineEdit: 'INPUT', TextEdit: 'TEXTAREA' };
		for (const entry of inventory.ids) {
			assert.equal(entry.tag, expectedTags[entry.kind], `${entry.kind}のtag: ${entry.tag}`);
			assert.match(entry.id, /^gdweb-text-\d+$/, `ObjectID形式: ${entry.id}`);
			assert.equal(entry.id, `gdweb-text-${entry.uid}`, `IDとObjectID不一致: ${entry.id}`);
		}
		for (const fallback of ['CLIPPED FALLBACK LONG', 'MATERIAL FALLBACK', 'ELLIPSIS FALLBACK LONG', 'THEME FONT FALLBACK']) {
			assert.equal(inventory.texts.includes(fallback), true, `${fallback}の簡易DOM代替なし`);
		}
		assert.equal(inventory.texts.includes('CANVAS ONLY'), false, '明示Canvas指定がDOM化された');
		assert.ok(inventory.bounds.left >= inventory.canvas.left - 1, `左超過: ${inventory.canvas.left - inventory.bounds.left}`);
		assert.ok(inventory.bounds.right <= inventory.canvas.right + 1, `右超過: ${inventory.bounds.right - inventory.canvas.right}`);
		assert.ok(inventory.bounds.top >= inventory.canvas.top - 1, `上超過: ${inventory.canvas.top - inventory.bounds.top}`);
		assert.ok(inventory.bounds.bottom <= inventory.canvas.bottom + 1, `下超過: ${inventory.bounds.bottom - inventory.canvas.bottom}`);

		// ButtonはControl全体でなく、Godotが確定した文字矩形だけを所有する。
		const buttonBefore = await item(page, 'THEME OVERRIDE');
		const inheritedLabelBefore = await item(page, 'INHERITED THEME');
		const inheritedButtonBefore = await item(page, 'INHERITED BUTTON');
		const linkInitial = await item(page, 'LINK BUTTON');
		const lineBefore = await control(page, 'LineEdit');
		const areaBefore = await control(page, 'TextEdit');
		assert.equal(buttonBefore?.kind, 'Button');
		assert.equal(lineBefore?.tag, 'INPUT');
		assert.equal(areaBefore?.tag, 'TEXTAREA');
		assert.equal(lineBefore.placeholder, '日本語 IME');
		assert.equal(areaBefore.placeholder, '複数行 IME');
		assert.equal(lineBefore.maxLength, 48, 'UTF-16側の安全な上限');
		assert.equal(lineBefore.logicalMaxLength, 24, 'GodotのUnicode文字上限');
		assert.equal(lineBefore.placeholderColor, 'rgba(135, 146, 168, 0.6)', `LineEdit placeholder色: ${lineBefore.placeholderColor}`);
		assert.equal(areaBefore.placeholderColor, 'rgba(0, 229, 255, 0.6)', `TextEdit placeholder色: ${areaBefore.placeholderColor}`);
		assert.ok(buttonBefore.box.width < 230 && buttonBefore.box.height < 54, `Button全体をDOM化: ${JSON.stringify(buttonBefore.box)}`);
		assert.ok(buttonBefore.box.x >= 32 && buttonBefore.box.x + buttonBefore.box.width <= 262, 'Button文字が背景外');

		// Canvas入力でTheme Resourceと局所overrideを変え、同じObjectIDへ反映する。
		const themeBefore = await item(page, 'THEME TARGET 24');
		assert.notEqual(themeBefore.shadow, 'none', 'Label shadow未反映');
		const buttonCenter = { x: buttonBefore.box.x + buttonBefore.box.width / 2, y: buttonBefore.box.y + buttonBefore.box.height / 2 };
		await page.mouse.move(buttonCenter.x, buttonCenter.y);
		await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
		const hovered = await item(page, 'THEME OVERRIDE');
		assert.notEqual(hovered.color, buttonBefore.color, 'Button hover色が未反映');
		await page.mouse.down();
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'BUTTON MODEL:DOWN:1:0'));
		assert.equal((await item(page, 'THEME OVERRIDE')).color, 'rgb(255, 79, 154)', 'Button pressed色が未反映');
		await page.mouse.up();
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent.startsWith('BUTTON MODEL:UP:')));
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'THEME ACTIVE'));
		const buttonAfter = await item(page, 'THEME ACTIVE');
		const themeAfter = await item(page, 'THEME TARGET 40');
		const inheritedLabelAfter = await item(page, 'INHERITED THEME');
		const inheritedButtonAfter = await item(page, 'INHERITED BUTTON');
		const lineAfterTheme = await control(page, 'LineEdit');
		const areaAfterTheme = await control(page, 'TextEdit');
		assert.equal(buttonAfter.id, buttonBefore.id, 'ButtonのObjectIDがTheme変更で変化');
		assert.equal(themeAfter.id, themeBefore.id, 'LabelのObjectIDがTheme変更で変化');
		assert.equal(buttonAfter.fontSize, 23, `Button Theme size: ${buttonAfter.fontSize}`);
		assert.equal(themeAfter.fontSize, 40, `Label Theme size: ${themeAfter.fontSize}`);
		assert.notEqual(themeAfter.color, themeBefore.color, 'Theme色が未反映');
		assert.match(themeAfter.stroke, /^3px/, `outline未反映: ${themeAfter.stroke}`);
		assert.equal(inheritedLabelAfter.id, inheritedLabelBefore.id, '継承Theme LabelのObjectIDが変化');
		assert.equal(inheritedButtonAfter.id, inheritedButtonBefore.id, '継承Theme ButtonのObjectIDが変化');
		assert.equal(inheritedLabelBefore.fontSize, 16, `継承Label初期size: ${inheritedLabelBefore.fontSize}`);
		assert.equal(inheritedLabelAfter.fontSize, 28, `継承Label変更size: ${inheritedLabelAfter.fontSize}`);
		assert.equal(inheritedButtonBefore.fontSize, 17, `継承Button初期size: ${inheritedButtonBefore.fontSize}`);
		assert.equal(inheritedButtonAfter.fontSize, 21, `継承Button変更size: ${inheritedButtonAfter.fontSize}`);
		assert.notEqual(inheritedLabelAfter.color, inheritedLabelBefore.color, '継承Label色が未反映');
		assert.notEqual(inheritedButtonAfter.color, inheritedButtonBefore.color, '継承Button色が未反映');
		assert.equal(lineAfterTheme.value, 'PROGRAMMATIC', 'Godotからinputへの値更新なし');
		assert.equal(areaAfterTheme.value, 'PROGRAM\nMODEL', 'Godotからtextareaへの値更新なし');
		assert.equal(lineAfterTheme.fontSize, 20, `LineEdit Theme size: ${lineAfterTheme.fontSize}`);
		assert.equal(areaAfterTheme.fontSize, 18, `TextEdit Theme size: ${areaAfterTheme.fontSize}`);
		assert.notEqual(lineAfterTheme.color, lineBefore.color, 'LineEdit Theme色が未反映');
		assert.notEqual(areaAfterTheme.color, areaBefore.color, 'TextEdit Theme色が未反映');
		assert.equal(lineAfterTheme.placeholderColor, 'rgba(0, 229, 255, 0.8)', `LineEdit placeholder Theme色: ${lineAfterTheme.placeholderColor}`);
		assert.equal(areaAfterTheme.placeholderColor, 'rgba(255, 79, 154, 0.8)', `TextEdit placeholder Theme色: ${areaAfterTheme.placeholderColor}`);
		assert.equal((await item(page, 'DISABLED BUTTON')).color, 'rgb(135, 146, 168)', 'Button disabled色が未反映');

		// 押下時action modeはmouseup前に発火し、Godotのfocus解放をDOMへ戻す。
		const pressMode = await item(page, 'PRESS MODE');
		await page.mouse.move(pressMode.box.x + pressMode.box.width / 2, pressMode.box.y + pressMode.box.height / 2);
		await page.mouse.down();
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'PRESS FIRED'));
		await page.waitForFunction(() => document.activeElement?.textContent !== 'PRESS FIRED');
		await page.mouse.up();

		// LinkButtonもglyphだけをDOM化し、入力結果とunderlineを追従する。
		const linkBefore = await item(page, 'LINK BUTTON');
		assert.equal(linkBefore?.kind, 'LinkButton');
		assert.equal(await page.locator('[data-gdweb-kind="LinkButton"]').getAttribute('href'), 'https://docs.godotengine.org/', 'LinkButton URI未反映');
		assert.equal(linkBefore.decoration, 'underline');
		assert.notEqual(linkBefore.underlineOffset, linkInitial.underlineOffset, 'underline間隔がTheme変更へ未追従');
		assert.match(linkBefore.underlineThickness, /^\d+(?:\.\d+)?px$/, `underline太さ: ${linkBefore.underlineThickness}`);
		await page.mouse.click(linkBefore.box.x + linkBefore.box.width / 2, linkBefore.box.y + linkBefore.box.height / 2);
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'LINK PRESSED'));
		assert.equal((await item(page, 'LINK PRESSED')).id, linkBefore.id, 'LinkButtonのObjectIDが入力で変化');
		await page.locator('[data-gdweb-kind="LinkButton"]').focus();
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'BUTTON MODEL:UP:0:1'));
		await page.locator('[data-gdweb-kind="LinkButton"]').press('Enter');
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'LINK BUTTON'));
		assert.equal((await item(page, 'LINK BUTTON')).id, linkBefore.id, 'LinkButtonのkeyboard入力でObjectIDが変化');
		await page.locator('[data-gdweb-kind="LinkButton"]').blur();
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'BUTTON MODEL:UP:0:0'));

		// composition中はDOMに保持し、確定時だけLineEditへ日本語と絵文字を戻す。
		const composingLineState = await page.evaluate(() => {
			const input = document.querySelector('[data-gdweb-kind="LineEdit"]');
			input.focus();
			input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
			input.value = '日本語😀';
			input.setSelectionRange(input.value.length, input.value.length);
			input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '日本語😀', inputType: 'insertCompositionText', isComposing: true }));
			return [...document.querySelectorAll('[data-gdweb-text]')].find((node) => node.textContent.startsWith('LINE MODEL:'))?.textContent;
		});
		assert.ok(!composingLineState.includes('日本語'), `IME未確定値がGodotへ流入: ${composingLineState}`);
		await page.evaluate(() => document.querySelector('[data-gdweb-kind="LineEdit"]').dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本語😀' })));
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'LINE MODEL:日本語😀:4:4'));

		// Godotから値を上書き後、直前と同じ入力へ戻しても通知を省略しない。
		const activeButton = await item(page, 'THEME ACTIVE');
		await page.mouse.click(activeButton.box.x + activeButton.box.width / 2, activeButton.box.y + activeButton.box.height / 2);
		await page.waitForFunction(() => document.querySelector('[data-gdweb-kind="LineEdit"]')?.value === 'PROGRAMMATIC');
		await page.evaluate(() => {
			const input = document.querySelector('[data-gdweb-kind="LineEdit"]');
			input.value = '日本語😀';
			input.setSelectionRange(input.value.length, input.value.length);
			input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '日本語😀', inputType: 'insertText' }));
		});
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'LINE MODEL:日本語😀:4:4'));
		await page.evaluate(() => {
			const input = document.querySelector('[data-gdweb-kind="LineEdit"]');
			input.setSelectionRange(1, 3);
			input.dispatchEvent(new Event('select', { bubbles: true }));
		});
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'LINE MODEL:日本語😀:1:3'));

		// Unicode文字数上限は絵文字を一文字として扱い、Enter後のGodot focus解放をDOMへ戻す。
		const limited = `${'a'.repeat(23)}😀`;
		await page.evaluate((value) => {
			const input = document.querySelector('[data-gdweb-kind="LineEdit"]');
			input.focus();
			input.value = `${value}Z`;
			input.setSelectionRange(input.value.length, input.value.length);
			input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'Z', inputType: 'insertText' }));
		}, limited);
		await page.waitForFunction((value) => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === `LINE MODEL:${value}:24:24`), limited);
		assert.equal(Array.from((await control(page, 'LineEdit')).value).length, 24, 'Unicode文字上限を超過');
		await page.locator('[data-gdweb-kind="LineEdit"]').press('Enter');
		await page.waitForFunction(() => document.activeElement?.dataset.gdwebKind !== 'LineEdit');

		// textareaも改行を保ったIME確定値とcaretをGodotへ戻す。
		await page.evaluate(() => {
			const area = document.querySelector('[data-gdweb-kind="TextEdit"]');
			area.focus();
			area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
			area.value = '一行\n二行😀';
			area.setSelectionRange(area.value.length, area.value.length);
			area.dispatchEvent(new InputEvent('input', { bubbles: true, data: '一行\n二行😀', inputType: 'insertCompositionText', isComposing: true }));
			area.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '一行\n二行😀' }));
		});
		await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent.startsWith('AREA MODEL:一行|二行😀:1:3:1:3:')));

		// textareaのnative scrollを唯一の表示scrollbarとし、Godotのscroll値へ戻す。
		await page.evaluate(() => {
			const area = document.querySelector('[data-gdweb-kind="TextEdit"]');
			area.value = Array.from({ length: 10 }, (_, index) => `ROW${index} ${'X'.repeat(40)}`).join('\n');
			area.setSelectionRange(0, 0);
			area.dispatchEvent(new InputEvent('input', { bubbles: true, data: '', inputType: 'insertText' }));
		});
		await page.waitForFunction(() => {
			const area = document.querySelector('[data-gdweb-kind="TextEdit"]');
			return area.scrollHeight > area.clientHeight && area.scrollWidth > area.clientWidth;
		});
		await page.evaluate(() => {
			const area = document.querySelector('[data-gdweb-kind="TextEdit"]');
			area.scrollTop = 48;
			area.scrollLeft = 32;
			area.dispatchEvent(new Event('scroll'));
		});
		await page.waitForFunction(() => {
			const state = [...document.querySelectorAll('[data-gdweb-text]')].find((node) => node.textContent.startsWith('AREA MODEL:ROW0'))?.textContent || '';
			const values = state.match(/:(\d+):(\d+)$/);
			return values && Number(values[1]) > 0 && Number(values[2]) > 0;
		});
		const scrolledArea = await control(page, 'TextEdit');
		assert.ok(scrolledArea.scroll.top > 0 && scrolledArea.scroll.left > 0, `textarea scroll未追従: ${JSON.stringify(scrolledArea.scroll)}`);

		// 親transform、物理、ゲーム更新を毎frameの同じDOM要素で追従する。
		const rotating = await samples(page, 'ROTATING LABEL', 4, 100);
		assert.equal(new Set(rotating.map((entry) => entry.id)).size, 1, '回転LabelのIDが変化');
		assert.ok(new Set(rotating.map((entry) => entry.transform)).size > 1, '回転transformが停止');
		assert.ok(rotating.some((entry) => !/^matrix\(1, 0, 0, 1,/.test(entry.transform)), '回転成分なし');
		const scaling = await samples(page, 'SCALING LABEL', 4, 100);
		assert.equal(new Set(scaling.map((entry) => entry.id)).size, 1, '拡縮LabelのIDが変化');
		assert.ok(new Set(scaling.map((entry) => entry.transform)).size > 1, '拡縮transformが停止');
		const shot = await samples(page, '▲', 4, 100);
		assert.equal(new Set(shot.map((entry) => entry.id)).size, 1, '弾LabelのIDが変化');
		assert.ok(Math.max(...shot.map((entry) => entry.box.y)) - Math.min(...shot.map((entry) => entry.box.y)) > 20, '弾Labelが未追従');
		const falling = await samples(page, 'PHYSICS BUTTON', 12, 250);
		assert.equal(new Set(falling.map((entry) => entry.id)).size, 1, '物理ButtonのIDが変化');
		assert.ok(Math.max(...falling.map((entry) => entry.box.y)) - Math.min(...falling.map((entry) => entry.box.y)) > 15, `物理Buttonが未追従: ${falling.map((entry) => entry.box.y).join(',')}`);
		assert.ok(new Set(falling.map((entry) => entry.transform)).size > 2, '物理回転が未追従');
		assert.match((await item(page, 'SCORE 00000'))?.id || (await page.locator('[data-gdweb-text]', { hasText: 'SCORE ' }).first().getAttribute('id')), /^gdweb-text-\d+$/, 'score未同期');

		// 解放済みObjectIDのDOMを一frame境界で回収する。
		await page.waitForFunction(() => ![...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'TEMPORARY DOM'));
		assert.equal((await item(page, 'HIDDEN DOM')).display, 'none', '非表示Labelが表示');

		// 100件超の追従処理が一frameを大幅に塞がないことを定量化する。
		const frames = await page.evaluate(() => new Promise((resolve) => {
			const gaps = [];
			let previous = performance.now();
			const tick = (now) => {
				gaps.push(now - previous);
				previous = now;
				if (gaps.length >= 30) resolve(gaps.slice(2));
				else requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}));
		const ordered = [...frames].sort((left, right) => left - right);
		const medianFrameMs = ordered[Math.floor(ordered.length / 2)];
		assert.ok(medianFrameMs < 50, `frame中央値: ${medianFrameMs} ms`);

		const image = await page.screenshot({ path: path.join(out, 'text-lab.png') });
		assert.ok(image.length > 50000, `確認画像が小さすぎる: ${image.length}`);
		const shaderPixels = await cyanPixels(page, image, { x: 1000, y: 125, width: 250, height: 45 });
		assert.equal(shaderPixels, 0, `文字MaterialがCanvasに残存: ${shaderPixels}`);
		assert.deepEqual(browserErrors, [], `Browser error: ${browserErrors.join(' | ')}`);
		const result = {
			ok: true,
			inventory: { count: inventory.count, kinds: inventory.kinds, objectIds: true, domAlternatives: 4, explicitCanvas: 1 },
			controls: { tags: expectedTags, buttonTextRect: buttonBefore.box, theme: true, inheritedTheme: true, states: true, actionModes: true, focus: true, link: true, underline: true, shadow: true, placeholder: true, lineIme: true, textAreaIme: true, unicodeLimit: true, selection: true, scroll: true, programmaticInput: true },
			motion: { rotation: true, scaling: true, physics: true, shooter: true, swarm: 80 },
			lifecycle: { hidden: true, removed: true },
			performance: { domCount: inventory.count, medianFrameMs },
			canvas: { textMaterialPixels: shaderPixels },
		};
		fs.writeFileSync(path.join(out, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
		console.log(JSON.stringify(result));
	} finally {
		await browser.close();
		server.close();
	}
})().catch((error) => {
	console.error(error.stack || error);
	server.close();
	process.exitCode = 1;
});
