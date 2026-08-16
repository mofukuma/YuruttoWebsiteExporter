/**************************************************************************/
/*  yuruttoweb_text_sync.h                                                     */
/**************************************************************************/

// 指定Controlの文字と入力状態をBrowser DOMへ同期する境界を公開する。

#ifndef YURUTTOWEB_TEXT_SYNC_H
#define YURUTTOWEB_TEXT_SYNC_H

#include "core/math/color.h"
#include "core/math/rect2.h"
#include "core/object/object_id.h"
#include "core/templates/rid.h"
#include "core/string/ustring.h"

class Control;

bool yuruttoweb_text_dom_owns(const Control *p_control);
void yuruttoweb_text_parts_begin(Control *p_control);
void yuruttoweb_text_capture_canvas(Control *p_control, RID p_canvas);
bool yuruttoweb_text_capture_outline(RID p_canvas, ObjectID p_source, int p_size, const Color &p_color);
bool yuruttoweb_text_capture_line(RID p_canvas, ObjectID p_source, const String &p_text, const String &p_font, const Rect2 &p_rect, int p_font_size, int p_horizontal, const Color &p_color, bool p_wrap);
void yuruttoweb_text_sync_control(Control *p_control, const String &p_text, const Rect2 &p_rect, int p_kind, int p_flags, int p_horizontal, int p_vertical, const Color &p_color, float p_font_size, float p_line_spacing, const Color &p_outline, float p_outline_size, const Color &p_shadow = Color(), const Vector2 &p_shadow_offset = Vector2(), float p_underline_offset = 0.0f, float p_underline_thickness = 0.0f, const String &p_aux = String());
void yuruttoweb_text_sync_queue(ObjectID p_object);
void yuruttoweb_text_sync_process();

#endif
