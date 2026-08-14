// DOM入力をGodot公開状態へ確定単位で戻す境界を検査する。
// IME、UTF-16変換、selection、disabled、Theme文字色を一括確認する。
// 設計思想：DOMは編集中の表示だけを持ち、確定状態はGodotへ戻す。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const source = path.join(root, 'tmp/godot-source'); // overlay適用済みGodot source。
const cpp = fs.readFileSync(path.join(source, 'platform/web/gdweb_dom_sync.cpp'), 'utf8');
const js = fs.readFileSync(path.join(source, 'platform/web/js/libs/library_gdweb_dom.js'), 'utf8');
const resultFile = path.join(root, 'tmp/gdweb/dom-input-static-result.json'); // 静的証拠。

assert.match(js, /compositionstart/);
assert.match(js, /compositionend/);
assert.match(js, /!element\.dataset\.gdwebComposing/);
assert.match(js, /Array\.from\(value\.slice\(0, utf16\)\)\.length/);
assert.match(js, /GDWebDOM\.sendText\(element, handle, 5\)/);
assert.match(js, /aria-disabled/);
assert.match(js, /GDWebDOM\.disabled\(element, event\)/);
assert.match(cpp, /line->select\(from, to\)/);
assert.match(cpp, /edit->_set_text\(text, true\)/);
assert.match(cpp, /static Vector2i dom_line_column/);
assert.match(cpp, /!line->is_editable\(\)/);
assert.match(cpp, /get_theme_color\(SNAME\("font_color"\)\)/);
assert.match(cpp, /get_theme_font_size\(SNAME\("font_size"\)\)/);

const result = { ok: true, imeCommit: true, codePointIndex: true, selection: true, disabled: true, themeText: true };
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
