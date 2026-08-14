// DOM同期がdirty集合だけを処理し、静止frameを走査しないことを検査する。
// Control通知、差分処理、明示削除、event callbackの四経路を一括確認する。
// 設計思想：SceneTree全走査と毎frameの同値DOM更新を製品sourceへ戻さない。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const source = path.join(root, 'tmp/godot-source'); // overlay適用済みGodot source。
const cpp = fs.readFileSync(path.join(source, 'platform/web/gdweb_dom_sync.cpp'), 'utf8');
const control = fs.readFileSync(path.join(source, 'scene/gui/control.cpp'), 'utf8');
const js = fs.readFileSync(path.join(source, 'platform/web/js/libs/library_gdweb_dom.js'), 'utf8');
const resultFile = path.join(root, 'tmp/gdweb/dom-dirty-static-result.json'); // 静的証拠。

assert.match(cpp, /static HashSet<ObjectID> dirty/);
assert.match(cpp, /if \(dirty\.is_empty\(\)\) return;/);
assert.match(cpp, /for \(ObjectID object : dirty\)/);
assert.doesNotMatch(cpp, /get_child_count\(|sync_node\(|SceneTree::get_singleton/);
assert.match(control, /gdweb_dom_sync_queue\(get_instance_id\(\)\)/);
assert.match(cpp, /godot_js_gdweb_dom_remove\(\*handle\)/);
assert.match(js, /GodotRuntime\.get_func\(callback\)/);
assert.doesNotMatch(js, /alive: new Set|alive\.clear/);

const result = { ok: true, traversal: 0, dirtySet: true, explicitRemove: true, eventCallback: true };
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
