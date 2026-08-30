#!/usr/bin/env node
// 既存presetを独立したゆるっとWebへ正規化する。
// 標準Web固有値を除き、GUIとCLIへ同じ最小設定を渡す。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const project = path.resolve(process.argv[2] || '.'); // Godot project root。
const name = process.argv[3] || 'Web'; // 正規化するpreset名。
const level = { dom: 0, '2d': 1, '3d': 2 }[process.env.YWEB_LEVEL || '2d']; // 開発templateと同じ書き出し段。
const production = process.env.YWEB_PRODUCTION === '1'; // 公開条件を明示した検査で本番安全検査を有効にする。
const file = path.join(project, 'export_presets.cfg'); // Godot export設定。
const prefixes = ['custom_template/', 'variant/', 'progressive_web_app/', 'threads/']; // 標準Webだけの設定群。
const removed = new Set([
	'vram_texture_compression/for_mobile',
	'html/export_icon', 'html/custom_html_shell', 'html/head_include',
	'html/canvas_resize_policy', 'html/experimental_virtual_keyboard',
]); // 独立テンプレートが受け取らない個別設定。
const defaults = {
	'yweb/level': String(level),
	'vram_texture_compression/for_desktop': 'true',
	'html/focus_canvas_on_start': 'true',
	'yweb/site/enabled': 'true',
	'yweb/site/production': String(production),
	'yweb/site/config': '"res://yweb-site.json"',
	'yweb/site/base_url': '"https://example.com"',
	'yweb/site/description': '"Godotで作成したWebサイトです。"',
	'yweb/site/locale': '"ja_JP"',
	'yweb/site/favicon': '""',
	'yweb/font/matching_webfont': 'true',
	'yweb/font/avoid_canvas_theme_font': 'true',
	'yweb/ogp/image': '"res://web/ogp.png"',
	'yweb/ogp/alt': '"サイトのプレビュー画像"',
	'yweb/ogp/frame': '2',
}; // 新規presetと同じ既定値。

// 一設定が標準Web専用かを判断する。
function standard(key) {
	return removed.has(key) || prefixes.some((prefix) => key.startsWith(prefix));
}

assert.ok(fs.existsSync(file), `export_presets.cfgなし: ${file}`);
let text = fs.readFileSync(file, 'utf8');
const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const preset = new RegExp(`(\\[preset\\.(\\d+)\\]\\n)([\\s\\S]*?)(?=\\n\\[preset\\.|$)`, 'g');
let index = '';
text = text.replace(preset, (section, head, number, body) => {
	if (!new RegExp(`^name="${escaped}"$`, 'm').test(body)) return section;
	index = number;
	let meta = body.replace(/^platform=.*$/m, 'platform="Yurutto Website"');
	if (!/^platform=/m.test(meta)) meta = `${meta.replace(/\s*$/, '')}\nplatform="Yurutto Website"\n`;
	if (/^runnable=/m.test(meta)) meta = meta.replace(/^runnable=.*$/m, 'runnable=true');
	else meta = `${meta.replace(/\s*$/, '')}\nrunnable=true\n`;
	return head + meta;
});
assert.notEqual(index, '', `presetなし: ${name}`);

const header = `[preset.${index}.options]`;
const start = text.indexOf(header);
assert.ok(start >= 0, `preset optionsなし: ${name}`);
const bodyStart = start + header.length;
const next = text.indexOf('\n[preset.', bodyStart);
const end = next >= 0 ? next : text.length;
const values = new Map();
for (const line of text.slice(bodyStart, end).split(/\r?\n/)) {
	const pair = /^([^=]+)=(.*)$/.exec(line);
	if (pair && !standard(pair[1])) values.set(pair[1], pair[2]);
}
for (const [key, value] of Object.entries(defaults)) if (!values.has(key)) values.set(key, value);
const options = `\n\n${[...values].map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
text = text.slice(0, bodyStart) + options + text.slice(end);
fs.writeFileSync(file, text.replace(/\n{3,}/g, '\n\n'));
console.log(JSON.stringify({ preset: name, platform: 'Yurutto Website', embeddedTemplate: true }));
