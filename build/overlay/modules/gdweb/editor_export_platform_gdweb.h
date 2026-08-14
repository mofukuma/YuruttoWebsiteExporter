/**************************************************************************/
/*  editor_export_platform_gdweb.h                                        */
/**************************************************************************/

// 限定Web templateを本家Web書き出し処理へ接続するplatform。
// 本家PCKとHTML生成を再利用し、専用templateと機能制約だけを固定する。

#pragma once

#include "platform/web/export/export_plugin.h"

class EditorExportPlatformGDWeb : public EditorExportPlatformWeb {
	GDCLASS(EditorExportPlatformGDWeb, EditorExportPlatformWeb);

	String _archive(const Ref<EditorExportPreset> &p_preset) const;
	void _configure(const Ref<EditorExportPreset> &p_preset) const;
	Error _validate_project();
	Error _validate_dir(const String &p_dir);
	Error _validate_file(const String &p_path);
	void _seo_dir(const String &p_dir, String &r_html);
	Error _inject_seo(const String &p_path);

protected:
	static void _bind_methods() {}

public:
	void get_preset_features(const Ref<EditorExportPreset> &p_preset, List<String> *r_features) const override;
	void get_export_options(List<ExportOption> *r_options) const override;
	String get_name() const override;
	bool has_valid_export_configuration(const Ref<EditorExportPreset> &p_preset, String &r_error, bool &r_missing_templates, bool p_debug = false) const override;
	Error export_project(const Ref<EditorExportPreset> &p_preset, bool p_debug, const String &p_path, BitField<EditorExportPlatform::DebugFlags> p_flags = 0, bool p_notify = true) override;
	void get_platform_features(List<String> *r_features) const override;
};
