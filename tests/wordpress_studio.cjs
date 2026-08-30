// WordPress型Godot作例の表示、操作、route、画面幅対応を一つのBrowserで検査する。
// source hashが同じ書き出しは再利用し、重いGodot起動を増やさない。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('./browser.cjs');
const { createServer } = require('../build/serve_web.cjs');
const { browserPath } = require('./browser.cjs');

const repo = path.resolve(__dirname, '..'); // exporterのroot。
const source = path.join(repo, 'sample/wordpress_studio'); // 公開する作例source。
const work = path.join(repo, 'tmp/wordpress-studio'); // 作業projectと確認画像の保存先。
const project = path.join(work, 'project'); // 生成cacheを隔離する作業project。
const output = path.join(project, 'output'); // 静的serverへ渡す成果物。

// 出力へ影響する作例sourceの内容hashを返す。
function sourceHash() {
	const files = [];
	const walk = (dir, skip = new Set()) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (skip.has(entry.name) || entry.name.endsWith('.import')) continue;
			const file = path.join(dir, entry.name);
			if (entry.isDirectory()) walk(file, skip);
			else files.push(file);
		}
	};
	walk(source, new Set(['.godot', 'addons', 'output', 'README.md', 'CREDITS.md', 'serve.sh']));
	walk(path.join(repo, 'addons/yurutto_website_exporter'), new Set(['yweb-2d.zip', 'yweb-3d.zip']));
	for (const name of ['export_minimum.sh', 'install_site_addon.cjs', 'prepare_yweb_preset.cjs']) files.push(path.join(repo, 'build', name));
	if (process.env.YWEB_TEMPLATE) files.push(path.resolve(process.env.YWEB_TEMPLATE));
	const hash = crypto.createHash('sha256');
	for (const file of [...new Set(files)].sort()) hash.update(path.relative(repo, file)).update(fs.readFileSync(file));
	return hash.digest('hex');
}

// sourceが変わった時に一度書き出し、同じ成果物は再利用する。
function build() {
	fs.mkdirSync(work, { recursive: true });
	const stamp = path.join(work, 'source.sha256');
	const hash = sourceHash();
	if (!fs.existsSync(path.join(output, 'index.html')) || !fs.existsSync(stamp) || fs.readFileSync(stamp, 'utf8').trim() !== hash) {
		fs.rmSync(project, { recursive: true, force: true });
		fs.cpSync(source, project, {
			recursive: true,
			filter: (file) => !['.godot', 'addons', 'output'].includes(path.basename(file)) && !file.endsWith('.import'),
		});
		child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(output, 'index.html')], { cwd: repo, stdio: 'pipe', timeout: 300000 });
		fs.writeFileSync(stamp, `${hash}\n`);
	}
}

// DOMの文字が現れるまでGodotのscene構築を待つ。
async function text(page, value) {
	await page.getByText(value, { exact: true }).first().waitFor();
}

// 実マウスを動かし、Godot Themeのhover色がDOM背景へ戻ることを確かめる。
async function hoverButton(page, button) {
	await page.mouse.move(1435, 895);
	await page.waitForTimeout(50);
	const state = () => button.evaluate((node) => {
		const background = document.getElementById(`${node.id}-box`);
		return { id: node.id, color: getComputedStyle(background).backgroundColor };
	});
	const before = await state();
	await button.hover();
	await page.waitForFunction(({ id, color }) => getComputedStyle(document.getElementById(`${id}-box`)).backgroundColor !== color, before, { timeout: 1500 });
	const after = await state();
	assert.notEqual(after.color, before.color, `hover色が変わらない: ${await button.textContent()}`);
	await page.mouse.move(1435, 895);
	await page.waitForFunction(({ id, color }) => getComputedStyle(document.getElementById(`${id}-box`)).backgroundColor === color, before, { timeout: 1500 });
}

// PC表示、carousel、無再読込routeを一画面で検査する。
async function desktop(browser, base) {
	const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
	page.setDefaultTimeout(5000);
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
	await page.goto(base, { waitUntil: 'domcontentloaded' });
	// 大きな実行資源をscript評価より前から読み、同じ通信をGodotが再利用することを確かめる。
	await page.waitForFunction(() => performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('.wasm')));
	const entries = await page.evaluate(() => performance.getEntriesByType('resource')
		.filter((entry) => /\.(js|wasm|pck)$/.test(new URL(entry.name).pathname))
		.map((entry) => [new URL(entry.name).pathname.split('/').pop(), { start: entry.startTime, type: entry.initiatorType }]));
	const loads = Object.fromEntries(entries);
	const js = Object.entries(loads).find(([name]) => name.endsWith('.js'))?.[1];
	const wasm = Object.entries(loads).find(([name]) => name.endsWith('.wasm'))?.[1];
	const pack = Object.entries(loads).find(([name]) => name.endsWith('.pck'))?.[1];
	assert.ok(js && wasm && pack, `初期資源が不足: ${JSON.stringify(loads)}`);
	assert.equal(wasm.type, 'link', 'WASMがpreload経由でない');
	assert.equal(pack.type, 'link', 'PCKがpreload経由でない');
	assert.equal(entries.filter(([name]) => name.endsWith('.wasm')).length, 1, 'WASMを重複取得した');
	assert.equal(entries.filter(([name]) => name.endsWith('.pck')).length, 1, 'PCKを重複取得した');
	assert.ok(wasm.start <= js.start + 1 && pack.start <= js.start + 1, `preload開始が遅い: ${JSON.stringify(loads)}`);
	await text(page, 'らしさを、\n体験に。');
	await text(page, '考える、つくる、育てる。');
	const routes = await page.getByRole('link').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, href: node.getAttribute('href') })));
	assert.equal(routes.length, 6, 'page導線がLinkButtonになっていない');
	assert.deepEqual([...new Set(routes.map((route) => route.href))].sort(), ['/', '/about/'], 'LinkButtonの実URLが違う');
	const contact = page.getByRole('button', { name: '相談する', exact: true });
	const heroContact = page.getByRole('button', { name: 'プロジェクトを相談', exact: true });
	await hoverButton(page, contact);
	await hoverButton(page, heroContact);
	await contact.click();
	await text(page, 'ありがとうございます。相談内容を受け付けました。');
	await text(page, '相談受付済み');
	await page.keyboard.press('Tab');
	await page.waitForFunction(() => document.activeElement?.textContent === 'プロジェクトを相談');
	await text(page, '01 / 03');
	await page.waitForFunction(() => [...document.querySelectorAll('span')].some((node) => node.textContent === '02 / 03'), null, { timeout: 4500 });
	const workY = await page.getByText('SELECTED WORKS', { exact: true }).evaluate((node) => node.getBoundingClientRect().y);
	await page.mouse.move(720, 450);
	await page.mouse.wheel(0, 1100);
	await page.waitForTimeout(120);
	const movedY = await page.getByText('SELECTED WORKS', { exact: true }).evaluate((node) => node.getBoundingClientRect().y);
	assert.ok(movedY < workY - 500, `Browser scrollが進まない: ${workY} -> ${movedY}`);
	const previous = page.getByRole('button', { name: '前へ', exact: true });
	const next = page.getByRole('button', { name: '次へ', exact: true });
	await hoverButton(page, previous);
	await hoverButton(page, next);
	await page.screenshot({ path: path.join(work, 'hover-desktop.png') });
	await previous.click();
	await text(page, '01 / 03');
	await next.click();
	await text(page, '02 / 03');
	await previous.click();
	await text(page, '01 / 03');
	await page.waitForTimeout(420);
	const copy = await page.evaluate(() => {
		const exact = (selector, value) => [...document.querySelectorAll(selector)].find((node) => node.textContent === value).getBoundingClientRect();
		return {
			bodyBottom: exact('span', '組織の声を集め、採用サイトと社内体験を同時に再設計。\n応募後の理解度が大きく向上しました。').bottom,
			buttonTop: exact('button', '前へ').top,
		};
	});
	assert.ok(copy.bodyBottom <= copy.buttonTop + 1, `carousel本文とButtonが重なった: ${copy.bodyBottom} > ${copy.buttonTop}`);
	await page.screenshot({ path: path.join(work, 'works-desktop.png') });
	await page.mouse.wheel(0, -2000);
	await page.waitForFunction(() => {
		const button = [...document.querySelectorAll('a')].find((node) => node.textContent === '私たち');
		const rect = button.getBoundingClientRect();
		return rect.top >= 0 && rect.bottom <= innerHeight;
	});
	const marker = await page.evaluate(() => globalThis.__sampleMarker = crypto.randomUUID());
	await page.getByRole('link', { name: '私たち', exact: true }).first().click();
	await page.waitForURL(`${base}about/`);
	await text(page, 'よく見る。\nよく聞く。\n一緒に考える。');
	assert.equal(await page.evaluate(() => globalThis.__sampleMarker), marker, 'About遷移で再読込した');
	await page.screenshot({ path: path.join(work, 'about-desktop.png') });
	await page.goBack();
	await page.waitForURL(base);
	await text(page, 'らしさを、\n体験に。');
	assert.equal(await page.evaluate(() => globalThis.__sampleMarker), marker, '戻る操作で再読込した');
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1440, 'PC表示が横へはみ出した');
	await page.screenshot({ path: path.join(work, 'home-desktop.png') });
	assert.deepEqual(errors, []);
	await page.close();
}

// 狭い画面で1列化、文字の重なり、横はみ出しを検査する。
async function mobile(browser, base) {
	const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
	page.setDefaultTimeout(5000);
	await page.goto(base, { waitUntil: 'domcontentloaded' });
	await text(page, 'らしさを、\n体験に。');
	const layout = await page.evaluate(() => {
		const exact = (value) => [...document.querySelectorAll('span')].find((node) => node.textContent === value).getBoundingClientRect();
		const title = exact('らしさを、\n体験に。');
		const lead = exact('戦略とデザイン、技術をつなぎ、\n愛される体験をつくります。');
		const action = [...document.querySelectorAll('button')].find((node) => node.textContent === 'プロジェクトを相談').getBoundingClientRect();
		const cards = ['ブランド戦略', '体験デザイン', 'グロース支援'].map(exact);
		return {
			width: document.documentElement.scrollWidth,
			titleBottom: title.bottom,
			leadTop: lead.top,
			leadBottom: lead.bottom,
			actionTop: action.top,
			cardX: cards.map((rect) => Math.round(rect.x)),
			cardY: cards.map((rect) => Math.round(rect.y)),
		};
	});
	assert.equal(layout.width, 390, 'mobile表示が横へはみ出した');
	assert.ok(layout.titleBottom <= layout.leadTop + 1, `Hero文字が重なった: ${layout.titleBottom} > ${layout.leadTop}`);
	assert.ok(layout.leadBottom <= layout.actionTop + 1, `Hero本文とButtonが重なった: ${layout.leadBottom} > ${layout.actionTop}`);
	assert.equal(new Set(layout.cardX).size, 1, 'service cardが1列でない');
	assert.ok(layout.cardY[0] < layout.cardY[1] && layout.cardY[1] < layout.cardY[2], 'service card順が一致しない');
	await page.screenshot({ path: path.join(work, 'home-mobile.png') });
	await page.close();
}

// 静的成果物を一つのserverとBrowserでまとめて検査する。
async function main() {
	build();
	for (const file of ['index.html', 'about/index.html', 'sitemap.xml', 'robots.txt']) {
		assert.ok(fs.existsSync(path.join(output, file)), `成果物なし: ${file}`);
	}
	// JavaScriptを動かす前のHTMLに、作例の意味と導線が入ることを確かめる。
	const imageCounts = {};
	for (const name of ['index.html', 'about/index.html']) {
		const html = fs.readFileSync(path.join(output, name), 'utf8');
		assert.equal((html.match(/<meta\s+charset=/gi) || []).length, 1, `${name}のcharset宣言が一意でない`);
		assert.ok(html.indexOf('<meta charset="utf-8">') < 1024, `${name}のcharset宣言が先頭1024 byte外`);
		assert.ok(html.indexOf('<base href=') < html.indexOf('rel="preload"'), `${name}のbaseがpreloadより後ろ`);
		const initial = html.match(/<main id="yweb-site-summary"[^>]*>(.*?)<\/main>/s)?.[1] || '';
		assert.equal((initial.match(/<h1(?:\s|>)/g) || []).length, 1, `${name}のH1が一意でない`);
		assert.ok((initial.match(/<h2(?:\s|>)/g) || []).length >= 3, `${name}の節見出しが少ない`);
		assert.ok((initial.match(/<p(?:\s|>)/g) || []).length >= 20, `${name}の本文が少ない`);
		assert.ok((initial.match(/<a\s/g) || []).length >= 4, `${name}のLinkButton導線が少ない`);
		assert.match(initial, /href="\/about\/"/, `${name}のAbout導線なし`);
		const images = initial.match(/<img\s[^>]+>/g) || [];
		assert.ok(images.length >= 2, `${name}の検索画像が少ない`);
		assert.match(images[0], /loading="eager" fetchpriority="high"/, `${name}の先頭画像優先度なし`);
		for (const [index, image] of images.entries()) {
			assert.match(image, /src="\/yweb-images\/[a-zA-Z0-9_-]+-[0-9a-f]{12}\.(?:png|jpe?g|webp)"/, `${name}の画像URLが不変名`);
			assert.match(image, /alt="[^"]+"/, `${name}の画像説明なし`);
			assert.match(image, /width="[1-9][0-9]*" height="[1-9][0-9]*"/, `${name}の画像寸法なし`);
			if (index > 0) assert.match(image, /loading="lazy"/, `${name}の後続画像が遅延読込でない`);
		}
		imageCounts[name] = images.length;
	}
	const server = createServer(output);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true });
	try {
		const base = `http://127.0.0.1:${server.address().port}/`;
		await desktop(browser, base);
		await mobile(browser, base);
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}
	fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ pages: 2, semanticHtml: true, imageSeo: imageCounts, carousel: 3, hoverButtons: 4, clicks: 5, keyboardFocus: true, reloads: 0, desktop: 1440, mobile: 390 }, null, 2)}\n`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
