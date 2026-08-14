// Godot GUI登録78件を意味DOMの所有方式へ機械分類する。
// 具象型と所有型を同じmanifestへ収録し、型追加漏れを防ぐ。
// 設計思想：HTML tagの分岐を完了表にせず、全登録型のfallbackも明記する。

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const source = path.join(root, 'tmp/godot-source'); // 固定Godot source。
const output = path.join(root, 'tmp/gdweb/normal-matrix/n16_gui/gui_manifest.json'); // N16 GUI母集団。
const proofFile = path.join(root, 'tmp/gdweb/normal-matrix/n16_gui/runtime-result.json'); // 同じruntimeの実行証跡。
const proof = fs.existsSync(proofFile) ? JSON.parse(fs.readFileSync(proofFile, 'utf8')) : null;
const register = fs.readFileSync(path.join(source, 'scene/register_scene_types.cpp'), 'utf8');
const block = register.split('/* REGISTER GUI */')[1].split('/* REGISTER ANIMATION */')[0];
const owned = new Set(['BaseButton', 'Range', 'ScrollBar', 'Slider', 'ButtonGroup', 'Separator', 'VideoStreamPlayback', 'VideoStream', 'SyntaxHighlighter', 'CodeHighlighter', 'TreeItem', 'RichTextEffect', 'CharFXTransform', 'FoldableGroup']); // 所有先で確認する型。
const windows = new Set(['Popup', 'PopupPanel', 'AcceptDialog', 'ConfirmationDialog', 'FileDialog', 'PopupMenu']); // Window派生の具象型。
const native = new Set(['Button', 'LinkButton', 'LineEdit', 'TextEdit', 'CodeEdit', 'ProgressBar', 'TextureProgressBar', 'HSlider', 'VSlider', 'HScrollBar', 'VScrollBar']); // native HTML所有型。
const aria = new Set(['CheckBox', 'CheckButton', 'ItemList', 'Tree', 'TabBar', 'MenuBar']); // ARIA固有role所有型。
const rows = [...block.matchAll(/GDREGISTER_(CLASS|ABSTRACT_CLASS|VIRTUAL_CLASS)\(([^),]+)(?:,[^)]+)?\)/g)].map((match) => {
	const name = match[2].trim();
	let owner = 'wrapper';
	if (owned.has(name)) owner = 'owned';
	else if (windows.has(name)) owner = 'window';
	else if (native.has(name)) owner = 'native';
	else if (aria.has(name)) owner = 'aria';
	const tested = proof?.ok && proof.tested_types?.includes(name);
	return { name, registration: match[1].toLowerCase(), owner, normal_tested_by: `n16_${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()}`, test_status: tested ? 'proven' : 'unproven' };
});

const manifest = { source: 'scene/register_scene_types.cpp', total: rows.length, implementationReady: rows.every((row) => row.test_status === 'proven'), types: rows };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ output, total: rows.length }));
