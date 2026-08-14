/**************************************************************************/
/*  gdweb_text_sync.h                                                     */
/**************************************************************************/

// Label文字だけをBrowser DOMへ同期する最小境界を公開する。

#ifndef GDWEB_TEXT_SYNC_H
#define GDWEB_TEXT_SYNC_H

#include "core/object/object_id.h"

class Label;

bool gdweb_text_dom_owns(const Label *p_label);
void gdweb_text_sync_queue(ObjectID p_object);
void gdweb_text_sync_process();

#endif
