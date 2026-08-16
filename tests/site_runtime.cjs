// History直リンク、Browser戻り、Godot scene変更を実runtimeとnginxで検査する。
// URL、title、SceneTree.current_sceneを双方向に一回ずつ動かす。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');

const repo = path.resolve(__dirname, '..'); // yuruttoweb project root。
const work = path.join(repo, 'tmp/site-runtime'); // Project copyとWeb成果物。
const project = path.join(work, 'project'); // addonを導入するfixture。
const site = path.join(work, 'site'); // nginx配信成果物。
const port = 49183; // 固定nginx検査port。
const { browserPath } = require('./browser.cjs'); // 導入済みplaywright-coreの固定Chromium。
let container = '';

// Export、nginx、Browserを一つの失敗境界で検査する。
async function main() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/site_runtime'), project, { recursive: true });
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], { stdio: 'pipe' });
	container = child.execFileSync('docker', ['run', '--rm', '-d', '-p', `127.0.0.1:${port}:8080`, '-v', `${site}:/usr/share/nginx/html:ro`, '-v', `${path.join(site, 'nginx-yuruttoweb.conf.example')}:/etc/nginx/conf.d/default.conf:ro`, 'nginx:alpine'], { encoding: 'utf8' }).trim();
	child.execFileSync('curl', ['-fsS', '--retry', '20', '--retry-all-errors', '--retry-delay', '0', '--max-time', '5', `http://127.0.0.1:${port}/`], { stdio: 'ignore' });
	const browser = await chromium.launch({ executablePath: browserPath, headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 640, height: 240 } });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => { if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text()); });
		await page.goto(`http://127.0.0.1:${port}/about/`, { waitUntil: 'domcontentloaded' });
		try {
			await page.getByText('ABOUT SCENE', { exact: true }).waitFor({ timeout: 8000 });
		} catch {
			const state = await page.evaluate(() => ({ url: location.href, title: document.title, text: document.body.innerText, labels: [...document.querySelectorAll('[data-yuruttoweb-text]')].map((node) => node.textContent), site: !!window.YuruttoWebSite, status: document.querySelector('#status-notice')?.textContent }));
			throw new Error(`初期route不一致: ${JSON.stringify({ state, errors })}`);
		}
		assert.equal(await page.title(), 'About Route');
		await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
		await page.getByText('MAIN SCENE', { exact: true }).waitFor();
		assert.equal(new URL(page.url()).pathname, '/');
		assert.equal(await page.title(), 'Main Route');
		await page.keyboard.press('n');
		await page.getByText('ABOUT SCENE', { exact: true }).waitFor();
		await page.waitForFunction(() => location.pathname === '/about/');
		assert.equal(await page.title(), 'About Route');
		assert.deepEqual(errors, []);
		await page.screenshot({ path: path.join(work, 'history-scene.png') });
		fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ direct: 'About', browserToGodot: 'Main', godotToBrowser: 'About', uri: '/about/' }, null, 2)}\n`);
	} finally {
		await browser.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
}).finally(() => {
	if (container) child.spawnSync('docker', ['stop', container], { stdio: 'ignore' });
});
