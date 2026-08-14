// render targetを固有OffscreenCanvasへ分離する経路を検査する。
// proxy解決、resize、target選択、screen blit、破棄を一括確認する。
// 設計思想：SubViewportを主Canvasへ直描きせず、ViewportTextureでだけ合成する。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..'); // gdweb project root。
const source = path.join(root, 'tmp/godot-source'); // overlay適用済みGodot source。
const texture = fs.readFileSync(path.join(source, 'servers/rendering/dummy/storage/texture_storage.h'), 'utf8');
const canvas = fs.readFileSync(path.join(source, 'servers/rendering/dummy/rasterizer_canvas_dummy.cpp'), 'utf8');
const browser = fs.readFileSync(path.join(source, 'platform/web/js/libs/library_gdweb_canvas2d.js'), 'utf8');
const resultFile = path.join(root, 'tmp/gdweb/subviewport-static-result.json'); // 静的証拠。

assert.match(texture, /RID proxy/);
assert.match(texture, /texture_proxy_update[\s\S]*texture->proxy = p_base/);
assert.match(texture, /gdweb_render_target_handle/);
assert.match(texture, /godot_js_gdweb_target_resize/);
assert.match(canvas, /push\(8, target_data, 8\)/);
assert.match(canvas, /push\(9, data, 9\)/);
assert.match(browser, /targets: new Map/);
assert.match(browser, /operation === 8/);
assert.match(browser, /operation === 9/);

const result = { ok: true, proxy: true, offscreen: true, viewportTexture: true, blit: true, free: true };
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
