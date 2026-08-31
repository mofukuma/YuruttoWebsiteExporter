/**************************************************************************/
/*  yweb_text_sync.cpp                                                   */
/**************************************************************************/

// Control、2D描画、3Dの平面とMeshを意味と見た目に合うDOMへ同期する。
// ObjectIDで対象を保持し、配置、形、文字、画像の確定値はGodotを唯一の正本にする設計。

#include "yweb_text_sync.h"

#include "core/object/object.h"
#include "core/io/resource_loader.h"
#include "core/io/json.h"
#include "core/templates/hash_map.h"
#include "core/templates/hash_set.h"
#include "scene/gui/base_button.h"
#include "scene/gui/button.h"
#include "scene/gui/check_box.h"
#include "scene/gui/check_button.h"
#include "scene/gui/code_edit.h"
#include "scene/gui/color_picker.h"
#include "scene/gui/label.h"
#include "scene/gui/line_edit.h"
#include "scene/gui/link_button.h"
#include "scene/gui/text_edit.h"
#include "scene/main/scene_tree.h"
#include "scene/main/viewport.h"
#include "scene/main/window.h"
#include "scene/resources/font.h"
#include "scene/resources/label_settings.h"
#include "scene/resources/text_line.h"
#include "core/crypto/crypto_core.h"
#include "core/io/image.h"
#include "scene/2d/sprite_2d.h"
#include "scene/2d/line_2d.h"
#include "scene/2d/mesh_instance_2d.h"
#include "scene/2d/multimesh_instance_2d.h"
#include "scene/2d/animated_sprite_2d.h"
#include "scene/2d/cpu_particles_2d.h"
#include "scene/2d/gpu_particles_2d.h"
#include "scene/2d/polygon_2d.h"
#include "scene/2d/physics/touch_screen_button.h"
#include "scene/2d/tile_map_layer.h"
#include "scene/gui/color_rect.h"
#include "scene/gui/progress_bar.h"
#include "scene/gui/rich_text_label.h"
#include "scene/gui/option_button.h"
#include "scene/gui/popup_menu.h"
#include "scene/gui/scroll_bar.h"
#include "scene/gui/scroll_container.h"
#include "scene/gui/subviewport_container.h"
#include "scene/gui/separator.h"
#include "scene/gui/slider.h"
#include "scene/gui/nine_patch_rect.h"
#include "scene/gui/texture_rect.h"
#include "scene/gui/texture_button.h"
#include "scene/gui/texture_progress_bar.h"
#include "scene/gui/virtual_joystick.h"
#include "scene/gui/video_stream_player.h"
#include "scene/resources/style_box.h"
#include "scene/resources/style_box_flat.h"
#include "scene/resources/style_box_line.h"
#include "scene/resources/atlas_texture.h"
#include "scene/resources/sprite_frames.h"
#include "scene/resources/texture.h"
#include "scene/resources/particle_process_material.h"
#include "scene/resources/2d/tile_set.h"
#include "servers/rendering/rendering_server.h"
#ifndef _3D_DISABLED
#include "modules/csg/csg_shape.h"
#include "modules/gridmap/grid_map.h"
#include "scene/3d/cpu_particles_3d.h"
#include "scene/3d/camera_3d.h"
#include "scene/3d/decal.h"
#include "scene/3d/gpu_particles_3d.h"
#include "scene/3d/importer_mesh_instance_3d.h"
#include "scene/3d/label_3d.h"
#include "scene/3d/mesh_instance_3d.h"
#include "scene/3d/multimesh_instance_3d.h"
#include "scene/3d/sprite_3d.h"
#include "scene/resources/3d/importer_mesh.h"
#include "scene/resources/material.h"
#include "scene/resources/mesh.h"
#endif

typedef void (*YWebTextEvent)(const char *, int, const char *, int, int);
typedef void (*YWebSiteEvent)(const char *);

extern "C" {
void yweb_text_set_event_cb(YWebTextEvent p_callback);
void yweb_site_set_event_cb(YWebSiteEvent p_callback);
int yweb_text_prefer_dom();
void yweb_site_scene(const char *p_path);
void yweb_text_begin();
void yweb_text_sync(const char *p_uid, const char *p_text, const char *p_aux, const char *p_font, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_flags, int p_z, int p_horizontal, int p_vertical, int p_kind, int p_max_length, int p_selection_start, int p_selection_end, float p_red, float p_green, float p_blue, float p_alpha, float p_font_size, float p_line_spacing, float p_outline_red, float p_outline_green, float p_outline_blue, float p_outline_alpha, float p_outline_size, float p_shadow_red, float p_shadow_green, float p_shadow_blue, float p_shadow_alpha, float p_shadow_x, float p_shadow_y, float p_underline_offset, float p_underline_thickness, float p_placeholder_red, float p_placeholder_green, float p_placeholder_blue, float p_placeholder_alpha, float p_font_ascent, float p_glyph_top, float p_glyph_bottom, float p_scroll_x, float p_scroll_y);
// Button全体の操作範囲と内側文字の余白をBrowserへ渡す。
void yweb_action_sync(const char *p_uid, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, float p_left, float p_top, float p_right, float p_bottom);
void yweb_code_sync(const char *p_uid, const char *p_state);
void yweb_text_remove(const char *p_uid);
void yweb_clip_sync(const char *p_uid, const char *p_owner, float p_left, float p_top, float p_right, float p_bottom, int p_enabled);
void yweb_scroll_sync(const char *p_uid, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, float p_max_x, float p_max_y);
void yweb_scroll_member(const char *p_uid, const char *p_owner);
void yweb_animation_sync(const char *p_uid, float p_length, float p_begin, float p_end, float p_offset, int p_enabled);
void yweb_image_data(const char *p_key, const char *p_data);
void yweb_draw_reset(const char *p_prefix);
void yweb_draw_touch(const char *p_prefix);
void yweb_image_sync(const char *p_uid, const char *p_key, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_z, float p_red, float p_green, float p_blue, float p_alpha);
void yweb_image_region_sync(const char *p_uid, const char *p_key, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, float p_image_width, float p_image_height, float p_src_x, float p_src_y, float p_src_width, float p_src_height, int p_z, float p_red, float p_green, float p_blue, float p_alpha);
void yweb_nine_patch_sync(const char *p_uid, const char *p_key, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, float p_left, float p_top, float p_right, float p_bottom, int p_z, int p_horizontal, int p_vertical, int p_center, float p_red, float p_green, float p_blue, float p_alpha);
void yweb_box_sync(const char *p_uid, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_z, float p_red, float p_green, float p_blue, float p_alpha, float p_left, float p_top, float p_right, float p_bottom, float p_border_red, float p_border_green, float p_border_blue, float p_border_alpha, float p_top_left, float p_top_right, float p_bottom_right, float p_bottom_left);
void yweb_polygon_sync(const char *p_uid, const char *p_points, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_z, float p_red, float p_green, float p_blue, float p_alpha);
void yweb_gradient_sync(const char *p_uid, int p_kind, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_z, float p_red, float p_green, float p_blue, float p_alpha);
void yweb_plane_sync(const char *p_uid, const char *p_type, const char *p_key, const char *p_text, float p_x0, float p_y0, float p_x1, float p_y1, float p_x2, float p_y2, float p_x3, float p_y3, float p_width, float p_height, int p_z, int p_kind, float p_red, float p_green, float p_blue, float p_alpha, float p_font_size);
void yweb_project_sync(const char *p_owner, float p_width, float p_height, float p_x0, float p_y0, float p_x1, float p_y1, float p_x2, float p_y2, float p_x3, float p_y3, int p_z);
void yweb_triangle_sync(const char *p_uid, const char *p_type, const char *p_group, float p_x0, float p_y0, float p_x1, float p_y1, float p_x2, float p_y2, int p_z, float p_red, float p_green, float p_blue, float p_alpha);
void yweb_text_end();
}

enum TextKind {
	TEXT_LABEL,
	TEXT_BUTTON,
	TEXT_LINK,
	TEXT_LINE_INPUT,
	TEXT_AREA,
	TEXT_CONTROL,
	TEXT_CODE,
};

enum TextFlag {
	TEXT_VISIBLE = 1,
	TEXT_RTL = 2,
	TEXT_CLIP = 4,
	TEXT_WRAP = 8,
	TEXT_UNDERLINE = 16,
	TEXT_EDITABLE = 32,
	TEXT_FOCUSED = 64,
	TEXT_SECRET = 128,
	TEXT_DISABLED = 256,
	TEXT_KEYBOARD_FOCUS = 1024,
	TEXT_MOUSE = 2048, // BrowserがButton全体のpointer入力を所有する。
	TEXT_POPUP = 4096, // PopupMenuの実項目をhoverと選択へ結ぶ。
};

struct TextState {
	String text; // 表示する翻訳済み文字列または入力値。
	String aux; // LinkのURIまたは入力のplaceholder。
	Rect2 rect; // Control内のDOM所有矩形。
	int kind = TEXT_LABEL; // DOM要素を決めるControl種別。
	int flags = 0; // clip、wrap、underline、入力状態。
	int horizontal = HORIZONTAL_ALIGNMENT_LEFT; // 文字の横整列。
	int vertical = VERTICAL_ALIGNMENT_TOP; // 文字の縦整列。
	int max_length = 0; // LineEditの最大文字数。0は無制限。
	int selection_start = 0; // Unicode文字単位の選択開始。
	int selection_end = 0; // Unicode文字単位の選択終了。
	Color color; // 状態とThemeを反映した文字色。
	float font_size = 16.0f; // Theme由来の文字寸法。
	float line_spacing = 0.0f; // 複数行の追加間隔。
	Color outline; // 文字縁の色。
	float outline_size = 0.0f; // 文字縁の幅。
	Color shadow; // 文字影の色。
	Vector2 shadow_offset; // 文字影の位置。
	float underline_offset = 0.0f; // underlineと文字の間隔。
	float underline_thickness = 0.0f; // underlineの太さ。
	Color placeholder; // 未入力時の案内文字色。
	Vector2 scroll; // textareaが所有する横縦scroll位置。
	String font; // 複数文字項目が実際に使うfont resource path。
};

struct OutlineState {
	Color color; // 次の通常文字描画へ付ける縁色。
	int size = 0; // 次の通常文字描画へ付ける縁幅。
};

struct GlyphState {
	uint64_t font = 0; // Variationとfallbackを含む実描画fontの識別値。
	String text; // 計測した文字列。
	int size = 0; // 計測した文字寸法。
	float ascent = 0.0f; // 行上端から基線までのGodot寸法。
	float top = 0.0f; // 基線から字形上端までのGodot寸法。
	float bottom = 0.0f; // 基線から字形下端までのGodot寸法。
	bool edge = false; // Chromium向け字形edge補正を使える実描画輪郭の有無。
};

struct EditState {
	uint32_t version = 0; // 本文が変わったかを判定するGodot編集番号。
	String text; // 変更時に取得した全文。毎frameの連結を避ける。
	CharString utf8; // WASMへ渡すUTF-8。変更時に一度作る。
	Vector<int> lines; // caret位置を全文先頭から数える各行の開始位置。
	bool sent = false; // 現本文をBrowserへ渡し終えた状態。
	bool present = false; // 前frameにDOMを所有していた状態。
	bool seen = false; // 現frameにDOMを所有した状態。
};

#ifndef GLES3_ENABLED
void yweb_draw_polygon(CanvasItem *p_item, const Vector<Point2> &p_points, const Vector<Color> &p_colors);
#endif

static HashSet<ObjectID> dirty; // 登録状態を見直すControl識別子。
static HashSet<ObjectID> tracked; // 毎frame追従するDOM指定Control。
static HashMap<ObjectID, TextState> states; // draw時に確定したButton系文字状態。
static HashMap<ObjectID, Vector<TextState>> parts; // 一Control内の複数文字項目。
static HashMap<RID, ObjectID> canvas_owners; // 文字描画canvasとControlの対応。
static HashMap<ObjectID, Vector<RID>> owner_canvases; // Control解放時に回収するCanvas RID一覧。
static HashMap<ObjectID, OutlineState> outlines; // outline直後の通常文字へ渡す状態。
static HashMap<String, GlyphState> glyph_states; // DOM UIDごとの字形範囲。文字が変わった時に測り直す。
static HashMap<String, Ref<Font>> font_resources; // 描画捕捉pathごとのfont。毎frameの再読込を避ける。
static HashMap<ObjectID, EditState> edit_states; // TextEdit本文と行位置を編集時に更新するcache。
static HashMap<ObjectID, String> code_states; // CodeEdit表示JSONを変更時とscroll時に更新する判定値。
static int paint_order = -1; // 木を辿る間に使う重なり順。-1は走査の外。
static HashMap<ObjectID, int> node_orders; // nodeごとの重なり順。描画命令は別timingで走るためここから引く。
static HashSet<String> sent_images; // Browserへ渡し終えた画像の識別値。
static bool event_ready = false; // Browser入力callbackの登録状態。
static ObjectID site_scene; // Browserへ通知済みのcurrent scene識別子。
#ifndef GLES3_ENABLED
static const int DOM_ORDER_STEP = 100000; // z値の間へ同じzの木順を収める幅。
#endif
#ifndef _3D_DISABLED
static HashMap<ObjectID, ObjectID> viewport_sprites; // SubViewportを表示するSprite3Dの対応。
#endif

// SubViewport内の座標を表示先Containerまで合成し、平坦DOMの最終座標にする。
static Transform2D canvas_transform(CanvasItem *p_item) {
	Transform2D transform = p_item->get_global_transform_with_canvas();
	for (Node *node = p_item->get_parent(); node; node = node->get_parent()) {
		// 埋め込みWindow内のCanvas座標へ、画面上のWindow位置を足す。
		Window *window = Object::cast_to<Window>(node);
		if (window && window->get_parent()) transform = Transform2D(0, Vector2(window->get_position())) * transform;
		SubViewport *viewport = Object::cast_to<SubViewport>(node);
		SubViewportContainer *container = viewport ? Object::cast_to<SubViewportContainer>(viewport->get_parent()) : nullptr;
		if (!container) continue;
		Vector2 scale(1, 1);
		const Size2 source = viewport->get_size();
		if (container->is_stretch_enabled() && source.x > 0 && source.y > 0) scale = container->get_size() / source;
		transform = container->get_global_transform_with_canvas() * Transform2D(0, scale, 0, Vector2()) * transform;
		node = container;
	}
	return transform;
}

#ifndef GLES3_ENABLED
// 親Controlごとの切り抜き範囲を渡し、Browserスクロール後にも正しい交差を作れるようにする。
static void sync_clip(CanvasItem *p_item) {
	const CharString uid = String::num_uint64((uint64_t)p_item->get_instance_id()).utf8();
	for (Node *node = p_item->get_parent(); node; node = node->get_parent()) {
		Control *control = Object::cast_to<Control>(node);
		if (!control || (!control->is_clipping_contents() && !Object::cast_to<SubViewportContainer>(control))) continue;
		const Transform2D transform = canvas_transform(control);
		const Size2 size = control->get_size();
		Rect2 area(transform.xform(Vector2()), Vector2());
		area = area.expand(transform.xform(Vector2(size.x, 0)));
		area = area.expand(transform.xform(Vector2(0, size.y)));
		area = area.expand(transform.xform(size));
		const CharString owner = String::num_uint64((uint64_t)control->get_instance_id()).utf8();
		yweb_clip_sync(uid.get_data(), owner.get_data(), area.position.x, area.position.y, area.get_end().x, area.get_end().y, 1);
	}
}
#endif

// ObjectIDをDOM IDへ直接使える十進文字列へ変換する。
static CharString text_uid(ObjectID p_object) {
	return String::num_uint64((uint64_t)p_object).utf8();
}

// 指定ControlがDOM前面文字として登録されているかを返す。
static bool capture_control(const Control *p_control) {
	if (!p_control) return false;
	return p_control->is_class(SNAME("MenuBar")) || p_control->is_class(SNAME("TabBar")) ||
			p_control->is_class(SNAME("ItemList")) || p_control->is_class(SNAME("Tree")) ||
			p_control->is_class(SNAME("FoldableContainer")) || p_control->is_class(SNAME("ProgressBar")) ||
			p_control->is_class(SNAME("RichTextLabel")) || p_control->is_class(SNAME("PopupMenuItems"));
}

// 標準文字Controlを既定DOM対象にし、明示falseを除外する。
static bool text_requested(const Control *p_control) {
	if (!p_control) return false;
	if (p_control->has_meta(SNAME("yweb_dom_text"))) return (bool)p_control->get_meta(SNAME("yweb_dom_text"));
	if (Object::cast_to<Label>(p_control) || Object::cast_to<Button>(p_control) || Object::cast_to<LinkButton>(p_control) || Object::cast_to<LineEdit>(p_control)) return true;
	if (Object::cast_to<TextEdit>(p_control)) return true;
	return capture_control(p_control);
}

// 任意shaderへ変換できないCanvas MaterialをDOMで誤再現しないため共通判定する。
static bool common_supported(const Control *p_control) {
	if (p_control->get_material().is_valid() || p_control->get_use_parent_material()) {
		WARN_PRINT_ONCE("DOM文字にMaterialがあります。DOM代替表示またはCanvas表示へ退避します。");
		return false;
	}
	return true;
}

// LabelSettingsを含む実際のfont resourceを取得する。
static Ref<Font> control_font(const Control *p_control) {
	Ref<Font> font;
	if (const Label *label = Object::cast_to<Label>(p_control)) {
		const Ref<LabelSettings> settings = label->get_label_settings();
		if (settings.is_valid()) font = settings->get_font();
	}
	if (font.is_null()) font = p_control->get_theme_font(SNAME("font"));
	return font;
}

// Variationの実描画設定を保ったまま、Browserへ渡す元font fileを取得する。
static String font_resource_path(Ref<Font> p_font) {
	Ref<Font> font = p_font;
	while (font.is_valid()) {
		Ref<FontVariation> variation = font;
		if (variation.is_null()) break;
		font = variation->get_base_font();
	}
	return font.is_valid() ? font->get_path() : String();
}

// 描画捕捉が渡すfont pathを一度読み、同じresourceを字形計測へ使う。
static Ref<Font> load_font(const String &p_path) {
	if (const Ref<Font> *cached = font_resources.getptr(p_path)) return *cached;
	const Ref<Font> font = ResourceLoader::load(p_path);
	font_resources.insert(p_path, font);
	return font;
}

// CSS行箱へGodot Fontの実高を渡し、複数行の基線間隔を揃える。
static float font_spacing(const Control *p_control, float p_size, float p_extra = 0.0f) {
	const Ref<Font> font = control_font(p_control);
	return (font.is_valid() ? font->get_height(p_size) - p_size : 0.0f) + p_extra;
}

// 実際の字形輪郭を測り、Browser側の同じ文字へ縦寸法を合わせる基準にする。
static GlyphState glyph_state(const String &p_uid, const String &p_text, const Ref<Font> &p_font, int p_size) {
	uint64_t font_id = p_font.is_valid() ? (uint64_t)p_font->get_instance_id() : 0;
	if (p_font.is_valid()) {
		const TypedArray<RID> rids = p_font->get_rids();
		for (int index = 0; index < rids.size(); index++) {
			const RID rid = rids[index];
			font_id ^= rid.get_id() + 0x9e3779b97f4a7c15ULL + (font_id << 6) + (font_id >> 2);
		}
	}
	if (const GlyphState *cached = glyph_states.getptr(p_uid)) {
		if (cached->font == font_id && cached->text == p_text && cached->size == p_size) return *cached;
	}
	GlyphState state;
	state.font = font_id;
	state.text = p_text;
	state.size = p_size;
	if (p_font.is_valid() && !p_text.is_empty()) {
		// 複数行へ同じ補正を掛けるため、先頭の実文字行をBrowserと共通の計測基準にする。
		String sample;
		int start = 0;
		while (start < p_text.length()) {
			const int found = p_text.find("\n", start);
			const int end = found < 0 ? p_text.length() : found;
			if (end > start) {
				sample = p_text.substr(start, end - start);
				break;
			}
			if (found < 0) break;
			start = found + 1;
		}
		TextLine line(sample, p_font, p_size);
		const Size2 shaped_size = line.get_size();
		(void)shaped_size;
		state.ascent = line.get_line_ascent();
		const int count = TS->shaped_text_get_glyph_count(line.get_rid());
		const Glyph *glyphs = TS->shaped_text_get_glyphs(line.get_rid());
		bool found = false;
		for (int index = 0; index < count; index++) {
			if (!glyphs[index].font_rid.is_valid()) continue;
			const Dictionary contour = TS->font_get_glyph_contours(glyphs[index].font_rid, glyphs[index].font_size, glyphs[index].index);
			const PackedVector3Array points = contour.get("points", PackedVector3Array());
			for (const Vector3 &point : points) {
				const float y = glyphs[index].y_off + point.y;
				if (!found) {
					state.top = y;
					state.bottom = y;
					found = true;
				} else {
					state.top = MIN(state.top, y);
					state.bottom = MAX(state.bottom, y);
				}
			}
		}
		state.edge = found;
	}
	glyph_states.insert(p_uid, state);
	return state;
}

// 解放Nodeの本文と内部項目に結び付いた字形計測をまとめて捨てる。
static void erase_glyph_states(const String &p_uid) {
	Vector<String> removed;
	for (const KeyValue<String, GlyphState> &entry : glyph_states) {
		if (entry.key == p_uid || entry.key.begins_with(p_uid + "-")) removed.push_back(entry.key);
	}
	for (const String &uid : removed) glyph_states.erase(uid);
}

// DOMで正確に再現できるControl文字を所有する。
bool yweb_text_dom_owns(const Control *p_control) {
	if (!text_requested(p_control)) return false;
	const bool prefer_dom = yweb_text_prefer_dom() != 0;
	if (!common_supported(p_control) && !prefer_dom) return false;
	if (const Label *label = Object::cast_to<Label>(p_control)) {
		bool supported = label->get_visible_characters() < 0 && label->get_visible_ratio() >= 1.0f;
		supported = supported && !label->is_uppercase() && label->get_tab_stops().is_empty() && label->get_text_overrun_behavior() == TextServer::OVERRUN_NO_TRIMMING && label->get_lines_skipped() == 0 && label->get_max_lines_visible() < 0;
		const Ref<LabelSettings> settings = label->get_label_settings();
		if (settings.is_valid()) {
			supported = supported && settings->get_shadow_size() == 0 && settings->get_paragraph_spacing() == 0 && settings->get_stacked_outline_data().is_empty() && settings->get_stacked_shadow_data().is_empty();
		}
		if (!supported) {
			WARN_PRINT_ONCE("Labelの複合文字装飾を簡易DOM表示へ置き換えます。");
		}
		return supported || prefer_dom;
	}
	if (const Button *button = Object::cast_to<Button>(p_control)) {
		const bool supported = button->get_autowrap_mode() == TextServer::AUTOWRAP_OFF && button->get_text_overrun_behavior() == TextServer::OVERRUN_NO_TRIMMING;
		if (!supported) {
			WARN_PRINT_ONCE("Buttonのwrapまたは文字省略をBrowser標準表示へ置き換えます。");
		}
		return supported || prefer_dom;
	}
	if (const LinkButton *link = Object::cast_to<LinkButton>(p_control)) {
		const bool supported = link->get_text_overrun_behavior() == TextServer::OVERRUN_NO_TRIMMING;
		if (!supported) {
			WARN_PRINT_ONCE("LinkButtonの文字省略をBrowser標準表示へ置き換えます。");
		}
		return supported || prefer_dom;
	}
	if (Object::cast_to<LineEdit>(p_control)) return true;
	if (const TextEdit *edit = Object::cast_to<TextEdit>(p_control)) {
		if (Object::cast_to<CodeEdit>(p_control)) return true;
		if (p_control->get_class() != SNAME("TextEdit")) return false;
		if (edit->get_caret_count() != 1 || edit->get_gutter_count() != 0 || edit->is_drawing_minimap() || edit->get_syntax_highlighter().is_valid()) {
			WARN_PRINT_ONCE("TextEditの補助表示をtextarea標準表示へ置き換えます。primary caretを同期します。");
		}
		return true;
	}
	return capture_control(p_control);
}

// 意味DOMがmouse入力を所有するButton系かを判定する。
bool yweb_text_dom_action_owns(const Control *p_control) {
	return Object::cast_to<BaseButton>(p_control) && yweb_text_dom_owns(p_control);
}

// 一つの文字状態を現在の画面transformと合成してDOMへ送る。
static void sync_text(Control *p_control, const TextState &p_state, const CharString &p_uid = CharString(), const CharString *p_text = nullptr, bool p_omit_text = false) {
	const ObjectID object = p_control->get_instance_id();
	const CharString uid = p_uid.is_empty() ? text_uid(object) : p_uid;
	const String uid_text = String::utf8(uid.get_data());
	if (!p_control->is_inside_tree() || !yweb_text_dom_owns(p_control)) {
		yweb_text_remove(uid.get_data());
		glyph_states.erase(uid_text);
		return;
	}

	Transform2D transform = canvas_transform(p_control);
	transform[2] = transform.xform(p_state.rect.position);
	const Color modulate = p_control->get_modulate_in_tree() * p_control->get_self_modulate();
	const Color color = p_state.color * modulate;
	const Color outline = p_state.outline * modulate;
	const Color shadow = p_state.shadow * modulate;
	int flags = p_state.flags;
	flags = p_control->is_visible_in_tree() ? flags | TEXT_VISIBLE : flags & ~TEXT_VISIBLE;
	flags = p_control->is_layout_rtl() ? flags | TEXT_RTL : flags & ~TEXT_RTL;
	const CharString text = p_text ? *p_text : p_state.text.utf8();
	const CharString aux = p_state.aux.utf8();
	Ref<Font> font_resource = control_font(p_control);
	if (!p_state.font.is_empty()) font_resource = load_font(p_state.font);
	const CharString font = font_resource_path(font_resource).utf8();
	GlyphState glyph;
	if (p_state.kind != TEXT_AREA && p_state.kind != TEXT_CODE) glyph = glyph_state(uid_text, p_state.text, font_resource, p_state.font_size);
	const int *order = node_orders.getptr(p_control->get_instance_id());
	yweb_text_sync(
			uid.get_data(), p_omit_text ? nullptr : text.get_data(), aux.get_data(), font.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_state.rect.size.x, p_state.rect.size.y, flags, paint_order >= 0 ? paint_order : (order ? *order : p_control->get_z_index()), p_state.horizontal, p_state.vertical, p_state.kind, p_state.max_length, p_state.selection_start, p_state.selection_end,
			color.r, color.g, color.b, color.a, p_state.font_size, p_state.line_spacing,
			outline.r, outline.g, outline.b, outline.a, p_state.outline_size,
			shadow.r, shadow.g, shadow.b, shadow.a, p_state.shadow_offset.x, p_state.shadow_offset.y,
			p_state.underline_offset, p_state.underline_thickness,
			p_state.placeholder.r, p_state.placeholder.g, p_state.placeholder.b, p_state.placeholder.a,
			glyph.ascent, glyph.top, glyph.bottom,
			p_state.scroll.x, p_state.scroll.y);
	// Buttonの意味DOMはControl全体でhitし、文字はThemeの内側へ配置する。
	if (Object::cast_to<BaseButton>(p_control)) {
		const Transform2D action = canvas_transform(p_control);
		const Size2 size = p_control->get_size();
		const Rect2 content = p_state.rect;
		yweb_action_sync(uid.get_data(), action[0].x, action[0].y, action[1].x, action[1].y, action[2].x, action[2].y,
				size.x, size.y, content.position.x, content.position.y,
				MAX(0.0f, size.x - content.position.x - content.size.x), MAX(0.0f, size.y - content.position.y - content.size.y));
	}
}

// 文字Controlの内側を得る共通処理を後段で定義する。
static Rect2 input_rect(Control *p_control, const Ref<StyleBox> &p_style);

// Labelの現在値から毎frame使う文字状態を組み立てる。
static void sync_label(Label *p_label) {
	const Ref<LabelSettings> settings = p_label->get_label_settings();
	TextState state;
	state.text = p_label->get_text();
	state.rect = Rect2(Vector2(), p_label->get_size());
	state.kind = TEXT_LABEL;
	if (p_label->is_clipping_text()) state.flags |= TEXT_CLIP;
	if (p_label->get_autowrap_mode() != TextServer::AUTOWRAP_OFF) state.flags |= TEXT_WRAP;
	state.horizontal = p_label->get_horizontal_alignment();
	state.vertical = p_label->get_vertical_alignment();
	state.color = settings.is_valid() ? settings->get_font_color() : p_label->get_theme_color(SNAME("font_color"));
	state.font_size = settings.is_valid() ? settings->get_font_size() : p_label->get_theme_font_size(SNAME("font_size"));
	state.line_spacing = font_spacing(p_label, state.font_size, settings.is_valid() ? settings->get_line_spacing() : p_label->get_theme_constant(SNAME("line_spacing")));
	state.outline = settings.is_valid() ? settings->get_outline_color() : p_label->get_theme_color(SNAME("font_outline_color"));
	state.outline_size = settings.is_valid() ? settings->get_outline_size() : p_label->get_theme_constant(SNAME("outline_size"));
	state.shadow = settings.is_valid() ? settings->get_shadow_color() : p_label->get_theme_color(SNAME("font_shadow_color"));
	state.shadow_offset = settings.is_valid() ? settings->get_shadow_offset() : Vector2(p_label->get_theme_constant(SNAME("shadow_offset_x")), p_label->get_theme_constant(SNAME("shadow_offset_y")));
	sync_text(p_label, state);
}

#ifndef GLES3_ENABLED
// RichTextLabelの整形後本文を、確定内側矩形へ意味DOMとして置く。
static void sync_rich_text(RichTextLabel *p_label) {
	TextState state;
	state.text = p_label->get_parsed_text();
	state.rect = input_rect(p_label, p_label->get_theme_stylebox(SNAME("normal")));
	state.kind = TEXT_LABEL;
	state.flags = TEXT_CLIP | TEXT_WRAP;
	state.color = p_label->get_theme_color(SNAME("default_color"));
	state.font_size = p_label->get_theme_font_size(SNAME("normal_font_size"));
	state.line_spacing = font_spacing(p_label, state.font_size, p_label->get_theme_constant(SNAME("line_separation")));
	sync_text(p_label, state);
}
#endif

// StyleBox内側をBrowser入力が所有する矩形へ変換する。
static Rect2 input_rect(Control *p_control, const Ref<StyleBox> &p_style) {
	if (p_style.is_null()) return Rect2(Vector2(), p_control->get_size());
	const Size2 size = p_control->get_size() - p_style->get_minimum_size();
	return Rect2(p_style->get_offset(), Size2(MAX(0.0f, size.x), MAX(0.0f, size.y)));
}

// 入力目的をGodot metadataから意味DOMへ渡す。
static String input_aux(Control *p_control, const String &p_placeholder) {
	Dictionary value;
	value["placeholder"] = p_placeholder;
	const String names[] = { "aria_label", "name", "autocomplete", "inputmode", "description" };
	for (const String &name : names) {
		const StringName meta = StringName("yweb_" + name);
		if (p_control->has_meta(meta)) value[name] = String(p_control->get_meta(meta));
	}
	return JSON::stringify(value);
}

// LineEditの値、Theme、caret、selectionをinput状態へまとめる。
static void sync_line_input(LineEdit *p_line) {
	TextState state;
	state.text = p_line->get_text();
	state.aux = input_aux(p_line, p_line->get_placeholder());
	state.kind = TEXT_LINE_INPUT;
	state.flags = TEXT_CLIP;
	if (p_line->is_editable()) state.flags |= TEXT_EDITABLE;
	if (p_line->has_focus()) state.flags |= TEXT_FOCUSED;
	if (p_line->get_focus_mode_with_override() == Control::FOCUS_ALL) state.flags |= TEXT_KEYBOARD_FOCUS;
	if (p_line->is_secret()) state.flags |= TEXT_SECRET;
	state.horizontal = p_line->get_horizontal_alignment();
	state.vertical = VERTICAL_ALIGNMENT_CENTER;
	state.max_length = p_line->get_max_length();
	state.selection_start = p_line->has_selection() ? p_line->get_selection_from_column() : p_line->get_caret_column();
	state.selection_end = p_line->has_selection() ? p_line->get_selection_to_column() : p_line->get_caret_column();
	state.color = p_line->get_theme_color(p_line->is_editable() ? SNAME("font_color") : SNAME("font_uneditable_color"));
	state.placeholder = p_line->get_theme_color(SNAME("font_placeholder_color"));
	state.font_size = p_line->get_theme_font_size(SNAME("font_size"));
	state.line_spacing = font_spacing(p_line, state.font_size);
	state.outline = p_line->get_theme_color(SNAME("font_outline_color"));
	state.outline_size = p_line->get_theme_constant(SNAME("outline_size"));
	state.rect = input_rect(p_line, p_line->get_theme_stylebox(p_line->is_editable() ? SNAME("normal") : SNAME("read_only")));
	Ref<Texture2D> icon = const_cast<LineEdit *>(p_line)->get_right_icon();
	if (p_line->is_editable() && p_line->is_clear_button_enabled() && !p_line->get_text().is_empty()) icon = p_line->get_theme_icon(SNAME("clear"));
	if (icon.is_valid()) {
		const float width = MIN(state.rect.size.x, (float)icon->get_width());
		state.rect.size.x -= width;
		if (p_line->is_layout_rtl()) state.rect.position.x += width;
	}
	sync_text(p_line, state);
}

// TextEdit本文と各行位置を編集番号で覚え、巨大な本文を毎frame組み立てない。
static EditState &edit_state(TextEdit *p_edit) {
	const ObjectID object = p_edit->get_instance_id();
	EditState *cached = edit_states.getptr(object);
	const uint32_t version = p_edit->get_version();
	if (cached && cached->version == version) return *cached;
	EditState state;
	state.version = version;
	state.text = p_edit->get_text();
	state.utf8 = state.text.utf8();
	state.lines.push_back(0);
	for (int index = 0; index < state.text.length(); index++) {
		if (state.text[index] == '\n') state.lines.push_back(index + 1);
	}
	edit_states.insert(object, state);
	return *edit_states.getptr(object);
}

// Godotの行列位置をcache済みの全文位置へ定数時間で直す。
static int text_index(const EditState &p_state, int p_line, int p_column) {
	const int line = CLAMP(p_line, 0, p_state.lines.size() - 1);
	return p_state.lines[line] + p_column;
}

// 一行をSyntaxHighlighterの色境界で分け、Browserへ安全な文字列として渡す。
static Array code_segments(CodeEdit *p_edit, int p_line, const Color &p_default) {
	const String text = p_edit->get_line(p_line);
	const Ref<SyntaxHighlighter> highlighter = p_edit->get_syntax_highlighter();
	Dictionary colors = highlighter.is_valid() ? highlighter->get_line_syntax_highlighting(p_line) : Dictionary();
	Vector<int> starts;
	const Array keys = colors.keys();
	for (int index = 0; index < keys.size(); index++) starts.push_back((int)keys[index]);
	starts.sort();
	if (starts.is_empty() || starts[0] != 0) starts.insert(0, 0);

	Array segments;
	Color color = p_default;
	for (int index = 0; index < starts.size(); index++) {
		const int from = CLAMP(starts[index], 0, text.length());
		if (colors.has(from)) {
			const Dictionary info = colors[from];
			if (info.has("color")) color = info["color"];
		}
		const int to = index + 1 < starts.size() ? CLAMP(starts[index + 1], from, text.length()) : text.length();
		Dictionary segment;
		segment["text"] = text.substr(from, to - from);
		segment["color"] = String("#") + color.to_html();
		segments.push_back(segment);
	}
	if (segments.is_empty()) {
		Dictionary segment;
		segment["text"] = "";
		segment["color"] = String("#") + p_default.to_html();
		segments.push_back(segment);
	}
	return segments;
}

// 小さな設定resourceの同一instance内変更を、公開保存propertyから識別する。
static String storage_signature(const Object *p_object) {
	if (!p_object) return "";
	String signature;
	List<PropertyInfo> properties;
	p_object->get_property_list(&properties);
	for (const PropertyInfo &property : properties) {
		if (!(property.usage & PROPERTY_USAGE_STORAGE)) continue;
		signature += "/" + String(property.name) + ":" + itos(p_object->get(property.name).hash());
	}
	return signature;
}

// SyntaxHighlighterの差替えと同一resource内の色変更を識別する。
static String syntax_signature(const Ref<SyntaxHighlighter> &p_highlighter) {
	if (p_highlighter.is_null()) return "0";
	return String::num_uint64((uint64_t)p_highlighter->get_instance_id()) + storage_signature(p_highlighter.ptr());
}

// Font差替えとVariation変更を、実描画RIDを含む識別値へまとめる。
static String code_font_signature(const Ref<Font> &p_font) {
	if (p_font.is_null()) return "0";
	String signature = String::num_uint64((uint64_t)p_font->get_instance_id());
	const TypedArray<RID> rids = p_font->get_rids();
	for (int index = 0; index < rids.size(); index++) {
		const RID rid = rids[index];
		signature += "/" + String::num_uint64(rid.get_id());
	}
	const Ref<FontVariation> variation = p_font;
	if (variation.is_valid()) signature += storage_signature(variation.ptr());
	return signature;
}

// 行番号と記号をGodotが確定した各gutterの位置へ置く。
static int code_gutters(CodeEdit *p_edit, Dictionary &r_state) {
	r_state["gutter"] = p_edit->get_total_gutter_width();
	int gutter_x = 0;
	int number_gutter = -1;
	for (int index = 0; index < p_edit->get_gutter_count(); index++) {
		if (!p_edit->is_gutter_drawn(index)) continue;
		const String name = p_edit->get_gutter_name(index);
		if (name == "main_gutter" || name == "line_numbers" || name == "fold_gutter") {
			r_state[name + "_x"] = gutter_x;
			r_state[name + "_width"] = p_edit->get_gutter_width(index);
		}
		if (name == "line_numbers") number_gutter = index;
		gutter_x += p_edit->get_gutter_width(index);
	}
	return number_gutter;
}

// Minimapの範囲と操作色を、文字ではない小矩形として渡す。
static Vector2i code_minimap(CodeEdit *p_edit, const Rect2 &p_text_rect, Dictionary &r_state) {
	if (!p_edit->is_drawing_minimap()) return Vector2i(-1, 0);
	const Ref<StyleBox> style = p_edit->get_theme_stylebox(p_edit->is_editable() ? SNAME("normal") : SNAME("read_only"));
	const float width = p_edit->get_minimap_width();
	const int visible = MAX(1, p_edit->get_minimap_visible_lines());
	ScrollBar *bar = p_edit->get_v_scroll_bar();
	Dictionary minimap;
	minimap["x"] = p_edit->get_size().x - Math::floor(style->get_margin(SIDE_RIGHT)) - width + 2 - p_text_rect.position.x;
	minimap["y"] = -p_text_rect.position.y;
	minimap["width"] = width;
	minimap["total"] = p_edit->get_line_count();
	minimap["height"] = visible * 3;
	minimap["viewport"] = (p_edit->get_visible_line_count() + 1) * 3;
	Color viewport = p_edit->get_theme_color(SNAME("caret_color"));
	viewport.a = 0.1;
	minimap["viewport_color"] = String("#") + viewport.to_html();
	viewport.a = 0.175;
	minimap["viewport_hover_color"] = String("#") + viewport.to_html();
	viewport.a = 0.25;
	minimap["viewport_pressed_color"] = String("#") + viewport.to_html();
	r_state["minimap"] = minimap;
	return Vector2i(Math::round(bar->get_as_ratio() * MAX(0, p_edit->get_line_count() - visible)), visible);
}

// 内蔵VScrollBarの確定矩形とThemeをOS非依存の表示層へ渡す。
static void code_scrollbar(CodeEdit *p_edit, const Rect2 &p_text_rect, Dictionary &r_state) {
	ScrollBar *bar = p_edit->get_v_scroll_bar();
	const Ref<StyleBoxFlat> track = bar->get_theme_stylebox(SNAME("scroll"));
	const Ref<StyleBoxFlat> grabber = bar->get_theme_stylebox(SNAME("grabber"));
	if (track.is_null() || grabber.is_null() || bar->get_size().x <= 0 || bar->get_size().y <= 0) return;
	const Size2 size = bar->get_size();
	const float range = bar->get_max() - bar->get_min();
	const float knob_min = grabber->get_minimum_size().y;
	const float travel = MAX(0.0f, size.y - track->get_minimum_size().y - knob_min);
	Dictionary scroll;
	scroll["x"] = bar->get_position().x - p_text_rect.position.x;
	scroll["y"] = bar->get_position().y - p_text_rect.position.y;
	scroll["width"] = size.x;
	scroll["height"] = size.y;
	scroll["knob"] = range > 0 ? knob_min + MAX(0.0, bar->get_page()) / range * travel : knob_min;
	scroll["track_color"] = String("#") + track->get_bg_color().to_html();
	scroll["grabber_color"] = String("#") + grabber->get_bg_color().to_html();
	scroll["track_radius"] = track->get_corner_radius(CORNER_TOP_LEFT);
	scroll["grabber_radius"] = grabber->get_corner_radius(CORNER_TOP_LEFT);
	r_state["scroll"] = scroll;
}

// 行長guideをFont実幅へ合わせた列位置へ変換する。
static Array code_guides(CodeEdit *p_edit, const Ref<Font> &p_font, int p_font_size) {
	Array guides;
	for (const Variant &value : p_edit->get_line_length_guidelines()) {
		const int column = value;
		Dictionary guide;
		guide["column"] = column;
		guide["x"] = p_edit->get_total_gutter_width() + (p_font.is_valid() ? p_font->get_string_size(String("0").repeat(column), HORIZONTAL_ALIGNMENT_LEFT, -1, p_font_size).x : 0.0f);
		guides.push_back(guide);
	}
	return guides;
}

// 可視行の記号と個別色を、再同期判定用の短い値へまとめる。
static String code_row_signature(CodeEdit *p_edit, int p_first, int p_last, int p_number_gutter) {
	String result;
	for (int line = p_first; line <= p_last; line++) {
		if (line >= p_edit->get_first_visible_line() && line <= p_edit->get_last_full_visible_line() && !p_edit->is_line_in_viewport(line)) continue;
		result += itos(line) + ":" + itos(p_edit->is_line_folded(line)) + itos(p_edit->can_fold_line(line));
		result += itos(p_edit->is_line_breakpointed(line)) + itos(p_edit->is_line_bookmarked(line)) + itos(p_edit->is_line_executing(line));
		if (p_number_gutter >= 0) result += p_edit->get_line_gutter_item_color(line, p_number_gutter).to_html();
	}
	return result;
}

// 可視行の本文、gutter記号、字形補正値をDOM転送用へまとめる。
static Array code_rows(CodeEdit *p_edit, const String &p_uid, int p_first, int p_last, int p_digits, int p_number_gutter, const Ref<Font> &p_font, int p_font_size, float p_line_height) {
	Array lines;
	for (int line = p_first; line <= p_last; line++) {
		if (line >= p_edit->get_first_visible_line() && line <= p_edit->get_last_full_visible_line() && !p_edit->is_line_in_viewport(line)) continue;
		Dictionary row;
		const String number = String::num_int64(line + 1).lpad(p_digits, p_edit->is_line_numbers_zero_padded() ? "0" : " ");
		row["line"] = line;
		row["number"] = number;
		Color line_color = p_number_gutter >= 0 ? p_edit->get_line_gutter_item_color(line, p_number_gutter) : Color(1, 1, 1);
		if (line_color == Color(1, 1, 1)) line_color = p_edit->get_theme_color(SNAME("line_number_color"));
		row["line_color"] = String("#") + line_color.to_html();
		const GlyphState glyph = glyph_state(p_uid + "-code-" + itos(line), p_edit->get_line(line), p_font, p_font_size);
		row["glyph_ascent"] = glyph.ascent;
		row["glyph_top"] = glyph.top;
		row["glyph_bottom"] = glyph.bottom;
		row["glyph_edge"] = glyph.edge;
		const GlyphState number_glyph = glyph_state(p_uid + "-code-number-" + itos(line), number, p_font, p_font_size);
		row["number_ascent"] = number_glyph.ascent;
		row["number_top"] = number_glyph.top;
		row["number_bottom"] = number_glyph.bottom;
		row["number_edge"] = number_glyph.edge;
		row["y"] = p_edit->get_scroll_pos_for_line(line) * p_line_height;
		row["fold"] = p_edit->is_line_folded(line) ? "closed" : p_edit->can_fold_line(line) ? "open" : "";
		row["breakpoint"] = p_edit->is_drawing_breakpoints_gutter() && p_edit->is_line_breakpointed(line);
		row["bookmark"] = p_edit->is_drawing_bookmarks_gutter() && p_edit->is_line_bookmarked(line);
		row["executing"] = p_edit->is_drawing_executing_lines_gutter() && p_edit->is_line_executing(line);
		row["segments"] = code_segments(p_edit, line, p_edit->get_font_color());
		lines.push_back(row);
	}
	return lines;
}

// Minimapの可視範囲を1行ごとの色区間へ変換する。
static void code_minimap_rows(CodeEdit *p_edit, int p_first, int p_visible, Dictionary &r_state) {
	if (p_first < 0) return;
	Dictionary minimap = r_state["minimap"];
	Array lines;
	for (int line = p_first; line < MIN(p_edit->get_line_count(), p_first + p_visible); line++) {
		Dictionary row;
		row["line"] = line;
		row["at"] = line - p_first;
		row["current"] = p_edit->is_highlight_current_line_enabled() && line == p_edit->get_caret_line();
		row["segments"] = code_segments(p_edit, line, p_edit->get_font_color());
		lines.push_back(row);
	}
	minimap["lines"] = lines;
	r_state["minimap"] = minimap;
}

// CodeEditの見えている行と補助表示を、再利用可能なDOM行へまとめて渡す。
static void sync_code(CodeEdit *p_edit, const Rect2 &p_text_rect, float p_line_height, const Ref<Font> &p_font, int p_font_size) {
	Dictionary state;
	const int number_gutter = code_gutters(p_edit, state);
	state["tab"] = p_edit->get_tab_size();
	state["indent"] = p_edit->is_indent_using_spaces() ? String(" ").repeat(p_edit->get_indent_size()) : String("\t");
	state["line_height"] = p_line_height;
	state["font_ascent"] = p_font.is_valid() ? p_font->get_ascent(p_font_size) : p_font_size;
	state["font_descent"] = p_font.is_valid() ? p_font->get_descent(p_font_size) : 0;
	state["line_numbers"] = p_edit->is_draw_line_numbers_enabled();
	state["line_color"] = String("#") + p_edit->get_theme_color(SNAME("line_number_color")).to_html();
	state["breakpoint_color"] = String("#") + p_edit->get_theme_color(SNAME("breakpoint_color")).to_html();
	state["bookmark_color"] = String("#") + p_edit->get_theme_color(SNAME("bookmark_color")).to_html();
	state["executing_color"] = String("#") + p_edit->get_theme_color(SNAME("executing_line_color")).to_html();
	state["fold_color"] = String("#") + p_edit->get_theme_color(SNAME("code_folding_color")).to_html();
	state["guide_color"] = String("#") + p_edit->get_theme_color(SNAME("line_length_guideline_color")).to_html();
	state["current_color"] = p_edit->is_highlight_current_line_enabled() ? String("#") + p_edit->get_theme_color(SNAME("current_line_color")).to_html() : "transparent";
	state["selection_color"] = String("#") + p_edit->get_theme_color(SNAME("selection_color")).to_html();
	state["caret_color"] = String("#") + p_edit->get_theme_color(SNAME("caret_color")).to_html();
	state["text_color"] = String("#") + p_edit->get_font_color().to_html();
	state["current"] = p_edit->get_caret_line();
	const Vector2i minimap_range = code_minimap(p_edit, p_text_rect, state);
	const int mini_first = minimap_range.x;
	const int mini_visible = minimap_range.y;
	code_scrollbar(p_edit, p_text_rect, state);

	const String uid_text = String::num_uint64((uint64_t)p_edit->get_instance_id());
	const int first = MAX(0, p_edit->get_first_visible_line());
	const int last = MIN(p_edit->get_line_count() - 1, p_edit->get_last_full_visible_line() + 1);
	const int digits = MAX(p_edit->get_line_numbers_min_digits(), String::num_int64(p_edit->get_line_count()).length());
	state["guides"] = code_guides(p_edit, p_font, p_font_size);
	// 本文、見える行、Themeが同じframeは構文解析とWASM転送を省く。
	const String row_state = code_row_signature(p_edit, first, last, number_gutter);
	const Ref<SyntaxHighlighter> highlighter = p_edit->get_syntax_highlighter();
	const String signature = itos(p_edit->get_version()) + "/" + itos(mini_first) + "/" + syntax_signature(highlighter) + "/" + code_font_signature(p_font) + "/" + row_state + "/" + JSON::stringify(state);
	const ObjectID object = p_edit->get_instance_id();
	const String *cached = code_states.getptr(object);
	if (cached && *cached == signature) return;

	state["lines"] = code_rows(p_edit, uid_text, first, last, digits, number_gutter, p_font, p_font_size, p_line_height);
	code_minimap_rows(p_edit, mini_first, mini_visible, state);
	const CharString uid = uid_text.utf8();
	const CharString json = JSON::stringify(state).utf8();
	yweb_code_sync(uid.get_data(), json.get_data());
	code_states.insert(object, signature);
}

// TextEditの値、Theme、caret、selectionをtextarea状態へまとめる。
static void sync_text_area(TextEdit *p_edit) {
	EditState &content = edit_state(p_edit);
	const bool sends = p_edit->is_inside_tree() && yweb_text_dom_owns(p_edit);
	if (!content.present || !sends) content.sent = false;
	content.seen = sends;
	TextState state;
	state.text = content.text;
	state.aux = input_aux(p_edit, p_edit->get_placeholder());
	CodeEdit *code = Object::cast_to<CodeEdit>(p_edit);
	state.kind = code ? TEXT_CODE : TEXT_AREA;
	state.flags = TEXT_CLIP;
	if (p_edit->get_line_wrapping_mode() != TextEdit::LINE_WRAPPING_NONE) state.flags |= TEXT_WRAP;
	if (p_edit->is_editable()) state.flags |= TEXT_EDITABLE;
	if (p_edit->has_focus()) state.flags |= TEXT_FOCUSED;
	if (p_edit->get_focus_mode_with_override() == Control::FOCUS_ALL) state.flags |= TEXT_KEYBOARD_FOCUS;
	state.vertical = VERTICAL_ALIGNMENT_TOP;
	if (p_edit->has_selection()) {
		state.selection_start = text_index(content, p_edit->get_selection_from_line(), p_edit->get_selection_from_column());
		state.selection_end = text_index(content, p_edit->get_selection_to_line(), p_edit->get_selection_to_column());
	} else {
		state.selection_start = text_index(content, p_edit->get_caret_line(), p_edit->get_caret_column());
		state.selection_end = state.selection_start;
	}
	state.color = p_edit->get_theme_color(p_edit->is_editable() ? SNAME("font_color") : SNAME("font_readonly_color"));
	state.placeholder = p_edit->get_theme_color(SNAME("font_placeholder_color"));
	state.font_size = p_edit->get_theme_font_size(SNAME("font_size"));
	state.line_spacing = font_spacing(p_edit, state.font_size, p_edit->get_theme_constant(SNAME("line_spacing")));
	state.scroll = Vector2(p_edit->get_h_scroll(), p_edit->get_v_scroll() * MAX(1.0f, state.font_size + state.line_spacing));
	state.outline = p_edit->get_theme_color(SNAME("font_outline_color"));
	state.outline_size = p_edit->get_theme_constant(SNAME("outline_size"));
	state.rect = input_rect(p_edit, p_edit->get_theme_stylebox(p_edit->is_editable() ? SNAME("normal") : SNAME("read_only")));
	sync_text(p_edit, state, CharString(), &content.utf8, content.sent);
	content.sent = sends;
	if (code) sync_code(code, state.rect, MAX(1.0f, state.font_size + state.line_spacing), control_font(code), state.font_size);
}

// Canvas RIDを所有Controlへ一意に登録し、解放用の逆索引も保つ。
static void register_canvas(ObjectID p_owner, RID p_canvas) {
	if (!p_canvas.is_valid()) return;
	canvas_owners.insert(p_canvas, p_owner);
	Vector<RID> &canvases = owner_canvases[p_owner];
	if (canvases.find(p_canvas) < 0) canvases.push_back(p_canvas);
}

// 解放Controlがまだ所有するCanvas RIDを対応表から回収する。
static void remove_canvases(ObjectID p_owner) {
	const Vector<RID> *canvases = owner_canvases.getptr(p_owner);
	if (!canvases) return;
	for (const RID &canvas : *canvases) {
		const ObjectID *owner = canvas_owners.getptr(canvas);
		if (owner && *owner == p_owner) canvas_owners.erase(canvas);
	}
	owner_canvases.erase(p_owner);
}

// 複数文字項目を持つ標準Controlの一回の再描画を開始する。
void yweb_text_parts_begin(Control *p_control) {
	if (!capture_control(p_control) || !text_requested(p_control)) return;
	const ObjectID object = p_control->get_instance_id();
	parts[object].clear();
	register_canvas(object, p_control->get_canvas_item());
	tracked.insert(object);
}

// 標準Controlが補助CanvasItemへ描く文字も同じ所有者へ結ぶ。
void yweb_text_capture_canvas(Control *p_control, RID p_canvas) {
	if (!capture_control(p_control) || !text_requested(p_control) || !p_canvas.is_valid()) return;
	register_canvas(p_control->get_instance_id(), p_canvas);
}

// 通常文字の直前に描かれるoutlineを同じ文字項目へ保持する。
bool yweb_text_capture_outline(RID p_canvas, ObjectID p_source, int p_size, const Color &p_color) {
	const ObjectID *owner = canvas_owners.getptr(p_canvas);
	Control *control = owner ? Object::cast_to<Control>(ObjectDB::get_instance(*owner)) : nullptr;
	if (!control || !yweb_text_dom_owns(control)) return false;
	outlines.insert(p_source, OutlineState{ p_color, p_size });
	return true;
}

// TextLineとTextParagraphの確定文字矩形をControl内のDOM項目へ追加する。
bool yweb_text_capture_line(RID p_canvas, ObjectID p_source, const String &p_text, const String &p_font, const Rect2 &p_rect, int p_font_size, int p_horizontal, const Color &p_color, bool p_wrap) {
	const ObjectID *owner = canvas_owners.getptr(p_canvas);
	Control *control = owner ? Object::cast_to<Control>(ObjectDB::get_instance(*owner)) : nullptr;
	if (!control || !yweb_text_dom_owns(control)) return false;
	TextState state;
	state.text = p_text;
	state.font = p_font;
	state.rect = p_rect;
	state.kind = TEXT_CONTROL;
	state.flags = p_wrap ? TEXT_WRAP : 0;
	state.horizontal = p_horizontal;
	state.color = p_color;
	state.font_size = p_font_size;
	// PopupMenuは影を別描画しておらず、影なしの字形補正を有効にする。
	if (control->is_class(SNAME("PopupMenuItems"))) state.shadow = Color(0, 0, 0, 0);
	if (const OutlineState *outline = outlines.getptr(p_source)) {
		state.outline = outline->color;
		state.outline_size = outline->size;
		outlines.erase(p_source);
	}
	parts[*owner].push_back(state);
	tracked.insert(*owner);
	return true;
}

// DOMの一続きの文字位置をTextEditの行と列へ変換する。
static Vector2i line_column(const String &p_text, int p_index) {
	int line = 0;
	int column = 0;
	for (int index = 0; index < MIN(p_index, p_text.length()); index++) {
		if (p_text[index] == '\n') {
			line++;
			column = 0;
		} else {
			column++;
		}
	}
	return Vector2i(column, line);
}

// Browser入力をGodotの公開値、caret、selection、focusへ戻す。
static void text_event(const char *p_uid, int p_kind, const char *p_text, int p_start, int p_end) {
	const ObjectID object = ObjectID((uint64_t)String::to_int(p_uid));
	Control *control = Object::cast_to<Control>(ObjectDB::get_instance(object));
	if (!control || !control->is_inside_tree() || !yweb_text_dom_owns(control)) return;
	const String incoming = String::utf8(p_text);
	if (p_kind >= 12 && p_kind <= 14 && control->is_class(SNAME("PopupMenuItems"))) {
		Node *owner = control;
		while (owner && !Object::cast_to<PopupMenu>(owner)) owner = owner->get_parent();
		PopupMenu *menu = Object::cast_to<PopupMenu>(owner);
		if (menu) {
			if (p_kind == 12) menu->yweb_hover(p_start);
			else if (p_kind == 13) menu->yweb_hover(-1);
			else menu->yweb_activate(p_start);
		}
	} else if (p_kind == 3) {
		control->grab_focus();
	} else if (p_kind == 4) {
		if (control->has_focus()) control->release_focus();
	} else if (p_kind == 6) {
		if (BaseButton *button = Object::cast_to<BaseButton>(control)) button->yweb_click();
	} else if (p_kind == 10 || p_kind == 11) {
		if (BaseButton *button = Object::cast_to<BaseButton>(control)) button->yweb_pointer(p_kind == 10);
	} else if (p_kind == 8 || p_kind == 9) {
		if (BaseButton *button = Object::cast_to<BaseButton>(control)) {
			if (Viewport *viewport = button->get_viewport()) viewport->yweb_update_mouse_over(p_kind == 8 ? button : nullptr);
		}
	} else if (LineEdit *line = Object::cast_to<LineEdit>(control)) {
		if ((p_kind == 1 || p_kind == 5) && line->get_text() != incoming) line->_set_text(incoming, true);
		const int start = CLAMP(p_start, 0, line->get_text().length());
		const int end = CLAMP(p_end, 0, line->get_text().length());
		line->set_caret_column(end);
		if (start == end) line->deselect(); else line->select(start, end);
		if (p_kind == 5) line->emit_signal(SNAME("text_submitted"), line->get_text());
	} else if (TextEdit *edit = Object::cast_to<TextEdit>(control)) {
		if (p_kind == 7 && Object::cast_to<CodeEdit>(edit)) {
			const float line_height = MAX(1.0f, (float)edit->get_theme_font_size(SNAME("font_size")) + edit->get_theme_constant(SNAME("line_spacing")));
			edit->set_v_scroll((double)p_start / line_height);
			edit->set_h_scroll(p_end);
			dirty.insert(object);
			return;
		}
		if (p_kind == 1 && edit->get_text() != incoming) edit->yweb_set_text(incoming);
		const Vector2i start = line_column(edit->get_text(), p_start);
		const Vector2i end = line_column(edit->get_text(), p_end);
		edit->set_caret_line(end.y);
		edit->set_caret_column(end.x);
		if (start == end) edit->deselect(); else edit->select(start.y, start.x, end.y, end.x);
	}
	dirty.insert(object);
}

// Browserの直リンクと履歴操作をSceneTreeへ遅延反映する。
static void site_event(const char *p_path) {
	SceneTree *tree = SceneTree::get_singleton();
	const String path = String::utf8(p_path);
	if (!tree || !path.begins_with("res://")) return;
	Node *current = tree->get_current_scene();
	if (!current || current->get_scene_file_path() != path) tree->call_deferred(SNAME("change_scene_to_file"), path);
}

// Button系のdrawで確定した文字矩形とTheme状態を追従表へ保存する。
void yweb_text_sync_control(Control *p_control, const String &p_text, const Rect2 &p_rect, int p_kind, int p_flags, int p_horizontal, int p_vertical, const Color &p_color, float p_font_size, float p_line_spacing, const Color &p_outline, float p_outline_size, const Color &p_shadow, const Vector2 &p_shadow_offset, float p_underline_offset, float p_underline_thickness, const String &p_aux) {
	if (!p_control) return;
	TextState state;
	state.text = p_text;
	state.aux = p_aux;
	state.rect = p_rect;
	state.kind = p_kind;
	state.flags = p_flags;
	state.horizontal = p_horizontal;
	state.vertical = p_vertical;
	state.color = p_color;
	state.font_size = p_font_size;
	state.line_spacing = p_line_spacing;
	state.outline = p_outline;
	state.outline_size = p_outline_size;
	state.shadow = p_shadow;
	state.shadow_offset = p_shadow_offset;
	state.underline_offset = p_underline_offset;
	state.underline_thickness = p_underline_thickness;
	const ObjectID object = p_control->get_instance_id();
	states.insert(object, state);
	tracked.insert(object);
}

// 通知されたControlを次の登録見直し単位へ積む。
void yweb_text_sync_queue(ObjectID p_object) {
	dirty.insert(p_object);
}


#ifndef GLES3_ENABLED
// ScrollBar基底型はClassDBへ登録されないため、公開される縦横型から共通型を得る。
static ScrollBar *as_scrollbar(Control *p_control) {
	const StringName type = p_control->get_class();
	if (type == SNAME("HScrollBar") || type == SNAME("VScrollBar")) return static_cast<ScrollBar *>(p_control);
	return nullptr;
}

static bool is_vertical_scrollbar(const Control *p_control) { return p_control->get_class() == SNAME("VScrollBar"); }

// Buttonが実際に選ぶ5状態と右書き用Theme名をDOM側でも共通利用する。
static StringName button_style(const BaseButton *p_button) {
	StringName item;
	switch (p_button->get_draw_mode()) {
		case BaseButton::DRAW_HOVER_PRESSED: item = SNAME("hover_pressed"); break;
		case BaseButton::DRAW_PRESSED: item = SNAME("pressed"); break;
		case BaseButton::DRAW_HOVER: item = SNAME("hover"); break;
		case BaseButton::DRAW_DISABLED: item = SNAME("disabled"); break;
		default: item = SNAME("normal"); break;
	}
	if (p_button->is_layout_rtl()) {
		const StringName mirrored = StringName(String(item) + "_mirrored");
		if (p_button->has_theme_stylebox(mirrored)) item = mirrored;
	}
	// hover_pressedが無いThemeはGodotと同じpressedへ戻し、右書き用も選び直す。
	if (p_button->get_draw_mode() == BaseButton::DRAW_HOVER_PRESSED && !p_button->has_theme_stylebox(item)) {
		const StringName mirrored = SNAME("pressed_mirrored");
		item = p_button->is_layout_rtl() && p_button->has_theme_stylebox(mirrored) ? mirrored : SNAME("pressed");
	}
	return item;
}

// Canvasを持たないDOM onlyで、Controlの面と枠をDOMの箱へ写す。
// StyleBoxFlatはCSSの背景、border、角丸へ素直に対応するため、必要な値を渡す設計。
static void sync_box(Control *p_control, int p_order) {
	if (!p_control->is_visible_in_tree()) {
		return;
	}
	Color background;
	Color border;
	Rect2 widths;
	Rect2 radius; // 左上、右上、右下、左下の順で持つ。
	Rect2 area = Rect2(Vector2(), p_control->get_size()); // 面を置く範囲。
	StringName selected;
	// 状態を持つControlは、Godotが現在描くStyleBoxを選ぶ。
	if (const BaseButton *button = Object::cast_to<BaseButton>(p_control)) {
		selected = button_style(button);
	} else if (const LineEdit *line = Object::cast_to<LineEdit>(p_control)) {
		selected = line->is_editable() ? SNAME("normal") : SNAME("read_only");
	} else if (const TextEdit *edit = Object::cast_to<TextEdit>(p_control)) {
		selected = edit->is_editable() ? SNAME("normal") : SNAME("read_only");
	} else if (const ScrollBar *bar = as_scrollbar(p_control)) {
		selected = bar->has_focus() ? SNAME("scroll_focus") : SNAME("scroll");
		const bool vertical = is_vertical_scrollbar(bar);
		const Ref<Texture2D> decrement = bar->get_theme_icon(bar->yweb_decrement_icon());
		const Ref<Texture2D> increment = bar->get_theme_icon(bar->yweb_increment_icon());
		const float begin = decrement.is_valid() ? (vertical ? decrement->get_height() : decrement->get_width()) : 0;
		const float end = increment.is_valid() ? (vertical ? increment->get_height() : increment->get_width()) : 0;
		area = vertical ? Rect2(Vector2(0, begin), Size2(area.size.x, MAX(0.0f, area.size.y - begin - end))) : Rect2(Vector2(begin, 0), Size2(MAX(0.0f, area.size.x - begin - end), area.size.y));
	}
	// Sliderはcontrol全体でなく、themeが決めた細いtrackを描く。
	if (const Slider *slider = Object::cast_to<Slider>(p_control)) {
		const Ref<StyleBox> track = slider->get_theme_stylebox(SNAME("slider"));
		if (track.is_valid()) {
			const Size2 least = track->get_minimum_size();
			if (Object::cast_to<VSlider>(slider) != nullptr) {
				area = Rect2(Vector2((area.size.width - least.width) * 0.5f, 0), Size2(least.width, area.size.height));
			} else {
				area = Rect2(Vector2(0, (area.size.height - least.height) * 0.5f), Size2(area.size.width, least.height));
			}
		}
	}
	if (const ColorRect *rect = Object::cast_to<ColorRect>(p_control)) {
		background = rect->get_color();
	} else {
		// 種別ごとに面を持つstylebox名が違うため、持っているものを順に探す。
		// StringNameの構築は表引きでlockを取るため、一度作って使い回す。
		static const StringName names[] = { SNAME("panel"), SNAME("normal"), SNAME("bg"), SNAME("slider"), SNAME("separator"), SNAME("background"), SNAME("scroll") };
		Ref<StyleBoxFlat> flat;
		if (!selected.is_empty() && p_control->has_theme_stylebox(selected)) flat = p_control->get_theme_stylebox(selected);
		for (const StringName &name : names) {
			if (flat.is_valid()) break;
			if (!p_control->has_theme_stylebox(name)) {
				continue;
			}
			flat = p_control->get_theme_stylebox(name);
			if (flat.is_valid()) {
				break;
			}
		}
		if (flat.is_null()) {
			return;
		}
		background = flat->get_bg_color();
		border = flat->get_border_color();
		widths = Rect2(flat->get_border_width(SIDE_LEFT), flat->get_border_width(SIDE_TOP), flat->get_border_width(SIDE_RIGHT), flat->get_border_width(SIDE_BOTTOM));
		radius = Rect2(flat->get_corner_radius(CORNER_TOP_LEFT), flat->get_corner_radius(CORNER_TOP_RIGHT), flat->get_corner_radius(CORNER_BOTTOM_RIGHT), flat->get_corner_radius(CORNER_BOTTOM_LEFT));
		// SeparatorはControl全体でなくThemeの最小寸法を中央へ置く。
		if (p_control->get_class() == SNAME("HSeparator") || p_control->get_class() == SNAME("VSeparator")) {
			const Size2 least = flat->get_minimum_size();
			if (p_control->get_class() == SNAME("VSeparator")) area = Rect2(Vector2((area.size.x - least.x) * 0.5f, 0), Size2(least.x, area.size.y));
			else area = Rect2(Vector2(0, (area.size.y - least.y) * 0.5f), Size2(area.size.x, least.y));
		}
	}
	// ColorPickerButtonの標準面は現在色そのものなので、Theme面の色より優先する。
	if (ColorPickerButton *picker = Object::cast_to<ColorPickerButton>(p_control)) background = picker->get_pick_color();
	const Color modulate = p_control->get_modulate_in_tree() * p_control->get_self_modulate();
	background *= modulate;
	border *= modulate;
	Transform2D transform = canvas_transform(p_control);
	transform[2] = transform.xform(area.position);
	const Size2 size = area.size;
	const CharString uid = (String::num_uint64((uint64_t)p_control->get_instance_id()) + "-box").utf8();
	yweb_box_sync(uid.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			size.width, size.height, p_order,
			background.r, background.g, background.b, background.a,
			widths.position.x, widths.position.y, widths.size.width, widths.size.height,
			border.r, border.g, border.b, border.a,
			radius.position.x, radius.position.y, radius.size.width, radius.size.height);
}

// 描画が無いDOM onlyでは、Button系の文字状態を持ち主から直接組み立てる。
static void sync_button_text(Control *p_control, const String &p_text, int p_kind, int p_horizontal) {
	TextState state;
	state.text = p_text;
	state.kind = p_kind;
	state.horizontal = p_horizontal;
	state.vertical = VERTICAL_ALIGNMENT_CENTER;
	StringName color = SNAME("font_color");
	if (const BaseButton *button = Object::cast_to<BaseButton>(p_control)) {
		const BaseButton::DrawMode mode = button->get_draw_mode();
		if (button->has_focus()) state.flags |= TEXT_FOCUSED;
		if (button->is_disabled()) state.flags |= TEXT_DISABLED;
		if (button->get_focus_mode_with_override() == Control::FOCUS_ALL) state.flags |= TEXT_KEYBOARD_FOCUS;
		if (button->get_mouse_filter_with_override() != Control::MOUSE_FILTER_IGNORE) state.flags |= TEXT_MOUSE;
		if (mode == BaseButton::DRAW_NORMAL && button->has_focus(true)) color = SNAME("font_focus_color");
		else if (mode == BaseButton::DRAW_HOVER_PRESSED) color = SNAME("font_hover_pressed_color");
		else if (mode == BaseButton::DRAW_PRESSED) color = button->has_theme_color(SNAME("font_pressed_color")) ? SNAME("font_pressed_color") : SNAME("font_color");
		else if (mode == BaseButton::DRAW_HOVER) color = SNAME("font_hover_color");
		else if (mode == BaseButton::DRAW_DISABLED) color = SNAME("font_disabled_color");
	}
	// LinkButtonはhrefと現在の下線状態を意味DOMへ渡す。
	if (const LinkButton *link = Object::cast_to<LinkButton>(p_control)) {
		state.aux = link->get_uri();
		const BaseButton::DrawMode mode = link->get_draw_mode();
		const bool active = mode == BaseButton::DRAW_HOVER || mode == BaseButton::DRAW_HOVER_PRESSED || mode == BaseButton::DRAW_PRESSED;
		if (link->get_underline_mode() == LinkButton::UNDERLINE_MODE_ALWAYS || (active && link->get_underline_mode() != LinkButton::UNDERLINE_MODE_NEVER)) state.flags |= TEXT_UNDERLINE;
	}
	// StyleBoxと内蔵iconが確保する領域を除き、Godotの文字配置へ合わせる。
	StringName style_name = SNAME("normal");
	if (const BaseButton *button = Object::cast_to<BaseButton>(p_control)) style_name = button_style(button);
	Ref<StyleBox> style = p_control->get_theme_stylebox(style_name);
	if (style.is_null()) style = p_control->get_theme_stylebox(SNAME("normal"));
	float left = style.is_valid() ? style->get_margin(SIDE_LEFT) : 0;
	float top = style.is_valid() ? style->get_margin(SIDE_TOP) : 0;
	float right = style.is_valid() ? style->get_margin(SIDE_RIGHT) : 0;
	float bottom = style.is_valid() ? style->get_margin(SIDE_BOTTOM) : 0;
	const StringName type = p_control->get_class();
	if (type == SNAME("CheckBox") || type == SNAME("CheckButton")) {
		const BaseButton *button = Object::cast_to<BaseButton>(p_control);
		const StringName icon_name = button && button->is_pressed() ? SNAME("checked") : SNAME("unchecked");
		const Ref<Texture2D> icon = p_control->get_theme_icon(icon_name);
		const float reserve = (icon.is_valid() ? icon->get_width() : 0) + p_control->get_theme_constant(SNAME("h_separation"));
		if ((type == SNAME("CheckBox")) != p_control->is_layout_rtl()) left += reserve;
		else right += reserve;
	} else if (type == SNAME("OptionButton")) {
		const Ref<Texture2D> arrow = p_control->get_theme_icon(SNAME("arrow"));
		const float reserve = (arrow.is_valid() ? arrow->get_width() : 0) + p_control->get_theme_constant(SNAME("arrow_margin"));
		if (p_control->is_layout_rtl()) left += reserve;
		else right += reserve;
	}
	state.rect = Rect2(Vector2(left, top), Size2(MAX(0.0f, p_control->get_size().x - left - right), MAX(0.0f, p_control->get_size().y - top - bottom)));
	state.color = p_control->get_theme_color(color);
	state.font_size = p_control->get_theme_font_size(SNAME("font_size"));
	state.line_spacing = font_spacing(p_control, state.font_size);
	// 下線はGodotの書体寸法とTheme間隔を使ってBrowserへ揃える。
	if (Object::cast_to<LinkButton>(p_control)) {
		const Ref<Font> font = control_font(p_control);
		state.underline_offset = p_control->get_theme_constant(SNAME("underline_spacing")) + font->get_underline_position(state.font_size);
		state.underline_thickness = MAX(1.0f, font->get_underline_thickness(state.font_size));
	}
	sync_text(p_control, state);
}


#ifndef GLES3_ENABLED
const int MAX_DOM_PARTICLES = 1024; // 一つのNodeがBrowserへ送る粒子instanceの上限。

static HashMap<ObjectID, CPUParticles2D *> gpu_particles_2d; // GPU設定をCPU式で進めるDOM専用proxy。
#ifndef _3D_DISABLED
static HashMap<ObjectID, CPUParticles3D *> gpu_particles_3d; // 3D GPU設定をCPU式で進めるDOM専用proxy。
#endif

// 解放済みGPU NodeのCPU proxyを同じframeで回収する。
static void prune_gpu_particles() {
	Vector<ObjectID> removed;
	for (const KeyValue<ObjectID, CPUParticles2D *> &entry : gpu_particles_2d) {
		if (!ObjectDB::get_instance(entry.key)) removed.push_back(entry.key);
	}
	for (ObjectID id : removed) {
		CPUParticles2D **proxy = gpu_particles_2d.getptr(id);
		if (proxy) memdelete(*proxy);
		gpu_particles_2d.erase(id);
	}
#ifndef _3D_DISABLED
	removed.clear();
	for (const KeyValue<ObjectID, CPUParticles3D *> &entry : gpu_particles_3d) {
		if (!ObjectDB::get_instance(entry.key)) removed.push_back(entry.key);
	}
	for (ObjectID id : removed) {
		CPUParticles3D **proxy = gpu_particles_3d.getptr(id);
		if (proxy) memdelete(*proxy);
		gpu_particles_3d.erase(id);
	}
#endif
}

static void emit_polygon(CanvasItem *p_item, const Vector<Point2> &p_points, const Vector<Color> &p_colors, const CharString &p_uid);
static void sync_mesh_2d(CanvasItem *p_item, const Ref<Mesh> &p_mesh, const Transform2D &p_instance, const Color &p_color, const String &p_tag);
static void sync_tile_map_layer(TileMapLayer *p_layer, int p_order);

// 二点を結ぶ線を、太さぶんの細い面として置く。線を出す処理はここへ集める。
static void emit_line(const Transform2D &p_basis, const Vector2 &p_from, const Vector2 &p_to, float p_width, const Color &p_color, const CharString &p_uid, int p_order) {
	const Vector2 delta = p_to - p_from;
	const float length = delta.length();
	if (length <= 0.0f) {
		return;
	}
	const float width = MAX(p_width, 1.0f);
	const Transform2D transform = p_basis * Transform2D(delta.angle(), p_from - Vector2(0, width * 0.5f));
	yweb_box_sync(p_uid.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			length, width, p_order, p_color.r, p_color.g, p_color.b, p_color.a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
}

// textureを一度PNGとしてBrowserへ渡し、以後は識別値で参照させる。
// 画素を毎frame送らないための入口で、識別値はresource pathかRIDから作る。
static String image_key(const Ref<Texture2D> &p_texture) {
	if (p_texture.is_null()) {
		return String();
	}
	const String path = p_texture->get_path();
	const String key = path.is_empty() ? "rid-" + itos(p_texture->get_rid().get_id()) : path;
	if (sent_images.has(key)) {
		return key;
	}
	const Ref<Image> image = p_texture->get_image();
	if (image.is_null() || image->is_empty()) {
		return String();
	}
	Ref<Image> copy = image->duplicate();
	if (copy->is_compressed()) {
		copy->decompress();
	}
	const Vector<uint8_t> png = copy->save_png_to_buffer();
	if (png.is_empty()) {
		return String();
	}
	const String encoded = CryptoCore::b64_encode_str(png.ptr(), png.size());
	sent_images.insert(key);
	const CharString key_utf8 = key.utf8();
	const CharString data_utf8 = ("data:image/png;base64," + encoded).utf8();
	yweb_image_data(key_utf8.get_data(), data_utf8.get_data());
	return key;
}

// 画像を指定Transform、矩形、重なり順でDOMへ写す。
static void sync_image_at(CanvasItem *p_item, const Ref<Texture2D> &p_texture, const Rect2 &p_rect, const Transform2D &p_basis, int p_order, const String &p_tag, const Color &p_tint) {
	const String key = image_key(p_texture);
	if (key.is_empty()) {
		return;
	}
	Transform2D transform = p_basis;
	transform[2] = transform.xform(p_rect.position);
	const Color modulate = p_item->get_modulate() * p_item->get_self_modulate() * p_tint;
	const CharString uid = (String::num_uint64((uint64_t)p_item->get_instance_id()) + "-" + p_tag).utf8();
	const CharString key_utf8 = key.utf8();
	yweb_image_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_rect.size.width, p_rect.size.height, p_order, modulate.r, modulate.g, modulate.b, modulate.a);
}

// 通常のCanvasItem画像を、Godotが確定したglobal Transformへ同期する。
static void sync_image(CanvasItem *p_item, const Ref<Texture2D> &p_texture, const Rect2 &p_rect, int p_order, const char *p_tag = "img", const Color &p_tint = Color(1, 1, 1, 1)) {
	sync_image_at(p_item, p_texture, p_rect, canvas_transform(p_item), p_order, p_tag, p_tint);
}

// textureの一部を原寸比で切り抜き、進捗など端位置に意味がある画像へ使う。
static void sync_image_region(CanvasItem *p_item, const Ref<Texture2D> &p_texture, const Rect2 &p_rect, const Rect2 &p_source, int p_order, const char *p_tag, const Color &p_tint) {
	const String key = image_key(p_texture);
	if (key.is_empty() || p_rect.size.x <= 0 || p_rect.size.y <= 0 || p_source.size.x <= 0 || p_source.size.y <= 0) return;
	Transform2D transform = canvas_transform(p_item);
	transform[2] = transform.xform(p_rect.position);
	const Color color = p_item->get_modulate() * p_item->get_self_modulate() * p_tint;
	const CharString uid = (String::num_uint64((uint64_t)p_item->get_instance_id()) + "-" + p_tag).utf8();
	const CharString key_utf8 = key.utf8();
	const Size2 image_size = p_texture->get_size();
	yweb_image_region_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_rect.size.x, p_rect.size.y, image_size.x, image_size.y, p_source.position.x, p_source.position.y, p_source.size.x, p_source.size.y,
			p_order, color.r, color.g, color.b, color.a);
}

// NinePatchRectのmarginと軸規則を一つのborder-image DOMへ同期する。
static void sync_nine_patch(NinePatchRect *p_patch, int p_order) {
	const Ref<Texture2D> texture = p_patch->get_texture();
	const String key = image_key(texture);
	if (key.is_empty()) return;
	const Transform2D transform = canvas_transform(p_patch);
	const Size2 size = p_patch->get_size();
	const Color color = p_patch->get_modulate() * p_patch->get_self_modulate();
	const CharString uid = (String::num_uint64((uint64_t)p_patch->get_instance_id()) + "-nine-patch").utf8();
	const CharString key_utf8 = key.utf8();
	yweb_nine_patch_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			size.x, size.y, p_patch->get_patch_margin(SIDE_LEFT), p_patch->get_patch_margin(SIDE_TOP), p_patch->get_patch_margin(SIDE_RIGHT), p_patch->get_patch_margin(SIDE_BOTTOM),
			p_order, p_patch->get_h_axis_stretch_mode(), p_patch->get_v_axis_stretch_mode(), p_patch->is_draw_center_enabled() ? 1 : 0,
			color.r, color.g, color.b, color.a);
}

// AnimatedSprite2Dを切り抜き枠とatlas画像へ分け、Godotが決めたframe領域を再現する。
static void sync_animated_sprite(AnimatedSprite2D *p_sprite, const Ref<Texture2D> &p_texture, int p_order) {
	Rect2 rect(p_sprite->get_offset(), p_texture->get_size());
	if (p_sprite->is_centered()) {
		rect.position -= rect.size * 0.5f;
	}
	if (p_sprite->is_flipped_h()) {
		rect.size.x = -rect.size.x;
	}
	if (p_sprite->is_flipped_v()) {
		rect.size.y = -rect.size.y;
	}

	Rect2 visible;
	Rect2 source;
	if (!p_texture->get_rect_region(rect, Rect2(Vector2(), p_texture->get_size()), visible, source)) {
		return;
	}
	const Ref<AtlasTexture> frame = p_texture;
	const Ref<Texture2D> image = frame.is_valid() ? frame->get_atlas() : p_texture;
	const String key = image_key(image);
	if (key.is_empty()) {
		return;
	}

	const bool flip_h = visible.size.x < 0;
	const bool flip_v = visible.size.y < 0;
	if (flip_h) {
		visible.size.x = -visible.size.x;
	}
	if (flip_v) {
		visible.size.y = -visible.size.y;
	}
	Transform2D transform = canvas_transform(p_sprite);
	transform[2] = transform.xform(visible.position);
	const Color modulate = p_sprite->get_modulate() * p_sprite->get_self_modulate();
	const CharString uid = (String::num_uint64((uint64_t)p_sprite->get_instance_id()) + "-animated").utf8();
	const CharString key_utf8 = key.utf8();
	const Size2 image_size = image->get_size();
	yweb_image_region_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			visible.size.x, visible.size.y, image_size.x, image_size.y, source.position.x, source.position.y,
			flip_h ? -source.size.x : source.size.x, flip_v ? -source.size.y : source.size.y,
			p_order, modulate.r, modulate.g, modulate.b, modulate.a);
}

// TileMap本体の規則から、画像の向きとcell中心を含む表示矩形を決める。
static Rect2 tile_rect(const Vector2 &p_center, const Size2 &p_size, const TileData *p_data, int p_alternative, bool &r_transpose) {
	const bool cell_transpose = bool(p_alternative & TileSetAtlasSource::TRANSFORM_TRANSPOSE);
	const bool cell_flip_h = bool(p_alternative & TileSetAtlasSource::TRANSFORM_FLIP_H);
	const bool cell_flip_v = bool(p_alternative & TileSetAtlasSource::TRANSFORM_FLIP_V);
	r_transpose = p_data->get_transpose() != cell_transpose;
	const bool flip_h = cell_flip_h != (cell_transpose ? p_data->get_flip_v() : p_data->get_flip_h());
	const bool flip_v = cell_flip_v != (cell_transpose ? p_data->get_flip_h() : p_data->get_flip_v());
	const Size2 placed = r_transpose ? Size2(p_size.y, p_size.x) : p_size;
	Rect2 rect(-placed * 0.5f, p_size);
	const Vector2 origin = p_data->get_texture_origin();
	rect.position -= cell_transpose ? Vector2(origin.y, origin.x) : origin;
	if (cell_flip_h) rect.position.x = -(rect.position.x + placed.x);
	if (cell_flip_v) rect.position.y = -(rect.position.y + placed.y);
	rect.position += p_center;
	if (flip_h) rect.size.x = -rect.size.x;
	if (flip_v) rect.size.y = -rect.size.y;
	return rect;
}

// 一つのatlas cellを切り抜き画像として同期する。
static void sync_tile_cell(CanvasItem *p_item, const Ref<TileSet> &p_tiles, const Vector2 &p_center, int p_source, const Vector2i &p_atlas_coords, int p_alternative, const String &p_tag, const Color &p_modulate, int p_order) {
	if (p_tiles.is_null() || p_source < 0) return;
	const Ref<TileSetAtlasSource> atlas = p_tiles->get_source(p_source);
	if (atlas.is_null()) return;
	TileData *data = atlas->get_tile_data(p_atlas_coords, p_alternative);
	const Ref<Texture2D> texture = atlas->get_runtime_texture();
	if (!data || texture.is_null()) return;
	const Rect2 source = atlas->get_runtime_tile_texture_region(p_atlas_coords);
	bool transpose = false;
	const Rect2 rect = tile_rect(p_center, source.size, data, p_alternative, transpose);
	Transform2D basis = canvas_transform(p_item);
	if (transpose) basis = basis * Transform2D(Vector2(0, 1), Vector2(1, 0), Vector2());
	const String key = image_key(texture);
	if (key.is_empty()) return;
	Transform2D transform = basis;
	transform[2] = transform.xform(rect.position);
	const Color color = p_item->get_modulate() * p_item->get_self_modulate() * p_modulate * data->get_modulate();
	const CharString uid = (String::num_uint64((uint64_t)p_item->get_instance_id()) + "-tile-" + p_tag).utf8();
	const CharString key_utf8 = key.utf8();
	const Size2 image_size = texture->get_size();
	yweb_image_region_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			Math::abs(rect.size.x), Math::abs(rect.size.y), image_size.x, image_size.y, source.position.x, source.position.y,
			rect.size.x < 0 ? -source.size.x : source.size.x, rect.size.y < 0 ? -source.size.y : source.size.y,
			p_order, color.r, color.g, color.b, color.a);
}

// TileMapLayerの使用cellを一括で同期する。
static void sync_tile_map_layer(TileMapLayer *p_layer, int p_order) {
	const Ref<TileSet> tiles = p_layer->get_tile_set();
	const TypedArray<Vector2i> cells = p_layer->get_used_cells();
	const int count = MIN(cells.size(), 4096);
	for (int index = 0; index < count; index++) {
		const Vector2i cell = cells[index];
		sync_tile_cell(p_layer, tiles, p_layer->map_to_local(cell), p_layer->get_cell_source_id(cell), p_layer->get_cell_atlas_coords(cell), p_layer->get_cell_alternative_tile(cell), itos(index), Color(1, 1, 1, 1), p_order);
	}
}

// GPU粒子の公開設定をGodotのCPU simulationへ移し、DOM用の確定Transformを得る。
static CPUParticles2D *gpu_proxy(GPUParticles2D *p_particles) {
	const ObjectID id = p_particles->get_instance_id();
	CPUParticles2D **stored = gpu_particles_2d.getptr(id);
	if (stored) return *stored;
	CPUParticles2D *proxy = memnew(CPUParticles2D);
	proxy->convert_from_particles(p_particles);
	proxy->restart(true);
	gpu_particles_2d.insert(id, proxy);
	return proxy;
}

// 画像を持つnodeから、texureと表示矩形を取り出して同期する。
static void sync_image_node(CanvasItem *p_item, int p_order) {
	if (!p_item->is_visible_in_tree()) {
		return;
	}
	if (TextureButton *button = Object::cast_to<TextureButton>(p_item)) {
		Ref<Texture2D> texture = button->get_texture_normal();
		if (button->is_disabled() && button->get_texture_disabled().is_valid()) texture = button->get_texture_disabled();
		else if (button->is_pressed() && button->get_texture_pressed().is_valid()) texture = button->get_texture_pressed();
		else if (button->is_hovered() && button->get_texture_hover().is_valid()) texture = button->get_texture_hover();
		sync_image(button, texture, Rect2(Vector2(), button->get_size()), p_order);
	} else if (TextureProgressBar *bar = Object::cast_to<TextureProgressBar>(p_item)) {
		const double span = bar->get_max() - bar->get_min();
		const float ratio = span > 0 ? (bar->get_value() - bar->get_min()) / span : 0;
		const Ref<Texture2D> under = bar->get_under_texture();
		const Ref<Texture2D> progress = bar->get_progress_texture();
		const Ref<Texture2D> over = bar->get_over_texture();
		if (under.is_valid()) sync_image(bar, under, Rect2(Vector2(), under->get_size()), p_order, "under", bar->get_tint_under());
		if (progress.is_valid() && !bar->get_nine_patch_stretch()) {
			const Size2 size = progress->get_size();
			Rect2 source(Vector2(), size);
			Rect2 target(bar->get_progress_offset(), size);
			switch (bar->get_fill_mode()) {
				case TextureProgressBar::FILL_LEFT_TO_RIGHT:
					source.size.x *= ratio;
					target.size.x *= ratio;
					break;
				case TextureProgressBar::FILL_RIGHT_TO_LEFT:
					source.position.x += size.x * (1.0f - ratio);
					target.position.x += size.x * (1.0f - ratio);
					source.size.x *= ratio;
					target.size.x *= ratio;
					break;
				case TextureProgressBar::FILL_TOP_TO_BOTTOM:
					source.size.y *= ratio;
					target.size.y *= ratio;
					break;
				case TextureProgressBar::FILL_BOTTOM_TO_TOP:
					source.position.y += size.y * (1.0f - ratio);
					target.position.y += size.y * (1.0f - ratio);
					source.size.y *= ratio;
					target.size.y *= ratio;
					break;
				default:
					target.size.x *= ratio;
					source.size.x *= ratio;
					break;
			}
			sync_image_region(bar, progress, target, source, p_order + 1, "progress", bar->get_tint_progress());
		} else if (progress.is_valid()) {
			sync_image(bar, progress, Rect2(bar->get_progress_offset(), Size2(bar->get_size().x * ratio, bar->get_size().y)), p_order + 1, "progress", bar->get_tint_progress());
		}
		if (over.is_valid()) sync_image(bar, over, Rect2(Vector2(), over->get_size()), p_order + 2, "over", bar->get_tint_over());
	} else if (TextureRect *rect = Object::cast_to<TextureRect>(p_item)) {
		sync_image(rect, rect->get_texture(), Rect2(Vector2(), rect->get_size()), p_order);
	} else if (VideoStreamPlayer *video = Object::cast_to<VideoStreamPlayer>(p_item)) {
		sync_image(video, video->get_video_texture(), Rect2(Vector2(), video->get_size()), p_order, "video");
	} else if (SubViewportContainer *container = Object::cast_to<SubViewportContainer>(p_item)) {
		SubViewport *viewport = nullptr;
		for (int index = 0; index < container->get_child_count(); index++) {
			viewport = Object::cast_to<SubViewport>(container->get_child(index));
			if (viewport) break;
		}
		if (!viewport || viewport->has_transparent_background()) return;
		const Transform2D transform = canvas_transform(container);
		const Size2 size = container->get_size();
		const Color color = RenderingServer::get_singleton()->get_default_clear_color();
		const CharString uid = (String::num_uint64((uint64_t)container->get_instance_id()) + "-viewport-background").utf8();
		yweb_box_sync(uid.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
				size.x, size.y, p_order, color.r, color.g, color.b, color.a, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
	} else if (NinePatchRect *patch = Object::cast_to<NinePatchRect>(p_item)) {
		sync_nine_patch(patch, p_order);
	} else if (MeshInstance2D *instance = Object::cast_to<MeshInstance2D>(p_item)) {
		sync_mesh_2d(instance, instance->get_mesh(), Transform2D(), Color(1, 1, 1, 1), "mesh");
	} else if (MultiMeshInstance2D *instance = Object::cast_to<MultiMeshInstance2D>(p_item)) {
		const Ref<MultiMesh> group = instance->get_multimesh();
		if (group.is_null() || group->get_mesh().is_null()) return;
		int count = group->get_visible_instance_count();
		if (count < 0) count = group->get_instance_count();
		count = MIN(count, MAX_DOM_PARTICLES);
		for (int index = 0; index < count; index++) {
			const Color color = group->is_using_colors() ? group->get_instance_color(index) : Color(1, 1, 1, 1);
			 sync_mesh_2d(instance, group->get_mesh(), group->get_instance_transform_2d(index), color, "multimesh-" + itos(index));
		}
	} else if (TouchScreenButton *button = Object::cast_to<TouchScreenButton>(p_item)) {
		Ref<Texture2D> texture = button->is_pressed() ? button->get_texture_pressed() : button->get_texture_normal();
		if (texture.is_null()) texture = button->get_texture_normal();
		if (texture.is_valid()) sync_image(button, texture, Rect2(Vector2(), texture->get_size()), p_order, "touch");
	} else if (TileMapLayer *layer = Object::cast_to<TileMapLayer>(p_item)) {
		sync_tile_map_layer(layer, p_order);
	} else if (CPUParticles2D *particles = Object::cast_to<CPUParticles2D>(p_item)) {
		const Ref<Texture2D> texture = particles->get_texture();
		if (texture.is_null()) return;
		const Rect2 rect(-texture->get_size() * 0.5f, texture->get_size());
		Vector<Transform2D> transforms;
		Vector<Color> colors;
		particles->yweb_particles(transforms, colors, MAX_DOM_PARTICLES);
		const Transform2D basis = particles->get_use_local_coordinates() ? canvas_transform(particles) : canvas_transform(particles) * particles->get_global_transform().affine_inverse();
		for (int index = 0; index < transforms.size(); index++) {
			sync_image_at(particles, texture, rect, basis * transforms[index], p_order, "cpu-particle" + itos(index), colors[index]);
		}
	} else if (GPUParticles2D *particles = Object::cast_to<GPUParticles2D>(p_item)) {
		const Ref<Texture2D> texture = particles->get_texture();
		if (texture.is_null()) return;
		const Rect2 rect(-texture->get_size() * 0.5f, texture->get_size());
		CPUParticles2D *proxy = gpu_proxy(particles);
		proxy->yweb_advance(particles->get_process_delta_time());
		Vector<Transform2D> transforms;
		Vector<Color> colors;
		proxy->yweb_particles(transforms, colors, MAX_DOM_PARTICLES);
		for (int index = 0; index < transforms.size(); index++) {
			sync_image_at(particles, texture, rect, canvas_transform(particles) * transforms[index], p_order, "gpu-particle" + itos(index), colors[index]);
		}
	} else if (Sprite2D *sprite = Object::cast_to<Sprite2D>(p_item)) {
		const Ref<Texture2D> texture = sprite->get_texture();
		if (texture.is_valid()) {
			const Size2 size = texture->get_size();
			const Vector2 offset = sprite->get_offset() - (sprite->is_centered() ? size * 0.5 : Vector2());
			sync_image(sprite, texture, Rect2(offset, size), p_order);
		}
	} else if (AnimatedSprite2D *sprite = Object::cast_to<AnimatedSprite2D>(p_item)) {
		const Ref<SpriteFrames> frames = sprite->get_sprite_frames();
		const Ref<Texture2D> texture = frames.is_valid() ? frames->get_frame_texture(sprite->get_animation(), sprite->get_frame()) : Ref<Texture2D>();
		if (texture.is_valid()) {
			sync_animated_sprite(sprite, texture, p_order);
		}
	}
}
#endif


// 面を一枚追加で出す。前景やつまみのように、node一つが複数の面を持つ場合に使う。
static void sync_extra_box(Control *p_control, const StringName &p_style, const Rect2 &p_area, const char *p_tag, int p_order) {
	if (!p_control->has_theme_stylebox(p_style)) {
		return;
	}
	Ref<StyleBoxFlat> flat = p_control->get_theme_stylebox(p_style);
	if (flat.is_null() || p_area.size.width <= 0 || p_area.size.height <= 0) {
		return;
	}
	Transform2D transform = canvas_transform(p_control);
	transform[2] = transform.xform(p_area.position);
	const CharString uid = (String::num_uint64((uint64_t)p_control->get_instance_id()) + "-" + p_tag).utf8();
	const Color modulate = p_control->get_modulate_in_tree() * p_control->get_self_modulate();
	const Color background = flat->get_bg_color() * modulate;
	const Color border = flat->get_border_color() * modulate;
	yweb_box_sync(uid.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_area.size.width, p_area.size.height, p_order,
			background.r, background.g, background.b, background.a,
			flat->get_border_width(SIDE_LEFT), flat->get_border_width(SIDE_TOP), flat->get_border_width(SIDE_RIGHT), flat->get_border_width(SIDE_BOTTOM),
			border.r, border.g, border.b, border.a,
			flat->get_corner_radius(CORNER_TOP_LEFT), flat->get_corner_radius(CORNER_TOP_RIGHT), flat->get_corner_radius(CORNER_BOTTOM_RIGHT), flat->get_corner_radius(CORNER_BOTTOM_LEFT));
}

// Theme iconをControl内の確定矩形へ置く。状態別iconも同じ入口を使う。
static void sync_theme_icon(Control *p_control, const StringName &p_icon, const Rect2 &p_area, const char *p_tag, int p_order, const Color &p_tint = Color(1, 1, 1, 1)) {
	if (!p_control->has_theme_icon(p_icon)) return;
	const Ref<Texture2D> icon = p_control->get_theme_icon(p_icon);
	if (icon.is_null() || p_area.size.x <= 0 || p_area.size.y <= 0) return;
	sync_image(p_control, icon, p_area, p_order, p_tag, p_tint);
}

// ScrollBarのtrack、button、grabberをGodot本体と同じRange計算から組み立てる。
static void sync_scrollbar(ScrollBar *p_bar, int p_order) {
	const bool vertical = is_vertical_scrollbar(p_bar);
	const Size2 size = p_bar->get_size();
	const StringName decrement_name = p_bar->yweb_decrement_icon();
	const StringName increment_name = p_bar->yweb_increment_icon();
	const StringName grabber_name = p_bar->yweb_grabber_style();
	const Ref<Texture2D> decrement = p_bar->get_theme_icon(decrement_name);
	const Ref<Texture2D> increment = p_bar->get_theme_icon(increment_name);
	const Ref<StyleBox> track = p_bar->get_theme_stylebox(SNAME("scroll"));
	const Ref<StyleBox> grabber = p_bar->get_theme_stylebox(grabber_name);
	if (track.is_null() || grabber.is_null()) return;

	const Size2 decr_size = decrement.is_valid() ? decrement->get_size() : Size2();
	const Size2 incr_size = increment.is_valid() ? increment->get_size() : Size2();
	const Size2 grabber_min = grabber->get_minimum_size();
	const float axis_size = vertical ? size.y : size.x;
	const float buttons = vertical ? decr_size.y + incr_size.y : decr_size.x + incr_size.x;
	const float track_min = vertical ? track->get_minimum_size().y : track->get_minimum_size().x;
	const float knob_min = vertical ? grabber_min.y : grabber_min.x;
	const float range = p_bar->get_max() - p_bar->get_min();
	const float travel = MAX(0.0f, axis_size - buttons - track_min - knob_min);
	const float page = MAX(0.0, p_bar->get_page());
	const float knob_size = range > 0 ? knob_min + page / range * travel : knob_min;
	const float offset = travel * p_bar->get_as_ratio();
	const int left = MAX(0, p_bar->get_theme_constant(SNAME("padding_left")));
	const int top = MAX(0, p_bar->get_theme_constant(SNAME("padding_top")));
	const int right = MAX(0, p_bar->get_theme_constant(SNAME("padding_right")));
	const int bottom = MAX(0, p_bar->get_theme_constant(SNAME("padding_bottom")));
	Rect2 knob;
	if (vertical) knob = Rect2(Vector2(left, decr_size.y + track->get_margin(SIDE_TOP) + offset), Size2(MAX(0.0f, size.x - left - right), knob_size));
	else knob = Rect2(Vector2(decr_size.x + track->get_margin(SIDE_LEFT) + offset, top), Size2(knob_size, MAX(0.0f, size.y - top - bottom)));
	sync_extra_box(p_bar, grabber_name, knob, "grabber", p_order + 1);
	sync_theme_icon(p_bar, decrement_name, Rect2(Vector2(), decr_size), "decrement", p_order + 2);
	const Vector2 incr_at = vertical ? Vector2(0, size.y - incr_size.y) : Vector2(size.x - incr_size.x, 0);
	sync_theme_icon(p_bar, increment_name, Rect2(incr_at, incr_size), "increment", p_order + 2);
}

// Button系がThemeから選ぶ印と矢印を、文字とは別の画像層へ同期する。
static void sync_control_icon(Control *p_control, int p_order) {
	StringName name;
	Vector2 at;
	if (p_control->get_class() == SNAME("CheckBox")) {
		CheckBox *box = static_cast<CheckBox *>(p_control);
		const bool disabled = box->is_disabled();
		const String prefix = box->get_button_group().is_valid() ? "radio_" : "";
		name = StringName(prefix + (box->is_pressed() ? "checked" : "unchecked") + (disabled ? "_disabled" : ""));
		const Ref<StyleBox> normal = box->get_theme_stylebox(SNAME("normal"));
		at.x = normal.is_valid() ? normal->get_margin(SIDE_LEFT) : 0;
	} else if (p_control->get_class() == SNAME("CheckButton")) {
		CheckButton *button = static_cast<CheckButton *>(p_control);
		name = StringName(String(button->is_pressed() ? "checked" : "unchecked") + (button->is_disabled() ? "_disabled" : ""));
	} else if (p_control->get_class() == SNAME("OptionButton")) {
		OptionButton *option = static_cast<OptionButton *>(p_control);
		name = SNAME("arrow");
		const Ref<Texture2D> arrow = option->get_theme_icon(name);
		at.x = option->get_size().x - (arrow.is_valid() ? arrow->get_width() : 0) - option->get_theme_constant(SNAME("arrow_margin"));
	} else if (Button *button = Object::cast_to<Button>(p_control)) {
		const Ref<Texture2D> icon = button->get_button_icon();
		if (icon.is_valid()) {
			at.y = (button->get_size().y - icon->get_height()) * 0.5f;
			sync_image(button, icon, Rect2(at, icon->get_size()), p_order, "button-icon");
		}
		return;
	} else {
		return;
	}
	const Ref<Texture2D> icon = p_control->get_theme_icon(name);
	if (icon.is_null()) return;
	if (p_control->get_class() == SNAME("CheckButton")) at.x = p_control->get_size().x - icon->get_width();
	at.y = (p_control->get_size().y - icon->get_height()) * 0.5f + p_control->get_theme_constant(SNAME("check_v_offset"));
	sync_theme_icon(p_control, name, Rect2(at, icon->get_size()), "theme-icon", p_order);
}

// 値に応じて伸びる面を持つnodeを、割合から矩形を出して同期する。
static void sync_ranged(Control *p_control, int p_order) {
	sync_control_icon(p_control, p_order + 2);
	if (VirtualJoystick *stick = Object::cast_to<VirtualJoystick>(p_control)) {
		if (stick->get_visibility_mode() == VirtualJoystick::VISIBILITY_WHEN_TOUCHED && !stick->yweb_is_pressed()) return;
		const float base_size = stick->get_joystick_size();
		const float tip_size = stick->get_tip_size();
		const Vector2 base = stick->get_joystick_position();
		const Vector2 tip = stick->yweb_tip_position();
		sync_extra_box(stick, stick->yweb_is_pressed() ? SNAME("pressed_joystick") : SNAME("normal_joystick"), Rect2(base - Vector2(base_size, base_size) * 0.5f, Size2(base_size, base_size)), "joystick", p_order);
		sync_extra_box(stick, stick->yweb_is_pressed() ? SNAME("pressed_tip") : SNAME("normal_tip"), Rect2(tip - Vector2(tip_size, tip_size) * 0.5f, Size2(tip_size, tip_size)), "joystick-tip", p_order + 1);
	} else if (ProgressBar *bar = Object::cast_to<ProgressBar>(p_control)) {
		const Size2 size = bar->get_size();
		const double span = bar->get_max() - bar->get_min();
		const double ratio = span > 0.0 ? (bar->get_value() - bar->get_min()) / span : 0.0;
		const Ref<StyleBox> fill = bar->get_theme_stylebox(SNAME("fill"));
		const Size2 least = fill.is_valid() ? fill->get_minimum_size() : Size2();
		Rect2 area;
		if (bar->get_fill_mode() == ProgressBar::FILL_TOP_TO_BOTTOM || bar->get_fill_mode() == ProgressBar::FILL_BOTTOM_TO_TOP) {
			const float length = Math::round(ratio * (size.y - least.y)) + least.y;
			area = Rect2(Vector2(0, bar->get_fill_mode() == ProgressBar::FILL_BOTTOM_TO_TOP ? size.y - length : 0), Size2(size.x, length));
		} else {
			const float length = Math::round(ratio * (size.x - least.x)) + least.x;
			const bool reverse = bar->get_fill_mode() == ProgressBar::FILL_END_TO_BEGIN || (bar->is_layout_rtl() && bar->get_fill_mode() == ProgressBar::FILL_BEGIN_TO_END);
			area = Rect2(Vector2(reverse ? size.x - length : 0, 0), Size2(length, size.y));
		}
		sync_extra_box(bar, SNAME("fill"), area, "fill", p_order);
	} else if (Slider *slider = Object::cast_to<Slider>(p_control)) {
		const Size2 size = slider->get_size();
		const double span = slider->get_max() - slider->get_min();
		const double ratio = span > 0.0 ? (slider->get_value() - slider->get_min()) / span : 0.0;
		const bool vertical = Object::cast_to<VSlider>(slider) != nullptr;
		const Ref<StyleBox> track = slider->get_theme_stylebox(SNAME("slider"));
		const Size2 least = track.is_valid() ? track->get_minimum_size() : size;
		Rect2 area;
		if (vertical) {
			const float left = (size.width - least.width) * 0.5f;
			area = Rect2(Vector2(left, size.height * (1.0 - ratio)), Size2(least.width, size.height * ratio));
		} else {
			const float top = (size.height - least.height) * 0.5f;
			area = Rect2(Vector2(0, top), Size2(size.width * ratio, least.height));
		}
		sync_extra_box(slider, SNAME("grabber_area"), area, "fill", p_order);
		// つまみはthemeのiconをそのまま画像として置く。
		const StringName icon_name = slider->has_focus() && slider->has_theme_icon(SNAME("grabber_highlight")) ? SNAME("grabber_highlight") : SNAME("grabber");
		const Ref<Texture2D> grabber = slider->get_theme_icon(icon_name);
		if (grabber.is_valid()) {
			const Size2 knob = grabber->get_size();
			const Vector2 at = vertical
					? Vector2((size.width - knob.width) * 0.5f, size.height * (1.0 - ratio) - knob.height * 0.5f)
					: Vector2(size.width * ratio - knob.width * 0.5f, (size.height - knob.height) * 0.5f);
			const String key = image_key(grabber);
			if (!key.is_empty()) {
				Transform2D transform = canvas_transform(slider);
				transform[2] = transform.xform(at);
				const CharString uid = (String::num_uint64((uint64_t)slider->get_instance_id()) + "-knob").utf8();
				const CharString key_utf8 = key.utf8();
				yweb_image_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
						knob.width, knob.height, p_order + 1, 1, 1, 1, 1);
			}
		}
	} else if (ScrollBar *bar = as_scrollbar(p_control)) {
		sync_scrollbar(bar, p_order);
	}
	// focusは通常面へ重ねて描くため、別DOM面として保つ。
	if (!as_scrollbar(p_control) && p_control->has_focus() && p_control->has_theme_stylebox(SNAME("focus"))) {
		sync_extra_box(p_control, SNAME("focus"), Rect2(Vector2(), p_control->get_size()), "focus", p_order + 3);
	}
}

// 図形を描くNode2Dを、線の集まりとしてCSSへ写す。
static void sync_shape(CanvasItem *p_item, int p_order) {
	if (Line2D *line = Object::cast_to<Line2D>(p_item)) {
		const PackedVector2Array points = line->get_points();
		const Color color = line->get_default_color() * p_item->get_modulate();
		const Transform2D basis = canvas_transform(p_item);
		for (int index = 0; index + 1 < points.size(); index++) {
			const CharString uid = (String::num_uint64((uint64_t)p_item->get_instance_id()) + "-line" + itos(index)).utf8();
			emit_line(basis, points[index], points[index + 1], line->get_width(), color, uid, p_order);
		}
	} else if (Polygon2D *polygon = Object::cast_to<Polygon2D>(p_item)) {
		const Vector<Vector2> points = polygon->get_polygon();
		const Vector<Color> colors = { polygon->get_color() };
		const CharString uid = (String::num_uint64((uint64_t)p_item->get_instance_id()) + "-polygon").utf8();
		emit_polygon(p_item, points, colors, uid);
	}
}

// ColorPicker内部のGodot確定矩形を探し、色面とhue帯をCSS gradientへ写す。
static void sync_color_picker(ColorPicker *p_picker, Node *p_node, int p_order) {
	for (int index = 0; index < p_node->get_child_count(true); index++) {
		Node *child = p_node->get_child(index, true);
		Control *control = Object::cast_to<Control>(child);
		if (control && control->is_visible_in_tree() && control->get_class() == SNAME("Control")) {
			const Size2 size = control->get_size();
			int kind = -1;
			if (size.x >= 64 && size.y >= 64) kind = 0;
			else if (size.x >= 12 && size.x <= 48 && size.y >= 64) kind = 1;
			if (kind >= 0) {
				const Transform2D transform = canvas_transform(control);
				const Color color = kind == 0 ? Color::from_hsv(p_picker->get_pick_color().get_h(), 1, 1) : Color(1, 1, 1, 1);
				const CharString uid = (String::num_uint64((uint64_t)p_picker->get_instance_id()) + "-gradient-" + itos(kind)).utf8();
				yweb_gradient_sync(uid.get_data(), kind, transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y, size.x, size.y, p_order, color.r, color.g, color.b, color.a);
			}
		}
		sync_color_picker(p_picker, child, p_order);
	}
}

#ifndef _3D_DISABLED
const int MAX_DOM_TRIANGLES = 4096; // 一つのNodeがBrowserへ送る三角形の上限。

// 3D平面のlocal座標をSprite3Dと同じ軸規則でworld座標へ直す。
static Vector3 sprite_point(SpriteBase3D *p_sprite, const Vector2 &p_point) {
	Vector2 point = p_point * p_sprite->get_pixel_size();
	const int axis = p_sprite->get_axis();
	int x_axis = (axis + 1) % 3;
	int y_axis = (axis + 2) % 3;
	if (axis != Vector3::AXIS_Z) {
		SWAP(x_axis, y_axis);
		if (axis == Vector3::AXIS_Y) point.y = -point.y;
		else if (axis == Vector3::AXIS_X) point.x = -point.x;
	}
	Vector3 local;
	local[x_axis] = point.x;
	local[y_axis] = point.y;
	return p_sprite->get_global_transform().xform(local);
}

// 指定SubViewportのtextureを表示しているSprite3Dをsceneから探す。
static Sprite3D *find_viewport_sprite(Node *p_node, const Ref<Texture2D> &p_texture) {
	if (Sprite3D *sprite = Object::cast_to<Sprite3D>(p_node)) {
		if (sprite->get_texture() == p_texture) return sprite;
	}
	for (int index = 0; index < p_node->get_child_count(true); index++) {
		if (Sprite3D *found = find_viewport_sprite(p_node->get_child(index, true), p_texture)) return found;
	}
	return nullptr;
}

// CanvasItemが属するSubViewportを、2D Container表示と3D texture表示に分けて得る。
static SubViewport *projected_viewport(CanvasItem *p_item) {
	for (Node *node = p_item->get_parent(); node; node = node->get_parent()) {
		SubViewport *viewport = Object::cast_to<SubViewport>(node);
		if (!viewport) continue;
		if (Object::cast_to<SubViewportContainer>(viewport->get_parent())) return nullptr;
		return viewport;
	}
	return nullptr;
}

// SubViewport内のDOMを、同じtextureを持つSprite3Dの投影面へ移す。
static void sync_projected_item(CanvasItem *p_item, int p_order) {
	SubViewport *viewport = projected_viewport(p_item);
	SceneTree *tree = SceneTree::get_singleton();
	Node *scene = tree ? tree->get_current_scene() : nullptr;
	if (!viewport || !scene) return;
	Sprite3D *sprite = nullptr;
	if (const ObjectID *stored = viewport_sprites.getptr(viewport->get_instance_id())) sprite = Object::cast_to<Sprite3D>(ObjectDB::get_instance(*stored));
	if (!sprite || sprite->get_texture() != viewport->get_texture()) {
		sprite = find_viewport_sprite(scene, viewport->get_texture());
		if (!sprite) return;
		viewport_sprites[viewport->get_instance_id()] = sprite->get_instance_id();
	}
	Viewport *screen = sprite->get_viewport();
	Camera3D *camera = screen ? screen->get_camera_3d() : nullptr;
	const Size2 size = viewport->get_size();
	const Rect2 rect = sprite->get_item_rect();
	if (!camera || size.x <= 0 || size.y <= 0 || rect.size.x <= 0 || rect.size.y <= 0) return;
	const Vector3 world[] = {
		sprite_point(sprite, Vector2(rect.position.x, rect.position.y + rect.size.y)),
		sprite_point(sprite, Vector2(rect.position.x + rect.size.x, rect.position.y + rect.size.y)),
		sprite_point(sprite, Vector2(rect.position.x, rect.position.y)),
		sprite_point(sprite, Vector2(rect.position.x + rect.size.x, rect.position.y)),
	};
	for (const Vector3 &point : world) {
		if (camera->is_position_behind(point)) return;
	}
	const Vector2 top_left = camera->unproject_position(world[0]);
	const Vector2 top_right = camera->unproject_position(world[1]);
	const Vector2 bottom_left = camera->unproject_position(world[2]);
	const Vector2 bottom_right = camera->unproject_position(world[3]);
	const float depth = camera->get_global_position().distance_to(sprite->get_global_position());
	const CharString owner = String::num_uint64((uint64_t)p_item->get_instance_id()).utf8();
	yweb_project_sync(owner.get_data(), size.x, size.y, top_left.x, top_left.y, top_right.x, top_right.y, bottom_left.x, bottom_left.y, bottom_right.x, bottom_right.y, (int)(100000.0f - depth * 100.0f) + p_order);
}

// world上の三点をCamera3Dで投影し、平面一枚のmatrix3dとしてBrowserへ渡す。
static void sync_plane(Node3D *p_node, Camera3D *p_camera, const Vector3 &p_top_left, const Vector3 &p_top_right, const Vector3 &p_bottom_left, const Vector3 &p_bottom_right, const Size2 &p_size, const String &p_key, const String &p_text, const Color &p_color, float p_font_size, int p_order) {
	if (!p_node->is_visible_in_tree() || p_size.x <= 0 || p_size.y <= 0 || p_camera->is_position_behind(p_top_left)) return;
	const Vector2 top_left = p_camera->unproject_position(p_top_left);
	const Vector2 top_right = p_camera->unproject_position(p_top_right);
	const Vector2 bottom_left = p_camera->unproject_position(p_bottom_left);
	const Vector2 bottom_right = p_camera->unproject_position(p_bottom_right);
	const float depth = p_camera->get_global_position().distance_to(p_node->get_global_position());
	const CharString uid = (String::num_uint64((uint64_t)p_node->get_instance_id()) + "-3d").utf8();
	const CharString type = p_node->get_class().utf8();
	const CharString key = p_key.utf8();
	const CharString text = p_text.utf8();
	yweb_plane_sync(uid.get_data(), type.get_data(), key.get_data(), text.get_data(), top_left.x, top_left.y, top_right.x, top_right.y, bottom_left.x, bottom_left.y, bottom_right.x, bottom_right.y, p_size.x, p_size.y,
			(int)(100000.0f - depth * 100.0f) + p_order, p_text.is_empty() ? 0 : 1,
			p_color.r, p_color.g, p_color.b, p_color.a, p_font_size);
}

// 材質が持つ確定色を、光を使わないDOM面の色へ直す。
static Color material_color(const Ref<Material> &p_material, const Color &p_fallback = Color(0.7, 0.7, 0.7, 1)) {
	const Ref<BaseMaterial3D> material = p_material;
	return material.is_valid() ? material->get_albedo() : p_fallback;
}

// 一つの三角形をCameraで投影し、画面上の平坦DOMへ深度順に送る。
static void emit_triangle_3d(Node3D *p_node, Camera3D *p_camera, const Vector3 &p_a, const Vector3 &p_b, const Vector3 &p_c, const Color &p_color, int p_index, int p_order, const String &p_group) {
	if (p_camera->is_position_behind(p_a) || p_camera->is_position_behind(p_b) || p_camera->is_position_behind(p_c)) return;
	const Vector2 a = p_camera->unproject_position(p_a);
	const Vector2 b = p_camera->unproject_position(p_b);
	const Vector2 c = p_camera->unproject_position(p_c);
	if (Math::abs((b - a).cross(c - a)) < 0.01f) return;
	const float depth = (p_camera->get_global_position().distance_to(p_a) + p_camera->get_global_position().distance_to(p_b) + p_camera->get_global_position().distance_to(p_c)) / 3.0f;
	const CharString uid = (String::num_uint64((uint64_t)p_node->get_instance_id()) + "-mesh" + itos(p_index)).utf8();
	const CharString type = p_node->get_class().utf8();
	const CharString group = p_group.utf8();
	yweb_triangle_sync(uid.get_data(), type.get_data(), group.get_data(), a.x, a.y, b.x, b.y, c.x, c.y,
			(int)(100000.0f - depth * 100.0f) + p_order, p_color.r, p_color.g, p_color.b, p_color.a);
}

// Mesh surfaceの頂点、index、頂点色を読み、三角形DOMへ写す。
static int sync_mesh(Node3D *p_node, Camera3D *p_camera, const Ref<Mesh> &p_mesh, const Transform3D &p_world, int p_order, int p_start = 0, const Color &p_tint = Color(1, 1, 1, 1), const String &p_group = String()) {
	if (p_mesh.is_null() || !p_node->is_visible_in_tree()) return p_start;
	int emitted = p_start;
	GeometryInstance3D *geometry = Object::cast_to<GeometryInstance3D>(p_node);
	for (int surface = 0; surface < p_mesh->get_surface_count() && emitted < MAX_DOM_TRIANGLES; surface++) {
		if (p_mesh->surface_get_primitive_type(surface) != Mesh::PRIMITIVE_TRIANGLES) continue;
		const Array arrays = p_mesh->surface_get_arrays(surface);
		if (arrays.size() <= Mesh::ARRAY_INDEX) continue;
		const PackedVector3Array vertices = arrays[Mesh::ARRAY_VERTEX];
		const PackedInt32Array indices = arrays[Mesh::ARRAY_INDEX];
		const PackedColorArray colors = arrays[Mesh::ARRAY_COLOR];
		if (vertices.is_empty()) continue;
		Ref<Material> source = p_mesh->surface_get_material(surface);
		if (MeshInstance3D *instance = Object::cast_to<MeshInstance3D>(p_node)) source = instance->get_active_material(surface);
		if (geometry && geometry->get_material_override().is_valid()) source = geometry->get_material_override();
		const Color base = material_color(source) * p_tint * Color(1, 1, 1, geometry ? 1.0f - geometry->get_transparency() : 1.0f);
		const int count = indices.is_empty() ? vertices.size() : indices.size();
		for (int index = 0; index + 2 < count && emitted < MAX_DOM_TRIANGLES; index += 3) {
			const int ia = indices.is_empty() ? index : indices[index];
			const int ib = indices.is_empty() ? index + 1 : indices[index + 1];
			const int ic = indices.is_empty() ? index + 2 : indices[index + 2];
			if (ia < 0 || ib < 0 || ic < 0 || ia >= vertices.size() || ib >= vertices.size() || ic >= vertices.size()) continue;
			Color color = base;
			if (colors.size() == vertices.size()) color *= (colors[ia] + colors[ib] + colors[ic]) / 3.0f;
			emit_triangle_3d(p_node, p_camera, p_world.xform(vertices[ia]), p_world.xform(vertices[ib]), p_world.xform(vertices[ic]), color, emitted++, p_order, p_group);
		}
	}
	return emitted;
}

// TransformとMeshの組を返すNodeを、同じsurface経路へまとめる。
static void sync_meshes(Node3D *p_node, Camera3D *p_camera, const Array &p_meshes, int p_order) {
	int emitted = 0;
	for (int index = 0; index + 1 < p_meshes.size() && emitted < MAX_DOM_TRIANGLES; index += 2) {
		const Transform3D local = p_meshes[index];
		const Ref<Mesh> mesh = p_meshes[index + 1];
		emitted = sync_mesh(p_node, p_camera, mesh, p_node->get_global_transform() * local, p_order, emitted);
	}
}

// 3D GPU粒子もCPU simulationへ変換し、Meshと同じ投影経路へ渡す。
static CPUParticles3D *gpu_proxy(GPUParticles3D *p_particles) {
	const ObjectID id = p_particles->get_instance_id();
	CPUParticles3D **stored = gpu_particles_3d.getptr(id);
	if (stored) return *stored;
	CPUParticles3D *proxy = memnew(CPUParticles3D);
	proxy->convert_from_particles(p_particles);
	proxy->restart(true);
	gpu_particles_3d.insert(id, proxy);
	return proxy;
}

// Sprite系とLabelを、Godotの実際の矩形とCamera投影から平面DOMへ同期する。
static void sync_3d(Node *p_node, int p_order) {
	Node3D *node = Object::cast_to<Node3D>(p_node);
	Viewport *viewport = node ? node->get_viewport() : nullptr;
	Camera3D *camera = viewport ? viewport->get_camera_3d() : nullptr;
	if (!node || !camera) return;
	if (Sprite3D *sprite = Object::cast_to<Sprite3D>(node)) {
		const Ref<Texture2D> texture = sprite->get_texture();
		const Rect2 rect = sprite->get_item_rect();
		const String key = image_key(texture);
		if (key.is_empty()) return;
		const Vector2 top_left(rect.position.x, rect.position.y + rect.size.y);
		const Vector2 top_right = top_left + Vector2(rect.size.x, 0);
		const Vector2 bottom_left(rect.position.x, rect.position.y);
		const Vector2 bottom_right = bottom_left + Vector2(rect.size.x, 0);
		sync_plane(sprite, camera, sprite_point(sprite, top_left), sprite_point(sprite, top_right), sprite_point(sprite, bottom_left), sprite_point(sprite, bottom_right), rect.size, key, String(), sprite->get_modulate(), 0, p_order);
	} else if (Label3D *label = Object::cast_to<Label3D>(node)) {
		const AABB box = label->get_aabb();
		const float pixel = label->get_pixel_size();
		if (pixel <= 0 || box.size.x <= 0 || box.size.y <= 0) return;
		const Transform3D world = label->get_global_transform();
		const Vector3 top_left = world.xform(Vector3(box.position.x, box.position.y + box.size.y, 0));
		const Vector3 top_right = world.xform(Vector3(box.position.x + box.size.x, box.position.y + box.size.y, 0));
		const Vector3 bottom_left = world.xform(Vector3(box.position.x, box.position.y, 0));
		const Vector3 bottom_right = world.xform(Vector3(box.position.x + box.size.x, box.position.y, 0));
		const Ref<Font> font = label->get_font();
		const String key = font.is_valid() ? font->get_path() : String();
		sync_plane(label, camera, top_left, top_right, bottom_left, bottom_right, Size2(box.size.x / pixel, box.size.y / pixel), key, label->get_text(), label->get_modulate(), label->get_font_size(), p_order);
	} else if (AnimatedSprite3D *sprite = Object::cast_to<AnimatedSprite3D>(node)) {
		const Ref<SpriteFrames> frames = sprite->get_sprite_frames();
		const Ref<Texture2D> texture = frames.is_valid() ? frames->get_frame_texture(sprite->get_animation(), sprite->get_frame()) : Ref<Texture2D>();
		const Rect2 rect = sprite->get_item_rect();
		const String key = image_key(texture);
		if (key.is_empty()) return;
		const Vector2 top_left(rect.position.x, rect.position.y + rect.size.y);
		const Vector2 top_right = top_left + Vector2(rect.size.x, 0);
		const Vector2 bottom_left(rect.position.x, rect.position.y);
		const Vector2 bottom_right = bottom_left + Vector2(rect.size.x, 0);
		sync_plane(sprite, camera, sprite_point(sprite, top_left), sprite_point(sprite, top_right), sprite_point(sprite, bottom_left), sprite_point(sprite, bottom_right), rect.size, key, String(), sprite->get_modulate(), 0, p_order);
	} else if (MeshInstance3D *mesh = Object::cast_to<MeshInstance3D>(node)) {
		sync_mesh(mesh, camera, mesh->get_mesh(), mesh->get_global_transform(), p_order);
	} else if (MultiMeshInstance3D *mesh = Object::cast_to<MultiMeshInstance3D>(node)) {
		sync_meshes(mesh, camera, mesh->get_meshes(), p_order);
	} else if (CSGShape3D *shape = Object::cast_to<CSGShape3D>(node)) {
		sync_meshes(shape, camera, shape->get_meshes(), p_order);
	} else if (GridMap *grid = Object::cast_to<GridMap>(node)) {
		sync_meshes(grid, camera, grid->get_meshes(), p_order);
	} else if (ImporterMeshInstance3D *instance = Object::cast_to<ImporterMeshInstance3D>(node)) {
		const Ref<ImporterMesh> source = instance->get_mesh();
		Ref<Mesh> mesh;
		if (source.is_valid()) mesh = source->get_mesh();
		sync_mesh(instance, camera, mesh, instance->get_global_transform(), p_order);
	} else if (CPUParticles3D *particles = Object::cast_to<CPUParticles3D>(node)) {
		int emitted = 0;
		Vector<Transform3D> transforms;
		Vector<Color> colors;
		particles->yweb_particles(transforms, colors, MAX_DOM_PARTICLES);
		const Transform3D basis = particles->get_global_transform();
		for (int index = 0; index < transforms.size() && emitted < MAX_DOM_TRIANGLES; index++) {
			emitted = sync_mesh(particles, camera, particles->get_mesh(), basis * transforms[index], p_order, emitted, colors[index], "particle" + itos(index));
		}
	} else if (GPUParticles3D *particles = Object::cast_to<GPUParticles3D>(node)) {
		int emitted = 0;
		CPUParticles3D *proxy = gpu_proxy(particles);
		proxy->yweb_advance(particles->get_process_delta_time());
		Vector<Transform3D> transforms;
		Vector<Color> colors;
		proxy->yweb_particles(transforms, colors, MAX_DOM_PARTICLES);
		for (int index = 0; index < transforms.size() && emitted < MAX_DOM_TRIANGLES; index++) {
			const Transform3D world = particles->get_global_transform() * transforms[index];
			for (int pass = 0; pass < particles->get_draw_passes(); pass++) emitted = sync_mesh(particles, camera, particles->get_draw_pass_mesh(pass), world, p_order, emitted, colors[index], "particle" + itos(index));
		}
	} else if (Decal *decal = Object::cast_to<Decal>(node)) {
		const Ref<Texture2D> texture = decal->get_texture(Decal::TEXTURE_ALBEDO);
		const String key = image_key(texture);
		const Vector3 size = decal->get_size();
		if (key.is_empty() || size.x <= 0 || size.z <= 0) return;
		const Transform3D world = decal->get_global_transform();
		const float y = -size.y * 0.5f;
		sync_plane(decal, camera,
				world.xform(Vector3(-size.x * 0.5f, y, -size.z * 0.5f)), world.xform(Vector3(size.x * 0.5f, y, -size.z * 0.5f)),
				world.xform(Vector3(-size.x * 0.5f, y, size.z * 0.5f)), world.xform(Vector3(size.x * 0.5f, y, size.z * 0.5f)),
				texture->get_size(), key, String(), decal->get_modulate(), 0, p_order);
	}
}
#endif


#ifndef GLES3_ENABLED
static HashMap<ObjectID, int> draw_counts; // 描画命令ごとに一意なDOM IDを作る連番。
static HashMap<ObjectID, Transform2D> draw_transforms; // draw_set_transformで指定された座標系。
static HashSet<ObjectID> dom_drawn; // 内部描画を初回DOM取得まで再実行したControl。

// 一回の描画の初めに、連番と座標系を戻す。
void yweb_draw_begin(CanvasItem *p_item) {
	draw_counts[p_item->get_instance_id()] = 0;
	draw_transforms[p_item->get_instance_id()] = Transform2D();
	const CharString object = String::num_uint64((uint64_t)p_item->get_instance_id()).utf8();
	yweb_animation_sync(object.get_data(), 1, 0, 1, 0, 0);
	const CharString prefix = (String::num_uint64((uint64_t)p_item->get_instance_id()) + "-d").utf8();
	yweb_draw_reset(prefix.get_data());
}

// 描画命令が使う重なり順を、そのnodeの走査順から引く。走査前なら最背面に置く。
static int draw_order(CanvasItem *p_item) {
	const int *order = node_orders.getptr(p_item->get_instance_id());
	return order != nullptr ? *order : 0;
}

// 命令ごとのDOM IDを返す。
static CharString draw_uid(CanvasItem *p_item, const char *p_kind) {
	const ObjectID object = p_item->get_instance_id();
	int &count = draw_counts[object];
	return (String::num_uint64((uint64_t)object) + "-d" + p_kind + itos(count++)).utf8();
}

// 命令が使う座標系を、node位置とdraw_set_transformから組み立てる。
static Transform2D draw_basis(CanvasItem *p_item) {
	const ObjectID object = p_item->get_instance_id();
	Transform2D local = draw_transforms.has(object) ? draw_transforms[object] : Transform2D();
	return canvas_transform(p_item) * local;
}

// draw_set_transformの指定を覚える。以後の命令はこの座標系で置かれる。
void yweb_draw_transform(CanvasItem *p_item, const Transform2D &p_transform) {
	draw_transforms[p_item->get_instance_id()] = p_transform;
}

// 塗りつぶした矩形を面としてDOMへ出す。枠の指定はborderで表す。
void yweb_draw_rect(CanvasItem *p_item, const Rect2 &p_rect, const Color &p_color, bool p_filled, real_t p_width) {
	Transform2D transform = draw_basis(p_item);
	transform[2] = transform.xform(p_rect.position);
	const Color color = p_color * p_item->get_modulate() * p_item->get_self_modulate();
	const CharString uid = draw_uid(p_item, "r");
	const float edge = p_filled ? 0.0f : MAX((float)p_width, 1.0f);
	yweb_box_sync(uid.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_rect.size.width, p_rect.size.height, draw_order(p_item),
			p_filled ? color.r : 0.0f, p_filled ? color.g : 0.0f, p_filled ? color.b : 0.0f, p_filled ? color.a : 0.0f,
			edge, edge, edge, edge, color.r, color.g, color.b, p_filled ? 0.0f : color.a, 0, 0, 0, 0);
}

// 円は角丸を半径いっぱいにした面で表す。
void yweb_draw_circle(CanvasItem *p_item, const Point2 &p_pos, real_t p_radius, const Color &p_color, bool p_filled, real_t p_width) {
	Transform2D transform = draw_basis(p_item);
	transform[2] = transform.xform(p_pos - Vector2(p_radius, p_radius));
	const Color color = p_color * p_item->get_modulate() * p_item->get_self_modulate();
	const CharString uid = draw_uid(p_item, "c");
	const float size = p_radius * 2.0f;
	const float edge = p_filled ? 0.0f : MAX((float)p_width, 1.0f);
	yweb_box_sync(uid.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			size, size, draw_order(p_item),
			p_filled ? color.r : 0.0f, p_filled ? color.g : 0.0f, p_filled ? color.b : 0.0f, p_filled ? color.a : 0.0f,
			edge, edge, edge, edge, color.r, color.g, color.b, p_filled ? 0.0f : color.a,
			p_radius, p_radius, p_radius, p_radius);
}

// 線の描画命令を、共通の線置きへ渡す。
void yweb_draw_line(CanvasItem *p_item, const Point2 &p_from, const Point2 &p_to, const Color &p_color, real_t p_width) {
	const Color color = p_color * p_item->get_modulate() * p_item->get_self_modulate();
	emit_line(draw_basis(p_item), p_from, p_to, (float)p_width, color, draw_uid(p_item, "l"), draw_order(p_item));
}

// 点列を連続線または二点ずつの独立線としてDOMへ出す。
void yweb_draw_polyline(CanvasItem *p_item, const Vector<Point2> &p_points, const Vector<Color> &p_colors, real_t p_width, bool p_pairs) {
	const Transform2D basis = draw_basis(p_item);
	const int step = p_pairs ? 2 : 1;
	for (int index = 0; index + 1 < p_points.size(); index += step) {
		const Color base = p_colors.is_empty() ? Color(1, 1, 1) : p_colors[MIN(index, p_colors.size() - 1)];
		const Color color = base * p_item->get_modulate() * p_item->get_self_modulate();
		emit_line(basis, p_points[index], p_points[index + 1], (float)p_width, color, draw_uid(p_item, "p"), draw_order(p_item));
	}
}

// 楕円をCSSの角丸矩形として出す。
void yweb_draw_ellipse(CanvasItem *p_item, const Point2 &p_pos, real_t p_major, real_t p_minor, const Color &p_color, bool p_filled, real_t p_width) {
	Transform2D transform = draw_basis(p_item);
	transform[2] = transform.xform(p_pos - Vector2(p_major, p_minor));
	const Color color = p_color * p_item->get_modulate() * p_item->get_self_modulate();
	const CharString uid = draw_uid(p_item, "e");
	const float edge = p_filled ? 0.0f : MAX((float)p_width, 1.0f);
	const float radius = MAX((float)p_major, (float)p_minor);
	yweb_box_sync(uid.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_major * 2.0f, p_minor * 2.0f, draw_order(p_item),
			p_filled ? color.r : 0.0f, p_filled ? color.g : 0.0f, p_filled ? color.b : 0.0f, p_filled ? color.a : 0.0f,
			edge, edge, edge, edge, color.r, color.g, color.b, p_filled ? 0.0f : color.a,
			radius, radius, radius, radius);
}

// 多角形をGodotのlocal座標と色から固定DOM IDのCSS clip-pathへ変換する。
static void emit_polygon(CanvasItem *p_item, const Vector<Point2> &p_points, const Vector<Color> &p_colors, const CharString &p_uid) {
	if (p_points.size() < 3) {
		return;
	}
	Rect2 bounds(p_points[0], Vector2());
	for (int index = 1; index < p_points.size(); index++) bounds = bounds.expand(p_points[index]);
	if (bounds.size.x <= 0 || bounds.size.y <= 0) {
		return;
	}
	String points;
	for (int index = 0; index < p_points.size(); index++) {
		if (index > 0) points += ",";
		const Vector2 local = p_points[index] - bounds.position;
		points += String::num_real(local.x) + "px " + String::num_real(local.y) + "px";
	}
	Transform2D transform = draw_basis(p_item);
	transform[2] = transform.xform(bounds.position);
	const Color base = p_colors.is_empty() ? Color(1, 1, 1) : p_colors[0];
	const Color color = base * p_item->get_modulate() * p_item->get_self_modulate();
	const CharString polygon = points.utf8();
	yweb_polygon_sync(p_uid.get_data(), polygon.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			bounds.size.x, bounds.size.y, draw_order(p_item), color.r, color.g, color.b, color.a);
}

// 2D Meshの三角形を既存の平坦polygonへ展開する。
static void sync_mesh_2d(CanvasItem *p_item, const Ref<Mesh> &p_mesh, const Transform2D &p_instance, const Color &p_color, const String &p_tag) {
	if (p_mesh.is_null()) return;
	for (int surface = 0; surface < p_mesh->get_surface_count(); surface++) {
		if (p_mesh->surface_get_primitive_type(surface) != Mesh::PRIMITIVE_TRIANGLES) continue;
		const Array arrays = p_mesh->surface_get_arrays(surface);
		const PackedVector3Array vertices = arrays[Mesh::ARRAY_VERTEX];
		const PackedInt32Array indices = arrays[Mesh::ARRAY_INDEX];
		const PackedColorArray colors = arrays[Mesh::ARRAY_COLOR];
		const int count = indices.is_empty() ? vertices.size() : indices.size();
		for (int triangle = 0; triangle + 2 < count; triangle += 3) {
			Vector<Point2> points;
			Vector<Color> shades;
			for (int corner = 0; corner < 3; corner++) {
				const int index = indices.is_empty() ? triangle + corner : indices[triangle + corner];
				if (index < 0 || index >= vertices.size()) continue;
				points.push_back(p_instance.xform(Vector2(vertices[index].x, vertices[index].y)));
				shades.push_back((index < colors.size() ? colors[index] : Color(1, 1, 1, 1)) * p_color);
			}
			const CharString uid = (String::num_uint64((uint64_t)p_item->get_instance_id()) + "-" + p_tag + "-" + itos(surface) + "-" + itos(triangle / 3)).utf8();
			emit_polygon(p_item, points, shades, uid);
		}
	}
}

// _draw命令の多角形は描画順に一意なDOM IDを割り当てる。
void yweb_draw_polygon(CanvasItem *p_item, const Vector<Point2> &p_points, const Vector<Color> &p_colors) {
	emit_polygon(p_item, p_points, p_colors, draw_uid(p_item, "g"));
}

// _drawのMesh系命令もNode2Dと同じ三角形展開へ集約する。
void yweb_draw_mesh(CanvasItem *p_item, const Ref<Mesh> &p_mesh, const Transform2D &p_transform, const Color &p_modulate) {
	sync_mesh_2d(p_item, p_mesh, p_transform, p_modulate, "draw-mesh");
}

// _drawのMultiMeshをinstance TransformとColorへ展開する。
void yweb_draw_multimesh(CanvasItem *p_item, const Ref<MultiMesh> &p_multimesh) {
	if (p_multimesh.is_null() || p_multimesh->get_mesh().is_null()) return;
	int count = p_multimesh->get_visible_instance_count();
	if (count < 0) count = p_multimesh->get_instance_count();
	count = MIN(count, MAX_DOM_PARTICLES);
	for (int index = 0; index < count; index++) {
		const Color color = p_multimesh->is_using_colors() ? p_multimesh->get_instance_color(index) : Color(1, 1, 1, 1);
		sync_mesh_2d(p_item, p_multimesh->get_mesh(), p_multimesh->get_instance_transform_2d(index), color, "draw-multimesh-" + itos(index));
	}
}

// animation sliceの時間範囲を、後続の描画DOMへ関連付ける。
void yweb_draw_animation(CanvasItem *p_item, double p_length, double p_begin, double p_end, double p_offset, bool p_enabled) {
	const CharString uid = String::num_uint64((uint64_t)p_item->get_instance_id()).utf8();
	yweb_animation_sync(uid.get_data(), p_length, p_begin, p_end, p_offset, p_enabled ? 1 : 0);
}

// 文字の描画命令を、DOMの文字要素として出す。基準線から上端へ寄せて矩形に合わせる。
void yweb_draw_string(const CanvasItem *p_item, const Point2 &p_pos, const String &p_text, int p_alignment, float p_width, int p_font_size, int p_lines, const Color &p_color, const Color &p_outline, int p_outline_size) {
	CanvasItem *item = const_cast<CanvasItem *>(p_item);
	const Color color = p_color * item->get_modulate() * item->get_self_modulate();
	const Color outline = p_outline * item->get_modulate() * item->get_self_modulate();
	const float height = p_font_size * 1.25f * MAX(p_lines, 1); // 基準線を含む行の高さの目安。
	Transform2D transform = draw_basis(item);
	transform[2] = transform.xform(p_pos - Vector2(0, p_font_size));
	const CharString uid = draw_uid(item, "s");
	const CharString text = p_text.utf8();
	const CharString empty = String().utf8();
	yweb_text_sync(uid.get_data(), text.get_data(), empty.get_data(), empty.get_data(),
			transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_width > 0 ? p_width : p_text.length() * p_font_size, height, TEXT_VISIBLE | (p_lines > 1 ? TEXT_WRAP : 0), draw_order(item),
			p_alignment, VERTICAL_ALIGNMENT_TOP, TEXT_LABEL, 0, 0, 0,
			color.r, color.g, color.b, color.a, p_font_size, 0,
			outline.r, outline.g, outline.b, outline.a, p_outline_size,
			0, 0, 0, 0, 0, 0,
			0, 0,
			0, 0, 0, 0,
			0, 0, 0,
			0, 0);
}

// 画像命令は、既存の画像同期へそのまま渡す。
void yweb_draw_texture(CanvasItem *p_item, const Ref<Texture2D> &p_texture, const Rect2 &p_rect, const Color &p_modulate) {
	const String key = image_key(p_texture);
	if (key.is_empty()) {
		return;
	}
	Transform2D transform = draw_basis(p_item);
	transform[2] = transform.xform(p_rect.position);
	const Color color = p_modulate * p_item->get_modulate() * p_item->get_self_modulate();
	const CharString uid = draw_uid(p_item, "t");
	const CharString key_utf8 = key.utf8();
	yweb_image_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_rect.size.width, p_rect.size.height, draw_order(p_item), color.r, color.g, color.b, color.a);
}

// 画像の一領域をCSS backgroundの位置と寸法で切り出す。
void yweb_draw_texture_region(CanvasItem *p_item, const Ref<Texture2D> &p_texture, const Rect2 &p_rect, const Rect2 &p_src_rect, const Color &p_modulate) {
	const String key = image_key(p_texture);
	if (key.is_empty() || p_src_rect.size.x <= 0 || p_src_rect.size.y <= 0) {
		return;
	}
	Transform2D transform = draw_basis(p_item);
	transform[2] = transform.xform(p_rect.position);
	const Color color = p_modulate * p_item->get_modulate() * p_item->get_self_modulate();
	const CharString uid = draw_uid(p_item, "u");
	const CharString key_utf8 = key.utf8();
	const Size2 image_size = p_texture->get_size();
	yweb_image_region_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_rect.size.x, p_rect.size.y, image_size.x, image_size.y, p_src_rect.position.x, p_src_rect.position.y, p_src_rect.size.x, p_src_rect.size.y,
			draw_order(p_item), color.r, color.g, color.b, color.a);
}

// StyleBoxFlatの面、枠、角丸を同じDOM箱転送へまとめる。
static void sync_flat_box(const CharString &p_uid, Transform2D p_transform, const Rect2 &p_rect, int p_order, const Ref<StyleBoxFlat> &p_flat, const Color &p_modulate = Color(1, 1, 1, 1)) {
	p_transform[2] = p_transform.xform(p_rect.position);
	const Color background = p_flat->get_bg_color() * p_modulate;
	const Color border = p_flat->get_border_color() * p_modulate;
	yweb_box_sync(p_uid.get_data(), p_transform[0].x, p_transform[0].y, p_transform[1].x, p_transform[1].y, p_transform[2].x, p_transform[2].y,
			p_rect.size.x, p_rect.size.y, p_order, background.r, background.g, background.b, background.a,
			p_flat->get_border_width(SIDE_LEFT), p_flat->get_border_width(SIDE_TOP), p_flat->get_border_width(SIDE_RIGHT), p_flat->get_border_width(SIDE_BOTTOM),
			border.r, border.g, border.b, border.a,
			p_flat->get_corner_radius(CORNER_TOP_LEFT), p_flat->get_corner_radius(CORNER_TOP_RIGHT), p_flat->get_corner_radius(CORNER_BOTTOM_RIGHT), p_flat->get_corner_radius(CORNER_BOTTOM_LEFT));
}

// StyleBoxFlatをGodotが確定した背景、枠、角丸の値でDOMへ出す。
void yweb_draw_style_box(CanvasItem *p_item, const Ref<StyleBox> &p_style, const Rect2 &p_rect) {
	const Ref<StyleBoxFlat> flat = p_style;
	if (flat.is_valid()) {
		const CharString uid = draw_uid(p_item, "b");
		sync_flat_box(uid, draw_basis(p_item), p_rect, draw_order(p_item), flat, p_item->get_modulate() * p_item->get_self_modulate());
		return;
	}
	const Ref<StyleBoxLine> line = p_style;
	if (line.is_null()) return;
	Rect2 rect = p_rect;
	if (line->is_vertical()) {
		rect.position.y -= line->get_grow_begin();
		rect.size.y += line->get_grow_begin() + line->get_grow_end();
		rect.size.x = line->get_thickness();
	} else {
		rect.position.x -= line->get_grow_begin();
		rect.size.x += line->get_grow_begin() + line->get_grow_end();
		rect.size.y = line->get_thickness();
	}
	yweb_draw_rect(p_item, rect, line->get_color(), true, 0);
}

// PopupMenuなど標準Controlの内部描画をCanvasItem共通変換へ渡す。
void yweb_dom_draw_style(Control *p_control, const Ref<StyleBox> &p_style, const Rect2 &p_rect) {
	yweb_draw_style_box(p_control, p_style, p_rect);
}

// 標準Controlの内部画像をCanvasItem共通変換へ渡す。
void yweb_dom_draw_texture(Control *p_control, const Ref<Texture2D> &p_texture, const Rect2 &p_rect, const Color &p_modulate) {
	yweb_draw_texture(p_control, p_texture, p_rect, p_modulate);
}
#endif

// Windowのtheme文字をCanvasItemなしで画面座標へ直接置く。
static void sync_window_text(Window *p_window, const String &p_suffix, const String &p_text, const Rect2 &p_rect, const StringName &p_font_name, const StringName &p_font_size_name, const StringName &p_color_name, int p_order, int p_horizontal = HORIZONTAL_ALIGNMENT_LEFT) {
	const Ref<Font> font = p_window->get_theme_font(p_font_name);
	const CharString uid = (String::num_uint64((uint64_t)p_window->get_instance_id()) + p_suffix).utf8();
	const CharString text = p_text.utf8();
	const CharString font_file = (font.is_valid() ? font->get_path() : String()).utf8();
	const CharString empty;
	const Color color = p_window->get_theme_color(p_color_name);
	const GlyphState glyph = glyph_state(String::utf8(uid.get_data()), p_text, font, p_window->get_theme_font_size(p_font_size_name));
	yweb_text_sync(uid.get_data(), text.get_data(), empty.get_data(), font_file.get_data(), 1, 0, 0, 1,
			p_rect.position.x, p_rect.position.y, p_rect.size.x, p_rect.size.y, TEXT_VISIBLE | TEXT_CLIP, p_order, p_horizontal, VERTICAL_ALIGNMENT_CENTER, TEXT_LABEL, 0, 0, 0,
			color.r, color.g, color.b, color.a, p_window->get_theme_font_size(p_font_size_name), 0,
			0, 0, 0, 0, 0,
			0, 0, 0, 0, 0, 0,
			0, 0,
			0, 0, 0, 0,
			glyph.ascent, glyph.top, glyph.bottom,
			0, 0);
}

// CanvasItemを持たないWindowの枠と題名を平坦DOMへ置く。
static void sync_window(Window *p_window, int p_order) {
	if (!p_window->is_visible() || !p_window->get_parent()) return;
	const Vector2 at = p_window->get_position();
	const Size2 size = p_window->get_size();
	const ObjectID object = p_window->get_instance_id();
	const StringName frame_name = p_window->has_focus() ? SNAME("embedded_border") : SNAME("embedded_unfocused_border");
	Ref<StyleBoxFlat> border = p_window->get_theme_stylebox(frame_name, SNAME("Window"));
	if (border.is_null()) border = p_window->get_theme_stylebox(SNAME("embedded_border"), SNAME("Window"));
	if (border.is_valid() && !p_window->get_flag(Window::FLAG_BORDERLESS)) {
		const float left = border->get_expand_margin(SIDE_LEFT);
		const float top = border->get_expand_margin(SIDE_TOP);
		const float right = border->get_expand_margin(SIDE_RIGHT);
		const float bottom = border->get_expand_margin(SIDE_BOTTOM);
		const Vector2 frame_at = at - Vector2(left, top);
		const Size2 frame_size = size + Size2(left + right, top + bottom);
		const CharString uid = (String::num_uint64((uint64_t)object) + "-window").utf8();
		sync_flat_box(uid, Transform2D(), Rect2(frame_at, frame_size), p_order, border);
		const int title_height = p_window->get_theme_constant(SNAME("title_height"), SNAME("Window"));
		sync_window_text(p_window, "-window-title", p_window->get_displayed_title(), Rect2(Vector2(at.x, at.y - title_height), Size2(size.x, title_height)), SNAME("title_font"), SNAME("title_font_size"), SNAME("title_color"), p_order + 1, HORIZONTAL_ALIGNMENT_CENTER);
		const Ref<Texture2D> close = p_window->get_theme_icon(SNAME("close"), SNAME("Window"));
		const String key = image_key(close);
		if (close.is_valid() && !key.is_empty()) {
			const CharString image_uid = (String::num_uint64((uint64_t)object) + "-window-close").utf8();
			const CharString image = key.utf8();
			const float x = at.x + size.x - p_window->get_theme_constant(SNAME("close_h_offset"), SNAME("Window"));
			const float y = at.y - p_window->get_theme_constant(SNAME("close_v_offset"), SNAME("Window"));
			yweb_image_sync(image_uid.get_data(), image.get_data(), 1, 0, 0, 1, x, y, close->get_width(), close->get_height(), p_order + 2, 1, 1, 1, 1);
		}
	}
}

// Scene全体のControlを順に辿り、表示順のまま箱と文字を出す。
// 描画命令を捕まえられないため、文字も持ち主の現在値から作る。
static bool owns_control_draw(Control *p_control) {
	const StringName type = p_control->get_class();
	return Object::cast_to<BaseButton>(p_control) || Object::cast_to<LineEdit>(p_control) || Object::cast_to<TextEdit>(p_control) ||
			Object::cast_to<ProgressBar>(p_control) || Object::cast_to<Slider>(p_control) || as_scrollbar(p_control) ||
			type == SNAME("Panel") || type == SNAME("PanelContainer") || type == SNAME("HSeparator") || type == SNAME("VSeparator");
}

// Godotの実効zを優先し、同じzでは木を辿った順序を保つCSS順へ変換する。
static int dom_order(CanvasItem *p_item, int p_sequence) {
	return p_item->get_effective_z_index() * DOM_ORDER_STEP + MIN(p_sequence * 2, DOM_ORDER_STEP - 10);
}

// ScrollContainerの表示範囲と内容量をBrowserへ渡し、スクロール量はDOMに保持させる。
static void sync_scroll_container(ScrollContainer *p_scroll) {
	const Transform2D transform = canvas_transform(p_scroll);
	const ScrollBar *horizontal = p_scroll->get_h_scroll_bar();
	const ScrollBar *vertical = p_scroll->get_v_scroll_bar();
	const float max_x = horizontal ? MAX(0.0, horizontal->get_max() - horizontal->get_page()) : 0.0;
	const float max_y = vertical ? MAX(0.0, vertical->get_max() - vertical->get_page()) : 0.0;
	const CharString uid = String::num_uint64((uint64_t)p_scroll->get_instance_id()).utf8();
	yweb_scroll_sync(uid.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_scroll->get_size().x, p_scroll->get_size().y, max_x, max_y);
}

// 平坦DOMの要素を祖先ScrollContainerへ結び、Browserの移動量を表示時に合成する。
static void sync_scroll_members(CanvasItem *p_item) {
	Node *branch = p_item;
	for (Node *parent = branch->get_parent(); parent; branch = parent, parent = parent->get_parent()) {
		ScrollContainer *scroll = Object::cast_to<ScrollContainer>(parent);
		if (!scroll || branch == scroll->get_h_scroll_bar() || branch == scroll->get_v_scroll_bar()) continue;
		const CharString uid = String::num_uint64((uint64_t)p_item->get_instance_id()).utf8();
		const CharString owner = String::num_uint64((uint64_t)scroll->get_instance_id()).utf8();
		yweb_scroll_member(uid.get_data(), owner.get_data());
	}
}

static void sync_boxes(Node *p_node, int &r_order) {
	// 閉じたWindowの内蔵ControlをDOMへ残さず、表示状態をGodotへ一致させる。
	Window *branch_window = Object::cast_to<Window>(p_node);
	if (branch_window && !branch_window->is_visible()) return;
	// 見えない枝は中身ごと出さない。走る量も減る。
	CanvasItem *visible = Object::cast_to<CanvasItem>(p_node);
	if (visible != nullptr && !visible->is_visible_in_tree()) {
		return;
	}
	// ScrollContainer内蔵barはBrowserのnative scrollbarへ任せ、Godot値へ戻す経路を作らない。
	ScrollBar *bar = Object::cast_to<ScrollBar>(p_node);
	if (bar && Object::cast_to<ScrollContainer>(bar->get_parent())) return;
	CanvasItem *item = Object::cast_to<CanvasItem>(p_node);
	const int order = item ? dom_order(item, r_order) : r_order * 2;
	if (item) {
		sync_scroll_members(item);
		node_orders[item->get_instance_id()] = order + 1;
		sync_clip(item);
		const CharString prefix = (String::num_uint64((uint64_t)item->get_instance_id()) + "-d").utf8();
		Control *control = Object::cast_to<Control>(item);
		if (control && control->is_class(SNAME("PopupMenuItems")) && !dom_drawn.has(item->get_instance_id())) {
			item->queue_redraw();
			item->yweb_dom_redraw();
			dom_drawn.insert(item->get_instance_id());
		} else if (control && owns_control_draw(control)) {
			item->yweb_dom_custom_redraw();
		} else {
			item->yweb_dom_redraw();
		}
		yweb_draw_touch(prefix.get_data());
		sync_image_node(item, order + 1);
		sync_shape(item, order + 1);
		if (ColorPicker *picker = Object::cast_to<ColorPicker>(item)) sync_color_picker(picker, picker, order + 1);
	}
#ifndef _3D_DISABLED
	sync_3d(p_node, order + 1);
#endif
	if (Window *window = Object::cast_to<Window>(p_node)) sync_window(window, r_order++ * 2);
	if (Control *control = Object::cast_to<Control>(p_node)) {
		r_order++;
		if (ScrollContainer *scroll = Object::cast_to<ScrollContainer>(control)) sync_scroll_container(scroll);
		sync_box(control, order);
		sync_ranged(control, order + 1);
		paint_order = order + 1;
		{
			if (Label *label = Object::cast_to<Label>(control)) sync_label(label);
			else if (RichTextLabel *rich = Object::cast_to<RichTextLabel>(control)) sync_rich_text(rich);
			else if (LineEdit *line = Object::cast_to<LineEdit>(control)) sync_line_input(line);
			else if (TextEdit *edit = Object::cast_to<TextEdit>(control)) sync_text_area(edit);
			else if (Button *button = Object::cast_to<Button>(control)) sync_button_text(button, button->get_text(), TEXT_BUTTON, button->get_text_alignment());
			else if (LinkButton *link = Object::cast_to<LinkButton>(control)) sync_button_text(link, link->get_text(), TEXT_LINK, HORIZONTAL_ALIGNMENT_LEFT);
		}
		paint_order = -1;
	} else if (item) r_order++;
#ifndef _3D_DISABLED
	if (item) sync_projected_item(item, order + 1);
#endif
	for (int index = 0; index < p_node->get_child_count(true); index++) {
		sync_boxes(p_node->get_child(index, true), r_order);
	}
}
#endif

// PopupMenuの文字位置から実項目の中点境界を作り、文字を保ったまま行全体を操作域にする。
static void sync_popup_item(Control *p_control, const Vector<TextState> &p_items, int p_index, const CharString &p_uid) {
	TextState state = p_items[p_index];
	state.flags |= TEXT_MOUSE | TEXT_POPUP;
	sync_text(p_control, state, p_uid);
	const float center = state.rect.get_center().y;
	const float before = p_index > 0 ? p_items[p_index - 1].rect.get_center().y : center - (p_items.size() > 1 ? p_items[1].rect.get_center().y - center : state.rect.size.y);
	const float after = p_index + 1 < p_items.size() ? p_items[p_index + 1].rect.get_center().y : center + (p_index > 0 ? center - p_items[p_index - 1].rect.get_center().y : state.rect.size.y);
	const float top = MAX(0.0f, (before + center) * 0.5f);
	const float bottom = MIN(p_control->get_size().y, (center + after) * 0.5f);
	Transform2D action = canvas_transform(p_control);
	action[2] = action.xform(Vector2(0, top));
	yweb_action_sync(p_uid.get_data(), action[0].x, action[0].y, action[1].x, action[1].y, action[2].x, action[2].y,
			p_control->get_size().x, bottom - top, state.rect.position.x, state.rect.position.y - top,
			MAX(0.0f, p_control->get_size().x - state.rect.get_end().x), MAX(0.0f, bottom - state.rect.get_end().y));
}

// 登録済み文字を毎frame同期し、物理親、回転、入力へ追従する。
void yweb_text_sync_process() {
	if (!event_ready) {
		yweb_text_set_event_cb(&text_event);
		yweb_site_set_event_cb(&site_event);
		event_ready = true;
	}
	// current sceneが変わったframeをBrowser routeへ通知する。
	SceneTree *tree = SceneTree::get_singleton();
	Node *scene = tree ? tree->get_current_scene() : nullptr;
	if (scene && scene->get_instance_id() != site_scene) {
		site_scene = scene->get_instance_id();
		glyph_states.clear();
		font_resources.clear();
		edit_states.clear();
		code_states.clear();
#ifndef GLES3_ENABLED
		// 前の画面の描画由来要素は、そのnodeが消えると描き直されないため、ここで捨てる。
		const CharString all = String().utf8();
		yweb_draw_reset(all.get_data());
		draw_counts.clear();
		draw_transforms.clear();
		dom_drawn.clear();
		node_orders.clear();
		sent_images.clear();
#ifndef _3D_DISABLED
		viewport_sprites.clear();
#endif
#endif
		const CharString path = scene->get_scene_file_path().utf8();
		yweb_site_scene(path.get_data());
	}
	Vector<ObjectID> removed;
	for (ObjectID object : dirty) {
		Control *control = Object::cast_to<Control>(ObjectDB::get_instance(object));
		if (text_requested(control)) tracked.insert(object); else removed.push_back(object);
	}
	dirty.clear();

	for (KeyValue<ObjectID, EditState> &entry : edit_states) entry.value.seen = false;
	yweb_text_begin();
#ifndef GLES3_ENABLED
	if (scene) {
		int order = 0; // 木を辿った順がそのまま重なり順になる。
		sync_boxes(scene, order);
	}
#endif
	for (ObjectID object : tracked) {
		Control *control = Object::cast_to<Control>(ObjectDB::get_instance(object));
		if (!control || !text_requested(control)) {
			removed.push_back(object);
			continue;
		}
#ifdef GLES3_ENABLED
		// 描画を持つlevelでは、描画時に確定した状態から文字を出す。
		if (Label *label = Object::cast_to<Label>(control)) sync_label(label);
		else if (LineEdit *line = Object::cast_to<LineEdit>(control)) sync_line_input(line);
		else if (TextEdit *edit = Object::cast_to<TextEdit>(control)) sync_text_area(edit);
		else if (const TextState *state = states.getptr(object)) sync_text(control, *state);
#endif
		if (const Vector<TextState> *items = parts.getptr(object)) {
			for (int index = 0; index < items->size(); index++) {
				const CharString uid = (String::num_uint64((uint64_t)object) + "-" + itos(index)).utf8();
				if (control->is_class(SNAME("PopupMenuItems"))) sync_popup_item(control, *items, index, uid);
				else sync_text(control, (*items)[index], uid);
			}
		}
	}
	for (ObjectID object : removed) {
		const CharString uid = text_uid(object);
		yweb_text_remove(uid.get_data());
		erase_glyph_states(String::utf8(uid.get_data()));
		tracked.erase(object);
		states.erase(object);
		parts.erase(object);
		edit_states.erase(object);
		code_states.erase(object);
		remove_canvases(object);
	}
	outlines.clear();
	yweb_text_end();
	for (KeyValue<ObjectID, EditState> &entry : edit_states) entry.value.present = entry.value.seen;
#ifndef GLES3_ENABLED
	prune_gpu_particles();
#endif
}
