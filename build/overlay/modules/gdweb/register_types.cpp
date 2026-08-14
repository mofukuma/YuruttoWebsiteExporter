/**************************************************************************/
/*  register_types.cpp                                                    */
/**************************************************************************/

// gdweb専用ExporterをEditorの書き出し一覧へ一回登録する。
// runtime初期化では何も登録せず、作品側のClassDBを増やさない。

#include "register_types.h"

#ifdef TOOLS_ENABLED
#include "editor_export_platform_gdweb.h"

#include "editor/editor_node.h"
#include "editor/export/editor_export.h"
#include "core/object/class_db.h"

// EditorExport生成後に専用platformを登録する。
static void register_gdweb_exporter() {
	Ref<EditorExportPlatformGDWeb> platform;
	platform.instantiate();
	EditorExport::get_singleton()->add_export_platform(platform);
}
#endif

void initialize_gdweb_module(ModuleInitializationLevel p_level) {
#ifdef TOOLS_ENABLED
	if (p_level == MODULE_INITIALIZATION_LEVEL_EDITOR) {
		GDREGISTER_VIRTUAL_CLASS(EditorExportPlatformGDWeb);
		EditorNode::add_init_callback(register_gdweb_exporter);
	}
#endif
}

void uninitialize_gdweb_module(ModuleInitializationLevel p_level) {
}
