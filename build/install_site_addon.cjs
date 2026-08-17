#!/usr/bin/env node
// ゆるっとWebを対象Godot projectへ同じ内容で導入する。
// 独立platformを有効化し、GUIとCLI exportを一致させる。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // yweb project root。
const project = path.resolve(process.argv[2] || '.'); // 導入先Godot project。
const source = path.join(repo, 'addons/yurutto_website_exporter'); // 単体配布する正本addon。
const target = path.join(project, 'addons/yurutto_website_exporter'); // project内addon。
const file = path.join(project, 'project.godot'); // 有効化するproject設定。

assert.ok(fs.existsSync(file), `project.godotなし: ${project}`);
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true, force: true });

let text = fs.readFileSync(file, 'utf8');

// Scene同期はminimumテンプレートが所有し、旧Autoload指定を残さない。
text = text.replace(/^YWebSite=.*\n?/m, '');
text = text.replace(/\n\[autoload\]\n(?=\n\[|$)/, '\n');

const entry = '"res://addons/yurutto_website_exporter/plugin.cfg"'; // 有効化するplugin指定。

// Export設定画面へpluginを一度だけ登録する。作り直しても重複させない。
if (!/^\[editor_plugins\]$/m.test(text)) {
	text += `\n[editor_plugins]\n\nenabled=PackedStringArray(${entry})\n`;
} else if (/^enabled=PackedStringArray\((.*)\)$/m.test(text)) {
	text = text.replace(/^enabled=PackedStringArray\((.*)\)$/m, (_line, values) => {
		const kept = values.split(',').map((value) => value.trim()).filter((value) => value && value !== entry);
		return `enabled=PackedStringArray(${[...kept, entry].join(', ')})`;
	});
} else {
	text = text.replace(/^\[editor_plugins\]$/m, `[editor_plugins]\n\nenabled=PackedStringArray(${entry})`);
}

fs.writeFileSync(file, text.replace(/\n{3,}/g, '\n\n'));
console.log(JSON.stringify({ project, addon: 'res://addons/yurutto_website_exporter', platform: 'Yurutto Website' }));
