// 標準ControlのTheme面、変形、入力、切り抜きを独立画面でBrowser検査する。
// DOMを階層配置せず、Godotの行列とclip範囲を正本にする境界を確かめる。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, browserPath } = require('./browser.cjs');
const { createServer } = require('../build/serve_web.cjs');

const repo = path.resolve(__dirname, '..'); // 検査対象project root。
const work = path.join(repo, 'tmp/dom-transform-controls'); // 書き出しと確認画像の保存先。
const project = path.join(work, 'project'); // アドオンを導入するfixture複製。
const site = path.join(work, 'site'); // Browserへ配信するDOM成果物。
const template = process.env.YWEB_TEMPLATE || path.join(repo, 'addons/yurutto_website_exporter/templates/yweb-dom.zip'); // 今回検査するDOMテンプレート。

// CSS transformを数値行列へ変換する。
function matrix(value) {
	const matched = /^matrix\(([^)]+)\)$/.exec(value);
	assert.ok(matched, `2D行列ではない: ${value}`);
	return matched[1].split(',').map(Number);
}

// SEO用初期HTMLを除き、実行中のGodot文字要素を選ぶ。
function textNode(page, value) {
	return page.locator('[data-yweb-glyph]').filter({ hasText: new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
}

// 対象の画面矩形へ重なるStyleBox背景色を返す。
async function backgrounds(page, locator) {
	const box = await locator.boundingBox();
	return page.locator('[data-yweb-box]').evaluateAll((nodes, area) => nodes.filter((node) => {
		const rect = node.getBoundingClientRect();
		const x = rect.x + rect.width * 0.5;
		const y = rect.y + rect.height * 0.5;
		return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
	}).map((node) => getComputedStyle(node).backgroundColor), box);
}

async function main() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/dom_transform_controls'), project, { recursive: true });
	fs.mkdirSync(site, { recursive: true });
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], {
		env: { ...process.env, YWEB_LEVEL: 'dom', YWEB_TEMPLATE: template, YWEB_PRODUCTION: '0' }, stdio: 'pipe', timeout: 300000,
	});

	const server = createServer(site);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	const errors = [];
	try {
		const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
		await page.locator('input[placeholder="Rotated input"]').waitFor({ timeout: 60000 });

		// 親Controlの回転と縮小を、平坦DOM自身のGodot行列へ反映する。
		const rotated = matrix(await textNode(page, 'ROTATED PANEL').locator('..').evaluate((node) => getComputedStyle(node).transform));
		assert.ok(Math.abs(rotated[1]) > 0.25 && Math.abs(rotated[2]) > 0.25, `回転行列がDOMへ届かない: ${rotated}`);
		const scaledButton = page.getByRole('button', { name: 'SCALED BUTTON', exact: true });
		const scaled = matrix(await scaledButton.evaluate((node) => getComputedStyle(node).transform));
		assert.ok(Math.abs(Math.hypot(scaled[0], scaled[1]) - 0.64) < 0.02 && Math.abs(Math.hypot(scaled[2], scaled[3]) - 0.72) < 0.02, `縮小率がGodotと違う: ${scaled}`);
		await scaledButton.click();
		await textNode(page, 'BUTTON:SCALED').waitFor();

		// MenuBar項目を意味Buttonにし、Theme状態とPopup操作をBrowserへ結ぶ。
		const file = page.getByRole('menuitem', { name: 'FILE', exact: true });
		const edit = page.getByRole('menuitem', { name: 'EDIT', exact: true });
		const menuDump = await page.locator('[data-yweb-text]').evaluateAll((nodes) => nodes.map((node) => `${node.id}/${node.tagName}/${node.dataset.ywebKind}/${node.getAttribute('role') || ''}/${node.textContent}`));
		assert.equal(await file.count(), 1, `MenuBar項目がDOMにない: ${menuDump.join(',')}`);
		assert.equal(await file.evaluate((node) => node.tagName), 'BUTTON', 'MenuBar項目が意味Buttonではない');
		assert.ok(await edit.isDisabled(), '無効Menu項目をBrowserで操作できる');
		assert.equal(await textNode(page, 'HIDDEN').count(), 0, '非表示Menu項目がDOMに残る');
		const fileBackgrounds = await backgrounds(page, file);
		const boxDump = await page.locator('[data-yweb-box]').evaluateAll((nodes) => nodes.map((node) => {
			const rect = node.getBoundingClientRect();
			return `${node.id}/${getComputedStyle(node).backgroundColor}/${rect.x.toFixed(0)},${rect.y.toFixed(0)},${rect.width.toFixed(0)},${rect.height.toFixed(0)}`;
		}));
		assert.ok(fileBackgrounds.includes('rgb(30, 41, 59)'), `MenuBarのnormal StyleBoxがDOMにない: ${boxDump.join(';')}`);
		const menuLayers = await file.evaluate((node) => {
			const area = node.getBoundingClientRect();
			const text = Number(getComputedStyle(node).zIndex);
			const owner = node.dataset.ywebText.split('-')[0];
			const boxes = [...document.querySelectorAll(`[data-yweb-box^="${owner}"]`)].filter((item) => {
				const rect = item.getBoundingClientRect();
				return rect.x < area.right && rect.right > area.x && rect.y < area.bottom && rect.bottom > area.y;
			}).map((item) => `${item.id}:${getComputedStyle(item).zIndex}`);
			return { text, boxes };
		});
		assert.ok(menuLayers.boxes.every((value) => Number(value.split(':')[1]) < menuLayers.text), `MenuBarの面が文字を覆う: ${JSON.stringify(menuLayers)}`);
		await file.hover();
		await page.waitForFunction(() => [...document.querySelectorAll('[data-yweb-box]')].some((node) => getComputedStyle(node).backgroundColor === 'rgb(14, 116, 144)'));
		await file.click();
		const fileItem = page.getByRole('menuitem', { name: 'FILE ITEM', exact: true });
		await page.waitForTimeout(300);
		const popupDump = await page.locator('[data-yweb-text]').evaluateAll((nodes) => nodes.map((node) => `${node.id}/${node.textContent}/${getComputedStyle(node).display}`));
		assert.equal(await fileItem.count(), 1, `MenuBarからPopupが開かない: ${popupDump.join(',')}`);
		await fileItem.click();
		await textNode(page, 'MENU:FILE').waitFor();

		// TabBarも直接描画するStyleBoxを共通経路で取得する。
		assert.equal(await textNode(page, 'HOME').count(), 1, 'TabBar文字がDOMにない');
		assert.equal(await textNode(page, 'SETTINGS').count(), 1, '選択Tab文字がDOMにない');
		const tabColors = await page.locator('[data-yweb-box]').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor));
		assert.ok(tabColors.includes('rgb(22, 101, 52)') && tabColors.includes('rgb(63, 63, 70)'), 'TabBarの選択・非選択StyleBoxがDOMにない');

		// 回転inputと縮小textareaから、日本語と改行をGodot modelへ戻す。
		const line = page.locator('input[placeholder="Rotated input"]');
		const lineMatrix = matrix(await line.evaluate((node) => getComputedStyle(node).transform));
		assert.ok(Math.abs(lineMatrix[1]) > 0.1, `入力欄の回転が消えた: ${lineMatrix}`);
		await line.fill('回転入力');
		await textNode(page, 'INPUT:回転入力').waitFor();
		const area = page.locator('textarea[placeholder="Scaled textarea"]');
		await area.fill('一行目\n二行目');
		await textNode(page, 'INPUT:一行目|二行目').waitFor();

		// はみ出したButtonは見える範囲で操作でき、clip外ではhitしない。
		const overflow = page.getByRole('button', { name: 'OVERFLOW BUTTON', exact: true });
		const clip = await page.locator('[data-yweb-box]').evaluateAll((nodes) => {
			const node = nodes.find((item) => getComputedStyle(item).backgroundColor === 'rgb(30, 58, 138)');
			return node?.getBoundingClientRect().toJSON();
		});
		const overflowBox = await overflow.boundingBox();
		const clipPath = await overflow.evaluate((node) => getComputedStyle(node).clipPath);
		assert.ok(clip && overflowBox.x + overflowBox.width > clip.x + clip.width + 80, 'Buttonがclip範囲を越えていない');
		assert.match(clipPath, /^polygon\(/, `はみ出し隠しがDOMへ届かない: ${clipPath}`);
		await page.mouse.click(overflowBox.x + overflowBox.width - 8, overflowBox.y + overflowBox.height * 0.5);
		assert.equal(await textNode(page, 'BUTTON:OVERFLOW').count(), 0, 'clip外からButtonを操作できる');
		await page.mouse.click(clip.x + clip.width - 14, overflowBox.y + overflowBox.height * 0.5);
		await textNode(page, 'BUTTON:OVERFLOW').waitFor();

		await page.screenshot({ path: path.join(work, 'browser.png') });
		assert.deepEqual(errors, [], `Browser error: ${errors.join(' | ')}`);
		console.log(JSON.stringify({ ok: true, menu: true, styles: ['MenuBar', 'TabBar'], rotation: 17, scale: [0.64, 0.72], input: true, overflow: true }));
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
