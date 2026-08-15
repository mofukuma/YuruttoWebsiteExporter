#!/bin/sh
# Godot 4.7.1標準Web rendererへ対応Controlの意味DOMだけを足したruntimeを再現する。
# 3Dだけを外し、背景、2D描画、物理、Shaderを本家Canvasへ残す。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # sourceと成果物を結ぶproject root。
src=${1:-tmp/godot-minimum-source} # 公式sourceと文字同期差分。
emsdk_root=${2:-tmp/emsdk} # 固定Emscripten 4.0.11。
out=${3:-$repo/tmp/minimum/runtime-proof} # 比較用の固定template。
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

# build結果とlicenseを同じtemplateへ一括固定し、古い成果物の再利用を防ぐ。
mkdir -p "$out"
archive=$src/bin/godot.web.template_release.wasm32.nothreads.gdwebminimum.zip
unzip -oq "$archive" godot.js godot.wasm godot.audio.worklet.js godot.audio.position.worklet.js -d "$out"
cp "$repo/LICENSES/GODOT-MIT.txt" "$out/GODOT_LICENSE.txt"
cp "$repo/LICENSES/GODOT-COPYRIGHT.txt" "$out/GODOT_COPYRIGHT.txt"
rm -f "$out/godot.font.woff2" "$out/FONT_LICENSE.txt"
cp "$archive" "$out/gdweb-minimum-template.zip"
(cd "$out" && zip -X -q gdweb-minimum-template.zip GODOT_LICENSE.txt GODOT_COPYRIGHT.txt)

# 独立Exporterへ使用entryだけを同梱し、内容識別値も同時更新する。
zip -d "$out/gdweb-minimum-template.zip" godot.service.worker.js godot.offline.html >/dev/null 2>&1 || true
addon=$repo/addons/gdweb_site/templates # 単体配布するruntime位置。
mkdir -p "$addon"
cp "$out/gdweb-minimum-template.zip" "$addon/yurutto_web_4.7.1.zip"
shasum -a 256 "$addon/yurutto_web_4.7.1.zip" | awk '{print $1}' > "$addon/yurutto_web_4.7.1.sha256"
