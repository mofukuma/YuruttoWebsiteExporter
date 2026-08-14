/**************************************************************************/
/*  register_types.h                                                      */
/**************************************************************************/

// gdweb専用Exporterの登録入口。
// Editorだけに書き出しplatformを追加し、runtimeへEditor処理を混ぜない。

#pragma once

#include "modules/register_module_types.h"

void initialize_gdweb_module(ModuleInitializationLevel p_level);
void uninitialize_gdweb_module(ModuleInitializationLevel p_level);
