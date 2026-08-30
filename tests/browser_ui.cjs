// 全書き出しlevelの意味DOMを、Browser操作からGodot signalまで往復検査する。
// roleとplaceholderを共通入口にし、各levelの描画方式へ依存しない設計にする。

'use strict';

const assert = require('node:assert/strict');

// 入力、送信、clickを順に行い、signal回数とDOM要素の寿命を確かめる。
async function exerciseUi(page, name, forbidden = '') {
	const wait = (value) => page.waitForFunction((text) => [...document.querySelectorAll('[data-yweb-text]')].some((element) => element.textContent === text), value, { timeout: 3000 });
	const root = page.locator('#yweb-text-root');
	await page.evaluate(() => {
		globalThis.__ywebUiNodes = new Map([...document.querySelectorAll('[data-yweb-text]')].map((element) => [element.dataset.ywebText, element]));
	});
	const line = root.getByPlaceholder('LINE INPUT');
	const area = root.getByPlaceholder('TEXT AREA');
	const button = root.getByRole('button', { name: 'CANVAS BUTTON', exact: true });
	const link = root.getByRole('link', { name: 'CANVAS LINK', exact: true });
	const disabledButton = root.getByRole('button', { name: 'DISABLED BUTTON', exact: true });
	const disabledLink = root.getByRole('link', { name: 'DISABLED LINK', exact: true });
	const noTabLine = root.getByPlaceholder('NO TAB LINE');
	const noTabArea = root.getByPlaceholder('NO TAB AREA');

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
	assert.equal(await root.getByText('COUNTS 1/1/1/2/1/0', { exact: true }).count(), 1, `${name}の無効Controlからsignalが届いている`);

	assert.equal(await line.inputValue(), 'alpha', `${name}のLineEdit値がBrowserへ残っていない`);
	assert.equal(await area.inputValue(), 'one\ntwo', `${name}のTextEdit値がBrowserへ残っていない`);
	const stable = await page.evaluate(() => {
		const current = [...document.querySelectorAll('[data-yweb-text]')];
		return current.length === globalThis.__ywebUiNodes.size && current.every((element) => globalThis.__ywebUiNodes.get(element.dataset.ywebText) === element && element.isConnected);
	});
	assert.equal(stable, true, `${name}の入力同期で意味DOMを作り直している`);
	if (forbidden) assert.equal(await page.locator(forbidden).count(), 0, `${name}の操作後に文字以外をDOMへ移している`);
}

// Browser scroll後のhover色、親子順、除外、非表示回収、Godot offsetを検査する。
async function exerciseHover(page, name) {
	const root = page.locator('#yweb-text-root');
	const wait = async (value) => {
		try {
			await root.getByText(value, { exact: true }).waitFor();
		} catch (error) {
			const current = await page.locator('[data-yweb-text]').evaluateAll((nodes) => nodes.map((node) => node.textContent).find((text) => text.startsWith('HOVER ')) || '');
			throw new Error(`${name}のhover状態が違う: 期待=${value} 実際=${current}`, { cause: error });
		}
	};
	const active = root.getByRole('button', { name: 'SCROLLED HOVER', exact: true });
	const disabled = root.getByRole('button', { name: 'DISABLED HOVER', exact: true });
	const ignored = root.getByRole('button', { name: 'IGNORED HOVER', exact: true });
	const hidden = root.getByRole('button', { name: 'HIDE ON HOVER', exact: true });
	const recursive = root.getByRole('button', { name: 'RECURSIVE DISABLED', exact: true });
	const scroll = page.locator('[data-yweb-scroll]').last();
	await scroll.evaluate((element) => {
		element.scrollLeft = 100;
		element.dispatchEvent(new Event('scroll'));
	});
	await page.waitForFunction(() => {
		const node = [...document.querySelectorAll('button')].find((element) => element.textContent === 'SCROLLED HOVER');
		const rect = node?.getBoundingClientRect();
		return rect && rect.left >= 0 && rect.right <= innerWidth;
	});
	await wait('GODOT OFFSET 0');
	const box = () => active.evaluate((node) => getComputedStyle(document.getElementById(`${node.id}-box`)).backgroundColor);
	const normal = await box();
	const actionStyle = await active.evaluate((node) => {
		const style = getComputedStyle(node);
		const boxWidth = document.getElementById(`${node.id}-box`).getBoundingClientRect().width;
		return { width: node.getBoundingClientRect().width, boxWidth, padding: Number.parseFloat(style.paddingLeft) };
	});
	assert.ok(Math.abs(actionStyle.width - actionStyle.boxWidth) <= 1 && actionStyle.padding >= 20, `${name}のButton全体と文字余白が分離されていない: ${JSON.stringify(actionStyle)}`);
	await active.hover({ position: { x: 4, y: 4 } });
	await wait('HOVER 1/0/0/0/1/0/0/0/0/0/0/0 1/0/0');
	await root.getByText('ORDER parent-enter,active-enter', { exact: true }).waitFor();
	assert.notEqual(await box(), normal, `${name}のhover色が変わらない`);
	const activeBox = await active.boundingBox();
	await page.mouse.move(activeBox.x + activeBox.width + 2, activeBox.y + activeBox.height / 2);
	await wait('HOVER 1/1/0/0/1/1/0/0/0/0/0/0 0/0/0');
	await root.getByText('ORDER parent-enter,active-enter,active-exit,parent-exit', { exact: true }).waitFor();
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	assert.equal(await root.getByText(/^CANVAS /).textContent(), 'CANVAS 1/0', `${name}の背面Canvasへhoverが届かない`);
	await page.mouse.move(activeBox.x + activeBox.width + 4, activeBox.y + activeBox.height / 2);
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	await wait('HOVER 1/1/0/0/1/1/0/0/0/0/0/0 0/0/0');
	assert.equal(await box(), normal, `${name}のhover色が戻らない`);
	await page.mouse.move(780, 580);
	await root.getByText('CANVAS 1/1', { exact: true }).waitFor();
	await scroll.evaluate((element) => {
		element.scrollLeft = 410;
		element.dispatchEvent(new Event('scroll'));
	});
	await disabled.hover();
	await wait('HOVER 1/1/1/0/1/1/0/0/0/0/0/0 0/1/0');
	await page.mouse.move(780, 580);
	await wait('HOVER 1/1/1/1/1/1/0/0/0/0/0/0 0/0/0');
	assert.equal(await disabled.isDisabled(), true, `${name}のdisabled状態が失われた`);
	await scroll.evaluate((element) => {
		element.scrollLeft = 600;
		element.dispatchEvent(new Event('scroll'));
	});
	assert.equal(await ignored.evaluate((node) => getComputedStyle(node).pointerEvents), 'none', `${name}のMOUSE_FILTER_IGNOREがBrowser hit対象になっている`);
	const ignoredBox = await ignored.boundingBox();
	await page.mouse.move(ignoredBox.x + ignoredBox.width / 2, ignoredBox.y + ignoredBox.height / 2);
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const ignoredCounts = await root.getByText(/^HOVER /).textContent();
	assert.match(ignoredCounts, /^HOVER 1\/1\/1\/1\/\d+\/\d+\/0\/0\/0\/0\/0\/0 /, `${name}のMOUSE_FILTER_IGNOREからsignalが届いている`);
	await page.mouse.move(780, 580);
	await scroll.evaluate((element) => {
		element.scrollLeft = 780;
		element.dispatchEvent(new Event('scroll'));
	});
	await hidden.hover();
	await root.getByText(/^HOVER 1\/1\/1\/1\/\d+\/\d+\/0\/0\/1\/0\/0\/0 0\/0\/1$/).waitFor();
	await root.getByText(/^HOVER 1\/1\/1\/1\/\d+\/\d+\/0\/0\/1\/1\/0\/0 0\/0\/0$/).waitFor();
	assert.equal(await hidden.isVisible(), false, `${name}のhover中非表示がDOMへ反映されない`);
	await scroll.evaluate((element) => {
		element.scrollLeft = 970;
		element.dispatchEvent(new Event('scroll'));
	});
	assert.equal(await recursive.evaluate((node) => getComputedStyle(node).pointerEvents), 'none', `${name}のrecursive mouse無効化がBrowser hitへ残っている`);
	const recursiveBox = await recursive.boundingBox();
	await page.mouse.move(recursiveBox.x + recursiveBox.width / 2, recursiveBox.y + recursiveBox.height / 2);
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
	const recursiveCounts = await root.getByText(/^HOVER /).textContent();
	assert.match(recursiveCounts, /^HOVER 1\/1\/1\/1\/\d+\/\d+\/0\/0\/1\/1\/0\/0 /, `${name}のrecursive無効Buttonからsignalが届いている`);
	await wait('GODOT OFFSET 0');
}

module.exports = { exerciseHover, exerciseUi };
