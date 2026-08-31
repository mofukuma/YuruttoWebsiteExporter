// Godotの検査用FontをBrowserと比較しやすい輪郭設定で取り込む。
// ヒンティングを切り、同じoutlineを異なる描画器へ渡した時の寸法差へ測定を絞る。

'use strict';

const fs = require('node:fs');

const settings = [
	'[remap]', '', 'importer="font_data_dynamic"', 'type="FontFile"', '',
	'[params]', '',
	'antialiasing=1', 'generate_mipmaps=false', 'disable_embedded_bitmaps=true',
	'multichannel_signed_distance_field=false', 'msdf_pixel_range=8', 'msdf_size=48',
	'allow_system_fallback=true', 'force_autohinter=false', 'modulate_color_glyphs=false',
	'hinting=0', 'subpixel_positioning=3', 'keep_rounding_remainders=true', 'Fallbacks/fallbacks=[]', '',
].join('\n'); // Browserとの比較で共有するGodot Font取込設定。

// 指定TTFのimport設定を比較条件へ固定する。
function matchBrowser(ttf) {
	fs.writeFileSync(`${ttf}.import`, settings);
}

module.exports = { matchBrowser };
