// Godot GUI登録78件を登録sourceから抽出し、所有・具象・DOM入口を照合する。
// 型名の手書き完了表を廃し、登録増減と未実証を別々に判定する。
// 設計思想：母集団合格を全GUI動作合格と混同しない。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const source = path.join(repo, 'tmp/godot-source'); // 固定Godot source。
const register = fs.readFileSync(path.join(source, 'scene/register_scene_types.cpp'), 'utf8');
const dom = fs.readFileSync(path.join(source, 'platform/web/js/libs/library_gdweb_dom.js'), 'utf8');
const exporter = fs.readFileSync(path.join(source, 'modules/gdweb/editor_export_platform_gdweb.cpp'), 'utf8');
const resultFile = path.resolve(process.argv[2] || path.join(repo, 'tmp/gdweb/gui-inventory-static-result.json')); // 静的証拠。
const manifestFile = path.join(repo, 'tmp/gdweb/normal-matrix/n16_gui/gui_manifest.json'); // source生成のGUI所有表。
const proofFile = path.join(repo, 'tmp/gdweb/normal-matrix/n16_gui/runtime-result.json'); // Chromium実行証跡。

const block = register.split('/* REGISTER GUI */')[1].split('/* REGISTER ANIMATION */')[0];
const rows = [...block.matchAll(/GDREGISTER_(CLASS|ABSTRACT_CLASS|VIRTUAL_CLASS)\(([^),]+)(?:,[^)]+)?\)/g)]
	.map((match) => ({ name: match[2].trim(), registration: match[1].toLowerCase() }));
const ownedNames = new Set(['BaseButton', 'Range', 'ScrollBar', 'Slider', 'ButtonGroup', 'Separator', 'VideoStreamPlayback', 'VideoStream', 'SyntaxHighlighter', 'CodeHighlighter', 'TreeItem', 'RichTextEffect', 'CharFXTransform', 'FoldableGroup']); // 所有Controlで確認する14型。
const owned = rows.filter((row) => ownedNames.has(row.name));
const concrete = rows.filter((row) => !ownedNames.has(row.name));
const windows = new Set(['Popup', 'PopupPanel', 'AcceptDialog', 'ConfirmationDialog', 'FileDialog', 'PopupMenu']); // Window派生の具象6型。
const semantic = ['Button', 'Label', 'LinkButton', 'LineEdit', 'TextEdit', 'CodeEdit', 'ProgressBar', 'TextureProgressBar', 'ItemList', 'Tree', 'TabBar', 'MenuBar']; // 専用HTML意味が必要な型。
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const proof = JSON.parse(fs.readFileSync(proofFile, 'utf8'));

assert.equal(rows.length, 78, 'GUI登録総数が変化');
assert.equal(new Set(rows.map((row) => row.name)).size, 78, 'GUI登録名が重複');
assert.equal(concrete.length, 64, 'GUI具象型数が変化');
assert.equal(owned.length, 14, 'GUI所有・抽象型数が変化');
assert.equal(concrete.filter((row) => windows.has(row.name)).length, 6, 'GUI Window型数が変化');
assert.deepEqual(manifest.types.map((row) => row.name), rows.map((row) => row.name), 'GUI manifestが登録順と一致しない');
assert.ok(manifest.types.every((row) => ['owned', 'window', 'native', 'aria', 'wrapper'].includes(row.owner)), 'GUI所有分類に空欄あり');
assert.equal(proof.runtime_sha256.length, 64, 'GUI証跡のruntime hashが不正');
assert.deepEqual(proof.counts, { total: 78, concrete: 64, owned: 14 }, 'GUI証跡の件数が不一致');
assert.equal(proof.themes.combinations, 9, 'Themeとviewportの直積が不足');
assert.equal(proof.mutations, 0, '静止DOM変異あり');
assert.ok(manifest.types.every((row) => row.test_status === 'proven'), 'GUI未実証あり');
assert.match(dom, /return 'div'/, '全Controlのwrapper fallbackがない');
for (const name of semantic) assert.ok(dom.includes(name), `意味DOM入口がない: ${name}`);
assert.match(dom, /\/Slider\$\/\.test\(type\)/, 'Slider派生の意味DOM入口がない');
assert.match(dom, /\/ScrollBar\$\/\.test\(type\)/, 'ScrollBar派生の意味DOM入口がない');
for (const token of ['Node3D', 'Shader', 'GDExtension', 'RenderingDevice']) assert.ok(exporter.includes(`"${token}"`), `構造拒否がない: ${token}`);

const result = {
	inventoryOk: true,
	implementationReady: true,
	counts: { total: rows.length, concrete: concrete.length, control: concrete.length - windows.size, window: windows.size, owned: owned.length },
	registered: rows,
	semantic,
	untested: [],
};
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
