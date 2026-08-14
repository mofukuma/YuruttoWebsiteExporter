/**************************************************************************/
/*  gdweb_dom_sync.cpp                                                    */
/**************************************************************************/

// 変更されたControlとWindowだけを意味DOMへ同期する。
// Godotを配置と状態の正本に保ち、静止frameの走査とDOM更新を発生させない。

#include "gdweb_dom_sync.h"

#include "core/object/object.h"
#include "core/templates/hash_map.h"
#include "core/templates/hash_set.h"
#include "scene/gui/base_button.h"
#include "scene/gui/button.h"
#include "scene/gui/control.h"
#include "scene/gui/label.h"
#include "scene/gui/line_edit.h"
#include "scene/gui/link_button.h"
#include "scene/gui/item_list.h"
#include "scene/gui/menu_bar.h"
#include "scene/gui/option_button.h"
#include "scene/gui/popup_menu.h"
#include "scene/gui/range.h"
#include "scene/gui/rich_text_label.h"
#include "scene/gui/tab_bar.h"
#include "scene/gui/text_edit.h"
#include "scene/gui/tree.h"
#include "scene/main/window.h"

typedef void (*GDWebDOMEvent)(int, int, const char *, double, double);

extern "C" {
void godot_js_gdweb_dom_begin();
void godot_js_gdweb_dom_sync(int p_handle, int p_parent, const char *p_type, const char *p_text, float p_xx, float p_xy, float p_yx, float p_yy, float p_x, float p_y, float p_width, float p_height, int p_flags, int p_z, int p_order, double p_value, double p_min, double p_max, double p_step, float p_red, float p_green, float p_blue, float p_alpha, float p_font_size, float p_outline_red, float p_outline_green, float p_outline_blue, float p_outline_alpha, float p_outline_size, float p_shadow_red, float p_shadow_green, float p_shadow_blue, float p_shadow_alpha, float p_shadow_x, float p_shadow_y);
void godot_js_gdweb_dom_remove(int p_handle);
void godot_js_gdweb_dom_end();
void godot_js_gdweb_dom_set_event_cb(GDWebDOMEvent p_callback);
}

static HashMap<ObjectID, int> dom_handles; // Godot objectから安定handleへの対応。
static HashMap<int, ObjectID> dom_objects; // Browser eventからGodot objectへの対応。
static HashSet<ObjectID> dirty; // 次の同期で反映するGUI要素。
static int next_handle = 1; // Browser境界で使える最初の正数。
static bool event_ready = false; // DOM event callbackの登録状態。

// 複数項目の意味文字を改行区切りの一命令へ積む。
static void dom_append(String &r_text, const String &p_item) {
	if (!r_text.is_empty()) r_text += "\\n";
	r_text += p_item;
}

// list、tree、tab、menuの項目文字をDOM用に列挙する。
static String dom_items(Object *p_object) {
	String text;
	if (ItemList *list = Object::cast_to<ItemList>(p_object)) {
		for (int i = 0; i < list->get_item_count(); i++) dom_append(text, list->get_item_text(i));
	} else if (Tree *tree = Object::cast_to<Tree>(p_object)) {
		for (TreeItem *item = tree->get_root(); item; item = item->get_next_in_tree()) dom_append(text, item->get_text(0));
	} else if (TabBar *tabs = Object::cast_to<TabBar>(p_object)) {
		for (int i = 0; i < tabs->get_tab_count(); i++) dom_append(text, tabs->get_tab_title(i));
	} else if (MenuBar *menus = Object::cast_to<MenuBar>(p_object)) {
		for (int i = 0; i < menus->get_menu_count(); i++) dom_append(text, menus->get_menu_title(i));
	} else if (PopupMenu *menu = Object::cast_to<PopupMenu>(p_object)) {
		for (int i = 0; i < menu->get_item_count(); i++) dom_append(text, menu->get_item_text(i));
	} else if (OptionButton *options = Object::cast_to<OptionButton>(p_object)) {
		for (int i = 0; i < options->get_item_count(); i++) dom_append(text, options->get_item_text(i));
	}
	return text;
}

// 未割当Controlへ衝突しない正数handleを払い出す。
static int dom_handle(ObjectID p_object) {
	if (const int *handle = dom_handles.getptr(p_object)) {
		return *handle;
	}
	int handle = next_handle;
	do {
		handle = next_handle;
		next_handle = handle == INT32_MAX ? 1 : handle + 1;
	} while (dom_objects.has(handle));
	dom_handles.insert(p_object, handle);
	dom_objects.insert(handle, p_object);
	return handle;
}

// Controlが所有する検索・選択・入力対象の文字を返す。
static String dom_text(Control *p_control) {
	const String items = dom_items(p_control);
	if (!items.is_empty()) return items;
	if (Label *label = Object::cast_to<Label>(p_control)) return label->get_text();
	if (Button *button = Object::cast_to<Button>(p_control)) return button->get_text();
	if (LinkButton *link = Object::cast_to<LinkButton>(p_control)) return link->get_text();
	if (LineEdit *line = Object::cast_to<LineEdit>(p_control)) return line->get_text();
	if (TextEdit *edit = Object::cast_to<TextEdit>(p_control)) return edit->get_text();
	if (RichTextLabel *rich = Object::cast_to<RichTextLabel>(p_control)) return rich->get_text();
	return "";
}

// 項目型Controlの現在選択をDOM状態に使える連番で返す。
static int dom_selected(Control *p_control) {
	if (OptionButton *options = Object::cast_to<OptionButton>(p_control)) return options->get_selected();
	if (TabBar *tabs = Object::cast_to<TabBar>(p_control)) return tabs->get_current_tab();
	if (ItemList *list = Object::cast_to<ItemList>(p_control)) {
		const Vector<int> selected = list->get_selected_items();
		return selected.is_empty() ? -1 : selected[0];
	}
	if (Tree *tree = Object::cast_to<Tree>(p_control)) {
		TreeItem *selected = tree->get_selected();
		int index = 0;
		for (TreeItem *item = tree->get_root(); item; item = item->get_next_in_tree(), index++) if (item == selected) return index;
	}
	return -1;
}

// 最も近いGUI親のhandleを返す。
static int dom_parent(Node *p_node) {
	for (Node *node = p_node->get_parent(); node; node = node->get_parent()) {
		if (Object::cast_to<Control>(node) || Object::cast_to<Window>(node)) return dom_handle(node->get_instance_id());
	}
	return -1;
}

// 親を先に同期するためのSceneTree深度を返す。
static int dom_depth(ObjectID p_object) {
	Node *node = Object::cast_to<Node>(ObjectDB::get_instance(p_object));
	if (!node) return INT32_MAX;
	int depth = 0;
	for (; node->get_parent(); node = node->get_parent()) depth++;
	return depth;
}

// 一続きの文字位置をTextEditの行と列へ変換する。
static Vector2i dom_line_column(const String &p_text, int p_index) {
	int line = 0;
	int column = 0;
	for (int i = 0; i < MIN(p_index, p_text.length()); i++) {
		if (p_text[i] == '\n') {
			line++;
			column = 0;
		} else {
			column++;
		}
	}
	return Vector2i(column, line);
}

// DOM操作をGodotの公開状態へ戻す。
static void dom_event(int p_handle, int p_kind, const char *p_text, double p_a, double p_b) {
	const ObjectID *object = dom_objects.getptr(p_handle);
	if (!object) return;
	Object *instance = ObjectDB::get_instance(*object);
	if (p_kind == 6) {
		if (PopupMenu *menu = Object::cast_to<PopupMenu>(instance)) {
			const int index = (int)p_a;
			if (index >= 0 && index < menu->get_item_count()) menu->activate_item(index);
			return;
		}
	}
	if (p_kind == 8) {
		if (Window *window = Object::cast_to<Window>(instance)) window->hide();
		return;
	}
	Control *control = Object::cast_to<Control>(instance);
	if (!control || !control->is_inside_tree()) return;
	if (p_kind == 1) {
		const String text = String::utf8(p_text);
		if (LineEdit *line = Object::cast_to<LineEdit>(control)) {
			line->_set_text(text, true);
			const int from = CLAMP((int)p_a, 0, text.length());
			const int to = CLAMP((int)p_b, 0, text.length());
			line->set_caret_column(to);
			if (from != to) line->select(from, to); else line->deselect();
		} else if (TextEdit *edit = Object::cast_to<TextEdit>(control)) {
			edit->_set_text(text, true);
			const Vector2i from = dom_line_column(text, (int)p_a);
			const Vector2i to = dom_line_column(text, (int)p_b);
			edit->set_caret_line(to.y);
			edit->set_caret_column(to.x);
			if (from != to) edit->select(from.y, from.x, to.y, to.x); else edit->deselect();
		}
	} else if (p_kind == 2) {
		if (Range *range = Object::cast_to<Range>(control)) range->set_value(p_a);
	} else if (p_kind == 3) {
		if (control->get_focus_mode() != Control::FOCUS_ACCESSIBILITY) control->grab_focus();
	} else if (p_kind == 4 && control->has_focus()) {
		control->release_focus();
	} else if (p_kind == 5) {
		if (LineEdit *line = Object::cast_to<LineEdit>(control)) {
			const int from = CLAMP((int)p_a, 0, line->get_text().length());
			const int to = CLAMP((int)p_b, 0, line->get_text().length());
			line->set_caret_column(to);
			if (from != to) line->select(from, to); else line->deselect();
		} else if (TextEdit *edit = Object::cast_to<TextEdit>(control)) {
			const String text = edit->get_text();
			const Vector2i from = dom_line_column(text, (int)p_a);
			const Vector2i to = dom_line_column(text, (int)p_b);
			edit->set_caret_line(to.y);
			edit->set_caret_column(to.x);
			if (from != to) edit->select(from.y, from.x, to.y, to.x); else edit->deselect();
		}
	} else if (p_kind == 6) {
		const int index = (int)p_a;
		if (OptionButton *options = Object::cast_to<OptionButton>(control)) {
			if (index >= 0 && index < options->get_item_count()) options->get_popup()->activate_item(index);
		} else if (TabBar *tabs = Object::cast_to<TabBar>(control)) {
			if (index >= 0 && index < tabs->get_tab_count()) tabs->set_current_tab(index);
		} else if (ItemList *list = Object::cast_to<ItemList>(control)) {
			if (index >= 0 && index < list->get_item_count()) { list->select(index); list->emit_signal(SNAME("item_selected"), index); }
		} else if (Tree *tree = Object::cast_to<Tree>(control)) {
			TreeItem *item = tree->get_root();
			for (int i = 0; item && i < index; i++) item = item->get_next_in_tree();
			if (item) { tree->set_selected(item, 0); tree->emit_signal(SNAME("cell_selected")); }
		} else if (MenuBar *menus = Object::cast_to<MenuBar>(control)) {
			if (index >= 0 && index < menus->get_menu_count()) menus->get_menu_popup(index)->popup();
		}
	} else if (p_kind == 7) {
		if (BaseButton *button = Object::cast_to<BaseButton>(control)) button->gdweb_click();
	} else if (p_kind == 9) {
		Control *next = p_a ? control->find_prev_valid_focus() : control->find_next_valid_focus();
		if (next) next->grab_focus();
	}
	gdweb_dom_sync_queue(*object);
}

// 一つのWindow状態をDOM命令へ変換する。
static void sync_window(Window *p_window) {
	const Vector2 pos = p_window->get_parent() ? Vector2(p_window->get_position()) : Vector2();
	const Vector2 size = p_window->get_size();
	const CharString type = p_window->get_class().utf8();
	const String meaning = Object::cast_to<PopupMenu>(p_window) ? dom_items(p_window) : p_window->get_title();
	const CharString text = meaning.utf8();
	int flags = (p_window->is_visible() ? 1 : 0) | 32;
	if (p_window->is_exclusive()) flags |= 64;
	if (p_window->is_popup()) flags |= 128;
	godot_js_gdweb_dom_sync(
			dom_handle(p_window->get_instance_id()), dom_parent(p_window), type.get_data(), text.get_data(),
			1.0, 0.0, 0.0, 1.0, pos.x, pos.y, size.x, size.y, flags, 0, p_window->get_index(),
				0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 16.0,
				0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
}

// 一つのControl状態をDOM命令へ変換する。
static void sync_control(Control *p_control) {
	Transform2D transform = p_control->get_transform();
	// GUI親を持たないControlはViewportのstretch変換をDOM側にも適用する。
	if (!Object::cast_to<CanvasItem>(p_control->get_parent())) transform = p_control->get_viewport_transform() * transform;
	const Vector2 size = p_control->get_size();
	const CharString type = p_control->get_class().utf8();
	const CharString text = dom_text(p_control).utf8();
	const BaseButton *button = Object::cast_to<BaseButton>(p_control);
	const Range *range = Object::cast_to<Range>(p_control);
	const LineEdit *line = Object::cast_to<LineEdit>(p_control);
	const TextEdit *edit = Object::cast_to<TextEdit>(p_control);
	const Color color = p_control->get_theme_color(SNAME("font_color")) * p_control->get_modulate_in_tree();
	const Color outline = p_control->get_theme_color(SNAME("font_outline_color")) * p_control->get_modulate_in_tree();
	const Color shadow = p_control->get_theme_color(SNAME("font_shadow_color")) * p_control->get_modulate_in_tree();
	int flags = p_control->is_visible_in_tree() ? 1 : 0;
	if (button && button->is_disabled()) flags |= 2;
	if (button && button->is_pressed()) flags |= 512;
	if ((line && !line->is_editable()) || (edit && !edit->is_editable())) flags |= 2;
	if (p_control->is_clipping_contents()) flags |= 4;
	if (p_control->get_focus_mode() != Control::FOCUS_NONE) flags |= 8;
	if (p_control->is_layout_rtl()) flags |= 16;
	if (line && line->is_secret()) flags |= 256;
	if (button) flags |= 1024;
	if (p_control->has_focus()) flags |= 2048;
	const int selected = dom_selected(p_control);
	godot_js_gdweb_dom_sync(
			dom_handle(p_control->get_instance_id()), dom_parent(p_control), type.get_data(), text.get_data(),
			transform[0].x, transform[0].y, transform[1].x, transform[1].y, transform[2].x, transform[2].y,
				size.x, size.y, flags, p_control->get_z_index(), p_control->get_index(), range ? range->get_value() : selected,
				range ? range->get_min() : 0.0, range ? range->get_max() : 0.0, range ? range->get_step() : 0.0,
				color.r, color.g, color.b, color.a, p_control->get_theme_font_size(SNAME("font_size")),
				outline.r, outline.g, outline.b, outline.a, p_control->get_theme_constant(SNAME("outline_size")),
				shadow.r, shadow.g, shadow.b, shadow.a,
				p_control->get_theme_constant(SNAME("shadow_offset_x")), p_control->get_theme_constant(SNAME("shadow_offset_y")));
}

// 変更されたControlを次の同期単位へ積む。
void gdweb_dom_sync_queue(ObjectID p_object) {
	dirty.insert(p_object);
}

// dirty集合だけをDOMへ一括反映し、消えたhandleを回収する。
void gdweb_dom_sync_process() {
	if (dirty.is_empty()) return;
	if (!event_ready) {
		godot_js_gdweb_dom_set_event_cb(&dom_event);
		event_ready = true;
	}
	Vector<ObjectID> changes;
	for (ObjectID object : dirty) changes.push_back(object);
	dirty.clear();
	// DOM親を同じbatch内で必ず先に生成する。
	for (int i = 1; i < changes.size(); i++) {
		const ObjectID value = changes[i];
		const int depth = dom_depth(value);
		int j = i - 1;
		while (j >= 0 && dom_depth(changes[j]) > depth) {
			changes.write[j + 1] = changes[j];
			j--;
		}
		changes.write[j + 1] = value;
	}
	godot_js_gdweb_dom_begin();
	for (ObjectID object : changes) {
		Object *instance = ObjectDB::get_instance(object);
		Control *control = Object::cast_to<Control>(instance);
		if (control && control->is_inside_tree()) {
			sync_control(control);
			continue;
		}
		Window *window = Object::cast_to<Window>(instance);
		if (window && window->is_inside_tree()) {
			sync_window(window);
			continue;
		}
		if (const int *handle = dom_handles.getptr(object)) {
			godot_js_gdweb_dom_remove(*handle);
			dom_objects.erase(*handle);
		}
		dom_handles.erase(object);
	}
	godot_js_gdweb_dom_end();
}
