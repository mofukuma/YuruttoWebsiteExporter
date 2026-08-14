// 本家Display JSからGPU context依存だけを除いたCanvas 2D用入口を生成する。
// 入力の関数形を照合し、Godot更新で変換点が変わった場合は生成を止める。
// 設計思想：入力、clipboard、resizeは本家実装を保ち、GPU初期化だけを持たない。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = path.resolve(process.argv[2]); // 本家Display JS。
const output = path.resolve(process.argv[3]); // gdweb用生成JS。
let text = fs.readFileSync(source, 'utf8');

// Emscripten GL状態への依存を除去する。
text = text.replace(
	"$GodotDisplayScreen__deps: ['$GodotConfig', '$GodotOS', '$GL', 'emscripten_webgl_get_current_context'],",
	"$GodotDisplayScreen__deps: ['$GodotConfig', '$GodotOS'],",
);
text = text.replace('\t\thidpi: true,', "\t\thidpi: true,\n\t\tcontext: null,");
text = text.replace(/\t\t_updateGL: function \(\) \{[\s\S]*?\n\t\t\},\n\t\tupdateSize:/, '\t\t_updateGL: function () {},\n\t\tupdateSize:');
text = text.replace(/\n\tgodot_js_display_has_webgl__proxy:[\s\S]*?\n\t\/\*\n\t \* Canvas/, '\n\t/*\n\t * Canvas');
text = text.replace(/\n\t\tGodotEventListeners\.add\(canvas, 'webglcontextlost',[\s\S]*?\n\t\t\}, false\);/, '');
text = text.replace(
	"godot_js_display_setup_canvas: function (p_width, p_height, p_fullscreen, p_hidpi) {\n\t\tconst canvas = GodotConfig.canvas;",
	"godot_js_display_setup_canvas: function (p_width, p_height, p_fullscreen, p_hidpi) {\n\t\tconst canvas = GodotConfig.canvas;\n\t\tcanvas.setAttribute('aria-hidden', 'true');\n\t\tGodotDisplayScreen.context = canvas.getContext('2d');",
);

assert.doesNotMatch(text, /webgl|opengl|gles/i, 'GPU context語がDisplay JSに残存');
assert.match(text, /GodotDisplayScreen__deps: \['\$GodotConfig', '\$GodotOS'\]/, '依存変換失敗');
assert.match(text, /_updateGL: function \(\) \{\}/, 'resize変換失敗');
assert.match(text, /context = canvas\.getContext\('2d'\)/, 'Canvas 2D初期化がない');
assert.doesNotMatch(text, /godot_js_display_has_webgl/, 'GPU能力検査が残存');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, text);
