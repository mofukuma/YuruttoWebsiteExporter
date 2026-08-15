// site機能を無効にしてもCanvas Theme font設定がHTMLへ伝わることを検査する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const root = path.join(repo, 'tmp/text-config'); // 最小exporter fixture。
const html = path.join(root, 'index.html'); // 設定注入対象。

// false指定と再実行時の一意性を確認する。
fs.rmSync(root, { recursive: true, force: true });
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'export_presets.cfg'), '[preset.0]\nname="Web"\nplatform="Web"\n[preset.0.options]\ngdweb/site/enabled=false\ngdweb/font/avoid_canvas_theme_font=false\n');
fs.writeFileSync(html, '<!doctype html><html><head></head><body><canvas></canvas></body></html>');
fs.writeFileSync(path.join(root, 'index.js'), `globalThis.TEST='${'x'.repeat(4096)}';`);
fs.writeFileSync(path.join(root, 'index.wasm'), Buffer.alloc(4096));
for (let count = 0; count < 2; count++) child.execFileSync('node', [path.join(repo, 'addons/gdweb_site/site_export.cjs'), root, html, 'Web']);
const output = fs.readFileSync(html, 'utf8');
assert.match(output, /GDWEB_TEXT_CONFIG=\{"avoidCanvasThemeFont":false\}/);
assert.equal((output.match(/id="gdweb-text-config"/g) || []).length, 1, '設定scriptが重複');
console.log(JSON.stringify({ ok: true, site: false, avoidCanvasThemeFont: false, scripts: 1 }));
