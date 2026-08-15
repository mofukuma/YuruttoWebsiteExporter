#!/bin/sh
# Godot 4.7.1標準Web rendererへ対応Controlの意味DOMだけを足したruntimeを再現する。
# 3Dだけを外し、背景、2D描画、物理、Shaderを本家Canvasへ残す。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # sourceと成果物を結ぶproject root。
src=${1:-tmp/godot-minimum-source} # 公式sourceと文字同期差分。
emsdk_root=${2:-tmp/emsdk} # 固定Emscripten 4.0.11。
out=${3:-$repo/tmp/minimum/runtime-proof} # 比較用の固定template。
font=${4:-$repo/LINESeedJP_A_OTF_Rg.woff2} # 日本語DOMへ使う固定Web font。
case $src in /*) ;; *) src=$repo/$src ;; esac
case $emsdk_root in /*) ;; *) emsdk_root=$repo/$emsdk_root ;; esac
. "$emsdk_root/emsdk_env.sh" >/dev/null

(cd "$src" && scons -j6 \
  platform=web target=template_release extra_suffix=gdwebminimum \
  gdweb_text_dom=yes \
  optimize=size_extra lto=none debug_symbols=no threads=no \
  opengl3=yes vulkan=no javascript_eval=no dlink_enabled=no \
  disable_3d=yes \
  disable_physics_2d=no disable_physics_3d=yes \
  disable_navigation_2d=no disable_navigation_3d=yes disable_xr=yes \
  disable_path_overrides=no modules_enabled_by_default=yes \
  wasm_simd=no initial_memory=32 progress=no)

# build結果と日本語fontを同じtemplateへ一括固定し、古い成果物の再利用を防ぐ。
mkdir -p "$out"
archive=$src/bin/godot.web.template_release.wasm32.nothreads.gdwebminimum.zip
unzip -oq "$archive" godot.js godot.wasm godot.audio.worklet.js godot.audio.position.worklet.js -d "$out"
cp "$font" "$out/godot.font.woff2"
cp "$repo/LICENSES/GODOT-MIT.txt" "$out/GODOT_LICENSE.txt"
cp "$repo/LICENSES/GODOT-COPYRIGHT.txt" "$out/GODOT_COPYRIGHT.txt"
cp "$repo/LICENSES/OFL-1.1.txt" "$out/FONT_LICENSE.txt"
cp "$archive" "$out/gdweb-minimum-template.zip"
(cd "$out" && zip -X -q gdweb-minimum-template.zip godot.font.woff2 GODOT_LICENSE.txt GODOT_COPYRIGHT.txt FONT_LICENSE.txt)
