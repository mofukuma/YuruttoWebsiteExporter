/**************************************************************************/
/*  gdweb_text_sync.cpp                                                   */
/**************************************************************************/

// 対応Controlの文字と入力状態だけを意味に合うDOMへ同期する。
// ObjectIDで対象を保持し、配置と確定値はGodotを唯一の正本にする。
// 背景、icon、物理、2D描画はGodot標準Canvasへ残す。

#include "gdweb_text_sync.h"

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
#include "scene/resources/style_box.h"
#include "scene/resources/texture.h"

typedef void (*GDWebTextEvent)(const char *, int, const char *, int, int);
typedef void (*GDWebSiteEvent)(const char *);

extern "C" {
void gdweb_text_set_event_cb(GDWebTextEvent p_callback);
void gdweb_site_set_event_cb(GDWebSiteEvent p_callback);
int gdweb_text_prefer_dom();
void gdweb_site_scene(const char *p_path);
void gdweb_text_begin();
void gdweb_text_sync(const char *p_uid, const char *p_text, const char *p_aux, const char *p_font, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_flags, int p_z, int p_horizontal, int p_vertical, int p_kind, int p_max_length, int p_selection_start, int p_selection_end, float p_red, float p_green, float p_blue, float p_alpha, float p_font_size, float p_line_spacing, float p_outline_red, float p_outline_green, float p_outline_blue, float p_outline_alpha, float p_outline_size, float p_shadow_red, float p_shadow_green, float p_shadow_blue, float p_shadow_alpha, float p_shadow_x, float p_shadow_y, float p_underline_offset, float p_underline_thickness, float p_placeholder_red, float p_placeholder_green, float p_placeholder_blue, float p_placeholder_alpha, float p_scroll_x, float p_scroll_y);
void gdweb_text_remove(const char *p_uid);
void gdweb_text_end();
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
	if (p_control->has_meta(SNAME("gdweb_dom_text"))) return (bool)p_control->get_meta(SNAME("gdweb_dom_text"));
	if (Object::cast_to<Label>(p_control) || Object::cast_to<Button>(p_control) || Object::cast_to<LinkButton>(p_control) || Object::cast_to<LineEdit>(p_control)) return true;
	if (Object::cast_to<TextEdit>(p_control)) return p_control->get_class() == SNAME("TextEdit");
	return capture_control(p_control);
}

// 後続対応の文字Controlを黙示処理せず、現在のCanvas標準表示を知らせる。
static void warn_pending(const Control *p_control) {
	if (!p_control || gdweb_text_prefer_dom() == 0) return;
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
bool gdweb_text_dom_owns(const Control *p_control) {
	if (!text_requested(p_control)) return false;
	const bool prefer_dom = gdweb_text_prefer_dom() != 0;
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
	if (!p_control->is_inside_tree() || !gdweb_text_dom_owns(p_control)) {
		gdweb_text_remove(uid.get_data());
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
	gdweb_text_sync(
			uid.get_data(), text.get_data(), aux.get_data(), font.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_state.rect.size.x, p_state.rect.size.y, flags, p_control->get_z_index(), p_state.horizontal, p_state.vertical, p_state.kind, p_state.max_length, p_state.selection_start, p_state.selection_end,
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
void gdweb_text_parts_begin(Control *p_control) {
	if (!capture_control(p_control) || !text_requested(p_control)) return;
	const ObjectID object = p_control->get_instance_id();
	parts[object].clear();
	register_canvas(object, p_control->get_canvas_item());
	tracked.insert(object);
}

// 標準Controlが補助CanvasItemへ描く文字も同じ所有者へ結ぶ。
void gdweb_text_capture_canvas(Control *p_control, RID p_canvas) {
	if (!capture_control(p_control) || !text_requested(p_control) || !p_canvas.is_valid()) return;
	register_canvas(p_control->get_instance_id(), p_canvas);
}

// 通常文字の直前に描かれるoutlineを同じ文字項目へ保持する。
bool gdweb_text_capture_outline(RID p_canvas, ObjectID p_source, int p_size, const Color &p_color) {
	const ObjectID *owner = canvas_owners.getptr(p_canvas);
	Control *control = owner ? Object::cast_to<Control>(ObjectDB::get_instance(*owner)) : nullptr;
	if (!control || !gdweb_text_dom_owns(control)) return false;
	outlines.insert(p_source, OutlineState{ p_color, p_size });
	return true;
}

// TextLineとTextParagraphの確定文字矩形をControl内のDOM項目へ追加する。
bool gdweb_text_capture_line(RID p_canvas, ObjectID p_source, const String &p_text, const String &p_font, const Rect2 &p_rect, int p_font_size, int p_horizontal, const Color &p_color, bool p_wrap) {
	const ObjectID *owner = canvas_owners.getptr(p_canvas);
	Control *control = owner ? Object::cast_to<Control>(ObjectDB::get_instance(*owner)) : nullptr;
	if (!control || !gdweb_text_dom_owns(control)) return false;
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
	if (!control || !control->is_inside_tree() || !gdweb_text_dom_owns(control)) return;
	const String incoming = String::utf8(p_text);
	if (p_kind == 3) {
		control->grab_focus();
	} else if (p_kind == 4) {
		if (control->has_focus()) control->release_focus();
	} else if (p_kind == 6) {
		if (BaseButton *button = Object::cast_to<BaseButton>(control)) button->gdweb_click();
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
			edit->gdweb_set_scroll((double)p_start / line_height, p_end);
			dirty.insert(object);
			return;
		}
		if (p_kind == 1 && edit->get_text() != incoming) edit->gdweb_set_text(incoming);
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
void gdweb_text_sync_control(Control *p_control, const String &p_text, const Rect2 &p_rect, int p_kind, int p_flags, int p_horizontal, int p_vertical, const Color &p_color, float p_font_size, float p_line_spacing, const Color &p_outline, float p_outline_size, const Color &p_shadow, const Vector2 &p_shadow_offset, float p_underline_offset, float p_underline_thickness, const String &p_aux) {
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
void gdweb_text_sync_queue(ObjectID p_object) {
	dirty.insert(p_object);
}

// 登録済み文字を毎frame同期し、物理親、回転、入力へ追従する。
void gdweb_text_sync_process() {
	if (!event_ready) {
		gdweb_text_set_event_cb(&text_event);
		gdweb_site_set_event_cb(&site_event);
		event_ready = true;
	}
	// current sceneが変わったframeだけをBrowser routeへ通知する。
	SceneTree *tree = SceneTree::get_singleton();
	Node *scene = tree ? tree->get_current_scene() : nullptr;
	if (scene && scene->get_instance_id() != site_scene) {
		site_scene = scene->get_instance_id();
		const CharString path = scene->get_scene_file_path().utf8();
		gdweb_site_scene(path.get_data());
	}
	Vector<ObjectID> removed;
	for (ObjectID object : dirty) {
		Control *control = Object::cast_to<Control>(ObjectDB::get_instance(object));
		warn_pending(control);
		if (text_requested(control)) tracked.insert(object); else removed.push_back(object);
	}
	dirty.clear();

	gdweb_text_begin();
	for (ObjectID object : tracked) {
		Control *control = Object::cast_to<Control>(ObjectDB::get_instance(object));
		if (!control || !text_requested(control)) {
			removed.push_back(object);
			continue;
		}
		if (Label *label = Object::cast_to<Label>(control)) sync_label(label);
		else if (LineEdit *line = Object::cast_to<LineEdit>(control)) sync_line_input(line);
		else if (TextEdit *edit = Object::cast_to<TextEdit>(control)) sync_text_area(edit);
		else if (const TextState *state = states.getptr(object)) sync_text(control, *state);
		if (const Vector<TextState> *items = parts.getptr(object)) {
			for (int index = 0; index < items->size(); index++) {
				const CharString uid = (String::num_uint64((uint64_t)object) + "-" + itos(index)).utf8();
				sync_text(control, (*items)[index], uid);
			}
		}
	}
	for (ObjectID object : removed) {
		const CharString uid = text_uid(object);
		gdweb_text_remove(uid.get_data());
		tracked.erase(object);
		states.erase(object);
		parts.erase(object);
		remove_canvases(object);
	}
	outlines.clear();
	gdweb_text_end();
}
