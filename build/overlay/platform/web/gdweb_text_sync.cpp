/**************************************************************************/
/*  gdweb_text_sync.cpp                                                   */
/**************************************************************************/

// Label、Button、LinkButtonの文字glyphだけをDOMへ同期する。
// ObjectIDで対象を保持し、親transformとTheme状態を毎frame反映する。
// 背景、icon、入力、物理、2D描画はGodot標準Canvasへ残す。

#include "gdweb_text_sync.h"

#include "core/object/object.h"
#include "core/templates/hash_map.h"
#include "core/templates/hash_set.h"
#include "scene/gui/button.h"
#include "scene/gui/label.h"
#include "scene/gui/link_button.h"
#include "scene/resources/label_settings.h"
#include "scene/theme/theme_db.h"

extern "C" {
void godot_js_gdweb_text_begin();
void godot_js_gdweb_text_sync(const char *p_uid, const char *p_text, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_flags, int p_z, int p_horizontal, int p_vertical, int p_kind, float p_red, float p_green, float p_blue, float p_alpha, float p_font_size, float p_line_spacing, float p_outline_red, float p_outline_green, float p_outline_blue, float p_outline_alpha, float p_outline_size, float p_shadow_red, float p_shadow_green, float p_shadow_blue, float p_shadow_alpha, float p_shadow_x, float p_shadow_y, float p_underline_offset, float p_underline_thickness);
void godot_js_gdweb_text_remove(const char *p_uid);
void godot_js_gdweb_text_end();
}

struct TextState {
	String text; // 表示する翻訳済み文字列。
	Rect2 rect; // Control内の文字描画矩形。
	int kind = 0; // DOM検査へ公開するControl種別。
	int flags = 0; // clip、wrap、underlineなどの表示状態。
	int horizontal = HORIZONTAL_ALIGNMENT_LEFT; // 文字の横整列。
	int vertical = VERTICAL_ALIGNMENT_TOP; // 文字の縦整列。
	Color color; // 状態とThemeを反映した文字色。
	float font_size = 16.0f; // Theme由来の文字寸法。
	float line_spacing = 0.0f; // 複数行の追加間隔。
	Color outline; // 文字縁の色。
	float outline_size = 0.0f; // 文字縁の幅。
	Color shadow; // 文字影の色。
	Vector2 shadow_offset; // 文字影の位置。
	float underline_offset = 0.0f; // underlineと文字の間隔。
	float underline_thickness = 0.0f; // underlineの太さ。
};

static HashSet<ObjectID> dirty; // 登録状態を見直すControl識別子。
static HashSet<ObjectID> tracked; // 毎frame追従するDOM指定Control。
static HashMap<ObjectID, TextState> states; // draw時に確定したButton系文字状態。

// ObjectIDをDOM IDへ直接使える十進文字列へ変換する。
static CharString text_uid(ObjectID p_object) {
	return String::num_uint64((uint64_t)p_object).utf8();
}

// 指定ControlがDOM前面文字として登録されているかを返す。
static bool text_requested(const Control *p_control) {
	return p_control && (bool)p_control->get_meta(SNAME("gdweb_dom_text"), false);
}

// 親clipとCanvas MaterialをDOMで誤再現しないため共通判定する。
static bool common_supported(const Control *p_control) {
	if (p_control->get_material().is_valid() || p_control->get_use_parent_material()) {
		WARN_PRINT_ONCE("DOM指定文字にMaterialがあります。Canvas表示へ戻します。");
		return false;
	}
	for (Node *node = p_control->get_parent(); node; node = node->get_parent()) {
		CanvasItem *item = Object::cast_to<CanvasItem>(node);
		Control *control = Object::cast_to<Control>(node);
		if ((item && item->get_clip_children_mode() != CanvasItem::CLIP_CHILDREN_DISABLED) || (control && control->is_clipping_contents())) {
			WARN_PRINT_ONCE("DOM指定文字の親にclipがあります。Canvas表示へ戻します。");
			return false;
		}
	}
	return true;
}

// 固定Web fontと異なるTheme fontをCanvasへ残す。
static bool font_supported(const Control *p_control) {
	return p_control->get_theme_font(SNAME("font")) == ThemeDB::get_singleton()->get_fallback_font();
}

// DOMで正確に再現できるControl文字だけを所有する。
bool gdweb_text_dom_owns(const Control *p_control) {
	if (!text_requested(p_control) || !common_supported(p_control)) {
		return false;
	}
	if (const Label *label = Object::cast_to<Label>(p_control)) {
		bool supported = font_supported(label) && label->get_visible_characters() < 0 && label->get_visible_ratio() >= 1.0f;
		supported = supported && !label->is_uppercase() && label->get_tab_stops().is_empty() && label->get_text_overrun_behavior() == TextServer::OVERRUN_NO_TRIMMING && label->get_lines_skipped() == 0 && label->get_max_lines_visible() < 0;
		const Ref<LabelSettings> settings = label->get_label_settings();
		if (settings.is_valid()) {
			supported = supported && settings->get_font().is_null() && settings->get_shadow_size() == 0 && settings->get_paragraph_spacing() == 0 && settings->get_stacked_outline_data().is_empty() && settings->get_stacked_shadow_data().is_empty();
		}
		if (!supported) {
			WARN_PRINT_ONCE("DOM指定Labelに非対応のfont、文字整形、複合装飾があります。Canvas表示へ戻します。");
		}
		return supported;
	}
	if (const Button *button = Object::cast_to<Button>(p_control)) {
		const bool supported = font_supported(button) && button->get_autowrap_mode() == TextServer::AUTOWRAP_OFF && button->get_text_overrun_behavior() == TextServer::OVERRUN_NO_TRIMMING;
		if (!supported) {
			WARN_PRINT_ONCE("DOM指定Buttonに非対応のfont、wrap、文字省略があります。Canvas表示へ戻します。");
		}
		return supported;
	}
	if (const LinkButton *link = Object::cast_to<LinkButton>(p_control)) {
		const bool supported = font_supported(link) && link->get_text_overrun_behavior() == TextServer::OVERRUN_NO_TRIMMING;
		if (!supported) {
			WARN_PRINT_ONCE("DOM指定LinkButtonに非対応のfont、文字省略があります。Canvas表示へ戻します。");
		}
		return supported;
	}
	WARN_PRINT_ONCE("DOM文字指定はLabel、Button、LinkButtonだけを対象にします。Canvas表示へ戻します。");
	return false;
}

// 一つの文字状態を現在の画面transformと合成してDOMへ送る。
static void sync_text(Control *p_control, const TextState &p_state) {
	const ObjectID object = p_control->get_instance_id();
	const CharString uid = text_uid(object);
	if (!p_control->is_inside_tree() || !gdweb_text_dom_owns(p_control)) {
		godot_js_gdweb_text_remove(uid.get_data());
		return;
	}

	Transform2D transform = p_control->get_screen_transform();
	transform[2] = transform.xform(p_state.rect.position);
	const Color modulate = p_control->get_modulate_in_tree() * p_control->get_self_modulate();
	const Color color = p_state.color * modulate;
	const Color outline = p_state.outline * modulate;
	const Color shadow = p_state.shadow * modulate;
	int flags = p_state.flags;
	if (p_control->is_visible_in_tree()) {
		flags |= 1;
	} else {
		flags &= ~1;
	}
	if (p_control->is_layout_rtl()) {
		flags |= 2;
	} else {
		flags &= ~2;
	}
	const CharString text = p_state.text.utf8();
	godot_js_gdweb_text_sync(
			uid.get_data(), text.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			p_state.rect.size.x, p_state.rect.size.y, flags, p_control->get_z_index(), p_state.horizontal, p_state.vertical, p_state.kind,
			color.r, color.g, color.b, color.a, p_state.font_size, p_state.line_spacing,
			outline.r, outline.g, outline.b, outline.a, p_state.outline_size,
			shadow.r, shadow.g, shadow.b, shadow.a, p_state.shadow_offset.x, p_state.shadow_offset.y,
			p_state.underline_offset, p_state.underline_thickness);
}

// Labelの現在値から毎frame使う文字状態を組み立てる。
static void sync_label(Label *p_label) {
	const Ref<LabelSettings> settings = p_label->get_label_settings();
	TextState state;
	state.text = p_label->get_text();
	state.rect = Rect2(Vector2(), p_label->get_size());
	state.kind = 0;
	if (p_label->is_clipping_text()) {
		state.flags |= 4;
	}
	if (p_label->get_autowrap_mode() != TextServer::AUTOWRAP_OFF) {
		state.flags |= 8;
	}
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

// Button系のdrawで確定した文字矩形とTheme状態を追従表へ保存する。
void gdweb_text_sync_control(Control *p_control, const String &p_text, const Rect2 &p_rect, int p_kind, int p_flags, int p_horizontal, int p_vertical, const Color &p_color, float p_font_size, float p_line_spacing, const Color &p_outline, float p_outline_size, const Color &p_shadow, const Vector2 &p_shadow_offset, float p_underline_offset, float p_underline_thickness) {
	if (!p_control) {
		return;
	}
	TextState state;
	state.text = p_text;
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

// 登録済み文字を毎frame同期し、物理親や回転へ通知なしで追従する。
void gdweb_text_sync_process() {
	Vector<ObjectID> removed;
	for (ObjectID object : dirty) {
		Object *instance = ObjectDB::get_instance(object);
		Control *control = Object::cast_to<Control>(instance);
		if (text_requested(control)) {
			tracked.insert(object);
		} else {
			removed.push_back(object);
		}
	}
	dirty.clear();

	godot_js_gdweb_text_begin();
	for (ObjectID object : tracked) {
		Object *instance = ObjectDB::get_instance(object);
		Control *control = Object::cast_to<Control>(instance);
		if (!control || !text_requested(control)) {
			removed.push_back(object);
			continue;
		}
		if (Label *label = Object::cast_to<Label>(control)) {
			sync_label(label);
		} else if (const TextState *state = states.getptr(object)) {
			sync_text(control, *state);
		}
	}
	for (ObjectID object : removed) {
		const CharString uid = text_uid(object);
		godot_js_gdweb_text_remove(uid.get_data());
		tracked.erase(object);
		states.erase(object);
	}
	godot_js_gdweb_text_end();
}
