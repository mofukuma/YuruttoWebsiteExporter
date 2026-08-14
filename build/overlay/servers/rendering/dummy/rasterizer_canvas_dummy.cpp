/**************************************************************************/
/*  rasterizer_canvas_dummy.cpp                                           */
/**************************************************************************/

// Godot Canvas命令をCanvas 2D用の小さな数値列へ変換する。
// 作品固有の描画処理をJavaScriptへ持たせず、命令の意味だけを共有する。

#include "rasterizer_canvas_dummy.h"

#include "core/os/time.h"
#include "servers/rendering/dummy/storage/texture_storage.h"

#ifdef GDWEB_2D_ENABLED
extern "C" void godot_js_gdweb_canvas_batch(const float *p_data, int p_count);
#endif


// 一命令をframe共有bufferへ可変長形式で追加する。
void RasterizerCanvasDummy::push(int p_operation, const float *p_data, int p_count) {
	batch.push_back(p_operation);
	batch.push_back(p_count);
	for (int i = 0; i < p_count; i++) batch.push_back(p_data[i]);
}

// 一frameの全命令を一回のWasm境界でBrowserへ渡す。
void RasterizerCanvasDummy::flush() {
#ifdef GDWEB_2D_ENABLED
	if (!batch.is_empty()) godot_js_gdweb_canvas_batch(batch.ptr(), batch.size());
#endif
	batch.clear();
	frame_targets.clear();
}

// render targetを画面Canvasへ指定矩形で合成する。
void RasterizerCanvasDummy::blit(const RenderingServerTypes::BlitToScreen *p_targets, int p_count) {
	RendererDummy::TextureStorage *storage = RendererDummy::TextureStorage::get_singleton();
	for (int i = 0; i < p_count; i++) {
		const RenderingServerTypes::BlitToScreen &blit = p_targets[i];
		const Rect2 source = blit.src_rect;
		const Rect2i target = blit.dst_rect;
		const float data[] = { (float)storage->gdweb_render_target_handle(blit.render_target), source.position.x, source.position.y, source.size.x, source.size.y, (float)target.position.x, (float)target.position.y, (float)target.size.x, (float)target.size.y };
		push(9, data, 9);
	}
}

// Polygon commandが参照するCPU頂点を保持する。
RendererCanvasRender::PolygonID RasterizerCanvasDummy::request_polygon(const Vector<int> &p_indices, const Vector<Point2> &p_points, const Vector<Color> &p_colors, const Vector<Point2> &p_uvs, const Vector<int> &p_bones, const Vector<float> &p_weights, int p_count) {
	PolygonData data;
	data.indices = p_indices;
	data.points = p_points;
	data.colors = p_colors;
	data.uvs = p_uvs;
	const PolygonID id = next_polygon++;
	polygons.insert(id, data);
	return id;
}

// 解放済みPolygonのCPU頂点を残さない。
void RasterizerCanvasDummy::free_polygon(PolygonID p_polygon) {
	polygons.erase(p_polygon);
}

// 変換、矩形、色を一つの描画命令として送る。
void RasterizerCanvasDummy::send_rect(const Transform2D &p_transform, const Rect2 &p_rect, const Color &p_color, float p_outline) {
#ifdef GDWEB_2D_ENABLED
	const float data[] = {
		p_transform[0].x, p_transform[0].y, p_transform[1].x, p_transform[1].y, p_transform[2].x, p_transform[2].y,
		p_rect.position.x, p_rect.position.y, p_rect.size.x, p_rect.size.y,
		p_color.r, p_color.g, p_color.b, p_color.a, p_outline,
	};
	push(1, data, 15);
#endif
}

// NinePatchの領域、margin、繰返し方式をCanvas 2Dへ送る。
void RasterizerCanvasDummy::send_ninepatch(const Transform2D &p_transform, const Item::CommandNinePatch *p_patch, const Color &p_color) {
#ifdef GDWEB_2D_ENABLED
	const int handle = RendererDummy::TextureStorage::get_singleton()->gdweb_texture_handle(p_patch->texture);
	if (!handle) {
		send_rect(p_transform, p_patch->rect, p_color);
		return;
	}
	const float data[] = {
		p_transform[0].x, p_transform[0].y, p_transform[1].x, p_transform[1].y, p_transform[2].x, p_transform[2].y,
		p_patch->rect.position.x, p_patch->rect.position.y, p_patch->rect.size.x, p_patch->rect.size.y,
		p_patch->source.position.x, p_patch->source.position.y, p_patch->source.size.x, p_patch->source.size.y,
		p_patch->margin[0], p_patch->margin[1], p_patch->margin[2], p_patch->margin[3],
		p_color.r, p_color.g, p_color.b, p_color.a, (float)handle, (float)p_patch->axis_x, (float)p_patch->axis_y, p_patch->draw_center ? 1.0f : 0.0f,
	};
	push(6, data, 26);
#endif
}

// ImageTextureの領域、反転、変調をCanvas 2Dへ送る。
void RasterizerCanvasDummy::send_texture(const Transform2D &p_transform, const Item::CommandRect *p_rect, const Color &p_color) {
#ifdef GDWEB_2D_ENABLED
	const int handle = RendererDummy::TextureStorage::get_singleton()->gdweb_texture_handle(p_rect->texture);
	if (!handle) {
		send_rect(p_transform, p_rect->rect, p_color);
		return;
	}
	const float data[] = {
		p_transform[0].x, p_transform[0].y, p_transform[1].x, p_transform[1].y, p_transform[2].x, p_transform[2].y,
		p_rect->rect.position.x, p_rect->rect.position.y, p_rect->rect.size.x, p_rect->rect.size.y,
		p_rect->source.position.x, p_rect->source.position.y, p_rect->source.size.x, p_rect->source.size.y,
		p_color.r, p_color.g, p_color.b, p_color.a, (float)handle, (float)p_rect->flags,
	};
	push(4, data, 20);
#endif
}

// 線、三角形、四角形を変換済み頂点列として送る。
void RasterizerCanvasDummy::send_primitive(const Transform2D &p_transform, const Item::CommandPrimitive *p_primitive, const Color &p_modulate) {
#ifdef GDWEB_2D_ENABLED
	float data[1 + 8 + 16] = {};
	data[0] = p_primitive->point_count;
	for (uint32_t i = 0; i < p_primitive->point_count; i++) {
		const Vector2 point = p_transform.xform(p_primitive->points[i]);
		const Color color = p_primitive->colors[i] * p_modulate;
		data[1 + i * 2] = point.x;
		data[2 + i * 2] = point.y;
		data[9 + i * 4] = color.r;
		data[10 + i * 4] = color.g;
		data[11 + i * 4] = color.b;
		data[12 + i * 4] = color.a;
	}
	push(2, data, 25);
#endif
}

// 三角形indexを展開し、頂点色付きPolygonとして送る。
void RasterizerCanvasDummy::send_polygon(const Transform2D &p_transform, const Item::CommandPolygon *p_polygon, const Color &p_modulate) {
#ifdef GDWEB_2D_ENABLED
	const PolygonData *polygon = polygons.getptr(p_polygon->polygon.polygon_id);
	if (!polygon) return;
	for (int at = 0; at + 2 < polygon->indices.size(); at += 3) {
		float data[25] = {};
		for (int i = 0; i < 3; i++) {
			const int index = polygon->indices[at + i];
			if (index < 0 || index >= polygon->points.size()) return;
			const Vector2 point = p_transform.xform(polygon->points[index]);
			const Color source = polygon->colors.is_empty() ? Color(1, 1, 1, 1) : polygon->colors[MIN(index, polygon->colors.size() - 1)];
			const Color color = source * p_modulate;
			data[i * 2] = point.x;
			data[i * 2 + 1] = point.y;
			data[6 + i * 4] = color.r;
			data[7 + i * 4] = color.g;
			data[8 + i * 4] = color.b;
			data[9 + i * 4] = color.a;
			if (index < polygon->uvs.size()) {
				data[18 + i * 2] = polygon->uvs[index].x;
				data[19 + i * 2] = polygon->uvs[index].y;
			}
		}
		data[24] = RendererDummy::TextureStorage::get_singleton()->gdweb_texture_handle(p_polygon->texture);
		push(7, data, 25);
	}
#endif
}

// Godotが並べたItemとCommandの順序を変えずにBrowserへ送る。
void RasterizerCanvasDummy::canvas_render_items(RID p_to_render_target, Item *p_item_list, const Color &p_modulate, Light *p_light_list, Light *p_directional_list, const Transform2D &p_canvas_transform, RSE::CanvasItemTextureFilter p_default_filter, RSE::CanvasItemTextureRepeat p_default_repeat, bool p_snap_2d_vertices_to_pixel, bool &r_sdf_used, RenderingServerTypes::RenderInfo *r_render_info) {
	r_sdf_used = false;
	RendererDummy::TextureStorage *storage = RendererDummy::TextureStorage::get_singleton();
	const Size2i target_size = storage->render_target_get_size(p_to_render_target);
	const Color clear = storage->render_target_get_clear_request_color(p_to_render_target);
	const bool first = !frame_targets.has(p_to_render_target);
	const float target_data[] = { (float)storage->gdweb_render_target_handle(p_to_render_target), (float)target_size.x, (float)target_size.y, first ? 1.0f : 0.0f, clear.r, clear.g, clear.b, storage->render_target_get_transparent(p_to_render_target) ? 0.0f : clear.a };
	push(8, target_data, 8);
	frame_targets.insert(p_to_render_target);
	for (Item *item = p_item_list; item; item = item->next) {
#ifdef GDWEB_2D_ENABLED
		const Rect2 clip = item->final_clip_rect;
		const float clip_data[] = { item->final_clip_owner ? 1.0f : 0.0f, clip.position.x, clip.position.y, clip.size.x, clip.size.y };
		push(0, clip_data, 5);
#endif
		// Parallaxの各反復に同じCommand列と局所変換を適用する。
		auto draw_item = [&](const Transform2D &p_item_transform) {
			Transform2D local;
			bool animation_visible = true;
			for (Item::Command *command = item->commands; command; command = command->next) {
				const Transform2D transform = p_canvas_transform * p_item_transform * local;
				const Color modulate = item->final_modulate * p_modulate;
				switch (command->type) {
					case Item::Command::TYPE_RECT: {
						if (!animation_visible) break;
						const Item::CommandRect *rect = static_cast<Item::CommandRect *>(command);
						const Color color = rect->modulate * modulate;
						if (rect->texture.is_valid()) send_texture(transform, rect, color);
						else send_rect(transform, rect->rect, color, rect->outline);
					} break;
					case Item::Command::TYPE_NINEPATCH: {
						if (!animation_visible) break;
						const Item::CommandNinePatch *patch = static_cast<Item::CommandNinePatch *>(command);
						send_ninepatch(transform, patch, patch->color * modulate);
					} break;
					case Item::Command::TYPE_PRIMITIVE:
						if (animation_visible) send_primitive(transform, static_cast<Item::CommandPrimitive *>(command), modulate);
						break;
					case Item::Command::TYPE_POLYGON:
						if (animation_visible) send_polygon(transform, static_cast<Item::CommandPolygon *>(command), modulate);
						break;
					case Item::Command::TYPE_TRANSFORM:
						local = static_cast<Item::CommandTransform *>(command)->xform;
						break;
					case Item::Command::TYPE_CLIP_IGNORE: {
#ifdef GDWEB_2D_ENABLED
						const Item::CommandClipIgnore *ignore = static_cast<Item::CommandClipIgnore *>(command);
						const float clip_data[] = { ignore->ignore ? 0.0f : (item->final_clip_owner ? 1.0f : 0.0f), item->final_clip_rect.position.x, item->final_clip_rect.position.y, item->final_clip_rect.size.x, item->final_clip_rect.size.y };
						push(0, clip_data, 5);
#endif
					} break;
					case Item::Command::TYPE_ANIMATION_SLICE: {
						const Item::CommandAnimationSlice *slice = static_cast<Item::CommandAnimationSlice *>(command);
						const double time = Time::get_singleton()->get_ticks_msec() / 1000.0 + slice->offset;
						const double position = slice->animation_length > 0.0 ? Math::fposmod(time, slice->animation_length) : 0.0;
						animation_visible = position >= slice->slice_begin && position < slice->slice_end;
					} break;
					default:
						break;
				}
			}
		};
		if (!item->repeat_source_item || item->repeat_size == Vector2()) {
			draw_item(item->final_transform);
			continue;
		}
		const Point2 start = item->repeat_size * -(item->repeat_times / 2);
		const int count_x = item->repeat_size.x ? item->repeat_times : 0;
		const int count_y = item->repeat_size.y ? item->repeat_times : 0;
		for (int y = 0; y <= count_y; y++) {
			for (int x = 0; x <= count_x; x++) {
				const Point2 offset = start + Point2(x * item->repeat_size.x, y * item->repeat_size.y);
				Transform2D transform = item->final_transform;
				transform.columns[2] += item->repeat_source_item->final_transform.basis_xform(offset);
				draw_item(transform);
			}
		}
	}
}
