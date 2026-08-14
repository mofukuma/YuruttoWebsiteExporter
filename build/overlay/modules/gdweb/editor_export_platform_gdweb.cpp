/**************************************************************************/
/*  editor_export_platform_gdweb.cpp                                      */
/**************************************************************************/

// gdweb作品の構造検査と限定Web template接続を実装する。
// 構造外の機能をPCK生成前に止め、黙った表示欠落を防ぐ。

#include "editor_export_platform_gdweb.h"

#include "core/config/project_settings.h"
#include "core/io/dir_access.h"
#include "core/io/file_access.h"
#include "core/object/class_db.h"

static constexpr const char *forbidden[] = {
	"Node3D", // 3D場面を拒否。
	"Shader", // Shader資源を拒否。
	"ShaderMaterial", // Shader materialを拒否。
	"CanvasItemMaterial", // Canvas shader相当を拒否。
	"GDExtension", // native拡張を拒否。
	"JavaScriptBridge", // 任意JavaScript実行を拒否。
	"JavaScriptObject", // Browser object直結を拒否。
	"RenderingDevice", // GPU deviceを拒否。
	"CanvasGroup", // backbuffer合成を拒否。
	"CPUParticles2D", // 粒子構造を拒否。
	"GPUParticles2D", // GPU粒子構造を拒否。
	"MeshInstance2D", // Mesh描画を拒否。
	"MultiMeshInstance2D", // MultiMesh描画を拒否。
	"Skeleton2D", // 骨格変形を拒否。
	"Bone2D", // 骨格変形を拒否。
	"Light2D", // 光源合成を拒否。
	"LightOccluder2D", // 光源遮蔽を拒否。
	"OccluderPolygon2D", // 光源遮蔽資源を拒否。
	"BackBufferCopy", // backbuffer読込を拒否。
	"CanvasModulate", // 全画面光変調を拒否。
	"TouchScreenButton", // texture mask入力を拒否。
	"PhysicalBone2D", // 骨格物理を拒否。
	"SkeletonModification", // 骨格変更資源を拒否。
	"ArrayMesh", // Mesh資源を拒否。
	"MeshConvexDecompositionSettings", // Mesh分解資源を拒否。
	"type=\"Mesh\"", // 抽象Mesh資源を拒否。
	"PlaceholderMesh", // Mesh資源を拒否。
	"ImmediateMesh", // Mesh資源を拒否。
	"MultiMesh", // MultiMesh資源を拒否。
	"SurfaceTool", // Mesh生成APIを拒否。
	"MeshDataTool", // Mesh編集APIを拒否。
}; // 限定runtimeに実装しない構造token。

static constexpr const char *script_forbidden[] = {
	"load(", // 動的Resource解決を拒否。
	"DirAccess.", // 実行時directory走査を拒否。
	"draw_mesh(", // CPU展開前のMesh描画を拒否。
	"draw_multimesh(", // CPU展開前のMultiMesh描画を拒否。
}; // 到達依存を静的に確定できないAPI。

// 識別子境界を判断し、preloadなど別名の一部一致を避ける。
static bool identifier_char(char32_t p_char) {
	return (p_char >= 'a' && p_char <= 'z') || (p_char >= 'A' && p_char <= 'Z') || (p_char >= '0' && p_char <= '9') || p_char == '_';
}

// コメントと文字列を空白化し、実行されるGDScriptだけを検査対象にする。
static String script_code(const String &p_text) {
	String code;
	char32_t quote = 0;
	bool triple = false;
	bool escaped = false;
	for (int i = 0; i < p_text.length(); i++) {
		const char32_t c = p_text[i];
		if (quote) {
			if (triple && c == quote && i + 2 < p_text.length() && p_text[i + 1] == quote && p_text[i + 2] == quote) {
				quote = 0;
				triple = false;
				code += "   ";
				i += 2;
			} else if (!triple && !escaped && c == quote) {
				quote = 0;
				code += ' ';
			} else {
				code += c == '\n' ? '\n' : ' ';
				escaped = !triple && !escaped && c == '\\';
				if (c != '\\') escaped = false;
			}
			continue;
		}
		if (c == '#') {
			while (i < p_text.length() && p_text[i] != '\n') {
				code += ' ';
				i++;
			}
			if (i < p_text.length()) code += '\n';
		} else if (c == '\'' || c == '"') {
			quote = c;
			triple = i + 2 < p_text.length() && p_text[i + 1] == c && p_text[i + 2] == c;
			code += triple ? "   " : " ";
			if (triple) i += 2;
		} else {
			code += c;
		}
	}
	return code;
}

// 識別子境界と空白を含め、指定関数の呼出だけを検出する。
static bool script_call(const String &p_code, const String &p_name) {
	int at = 0;
	while ((at = p_code.find(p_name, at)) >= 0) {
		const bool left = at == 0 || !identifier_char(p_code[at - 1]);
		int next = at + p_name.length();
		while (next < p_code.length() && (p_code[next] == ' ' || p_code[next] == '\t')) next++;
		if (left && next < p_code.length() && p_code[next] == '(') return true;
		at += p_name.length();
	}
	return false;
}

struct WarningRule {
	const char *token;
	const char *property;
	const char *process;
	const char *fallback;
};

static constexpr WarningRule warning_rules[] = {
	{ "mouse_default_cursor_shape =", "mouse_default_cursor_shape", "DOM pointer", "default cursor" },
	{ "tooltip_text =", "tooltip_text", "DOM meaning", "empty tooltip" },
}; // DOMへ同値変換できない値と固定fallback。

// HTML本文へ埋め込む文字の構造記号を無害化する。
static String seo_escape(String p_text) {
	return p_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
}

// 一つのscene blockから初期HTMLに必要な意味文字を追加する。
static void seo_append(String &r_html, const String &p_type, const String &p_text, bool p_secret) {
	if (p_text.is_empty() || p_secret) return;
	String tag = "span";
	String attributes;
	if (p_type == "Button") {
		tag = "button";
		attributes = " type=\"button\"";
	} else if (p_type == "LinkButton") {
		tag = "a";
		attributes = " href=\"#\"";
	} else if (p_type == "LineEdit" || p_type == "TextEdit" || p_type == "CodeEdit") return;
	else if (p_type != "Label" && p_type != "RichTextLabel") return;
	r_html += vformat("<%s%s data-gdweb-seo=\"1\" data-gdweb-type=\"%s\">%s</%s>", tag, attributes, p_type, seo_escape(p_text), tag);
}

// 専用template archiveの絶対pathを返す。
String EditorExportPlatformGDWeb::_archive(const Ref<EditorExportPreset> &p_preset) const {
	const String value = p_preset->get("template/archive");
	return value.is_relative_path() ? ProjectSettings::get_singleton()->globalize_path(value) : value;
}

// 本家Web exporterへ限定条件を一括反映する。
void EditorExportPlatformGDWeb::_configure(const Ref<EditorExportPreset> &p_preset) const {
	const String archive = _archive(p_preset);
	p_preset->set("variant/thread_support", false);
	p_preset->set("variant/extensions_support", false);
	p_preset->set("custom_template/debug", archive);
	p_preset->set("custom_template/release", archive);
}

// project内の対象fileだけを再帰検査する。
Error EditorExportPlatformGDWeb::_validate_dir(const String &p_dir) {
	Ref<DirAccess> dir = DirAccess::open(p_dir);
	ERR_FAIL_COND_V_MSG(dir.is_null(), ERR_CANT_OPEN, vformat("gdweb: cannot open directory: %s", p_dir));
	dir->list_dir_begin();
	Error result = OK;
	for (String name = dir->get_next(); !name.is_empty(); name = dir->get_next()) {
		if (name.begins_with(".")) {
			continue;
		}
		const String file = p_dir.path_join(name);
		if (dir->current_is_dir()) {
			const Error err = _validate_dir(file);
			if (err != OK) result = err;
		} else {
			const String ext = file.get_extension().to_lower();
			if (ext != "gd" && ext != "tscn" && ext != "tres" && ext != "godot" && ext != "gdextension") {
				continue;
			}
			const Error err = _validate_file(file);
			if (err != OK) result = err;
		}
	}
	return result;
}

// 一つのsourceから構造外tokenを検出する。
Error EditorExportPlatformGDWeb::_validate_file(const String &p_path) {
	if (p_path.get_extension().to_lower() == "gdextension") {
		add_message(EXPORT_MESSAGE_ERROR, "gdweb", vformat("%s: unsupported extension structure: GDExtension", p_path));
		return ERR_UNAVAILABLE;
	}
	const String text = FileAccess::get_file_as_string(p_path);
	Error result = OK;
	for (const char *token : forbidden) {
		if (text.contains(token)) {
			add_message(EXPORT_MESSAGE_ERROR, "gdweb", vformat("%s: unsupported API or resource token: %s", p_path, token));
			result = ERR_UNAVAILABLE;
		}
	}
	if (p_path.get_extension().to_lower() == "gd") {
		const String code = script_code(text);
		for (const char *token : script_forbidden) {
			const String value = token;
			const bool found = value == "DirAccess." ? code.contains(value) : script_call(code, value.trim_suffix("("));
			if (found) {
				add_message(EXPORT_MESSAGE_ERROR, "gdweb", vformat("%s: unsupported dynamic API token: %s", p_path, token));
				result = ERR_UNAVAILABLE;
			}
		}
	}
	String node = ".";
	for (const String &raw : text.split("\n")) {
		const String line = raw.strip_edges();
		if (line.begins_with("[node ")) {
			node = line.get_slice("name=\"", 1).get_slice("\"", 0);
			const String type = line.get_slice("type=\"", 1).get_slice("\"", 0);
			if (!type.is_empty() && ClassDB::is_parent_class(type, "Node3D")) {
				add_message(EXPORT_MESSAGE_ERROR, "gdweb", vformat("%s: node=%s unsupported 3D type: %s", p_path, node, type));
				result = ERR_UNAVAILABLE;
			}
		}
		for (const WarningRule &rule : warning_rules) {
			if (line.begins_with(rule.token)) add_message(EXPORT_MESSAGE_WARNING, "gdweb", vformat("%s: node=%s property=%s process=%s fallback=%s", p_path, node, rule.property, rule.process, rule.fallback));
		}
	}
	return result;
}

// sceneに記録された意味文字をproject全体から列挙する。
void EditorExportPlatformGDWeb::_seo_dir(const String &p_dir, String &r_html) {
	Ref<DirAccess> dir = DirAccess::open(p_dir);
	if (dir.is_null()) return;
	dir->list_dir_begin();
	for (String name = dir->get_next(); !name.is_empty(); name = dir->get_next()) {
		if (name.begins_with(".")) continue;
		const String file = p_dir.path_join(name);
		if (dir->current_is_dir()) {
			_seo_dir(file, r_html);
			continue;
		}
		if (file.get_extension().to_lower() != "tscn") continue;
		String type;
		String text;
		bool secret = false;
		for (const String &raw : FileAccess::get_file_as_string(file).split("\n")) {
			const String line = raw.strip_edges();
			if (line.begins_with("[node ")) {
				seo_append(r_html, type, text, secret);
				type = line.get_slice("type=\"", 1).get_slice("\"", 0);
				text = "";
				secret = false;
			} else if (line.begins_with("text = \"") && line.ends_with("\"")) {
				text = line.substr(8, line.length() - 9).c_unescape();
			} else if (line == "secret = true") {
				secret = true;
			}
		}
		seo_append(r_html, type, text, secret);
	}
}

// 実行前から読める意味DOMを出力HTMLへ入れる。
Error EditorExportPlatformGDWeb::_inject_seo(const String &p_path) {
	if (p_path.get_extension().to_lower() != "html") return OK;
	String items;
	_seo_dir("res://", items);
	String html = FileAccess::get_file_as_string(p_path);
	const String root = "<div id=\"gdweb-dom-root\" data-gdweb-seo-root=\"1\" style=\"position:absolute;inset:0;z-index:1;visibility:hidden;pointer-events:none;overflow:hidden\">" + items + "</div>";
	const String fallback = "<noscript><section id=\"gdweb-seo-fallback\">" + items + "</section></noscript>";
	const int body = html.find("<body>");
	ERR_FAIL_COND_V_MSG(body < 0, ERR_FILE_CORRUPT, "gdweb: output HTML has no body");
	html = html.insert(body + 6, root + fallback);
	Ref<FileAccess> output = FileAccess::open(p_path, FileAccess::WRITE);
	ERR_FAIL_COND_V_MSG(output.is_null(), ERR_CANT_OPEN, vformat("gdweb: cannot update output HTML: %s", p_path));
	output->store_string(html);
	return OK;
}

// 書き出し前に作品全体の構造契約を確認する。
Error EditorExportPlatformGDWeb::_validate_project() {
	return _validate_dir("res://");
}

// 本家Web featureへgdweb識別子を追加する。
void EditorExportPlatformGDWeb::get_preset_features(const Ref<EditorExportPreset> &p_preset, List<String> *r_features) const {
	EditorExportPlatformWeb::get_preset_features(p_preset, r_features);
	r_features->push_back("gdweb");
}

// 限定runtime archiveをpresetの必須値として追加する。
void EditorExportPlatformGDWeb::get_export_options(List<ExportOption> *r_options) const {
	EditorExportPlatformWeb::get_export_options(r_options);
	r_options->push_back(ExportOption(PropertyInfo(Variant::STRING, "template/archive", PROPERTY_HINT_GLOBAL_FILE, "*.zip"), "", false, true));
}

// export presetで使う一意なplatform名。
String EditorExportPlatformGDWeb::get_name() const {
	return "gdweb";
}

// archive実在と本家Web設定を同じ判定へ通す。
bool EditorExportPlatformGDWeb::has_valid_export_configuration(const Ref<EditorExportPreset> &p_preset, String &r_error, bool &r_missing_templates, bool p_debug) const {
	_configure(p_preset);
	const String archive = _archive(p_preset);
	if (archive.is_empty() || !FileAccess::exists(archive)) {
		r_error += vformat("gdweb runtime archive not found: %s\n", archive);
		r_missing_templates = true;
		return false;
	}
	return EditorExportPlatformWeb::has_valid_export_configuration(p_preset, r_error, r_missing_templates, p_debug);
}

// 正常な作品だけを本家Web exporterへ渡す。
Error EditorExportPlatformGDWeb::export_project(const Ref<EditorExportPreset> &p_preset, bool p_debug, const String &p_path, BitField<EditorExportPlatform::DebugFlags> p_flags, bool p_notify) {
	_configure(p_preset);
	const Error err = _validate_project();
	if (err != OK) {
		return err;
	}
	const Error export_error = EditorExportPlatformWeb::export_project(p_preset, p_debug, p_path, p_flags, p_notify);
	if (export_error != OK) return export_error;
	return _inject_seo(p_path);
}

// feature照合へWebとgdwebを同時に公開する。
void EditorExportPlatformGDWeb::get_platform_features(List<String> *r_features) const {
	EditorExportPlatformWeb::get_platform_features(r_features);
	r_features->push_back("gdweb");
}
