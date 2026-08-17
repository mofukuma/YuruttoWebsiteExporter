// エクスポート画面の文言が英語と日本語で揃うことを検査する。
// 文言表の対応、差し込み数の一致、code側へ直書きが残っていないことを見る。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const addon = path.resolve(__dirname, '../addons/yurutto_website_exporter'); // 配布addonの正本。
const table = fs.readFileSync(path.join(addon, 'i18n.gd'), 'utf8'); // 文言表。
const users = ['platform.gd', 'site_builder.gd', 'project_check.gd', 'ogp_plugin.gd', 'ogp_capture.gd']; // 文言を使うscript。
const japanese = /[ぁ-んァ-ヶ一-龠]/; // 日本語を含むかの判定。

// 文言表からkeyと英日の組を読む。
const texts = new Map();
for (const line of table.split('\n')) {
	const match = /^\t"([a-z0-9_]+)": \["((?:[^"\\]|\\.)*)", "((?:[^"\\]|\\.)*)"\],$/.exec(line);
	if (match) texts.set(match[1], { en: match[2], ja: match[3] });
}
assert.ok(texts.size > 40, `文言表が読めていない: ${texts.size}`);

// 英語と日本語で差し込みの数が揃うことを見る。
for (const [key, pair] of texts) {
	assert.ok(pair.en.length > 0 && pair.ja.length > 0, `片方が空: ${key}`);
	assert.equal((pair.en.match(/%s/g) || []).length, (pair.ja.match(/%s/g) || []).length, `差し込み数が不一致: ${key}`);
	assert.equal(japanese.test(pair.en), false, `英語へ日本語が混入: ${key}`);
}

// 使う側のkeyが全て表にあることを見る。
let used = 0;
for (const name of users) {
	const source = fs.readFileSync(path.join(addon, name), 'utf8');
	for (const [, key] of source.matchAll(/I18n\.t\("([a-z0-9_]+)"/g)) {
		assert.ok(texts.has(key), `文言表にないkey: ${name} :: ${key}`);
		used += 1;
	}
	// 画面へ出る文字列の直書きが残っていないことを見る。コメントは対象外。
	// platform名はexport_presets.cfgへ保存される識別子なので、言語で変えずそのまま持つ。
	for (const [index, line] of source.split('\n').entries()) {
		if (line.startsWith('const NAME :=')) continue;
		const code = line.replace(/#.*$/, '');
		for (const [, literal] of code.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
			assert.equal(japanese.test(literal), false, `画面文言の直書き: ${name}:${index + 1} ${literal}`);
		}
	}
}

console.log(JSON.stringify({ ok: true, keys: texts.size, used, locales: ['en', 'ja'] }));
