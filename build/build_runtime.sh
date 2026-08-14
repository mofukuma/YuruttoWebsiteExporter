#!/bin/sh
# Godot 4.7.1改変sourceから、Canvas 2D・DOM・2D物理専用Web runtimeを再現buildする。
# 出力はGodot sourceのbinへ置き、通常Web templateとはsuffixで分離する。
# 設計思想：描画API、2D物理、module、文字計量を固定し、作品ごとの差をruntimeへ混ぜない。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # sourceと成果物を結ぶproject root。
src=${1:-tmp/godot-source} # 改変済みGodot source。
emsdk_root=${2:-tmp/emsdk} # 固定Emscripten 4.0.11。
out=${3:-$repo/tmp/gdweb/runtime-proof} # Exporterが読む固定template。
font=${4:-$repo/LINESeedJP_A_OTF_Rg.woff2} # 日本語DOMへ使う固定Web font。
case $src in /*) ;; *) src=$repo/$src ;; esac
case $emsdk_root in /*) ;; *) emsdk_root=$repo/$emsdk_root ;; esac
profile=$(cd "$(dirname "$0")" && pwd)/gdweb.build # 許可外classの固定表。

. "$emsdk_root/emsdk_env.sh" >/dev/null

(cd "$src" && scons -j6 \
  platform=web target=template_release extra_suffix=gdweb2dfinal \
  gdweb_2d=yes build_profile="$profile" \
  optimize=size_extra lto=none debug_symbols=no threads=no \
  opengl3=no vulkan=no javascript_eval=no dlink_enabled=no \
  deprecated=no minizip=no brotli=no accesskit=no \
  disable_3d=yes disable_advanced_gui=no \
  disable_physics_2d=no disable_physics_3d=yes \
  disable_navigation_2d=no disable_navigation_3d=yes disable_xr=yes \
  disable_path_overrides=no modules_enabled_by_default=no \
  module_gdscript_enabled=yes module_text_server_fb_enabled=yes \
  module_gdweb_enabled=no \
  module_godot_physics_2d_enabled=yes \
  module_navigation_2d_enabled=yes \
  module_ogg_enabled=yes module_vorbis_enabled=yes module_theora_enabled=yes \
  module_webp_enabled=yes \
  module_freetype_enabled=yes module_msdfgen_enabled=yes module_svg_enabled=yes \
  module_mbedtls_enabled=no wasm_simd=no initial_memory=16 progress=no)

# build結果と日本語fontを同じtemplateへ一括固定し、古い成果物の再利用を防ぐ。
mkdir -p "$out"
archive=$src/bin/godot.web.template_release.wasm32.nothreads.gdweb2dfinal.zip
unzip -oq "$archive" godot.js godot.wasm godot.audio.worklet.js godot.audio.position.worklet.js -d "$out"
cp "$font" "$out/godot.font.woff2"
cp "$archive" "$out/gdweb-template.zip"
(cd "$out" && zip -X -q gdweb-template.zip godot.font.woff2)
