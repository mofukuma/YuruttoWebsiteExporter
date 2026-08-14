// WindowとControlが一つの安定handle木へ同期されることを検査する。
// 通知、親子順、表示状態、Popup意味情報を一括確認する。
// 設計思想：GUI派生ごとの別管理を作らず、同じ差分境界へ集約する。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const source = path.join(root, 'tmp/godot-source'); // overlay適用済みGodot source。
const cpp = fs.readFileSync(path.join(source, 'platform/web/gdweb_dom_sync.cpp'), 'utf8');
const window = fs.readFileSync(path.join(source, 'scene/main/window.cpp'), 'utf8');
const js = fs.readFileSync(path.join(source, 'platform/web/js/libs/library_gdweb_dom.js'), 'utf8');
const resultFile = path.join(root, 'tmp/gdweb/dom-window-static-result.json'); // 静的証拠。

assert.match(cpp, /Object::cast_to<Control>\(node\) \|\| Object::cast_to<Window>\(node\)/);
assert.match(cpp, /static void sync_window\(Window \*p_window\)/);
assert.match(cpp, /while \(j >= 0 && dom_depth\(changes\[j\]\) > depth\)/);
assert.match(window, /case NOTIFICATION_POST_POPUP:[\s\S]*gdweb_dom_sync_queue\(get_instance_id\(\)\)/);
assert.match(window, /case NOTIFICATION_VISIBILITY_CHANGED:/);
assert.match(js, /if \(type === 'PopupMenu'\) return 'menu'/);
assert.match(js, /\/\^Popup\/\.test\(type\).*return 'dialog'/);
assert.match(js, /element\.dataset\.gdwebType = type/);
assert.match(js, /element\.setAttribute\('aria-modal'/);
assert.match(js, /type === 'Window'[\s\S]*element\.setAttribute\('aria-label', text\)/);

const result = { ok: true, sharedHandles: true, parentFirst: true, popupRole: true, windowDirty: true, windowTitleOnlyAria: true };
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
