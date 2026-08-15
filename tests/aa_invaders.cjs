// スマートフォン画面でAA敵、顔文字自機、画面Button、侵入ルールを一括検査する。
// 実runtimeを390x844で動かし、移動、命中、下降、敵弾、防壁損耗を観測する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');
const { createServer } = require('../build/serve_web.cjs');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const work = path.join(repo, 'tmp/aa-invaders'); // Project copy、Web成果物、確認画像。
const project = path.join(work, 'project'); // addonを導入する検査project。
const site = path.join(work, 'site'); // Browser配信成果物。
const browserPath = '/Users/k/Library/Caches/ms-playwright/chromium-1194/chrome-mac/Chromium.app/Contents/MacOS/Chromium'; // 固定Chromium。
const godot = '/Applications/Godot 4.7.1.app/Contents/MacOS/Godot'; // 固定Godot 4.7.1。
let server = null;
let browser = null;

// 表示文字を持つDOM要素の画面矩形を返す。
async function box(page, text) {
	return page.evaluate((value) => {
		const node = [...document.querySelectorAll('[data-gdweb-text]')].find((item) => item.textContent === value);
		if (!node) return null;
		const rect = node.getBoundingClientRect();
		return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, tag: node.tagName, family: getComputedStyle(node).fontFamily };
	}, text);
}

// 画面Buttonを指定時間押し、Canvas標準mouse入力を通す。
async function hold(page, text, duration) {
	const target = await page.getByText(text, { exact: true }).boundingBox();
	assert.ok(target, `操作Buttonなし: ${text}`);
	await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
	await page.mouse.down();
	await page.waitForTimeout(duration);
	await page.mouse.up();
}

// 自機を防壁間にいる最下段敵へ合わせる。
async function aim(page) {
	for (let count = 0; count < 4; count++) {
		const state = await page.evaluate(() => {
			const nodes = [...document.querySelectorAll('[data-gdweb-text]')];
			const player = nodes.find((node) => node.textContent === '(´・ω・`)').getBoundingClientRect();
			const enemies = nodes.filter((node) => node.textContent === '≪(oo)≫' && getComputedStyle(node).display !== 'none').map((node) => node.getBoundingClientRect());
			const gaps = enemies.filter((rect) => {
				const x = rect.x + rect.width / 2;
				return (x > 112 && x < 158) || (x > 232 && x < 278);
			});
			const target = (gaps.length ? gaps : enemies).sort((a, b) => Math.abs(a.x + a.width / 2 - (player.x + player.width / 2)) - Math.abs(b.x + b.width / 2 - (player.x + player.width / 2)))[0];
			return { player: player.x + player.width / 2, target: target.x + target.width / 2 };
		});
		const delta = state.target - state.player;
		if (Math.abs(delta) < 8) return;
		await hold(page, delta < 0 ? '◀' : '▶', Math.min(220, Math.max(35, Math.abs(delta) / 230 * 1000)));
	}
}

// ExportからBrowser実測までを一つの終了境界で行う。
async function main() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'examples/aa_invaders'), project, { recursive: true });
	const rules = child.execFileSync(godot, ['--headless', '--path', project, '--script', path.join(repo, 'tests/aa_invaders_scene.gd')], { encoding: 'utf8', timeout: 5000 });
	assert.match(rules, /"next_wave":2/);
	assert.match(rules, /"game_over":true/);
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], { stdio: 'pipe' });
	server = createServer(site);
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	browser = await chromium.launch({ executablePath: browserPath, headless: true, args: ['--use-angle=swiftshader'] });
	const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
	page.setDefaultTimeout(12000);
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.stack || error.message));
	page.on('console', (message) => {
		const text = message.text();
		if ((message.type() === 'error' || message.type() === 'warning') && !text.includes('GL Driver Message')) errors.push(text);
	});
	await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'domcontentloaded' });
	await page.getByText('(´・ω・`)', { exact: true }).waitFor();
	await page.waitForFunction(() => [...document.querySelectorAll('[data-gdweb-text]')].filter((node) => ['╱(• •)╲', '〈[°°]〉', 'Ψ(××)Ψ', '╭[••]╮', '≪(oo)≫'].includes(node.textContent)).length === 40);

	// DOM意味要素、Browser標準font、スマートフォン収容を確認する。
	const initialPlayer = await box(page, '(´・ω・`)');
	assert.equal(initialPlayer.family, 'sans-serif');
	assert.equal((await box(page, 'FIRE')).tag, 'BUTTON');
	const layout = await page.evaluate(() => {
		const canvasNode = document.querySelector('canvas');
		const canvas = canvasNode.getBoundingClientRect();
		const root = document.querySelector('#gdweb-text-root').getBoundingClientRect();
		const nodes = [...document.querySelectorAll('[data-gdweb-text]')].map((node) => node.getBoundingClientRect());
		return { canvas: { width: canvas.width, height: canvas.height }, canvasPixels: { width: canvasNode.width, height: canvasNode.height }, root: { width: root.width, height: root.height }, minLeft: Math.min(...nodes.map((rect) => rect.left)), maxRight: Math.max(...nodes.map((rect) => rect.right)), documentWidth: document.documentElement.scrollWidth, domCount: nodes.length, buttonCount: document.querySelectorAll('[data-gdweb-kind="Button"]').length, webgl2: !!canvasNode.getContext('webgl2') };
	});
	assert.deepEqual(layout.canvas, { width: 390, height: 844 });
	assert.deepEqual(layout.canvasPixels, { width: 1170, height: 2532 });
	assert.deepEqual(layout.root, { width: 390, height: 844 });
	assert.equal(layout.domCount, 50);
	assert.equal(layout.buttonCount, 3);
	assert.equal(layout.webgl2, true);
	assert.ok(layout.minLeft >= 0 && layout.maxRight <= 390);
	assert.equal(layout.documentWidth, 390);

	// 画面Buttonを押し続け、顔文字DOMが右へ追従することを確認する。
	await hold(page, '▶', 220);
	const movedPlayer = await box(page, '(´・ω・`)');
	assert.ok(movedPlayer.x > initialPlayer.x + 20, `自機移動不足: ${movedPlayer.x - initialPlayer.x}`);

	// 防壁間へ照準し、一発制限の射撃で実際に敵を得点化する。
	for (let shot = 0; shot < 5 && await page.getByText('SCORE 0000', { exact: true }).count(); shot++) {
		await aim(page);
		await hold(page, 'FIRE', 35);
		await page.waitForTimeout(620);
	}
	await page.waitForFunction(() => ![...document.querySelectorAll('[data-gdweb-text]')].some((node) => node.textContent === 'SCORE 0000'));
	const score = await page.evaluate(() => [...document.querySelectorAll('[data-gdweb-text]')].find((node) => node.textContent.startsWith('SCORE ')).textContent);

	// 編隊下降、敵弾、防壁損耗が同じ実行中に成立することを確認する。
	await page.waitForFunction(() => {
		const stats = [...document.querySelectorAll('[data-gdweb-text]')].find((node) => node.textContent.startsWith('INV '))?.textContent || '';
		const values = Object.fromEntries([...stats.matchAll(/(INV|DROP|ESHOT|SHIELD) (\d+)/g)].map((match) => [match[1], Number(match[2])]));
		return values.DROP >= 1 && values.ESHOT >= 1 && values.SHIELD < 42;
	});
	const stats = await page.evaluate(() => [...document.querySelectorAll('[data-gdweb-text]')].find((node) => node.textContent.startsWith('INV ')).textContent);
	assert.equal(await page.getByText('LIFE 3', { exact: true }).count(), 1);
	assert.deepEqual(errors, []);
	await page.screenshot({ path: path.join(work, 'mobile-game.png') });
	fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ viewport: '390x844@3', backing: '1170x2532', domCount: 50, invaders: 40, player: '(´・ω・`)', moved: movedPlayer.x - initialPlayer.x, score, stats, browserFont: initialPlayer.family, webgl2: true }, null, 2)}\n`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
}).finally(async () => {
	if (browser) await browser.close().catch(() => {});
	if (server) await new Promise((resolve) => server.close(resolve));
});
