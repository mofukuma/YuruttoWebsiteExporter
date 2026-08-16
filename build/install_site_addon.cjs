#!/usr/bin/env node
// ゆるっとWebを対象Godot projectへ同じ内容で導入する。
// 独立platformを有効化し、GUIとCLI exportを一致させる。

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const project = path.resolve(process.argv[2] || '.'); // 導入先Godot project。
const source = path.join(repo, 'addons/gdweb_site'); // 単体配布する正本addon。
const target = path.join(project, 'addons/gdweb_site'); // project内addon。
const file = path.join(project, 'project.godot'); // 有効化するproject設定。

assert.ok(fs.existsSync(file), `project.godotなし: ${project}`);
fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true, force: true });

let text = fs.readFileSync(file, 'utf8');

// Scene同期はminimum runtimeが所有し、旧Autoload指定を残さない。
text = text.replace(/^GDWebSite=.*\n?/m, '');
text = text.replace(/\n\[autoload\]\n(?=\n\[|$)/, '\n');

// Export設定画面へpluginを一度だけ登録する。
if (!/^\[editor_plugins\]$/m.test(text)) text += '\n[editor_plugins]\n\nenabled=PackedStringArray("res://addons/gdweb_site/plugin.cfg")\n';
else if (!/res:\/\/addons\/gdweb_site\/plugin\.cfg/.test(text)) {
	if (/^enabled=PackedStringArray\((.*)\)$/m.test(text)) {
		text = text.replace(/^enabled=PackedStringArray\((.*)\)$/m, (_line, values) => `enabled=PackedStringArray(${values}${values.trim() ? ', ' : ''}"res://addons/gdweb_site/plugin.cfg")`);
	} else {
		text = text.replace(/^\[editor_plugins\]$/m, '[editor_plugins]\n\nenabled=PackedStringArray("res://addons/gdweb_site/plugin.cfg")');
	}
}

fs.writeFileSync(file, text.replace(/\n{3,}/g, '\n\n'));
console.log(JSON.stringify({ project, addon: 'res://addons/gdweb_site', platform: 'ゆるっとWebサイト' }));
