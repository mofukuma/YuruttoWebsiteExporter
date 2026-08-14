/**************************************************************************/
/*  rasterizer_canvas_dummy.h                                             */
/**************************************************************************/

// gdwebではDummy rendererのCanvas命令だけをCanvas 2Dへ転送する。
// GPU資源を作らず、Godotが確定した順序、変換、色をBrowserへ渡す。

#pragma once

#include "core/templates/hash_map.h"
#include "core/templates/hash_set.h"
#include "servers/rendering/renderer_canvas_render.h"


class RasterizerCanvasDummy : public RendererCanvasRender {
	struct PolygonData {
		Vector<int> indices; // 三角形の頂点番号。
		Vector<Point2> points; // Godot局所座標。
		Vector<Color> colors; // 頂点色または共通色。
		Vector<Point2> uvs; // texture上の頂点座標。
	};

	HashMap<PolygonID, PolygonData> polygons; // PolygonIDからCPU頂点への対応。
	Vector<float> batch; // 一frameの可変長Canvas命令列。
	HashSet<RID> frame_targets; // clear済みrender target。
	PolygonID next_polygon = 1; // 0を無効値として避ける連番。

	void push(int p_operation, const float *p_data, int p_count);
	void send_rect(const Transform2D &p_transform, const Rect2 &p_rect, const Color &p_color, float p_outline = 0.0f);
	void send_texture(const Transform2D &p_transform, const Item::CommandRect *p_rect, const Color &p_color);
	void send_ninepatch(const Transform2D &p_transform, const Item::CommandNinePatch *p_patch, const Color &p_color);
	void send_primitive(const Transform2D &p_transform, const Item::CommandPrimitive *p_primitive, const Color &p_modulate);
	void send_polygon(const Transform2D &p_transform, const Item::CommandPolygon *p_polygon, const Color &p_modulate);

public:
	void flush();
	void blit(const RenderingServerTypes::BlitToScreen *p_targets, int p_count);
	PolygonID request_polygon(const Vector<int> &p_indices, const Vector<Point2> &p_points, const Vector<Color> &p_colors, const Vector<Point2> &p_uvs = Vector<Point2>(), const Vector<int> &p_bones = Vector<int>(), const Vector<float> &p_weights = Vector<float>(), int p_count = -1) override;
	void free_polygon(PolygonID p_polygon) override;

	void canvas_render_items(RID p_to_render_target, Item *p_item_list, const Color &p_modulate, Light *p_light_list, Light *p_directional_list, const Transform2D &p_canvas_transform, RSE::CanvasItemTextureFilter p_default_filter, RSE::CanvasItemTextureRepeat p_default_repeat, bool p_snap_2d_vertices_to_pixel, bool &r_sdf_used, RenderingServerTypes::RenderInfo *r_render_info = nullptr) override;

	RID light_create() override { return RID(); }
	void light_set_texture(RID p_rid, RID p_texture) override {}
	void light_set_use_shadow(RID p_rid, bool p_enable) override {}
	void light_update_shadow(RID p_rid, int p_shadow_index, const Transform2D &p_light_xform, int p_light_mask, float p_near, float p_far, LightOccluderInstance *p_occluders, const Rect2 &p_light_rect) override {}
	void light_update_directional_shadow(RID p_rid, int p_shadow_index, const Transform2D &p_light_xform, int p_light_mask, float p_cull_distance, const Rect2 &p_clip_rect, LightOccluderInstance *p_occluders) override {}

	void render_sdf(RID p_render_target, LightOccluderInstance *p_occluders) override {}
	RID occluder_polygon_create() override { return RID(); }
	void occluder_polygon_set_shape(RID p_occluder, const Vector<Vector2> &p_points, bool p_closed) override {}
	void occluder_polygon_set_cull_mode(RID p_occluder, RSE::CanvasOccluderPolygonCullMode p_mode) override {}
	void set_shadow_texture_size(int p_size) override {}

	bool free(RID p_rid) override { return true; }
	void update() override {}
	void set_debug_redraw(bool p_enabled, double p_time, const Color &p_color) override {}
	uint32_t get_pipeline_compilations(RSE::PipelineSource p_source) override { return 0; }
};
