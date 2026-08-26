// 物理直リンク、Browser戻り、Godot scene変更を静的hostで検査する。
// URL、title、SceneTree.current_sceneを再読込なしで双方向へ動かす設計。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../tmp/playwright/node_modules/playwright-core');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const work = path.join(repo, 'tmp/site-runtime'); // Project copyとWeb成果物。
const project = path.join(work, 'project'); // addonを導入するfixture。
const site = path.join(work, 'site'); // 静的配信成果物。
const port = 49183; // Browser検査port。
const { browserPath } = require('./browser.cjs'); // 固定Chromium。
const { createServer } = require('../build/serve_web.cjs'); // 静的検査server。

// Export、静的配信、Browserを一つの失敗境界で検査する。
async function main() {
	fs.rmSync(work, { recursive: true, force: true });
	fs.cpSync(path.join(repo, 'tests/fixtures/site_runtime'), project, { recursive: true });
	child.execFileSync('sh', [path.join(repo, 'build/export_minimum.sh'), project, path.join(site, 'index.html')], { stdio: 'pipe' });
	assert.ok(fs.existsSync(path.join(site, 'about/index.html')), 'About物理HTMLなし');
	const server = createServer(site);
	await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
	const browser = await chromium.launch({ executablePath: browserPath, headless: true });
	try {
		const page = await browser.newPage({ viewport: { width: 640, height: 240 } });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(`http://127.0.0.1:${port}/about/`, { waitUntil: 'domcontentloaded' });
		await page.getByText('ABOUT SCENE', { exact: true }).waitFor({ timeout: 8000 });
		assert.equal(await page.title(), 'About Route');
		const marker = await page.evaluate(() => window.ywebPageMarker = crypto.randomUUID());
		await page.evaluate(() => { history.pushState({}, '', '/'); dispatchEvent(new PopStateEvent('popstate')); });
		await page.getByText('MAIN SCENE', { exact: true }).waitFor();
		assert.equal(await page.title(), 'Main Route');
		await page.keyboard.press('n');
		await page.getByText('ABOUT SCENE', { exact: true }).waitFor();
		await page.waitForFunction(() => location.pathname === '/about/');
		assert.equal(await page.title(), 'About Route');
		assert.equal(await page.evaluate(() => window.ywebPageMarker), marker, 'scene遷移で再読込');
		assert.deepEqual(errors, []);
		await page.screenshot({ path: path.join(work, 'physical-scene.png') });
		fs.writeFileSync(path.join(work, 'result.json'), `${JSON.stringify({ direct: 'About', browserToGodot: 'Main', godotToBrowser: 'About', reloads: 1 }, null, 2)}\n`);
	} finally {
		await browser.close();
		await new Promise((resolve) => server.close(resolve));
	}
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
