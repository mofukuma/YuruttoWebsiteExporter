/**************************************************************************/
/*  yweb_text_sync.h                                                     */
/**************************************************************************/

// 指定Controlの文字と入力状態をBrowser DOMへ同期する境界を公開する。

#ifndef YWEB_TEXT_SYNC_H
#define YWEB_TEXT_SYNC_H

#include "core/math/color.h"
#include "core/math/rect2.h"
#include "core/object/object_id.h"
#include "core/object/ref_counted.h"
#include "core/templates/rid.h"
#include "core/string/ustring.h"

class Control;
class StyleBox;
class Texture2D;

bool yweb_text_dom_owns(const Control *p_control);
// Browser側へ操作を一本化するButtonか判定する。
bool yweb_text_dom_action_owns(const Control *p_control);
void yweb_text_parts_begin(Control *p_control);
void yweb_text_capture_canvas(Control *p_control, RID p_canvas);
bool yweb_text_capture_outline(RID p_canvas, ObjectID p_source, int p_size, const Color &p_color);
bool yweb_text_capture_line(RID p_canvas, ObjectID p_source, const String &p_text, const String &p_font, const Rect2 &p_rect, int p_font_size, int p_horizontal, const Color &p_color, bool p_wrap);
void yweb_text_sync_control(Control *p_control, const String &p_text, const Rect2 &p_rect, int p_kind, int p_flags, int p_horizontal, int p_vertical, const Color &p_color, float p_font_size, float p_line_spacing, const Color &p_outline, float p_outline_size, const Color &p_shadow = Color(), const Vector2 &p_shadow_offset = Vector2(), float p_underline_offset = 0.0f, float p_underline_thickness = 0.0f, const String &p_aux = String());
void yweb_text_sync_queue(ObjectID p_object);
void yweb_text_sync_process();
// 標準Control内部の描画命令を、確定済みの局所座標からDOMへ移す。
void yweb_dom_draw_style(Control *p_control, const Ref<StyleBox> &p_style, const Rect2 &p_rect);
void yweb_dom_draw_texture(Control *p_control, const Ref<Texture2D> &p_texture, const Rect2 &p_rect, const Color &p_modulate);

#endif
