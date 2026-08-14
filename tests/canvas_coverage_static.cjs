// Godot Canvas命令10種を実装または構造非採用へ全件分類する。
// CPU backend、Browser描画、画像寿命、正常fixtureの入口を一括照合する。
// 設計思想：GPU経路を戻さず、分類名だけで実装済みにしない。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // gdweb project root。
const source = path.join(repo, 'tmp/godot-source'); // overlay適用済みGodot source。
const read = (file) => fs.readFileSync(file, 'utf8');
const command = read(path.join(source, 'servers/rendering/renderer_canvas_render.h'));
const backend = read(path.join(source, 'servers/rendering/dummy/rasterizer_canvas_dummy.cpp'));
const compositor = read(path.join(source, 'servers/rendering/dummy/rasterizer_dummy.cpp'));
const texture = read(path.join(source, 'servers/rendering/dummy/storage/texture_storage.h'));
const browser = read(path.join(source, 'platform/web/js/libs/library_gdweb_canvas2d.js'));
const fixture = read(path.join(repo, 'tmp/gdweb/smoke/main.gd'));
const polygon2d = read(path.join(source, 'scene/2d/polygon_2d.cpp'));
const profile = JSON.parse(read(path.join(repo, 'build/gdweb.build')));
const resultFile = path.join(repo, 'tmp/gdweb/canvas-coverage-static-result.json'); // 静的証拠。

const block = command.match(/struct Command \{\s*enum Type \{([\s\S]*?)\};/);
assert.ok(block, 'Canvas命令enumを読めない');
const population = [...block[1].matchAll(/TYPE_[A-Z_]+/g)].map((match) => match[0]);
const implemented = [
	'TYPE_RECT', 'TYPE_NINEPATCH', 'TYPE_POLYGON', 'TYPE_PRIMITIVE',
	'TYPE_TRANSFORM', 'TYPE_CLIP_IGNORE', 'TYPE_ANIMATION_SLICE',
]; // Canvas 2Dへ意味を移した命令。
const excluded = {
	TYPE_MESH: 'MeshInstance2D',
	TYPE_MULTIMESH: 'MultiMeshInstance2D',
	TYPE_PARTICLES: 'GPUParticles2D',
}; // GPUまたはShader前提で構造非採用の命令。

for (const type of implemented) assert.match(backend, new RegExp(`Command::${type}`), `${type}分岐がない`);
for (const type of Object.values(excluded)) assert.ok(profile.disabled_classes.includes(type), `${type}がbuildへ残る`);
assert.deepEqual([...implemented, ...Object.keys(excluded)].sort(), population.sort(), 'Canvas命令の分類漏れ');
for (const operation of [0, 1, 2, 4, 6, 7]) assert.match(browser, new RegExp(`operation === ${operation}`), `Browser operation ${operation}がない`);
assert.match(backend, /godot_js_gdweb_canvas_batch\(batch\.ptr\(\), batch\.size\(\)\)/);
assert.doesNotMatch(backend, /godot_js_gdweb_canvas_command/);
assert.match(compositor, /canvas->flush\(\)/);
assert.match(read(path.join(source, 'scene/gui/label.cpp')), /draw_glyph[\s\S]*#ifdef GDWEB_2D_ENABLED[\s\S]*return;/);
assert.match(browser, /window\.gdwebCanvasMetrics = \{ commands, floats: count, flushes: 1/);
assert.match(texture, /texture_2d_initialize[\s\S]*gdweb_upload\(t\)/);
assert.match(texture, /texture_2d_update[\s\S]*gdweb_upload\(texture\)/);
assert.match(texture, /godot_js_gdweb_texture_free\(texture->gdweb_handle\)/);
assert.match(texture, /canvas_texture_set_channel[\s\S]*CANVAS_TEXTURE_CHANNEL_DIFFUSE[\s\S]*texture->diffuse = p_texture/);
assert.match(texture, /gdweb_texture_handle[\s\S]*canvas_texture_owner\.get_or_null[\s\S]*canvas->diffuse/);
assert.match(browser, /window\.gdwebTextureCount = GDWebCanvas2D\.textures\.size/);
assert.match(polygon2d, /GDWEB_2D_ENABLED[\s\S]*canvas_item_add_triangle_array/);
assert.match(backend, /repeat_source_item[\s\S]*repeat_size[\s\S]*draw_item\(transform\)/);
for (const marker of ['draw_rect(', 'draw_line(', 'draw_colored_polygon(', 'draw_texture_rect(', 'draw_style_box(']) assert.ok(fixture.includes(marker), `正常fixture不足: ${marker}`);

const result = {
	ok: true,
	population,
	implemented,
	excluded,
	browserOperations: [0, 1, 2, 4, 6, 7],
	batchBoundary: 1,
	textureLifecycle: ['initialize', 'update', 'free'],
};
fs.mkdirSync(path.dirname(resultFile), { recursive: true });
fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
