/**************************************************************************/
/*  gdweb_dom_sync.h                                                      */
/**************************************************************************/

// GodotのControl状態をBrowserの意味DOMへ同期する入口。
// SceneTree更新後の一回だけ呼び、配置の正本をGodotへ保つ。

#pragma once

#include "core/object/object_id.h"

// 変更されたControlだけを次の同期単位へ積む。
void gdweb_dom_sync_queue(ObjectID p_object);

// 積まれたControl状態を一括同期する。
void gdweb_dom_sync_process();
