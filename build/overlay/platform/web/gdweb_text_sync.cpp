/**************************************************************************/
/*  gdweb_text_sync.cpp                                                   */
/**************************************************************************/

// Labelの文字列、画面変換、矩形、文字装飾だけをDOMへ同期する。
// Godotを配置の正本に保ち、Label以外の表示と操作をCanvasへ残す。

#include "gdweb_text_sync.h"

#include "core/object/object.h"
#include "core/templates/hash_map.h"
#include "core/templates/hash_set.h"
#include "scene/gui/label.h"
#include "scene/resources/label_settings.h"

extern "C" {
void godot_js_gdweb_text_begin();
void godot_js_gdweb_text_sync(int p_handle, const char *p_text, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_flags, int p_z, int p_horizontal, int p_vertical, float p_red, float p_green, float p_blue, float p_alpha, float p_font_size, float p_line_spacing, float p_outline_red, float p_outline_green, float p_outline_blue, float p_outline_alpha, float p_outline_size, float p_shadow_red, float p_shadow_green, float p_shadow_blue, float p_shadow_alpha, float p_shadow_x, float p_shadow_y);
void godot_js_gdweb_text_remove(int p_handle);
void godot_js_gdweb_text_end();
}

static HashSet<ObjectID> dirty; // 次回同期するControl識別子。
static HashMap<ObjectID, int> handles; // ObjectIDとDOM識別子の対応。
static int next_handle = 1; // Browserへ渡す正整数識別子。

// DOMで再現できる単純なLabelだけを所有する。
bool gdweb_text_dom_owns(const Label *p_label) {
	if (!p_label || !(bool)p_label->get_meta(SNAME("gdweb_dom_text"), false)) {
		return false;
	}
	bool supported = !p_label->has_theme_font_override(SNAME("font"));
	supported = supported && !p_label->get_material().is_valid() && !p_label->get_use_parent_material() && p_label->get_visible_characters() < 0 && p_label->get_visible_ratio() >= 1.0f;
	if (!supported) {
		WARN_PRINT_ONCE("DOM指定Labelに非対応のfont、Material、文字表示設定があります。Canvas表示へ戻します。");
		return false;
	}
	if (p_label->is_uppercase() || !p_label->get_tab_stops().is_empty() || p_label->get_text_overrun_behavior() != TextServer::OVERRUN_NO_TRIMMING || p_label->get_lines_skipped() != 0 || p_label->get_max_lines_visible() >= 0) {
		WARN_PRINT_ONCE("DOM指定Labelに非対応の文字整形があります。Canvas表示へ戻します。");
		return false;
	}
	for (Node *node = p_label->get_parent(); node; node = node->get_parent()) {
		CanvasItem *item = Object::cast_to<CanvasItem>(node);
		Control *control = Object::cast_to<Control>(node);
		if ((item && item->get_clip_children_mode() != CanvasItem::CLIP_CHILDREN_DISABLED) || (control && control->is_clipping_contents())) {
			WARN_PRINT_ONCE("DOM指定Labelの親にclipがあります。Canvas表示へ戻します。");
			return false;
		}
	}
	const Ref<LabelSettings> settings = p_label->get_label_settings();
	if (settings.is_valid()) {
		supported = settings->get_font().is_null() && settings->get_shadow_size() == 0 && settings->get_paragraph_spacing() == 0 && settings->get_stacked_outline_data().is_empty() && settings->get_stacked_shadow_data().is_empty();
	} else {
		supported = true;
	}
	if (!supported) {
		WARN_PRINT_ONCE("DOM指定Labelに非対応の複合装飾があります。Canvas表示へ戻します。");
	}
	return supported;
}

// ObjectIDへ一度だけDOM識別子を割り当てる。
static int text_handle(ObjectID p_object) {
	if (const int *handle = handles.getptr(p_object)) {
		return *handle;
	}
	const int handle = next_handle++;
	handles.insert(p_object, handle);
	return handle;
}

// 一つのLabelを画面座標と文字装飾へ変換する。
static void sync_label(Label *p_label) {
	const Ref<LabelSettings> settings = p_label->get_label_settings();
	const bool own = gdweb_text_dom_owns(p_label);
	const ObjectID object = p_label->get_instance_id();
	if (!own || !p_label->is_inside_tree()) {
		if (const int *handle = handles.getptr(object)) {
			godot_js_gdweb_text_remove(*handle);
			handles.erase(object);
		}
		return;
	}

	const Transform2D transform = p_label->get_screen_transform();
	const Vector2 size = p_label->get_size();
	const Color modulate = p_label->get_modulate_in_tree() * p_label->get_self_modulate();
	const Color color = (settings.is_valid() ? settings->get_font_color() : p_label->get_theme_color(SNAME("font_color"))) * modulate;
	const Color outline = (settings.is_valid() ? settings->get_outline_color() : p_label->get_theme_color(SNAME("font_outline_color"))) * modulate;
	const Color shadow = (settings.is_valid() ? settings->get_shadow_color() : p_label->get_theme_color(SNAME("font_shadow_color"))) * modulate;
	const Vector2 shadow_offset = settings.is_valid() ? settings->get_shadow_offset() : Vector2(p_label->get_theme_constant(SNAME("shadow_offset_x")), p_label->get_theme_constant(SNAME("shadow_offset_y")));
	const float font_size = settings.is_valid() ? settings->get_font_size() : p_label->get_theme_font_size(SNAME("font_size"));
	const float line_spacing = settings.is_valid() ? settings->get_line_spacing() : p_label->get_theme_constant(SNAME("line_spacing"));
	const float outline_size = settings.is_valid() ? settings->get_outline_size() : p_label->get_theme_constant(SNAME("outline_size"));
	int flags = p_label->is_visible_in_tree() ? 1 : 0;
	if (p_label->is_layout_rtl()) flags |= 2;
	if (p_label->is_clipping_text()) flags |= 4;
	if (p_label->get_autowrap_mode() != TextServer::AUTOWRAP_OFF) flags |= 8;
	const CharString text = p_label->get_text().utf8();
	godot_js_gdweb_text_sync(
			text_handle(object), text.get_data(), transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
			size.x, size.y, flags, p_label->get_z_index(), p_label->get_horizontal_alignment(), p_label->get_vertical_alignment(),
			color.r, color.g, color.b, color.a, font_size, line_spacing,
			outline.r, outline.g, outline.b, outline.a, outline_size,
			shadow.r, shadow.g, shadow.b, shadow.a, shadow_offset.x, shadow_offset.y);
}

// 変更されたControlを次の同期単位へ積む。
void gdweb_text_sync_queue(ObjectID p_object) {
	dirty.insert(p_object);
}

// dirty集合だけを一frame一回DOMへ反映する。
void gdweb_text_sync_process() {
	if (dirty.is_empty()) {
		return;
	}
	Vector<ObjectID> changes;
	for (ObjectID object : dirty) {
		changes.push_back(object);
	}
	dirty.clear();
	godot_js_gdweb_text_begin();
	for (ObjectID object : changes) {
		Object *instance = ObjectDB::get_instance(object);
		Label *label = Object::cast_to<Label>(instance);
		if (label) {
			sync_label(label);
		} else if (const int *handle = handles.getptr(object)) {
			godot_js_gdweb_text_remove(*handle);
			handles.erase(object);
		}
	}
	godot_js_gdweb_text_end();
}
