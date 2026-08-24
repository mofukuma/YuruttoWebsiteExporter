// 全書き出しlevelの意味DOMを、Browser操作からGodot signalまで往復検査する。
// roleとplaceholderを共通入口にし、各levelの描画方式へ依存しない設計にする。

'use strict';

const assert = require('node:assert/strict');

// 入力、送信、clickを順に行い、signal回数とDOM要素の寿命を確かめる。
async function exerciseUi(page, name, forbidden = '') {
	const wait = (value) => page.waitForFunction((text) => [...document.querySelectorAll('[data-yweb-text]')].some((element) => element.textContent === text), value, { timeout: 3000 });
	await page.evaluate(() => {
		globalThis.__ywebUiNodes = new Map([...document.querySelectorAll('[data-yweb-text]')].map((element) => [element.dataset.ywebText, element]));
	});
	const line = page.getByPlaceholder('LINE INPUT');
	const area = page.getByPlaceholder('TEXT AREA');
	const button = page.getByRole('button', { name: 'CANVAS BUTTON', exact: true });
	const link = page.getByRole('link', { name: 'CANVAS LINK', exact: true });
	const disabledButton = page.getByRole('button', { name: 'DISABLED BUTTON', exact: true });
	const disabledLink = page.getByRole('link', { name: 'DISABLED LINK', exact: true });
	const noTabLine = page.getByPlaceholder('NO TAB LINE');
	const noTabArea = page.getByPlaceholder('NO TAB AREA');

	await line.fill('alpha');
	await wait('LINE alpha');
	await line.press('Enter');
	await wait('SUBMIT alpha');
	// Godotへfocusが往復してから値を入れ、直前のLineEditへ誤入力しないことも見る。
	await area.focus();
	await page.waitForFunction(() => document.activeElement?.tagName === 'TEXTAREA');
	await area.fill('one\ntwo');
	await wait('AREA one|two');
	await button.click();
	await wait('BUTTON 1');
	await button.press('Enter');
	await wait('BUTTON 2');
	await link.click();
	await wait('LINK 1');
	await wait('COUNTS 1/1/1/2/1/0');
	assert.equal(await disabledButton.isDisabled(), true, `${name}の無効Buttonが操作可能になっている`);
	assert.equal(await disabledLink.getAttribute('aria-disabled'), 'true', `${name}の無効Linkへ意味状態がない`);
	assert.match(await disabledLink.getAttribute('href'), /\/disabled$/, `${name}の無効Linkがlink roleを失っている`);
	assert.equal(await disabledLink.evaluate((element) => element.tabIndex), -1, `${name}の無効LinkがTab順へ残っている`);
	assert.deepEqual(await Promise.all([noTabLine, noTabArea].map((element) => element.evaluate((node) => node.tabIndex))), [-1, -1], `${name}のFOCUS_NONE入力がTab順へ入っている`);

	// 有効要素のTab属性を確かめ、先頭から実際のTab移動で無効要素を飛ばす。
	assert.deepEqual(await Promise.all([line, area, button, link].map((element) => element.evaluate((node) => node.tabIndex))), [0, 0, 0, 0], `${name}の有効UIがTab順にない`);
	await link.focus();
	await wait('FOCUS ActionLink');
	await line.focus();
	await wait('FOCUS LineInput');
	const expectedTabs = [
		{ tag: 'INPUT', text: '', placeholder: 'LINE INPUT', focus: 'FOCUS LineInput' },
		{ tag: 'BUTTON', text: 'CANVAS BUTTON', placeholder: '', focus: 'FOCUS ActionButton' },
		{ tag: 'TEXTAREA', text: '', placeholder: 'TEXT AREA', focus: 'FOCUS TextArea' },
		{ tag: 'A', text: 'CANVAS LINK', placeholder: '', focus: 'FOCUS ActionLink' },
	];
	const tabbed = [];
	for (let index = 0; index < 4; index++) {
		const active = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent || '', placeholder: document.activeElement?.getAttribute('placeholder') || '' }));
		tabbed.push({ ...active, focus: expectedTabs[index].focus });
		await wait(expectedTabs[index].focus);
		if (index < 3) {
			await page.keyboard.press('Tab');
			try {
				await page.waitForFunction((expected) => document.activeElement?.tagName === expected.tag && (document.activeElement.textContent || '') === expected.text && (document.activeElement.getAttribute('placeholder') || '') === expected.placeholder, expectedTabs[index + 1], { timeout: 3000 });
			} catch (error) {
				const state = await page.evaluate(() => ({
					active: document.activeElement?.outerHTML,
					focus: [...document.querySelectorAll('[data-yweb-text]')].find((element) => element.textContent.startsWith('FOCUS '))?.textContent,
					tabs: [...document.querySelectorAll('[data-yweb-text]')].filter((element) => element.tabIndex >= 0).map((element) => ({ tag: element.tagName, text: element.textContent, placeholder: element.getAttribute('placeholder'), box: element.getBoundingClientRect().toJSON() })),
				}));
				throw new Error(`${name}のTab ${index}で次へ移れない: ${JSON.stringify(state)}`, { cause: error });
			}
		}
	}
	assert.deepEqual(tabbed, expectedTabs, `${name}のTab順または無効要素の除外が違う`);
	await disabledButton.dispatchEvent('click');
	await disabledLink.dispatchEvent('click');
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	assert.equal(await page.getByText('COUNTS 1/1/1/2/1/0', { exact: true }).count(), 1, `${name}の無効Controlからsignalが届いている`);

	assert.equal(await line.inputValue(), 'alpha', `${name}のLineEdit値がBrowserへ残っていない`);
	assert.equal(await area.inputValue(), 'one\ntwo', `${name}のTextEdit値がBrowserへ残っていない`);
	const stable = await page.evaluate(() => {
		const current = [...document.querySelectorAll('[data-yweb-text]')];
		return current.length === globalThis.__ywebUiNodes.size && current.every((element) => globalThis.__ywebUiNodes.get(element.dataset.ywebText) === element && element.isConnected);
	});
	assert.equal(stable, true, `${name}の入力同期で意味DOMを作り直している`);
	if (forbidden) assert.equal(await page.locator(forbidden).count(), 0, `${name}の操作後に文字以外をDOMへ移している`);
}

module.exports = { exerciseUi };
