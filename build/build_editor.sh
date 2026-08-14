#!/bin/sh
# gdweb書き出し器を含むGodot 4.7.1 native Editorを再現buildする。
# 作品検査に必要な2D、GUI、文字、音声、動画moduleだけを明示する。

set -eu

root=$(cd "$(dirname "$0")/.." && pwd) # gdweb project root。
source_root=${1:-$root/tmp/godot-source} # overlay適用済みGodot source。
jobs=${GDWEB_BUILD_JOBS:-6} # 同時compile数。

"$root/build/apply_overlay.sh" "$source_root"

cd "$source_root"
scons -j"$jobs" \
  platform=macos target=editor arch=arm64 \
  vulkan=no angle=no accesskit=no \
  modules_enabled_by_default=no \
  module_gdweb_enabled=yes module_gdscript_enabled=yes module_regex_enabled=yes \
  module_text_server_fb_enabled=yes module_text_server_adv_enabled=yes module_freetype_enabled=yes module_msdfgen_enabled=yes \
  module_svg_enabled=yes module_webp_enabled=yes \
  module_godot_physics_2d_enabled=yes module_godot_physics_3d_enabled=yes module_navigation_2d_enabled=yes \
  module_ogg_enabled=yes module_vorbis_enabled=yes module_theora_enabled=yes \
  debug_symbols=no lto=none
