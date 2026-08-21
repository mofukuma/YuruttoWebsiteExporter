/**************************************************************************/
/*  yweb_text_sync.cpp                                                   */
/**************************************************************************/

// 対応Controlの文字と入力状態だけを意味に合うDOMへ同期する。
// ObjectIDで対象を保持し、配置と確定値はGodotを唯一の正本にする。
// 背景、icon、物理、2D描画はGodot標準Canvasへ残す。

#include "yweb_text_sync.h"

#include "core/object/object.h"
#include "core/templates/hash_map.h"
#include "core/templates/hash_set.h"
#include "scene/gui/base_button.h"
#include "scene/gui/button.h"
#include "scene/gui/label.h"
#include "scene/gui/line_edit.h"
#include "scene/gui/link_button.h"
#include "scene/gui/text_edit.h"
#include "scene/main/scene_tree.h"
#include "scene/resources/font.h"
#include "scene/resources/label_settings.h"
#include "core/crypto/crypto_core.h"
#include "core/io/image.h"
#include "scene/2d/sprite_2d.h"
#include "scene/2d/line_2d.h"
#include "scene/gui/color_rect.h"
#include "scene/gui/progress_bar.h"
#include "scene/gui/slider.h"
#include "scene/gui/nine_patch_rect.h"
#include "scene/gui/texture_rect.h"
#include "scene/resources/style_box.h"
#include "scene/resources/style_box_flat.h"
#include "scene/resources/texture.h"

typedef void (*YWebTextEvent)(const char *, int, const char *, int, int);
typedef void (*YWebSiteEvent)(const char *);

extern "C" {
void yweb_text_set_event_cb(YWebTextEvent p_callback);
void yweb_site_set_event_cb(YWebSiteEvent p_callback);
int yweb_text_prefer_dom();
void yweb_site_scene(const char *p_path);
void yweb_text_begin();
void yweb_text_sync(const char *p_uid, const char *p_text, const char *p_aux, const char *p_font, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_flags, int p_z, int p_horizontal, int p_vertical, int p_kind, int p_max_length, int p_selection_start, int p_selection_end, float p_red, float p_green, float p_blue, float p_alpha, float p_font_size, float p_line_spacing, float p_outline_red, float p_outline_green, float p_outline_blue, float p_outline_alpha, float p_outline_size, float p_shadow_red, float p_shadow_green, float p_shadow_blue, float p_shadow_alpha, float p_shadow_x, float p_shadow_y, float p_underline_offset, float p_underline_thickness, float p_placeholder_red, float p_placeholder_green, float p_placeholder_blue, float p_placeholder_alpha, float p_scroll_x, float p_scroll_y);
void yweb_text_remove(const char *p_uid);
void yweb_image_data(const char *p_key, const char *p_data);
void yweb_draw_reset(const char *p_prefix);
void yweb_image_sync(const char *p_uid, const char *p_key, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_z, float p_red, float p_green, float p_blue, float p_alpha);
void yweb_box_sync(const char *p_uid, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_z, float p_red, float p_green, float p_blue, float p_alpha, float p_left, float p_top, float p_right, float p_bottom, float p_border_red, float p_border_green, float p_border_blue, float p_border_alpha, float p_top_left, float p_top_right, float p_bottom_right, float p_bottom_left);
void yweb_text_end();
}

enum TextKind {
	TEXT_LABEL,
	TEXT_BUTTON,
	TEXT_LINK,
	TEXT_LINE_INPUT,
	TEXT_AREA,
	TEXT_CONTROL,
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

static HashSet<ObjectID> dirty; // 登録状態を見直すControl識別子。
static HashSet<ObjectID> tracked; // 毎frame追従するDOM指定Control。
static HashMap<ObjectID, TextState> states; // draw時に確定したButton系文字状態。
static HashMap<ObjectID, Vector<TextState>> parts; // 一Control内の複数文字項目。
static HashMap<RID, ObjectID> canvas_owners; // 文字描画canvasとControlの対応。
static HashMap<ObjectID, Vector<RID>> owner_canvases; // Control解放時に回収するCanvas RID一覧。
static HashMap<ObjectID, OutlineState> outlines; // outline直後の通常文字へ渡す状態。
static int paint_order = -1; // 木を辿る間だけ使う重なり順。-1は走査の外。
static HashMap<ObjectID, int> node_orders; // nodeごとの重なり順。描画命令は別timingで走るためここから引く。
static HashSet<String> sent_images; // Browserへ渡し終えた画像の識別値。
static bool event_ready = false; // Browser入力callbackの登録状態。
static ObjectID site_scene; // Browserへ通知済みのcurrent scene識別子。

// ObjectIDをDOM IDへ直接使える十進文字列へ変換する。
static CharString text_uid(ObjectID p_object) {
	return String::num_uint64((uint64_t)p_object).utf8();
}

// 指定ControlがDOM前面文字として登録されているかを返す。
static bool capture_control(const Control *p_control) {
	if (!p_control) return false;
	return p_control->is_class(SNAME("MenuBar")) || p_control->is_class(SNAME("TabBar")) ||
			p_control->is_class(SNAME("ItemList")) || p_control->is_class(SNAME("Tree")) ||
			p_control->is_class(SNAME("FoldableContainer")) || p_control->is_class(SNAME("ProgressBar"));
}

// 標準文字Controlを既定DOM対象にし、明示falseだけを除外する。
static bool text_requested(const Control *p_control) {
	if (!p_control) return false;
	if (p_control->has_meta(SNAME("yweb_dom_text"))) return (bool)p_control->get_meta(SNAME("yweb_dom_text"));
	if (Object::cast_to<Label>(p_control) || Object::cast_to<Button>(p_control) || Object::cast_to<LinkButton>(p_control) || Object::cast_to<LineEdit>(p_control)) return true;
	if (Object::cast_to<TextEdit>(p_control)) return p_control->get_class() == SNAME("TextEdit");
	return capture_control(p_control);
}

// 後続対応の文字Controlを黙示処理せず、現在のCanvas標準表示を知らせる。
static void warn_pending(const Control *p_control) {
	if (!p_control || yweb_text_prefer_dom() == 0) return;
	if (p_control->is_class(SNAME("CodeEdit"))) {
		WARN_PRINT_ONCE("CodeEditは後続対応です。暫定でGodot標準fontのCanvas表示を使います。");
	} else if (p_control->is_class(SNAME("RichTextLabel"))) {
		WARN_PRINT_ONCE("RichTextLabelとBBCodeは後続対応です。暫定でGodot標準fontのCanvas表示を使います。");
	}
}

// 親clipとCanvas MaterialをDOMで誤再現しないため共通判定する。
static bool common_supported(const Control *p_control) {
	if (p_control->get_material().is_valid() || p_control->get_use_parent_material()) {
		WARN_PRINT_ONCE("DOM文字にMaterialがあります。DOM代替表示またはCanvas表示へ退避します。");
		return false;
	}
	for (Node *node = p_control->get_parent(); node; node = node->get_parent()) {
		CanvasItem *item = Object::cast_to<CanvasItem>(node);
		Control *control = Object::cast_to<Control>(node);
		if ((item && item->get_clip_children_mode() != CanvasItem::CLIP_CHILDREN_DISABLED) || (control && control->is_clipping_contents())) {
			WARN_PRINT_ONCE("DOM文字の親にclipがあります。DOM代替表示またはCanvas表示へ退避します。");
			return false;
		}
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
	while (font.is_valid()) {
		Ref<FontVariation> variation = font;
		if (variation.is_null()) break;
		font = variation->get_base_font();
	}
	return font;
}

// Theme fontの元resource pathを取得する。
static String font_path(const Control *p_control) {
	const Ref<Font> font = control_font(p_control);
	return font.is_valid() ? font->get_path() : String();
}

// DOMで正確に再現できるControl文字だけを所有する。
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
		if (p_control->get_class() != SNAME("TextEdit")) return false;
		if (edit->get_caret_count() != 1 || edit->get_gutter_count() != 0 || edit->is_drawing_minimap() || edit->get_syntax_highlighter().is_valid()) {
			WARN_PRINT_ONCE("TextEditの補助表示をtextarea標準表示へ置き換えます。primary caretだけを同期します。");
		}
		return true;
	}
	return capture_control(p_control);
}

// 一つの文字状態を現在の画面transformと合成してDOMへ送る。
static void sync_text(Control *p_control, const TextState &p_state, const CharString &p_uid = CharString()) {
	const ObjectID object = p_control->get_instance_id();
	const CharString uid = p_uid.is_empty() ? text_uid(object) : p_uid;
	if (!p_control->is_inside_tree() || !yweb_text_dom_owns(p_control)) {
		yweb_text_remove(uid.get_data());
		return;
	}

	Transform2D transform = p_control->get_screen_transform();
	transform[2] = transform.xform(p_state.rect.position);
	const Color modulate = p_control->get_modulate_in_tree() * p_control->get_self_modulate();
	const Color color = p_state.color * modulate;
	const Color outline = p_state.outline * modulate;
	const Color shadow = p_state.shadow * modulate;
	int flags = p_state.flags;
	flags = p_control->is_visible_in_tree() ? flags | TEXT_VISIBLE : flags & ~TEXT_VISIBLE;
	flags = p_control->is_layout_rtl() ? flags | TEXT_RTL : flags & ~TEXT_RTL;
	const CharString text = p_state.text.utf8();
	const CharString aux = p_state.aux.utf8();
	const CharString font = (p_state.font.is_empty() ? font_path(p_control) : p_state.font).utf8();
	yweb_text_sync(
			uid.get_data(), text.get_data(), aux.get_data(), font.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_state.rect.size.x, p_state.rect.size.y, flags, paint_order >= 0 ? paint_order : p_control->get_z_index(), p_state.horizontal, p_state.vertical, p_state.kind, p_state.max_length, p_state.selection_start, p_state.selection_end,
			color.r, color.g, color.b, color.a, p_state.font_size, p_state.line_spacing,
			outline.r, outline.g, outline.b, outline.a, p_state.outline_size,
			shadow.r, shadow.g, shadow.b, shadow.a, p_state.shadow_offset.x, p_state.shadow_offset.y,
			p_state.underline_offset, p_state.underline_thickness,
			p_state.placeholder.r, p_state.placeholder.g, p_state.placeholder.b, p_state.placeholder.a,
			p_state.scroll.x, p_state.scroll.y);
}

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
	state.line_spacing = settings.is_valid() ? settings->get_line_spacing() : p_label->get_theme_constant(SNAME("line_spacing"));
	state.outline = settings.is_valid() ? settings->get_outline_color() : p_label->get_theme_color(SNAME("font_outline_color"));
	state.outline_size = settings.is_valid() ? settings->get_outline_size() : p_label->get_theme_constant(SNAME("outline_size"));
	state.shadow = settings.is_valid() ? settings->get_shadow_color() : p_label->get_theme_color(SNAME("font_shadow_color"));
	state.shadow_offset = settings.is_valid() ? settings->get_shadow_offset() : Vector2(p_label->get_theme_constant(SNAME("shadow_offset_x")), p_label->get_theme_constant(SNAME("shadow_offset_y")));
	sync_text(p_label, state);
}

// StyleBox内側をBrowser入力が所有する矩形へ変換する。
static Rect2 input_rect(Control *p_control, const Ref<StyleBox> &p_style) {
	if (p_style.is_null()) return Rect2(Vector2(), p_control->get_size());
	const Size2 size = p_control->get_size() - p_style->get_minimum_size();
	return Rect2(p_style->get_offset(), Size2(MAX(0.0f, size.x), MAX(0.0f, size.y)));
}

// LineEditの値、Theme、caret、selectionをinput状態へまとめる。
static void sync_line_input(LineEdit *p_line) {
	TextState state;
	state.text = p_line->get_text();
	state.aux = p_line->get_placeholder();
	state.kind = TEXT_LINE_INPUT;
	state.flags = TEXT_CLIP;
	if (p_line->is_editable()) state.flags |= TEXT_EDITABLE;
	if (p_line->has_focus()) state.flags |= TEXT_FOCUSED;
	if (p_line->is_secret()) state.flags |= TEXT_SECRET;
	state.horizontal = p_line->get_horizontal_alignment();
	state.vertical = VERTICAL_ALIGNMENT_CENTER;
	state.max_length = p_line->get_max_length();
	state.selection_start = p_line->has_selection() ? p_line->get_selection_from_column() : p_line->get_caret_column();
	state.selection_end = p_line->has_selection() ? p_line->get_selection_to_column() : p_line->get_caret_column();
	state.color = p_line->get_theme_color(p_line->is_editable() ? SNAME("font_color") : SNAME("font_uneditable_color"));
	state.placeholder = p_line->get_theme_color(SNAME("font_placeholder_color"));
	state.font_size = p_line->get_theme_font_size(SNAME("font_size"));
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

// TextEditの行列位置をDOMが使う一続きのUnicode文字位置へ変換する。
static int text_index(TextEdit *p_edit, int p_line, int p_column) {
	int index = 0;
	for (int line = 0; line < p_line; line++) index += p_edit->get_line(line).length() + 1;
	return index + p_column;
}

// TextEditの値、Theme、caret、selectionをtextarea状態へまとめる。
static void sync_text_area(TextEdit *p_edit) {
	TextState state;
	state.text = p_edit->get_text();
	state.aux = p_edit->get_placeholder();
	state.kind = TEXT_AREA;
	state.flags = TEXT_CLIP;
	if (p_edit->get_line_wrapping_mode() != TextEdit::LINE_WRAPPING_NONE) state.flags |= TEXT_WRAP;
	if (p_edit->is_editable()) state.flags |= TEXT_EDITABLE;
	if (p_edit->has_focus()) state.flags |= TEXT_FOCUSED;
	state.vertical = VERTICAL_ALIGNMENT_TOP;
	if (p_edit->has_selection()) {
		state.selection_start = text_index(p_edit, p_edit->get_selection_from_line(), p_edit->get_selection_from_column());
		state.selection_end = text_index(p_edit, p_edit->get_selection_to_line(), p_edit->get_selection_to_column());
	} else {
		state.selection_start = text_index(p_edit, p_edit->get_caret_line(), p_edit->get_caret_column());
		state.selection_end = state.selection_start;
	}
	state.color = p_edit->get_theme_color(p_edit->is_editable() ? SNAME("font_color") : SNAME("font_readonly_color"));
	state.placeholder = p_edit->get_theme_color(SNAME("font_placeholder_color"));
	state.font_size = p_edit->get_theme_font_size(SNAME("font_size"));
	state.line_spacing = p_edit->get_theme_constant(SNAME("line_spacing"));
	state.scroll = Vector2(p_edit->get_h_scroll(), p_edit->get_v_scroll() * MAX(1.0f, state.font_size + state.line_spacing));
	state.outline = p_edit->get_theme_color(SNAME("font_outline_color"));
	state.outline_size = p_edit->get_theme_constant(SNAME("outline_size"));
	state.rect = input_rect(p_edit, p_edit->get_theme_stylebox(p_edit->is_editable() ? SNAME("normal") : SNAME("read_only")));
	sync_text(p_edit, state);
}

// Canvas RIDを所有Controlへ一意に登録し、解放用の逆索引も保つ。
static void register_canvas(ObjectID p_owner, RID p_canvas) {
	if (!p_canvas.is_valid()) return;
	canvas_owners.insert(p_canvas, p_owner);
	Vector<RID> &canvases = owner_canvases[p_owner];
	if (canvases.find(p_canvas) < 0) canvases.push_back(p_canvas);
}

// 解放Controlがまだ所有するCanvas RIDだけを対応表から回収する。
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
	if (p_kind == 3) {
		control->grab_focus();
	} else if (p_kind == 4) {
		if (control->has_focus()) control->release_focus();
	} else if (p_kind == 6) {
		if (BaseButton *button = Object::cast_to<BaseButton>(control)) button->yweb_click();
	} else if (LineEdit *line = Object::cast_to<LineEdit>(control)) {
		if ((p_kind == 1 || p_kind == 5) && line->get_text() != incoming) line->_set_text(incoming, true);
		const int start = CLAMP(p_start, 0, line->get_text().length());
		const int end = CLAMP(p_end, 0, line->get_text().length());
		line->set_caret_column(end);
		if (start == end) line->deselect(); else line->select(start, end);
		if (p_kind == 5) line->emit_signal(SNAME("text_submitted"), line->get_text());
	} else if (TextEdit *edit = Object::cast_to<TextEdit>(control)) {
		if (p_kind == 7) {
			const float line_height = MAX(1.0f, (float)edit->get_theme_font_size(SNAME("font_size")) + edit->get_theme_constant(SNAME("line_spacing")));
			edit->yweb_set_scroll((double)p_start / line_height, p_end);
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
// Canvasを持たないDOM onlyで、Controlの面と枠をDOMの箱へ写す。
// StyleBoxFlatはCSSの背景、border、角丸へ素直に対応するため、その値だけを渡す設計。
static void sync_box(Control *p_control, int p_order) {
	if (!p_control->is_visible_in_tree()) {
		return;
	}
	Color background;
	Color border;
	Rect2 widths;
	Rect2 radius; // 左上、右上、右下、左下の順で持つ。
	Rect2 area = Rect2(Vector2(), p_control->get_size()); // 面を置く範囲。
	// Sliderはcontrol全体でなく、themeが決めた細いtrackだけを描く。
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
		// StringNameの構築は表引きでlockを取るため、一度だけ作って使い回す。
		static const StringName names[] = { SNAME("panel"), SNAME("normal"), SNAME("bg"), SNAME("slider"), SNAME("separator"), SNAME("background") };
		Ref<StyleBoxFlat> flat;
		for (const StringName &name : names) {
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
	}
	const Color modulate = p_control->get_modulate_in_tree() * p_control->get_self_modulate();
	background *= modulate;
	border *= modulate;
	Transform2D transform = p_control->get_global_transform_with_canvas();
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
	state.rect = Rect2(Vector2(), p_control->get_size());
	state.kind = p_kind;
	state.horizontal = p_horizontal;
	state.vertical = VERTICAL_ALIGNMENT_CENTER;
	state.color = p_control->get_theme_color(SNAME("font_color"));
	state.font_size = p_control->get_theme_font_size(SNAME("font_size"));
	sync_text(p_control, state);
}


#ifndef GLES3_ENABLED

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

// textureを一度だけPNGとしてBrowserへ渡し、以後は識別値で参照させる。
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

// 画像を持つControlとSprite2Dを、矩形と重なり順だけでDOMへ写す。
static void sync_image(CanvasItem *p_item, const Ref<Texture2D> &p_texture, const Rect2 &p_rect, int p_order) {
	const String key = image_key(p_texture);
	if (key.is_empty()) {
		return;
	}
	Transform2D transform = p_item->get_global_transform_with_canvas();
	transform[2] = transform.xform(p_rect.position);
	const Color modulate = p_item->get_modulate() * p_item->get_self_modulate();
	const CharString uid = (String::num_uint64((uint64_t)p_item->get_instance_id()) + "-img").utf8();
	const CharString key_utf8 = key.utf8();
	yweb_image_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_rect.size.width, p_rect.size.height, p_order, modulate.r, modulate.g, modulate.b, modulate.a);
}

// 画像を持つnodeから、texureと表示矩形を取り出して同期する。
static void sync_image_node(CanvasItem *p_item, int p_order) {
	if (!p_item->is_visible_in_tree()) {
		return;
	}
	if (TextureRect *rect = Object::cast_to<TextureRect>(p_item)) {
		sync_image(rect, rect->get_texture(), Rect2(Vector2(), rect->get_size()), p_order);
	} else if (NinePatchRect *patch = Object::cast_to<NinePatchRect>(p_item)) {
		sync_image(patch, patch->get_texture(), Rect2(Vector2(), patch->get_size()), p_order);
	} else if (Sprite2D *sprite = Object::cast_to<Sprite2D>(p_item)) {
		const Ref<Texture2D> texture = sprite->get_texture();
		if (texture.is_valid()) {
			const Size2 size = texture->get_size();
			const Vector2 offset = sprite->get_offset() - (sprite->is_centered() ? size * 0.5 : Vector2());
			sync_image(sprite, texture, Rect2(offset, size), p_order);
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
	Transform2D transform = p_control->get_global_transform_with_canvas();
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

// 値に応じて伸びる面を持つnodeを、割合から矩形を出して同期する。
static void sync_ranged(Control *p_control, int p_order) {
	if (ProgressBar *bar = Object::cast_to<ProgressBar>(p_control)) {
		const Size2 size = bar->get_size();
		const double span = bar->get_max() - bar->get_min();
		const double ratio = span > 0.0 ? (bar->get_value() - bar->get_min()) / span : 0.0;
		sync_extra_box(bar, SNAME("fill"), Rect2(Vector2(), Size2(size.width * ratio, size.height)), "fill", p_order);
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
		const Ref<Texture2D> grabber = slider->get_theme_icon(SNAME("grabber"));
		if (grabber.is_valid()) {
			const Size2 knob = grabber->get_size();
			const Vector2 at = vertical
					? Vector2((size.width - knob.width) * 0.5f, size.height * (1.0 - ratio) - knob.height * 0.5f)
					: Vector2(size.width * ratio - knob.width * 0.5f, (size.height - knob.height) * 0.5f);
			const String key = image_key(grabber);
			if (!key.is_empty()) {
				Transform2D transform = slider->get_global_transform_with_canvas();
				transform[2] = transform.xform(at);
				const CharString uid = (String::num_uint64((uint64_t)slider->get_instance_id()) + "-knob").utf8();
				const CharString key_utf8 = key.utf8();
				yweb_image_sync(uid.get_data(), key_utf8.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
						knob.width, knob.height, p_order + 1, 1, 1, 1, 1);
			}
		}
	}
}

// 図形を描くNode2Dを、線の集まりとしてCSSへ写す。
static void sync_shape(CanvasItem *p_item, int p_order) {
	Line2D *line = Object::cast_to<Line2D>(p_item);
	if (line == nullptr) {
		return;
	}
	const PackedVector2Array points = line->get_points();
	const Color color = line->get_default_color() * p_item->get_modulate();
	const Transform2D basis = p_item->get_global_transform_with_canvas();
	for (int index = 0; index + 1 < points.size(); index++) {
		const CharString uid = (String::num_uint64((uint64_t)p_item->get_instance_id()) + "-line" + itos(index)).utf8();
		emit_line(basis, points[index], points[index + 1], line->get_width(), color, uid, p_order);
	}
}


#ifndef GLES3_ENABLED
static HashMap<ObjectID, int> draw_counts; // 描画命令ごとに一意なDOM IDを作る連番。
static HashMap<ObjectID, Transform2D> draw_transforms; // draw_set_transformで指定された座標系。

// 一回の描画の初めに、連番と座標系を戻す。
void yweb_draw_begin(CanvasItem *p_item) {
	draw_counts[p_item->get_instance_id()] = 0;
	draw_transforms[p_item->get_instance_id()] = Transform2D();
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
	return p_item->get_global_transform_with_canvas() * local;
}

// draw_set_transformの指定を覚える。以後の命令はこの座標系で置かれる。
void yweb_draw_transform(CanvasItem *p_item, const Transform2D &p_transform) {
	draw_transforms[p_item->get_instance_id()] = p_transform;
}

// 塗りつぶした矩形を面としてDOMへ出す。枠だけの指定はborderで表す。
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

// 文字の描画命令を、DOMの文字要素として出す。基準線から上端へ寄せて矩形に合わせる。
void yweb_draw_string(const CanvasItem *p_item, const Point2 &p_pos, const String &p_text, int p_alignment, float p_width, int p_font_size, const Color &p_color) {
	CanvasItem *item = const_cast<CanvasItem *>(p_item);
	const Color color = p_color * item->get_modulate() * item->get_self_modulate();
	const float height = p_font_size * 1.25f; // 基準線を含む行の高さの目安。
	Transform2D transform = draw_basis(item);
	transform[2] = transform.xform(p_pos - Vector2(0, p_font_size));
	const CharString uid = draw_uid(item, "s");
	const CharString text = p_text.utf8();
	const CharString empty = String().utf8();
	yweb_text_sync(uid.get_data(), text.get_data(), empty.get_data(), empty.get_data(),
			transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_width > 0 ? p_width : p_text.length() * p_font_size, height, TEXT_VISIBLE, draw_order(item),
			p_alignment, VERTICAL_ALIGNMENT_TOP, TEXT_LABEL, 0, 0, 0,
			color.r, color.g, color.b, color.a, p_font_size, 0,
			0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
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
#endif

// Scene全体のControlを順に辿り、表示順のまま箱と文字を出す。
// 描画命令を捕まえられないため、文字も持ち主の現在値から作る。
static void sync_boxes(Node *p_node, int &r_order) {
	// 見えない枝は中身ごと出さない。走る量も減る。
	CanvasItem *visible = Object::cast_to<CanvasItem>(p_node);
	if (visible != nullptr && !visible->is_visible_in_tree()) {
		return;
	}
	if (CanvasItem *item = Object::cast_to<CanvasItem>(p_node)) {
		node_orders[item->get_instance_id()] = r_order * 2 + 1;
		sync_image_node(item, r_order * 2 + 1);
		sync_shape(item, r_order * 2 + 1);
	}
	if (Control *control = Object::cast_to<Control>(p_node)) {
		const int order = r_order++;
		sync_box(control, order * 2);
		sync_ranged(control, order * 2 + 1);
		paint_order = order * 2 + 1;
		{
			if (Label *label = Object::cast_to<Label>(control)) sync_label(label);
			else if (LineEdit *line = Object::cast_to<LineEdit>(control)) sync_line_input(line);
			else if (TextEdit *edit = Object::cast_to<TextEdit>(control)) sync_text_area(edit);
			else if (Button *button = Object::cast_to<Button>(control)) sync_button_text(button, button->get_text(), TEXT_BUTTON, button->get_text_alignment());
			else if (LinkButton *link = Object::cast_to<LinkButton>(control)) sync_button_text(link, link->get_text(), TEXT_LINK, HORIZONTAL_ALIGNMENT_LEFT);
		}
		paint_order = -1;
	}
	for (int index = 0; index < p_node->get_child_count(); index++) {
		sync_boxes(p_node->get_child(index), r_order);
	}
}
#endif

// 登録済み文字を毎frame同期し、物理親、回転、入力へ追従する。
void yweb_text_sync_process() {
	if (!event_ready) {
		yweb_text_set_event_cb(&text_event);
		yweb_site_set_event_cb(&site_event);
		event_ready = true;
	}
	// current sceneが変わったframeだけをBrowser routeへ通知する。
	SceneTree *tree = SceneTree::get_singleton();
	Node *scene = tree ? tree->get_current_scene() : nullptr;
	if (scene && scene->get_instance_id() != site_scene) {
		site_scene = scene->get_instance_id();
#ifndef GLES3_ENABLED
		// 前の画面の描画由来要素は、そのnodeが消えると描き直されないため、ここで捨てる。
		const CharString all = String().utf8();
		yweb_draw_reset(all.get_data());
		draw_counts.clear();
		draw_transforms.clear();
		node_orders.clear();
		sent_images.clear();
#endif
		const CharString path = scene->get_scene_file_path().utf8();
		yweb_site_scene(path.get_data());
	}
	Vector<ObjectID> removed;
	for (ObjectID object : dirty) {
		Control *control = Object::cast_to<Control>(ObjectDB::get_instance(object));
		warn_pending(control);
		if (text_requested(control)) tracked.insert(object); else removed.push_back(object);
	}
	dirty.clear();

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
				sync_text(control, (*items)[index], uid);
			}
		}
	}
	for (ObjectID object : removed) {
		const CharString uid = text_uid(object);
		yweb_text_remove(uid.get_data());
		tracked.erase(object);
		states.erase(object);
		parts.erase(object);
		remove_canvases(object);
	}
	outlines.clear();
	yweb_text_end();
}
