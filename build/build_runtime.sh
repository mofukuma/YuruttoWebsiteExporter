#!/bin/sh
# 固定Godotの標準Web rendererへ対応Controlの意味DOMだけを足したruntimeを再現する。
# 3Dだけを外し、背景、2D描画、物理、Shaderを本家Canvasへ残す。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # sourceと成果物を結ぶproject root。
. "$repo/build/distribution.lock"
src=${1:-tmp/godot-minimum-source} # 公式sourceと文字同期差分。
emsdk_root=${2:-tmp/emsdk} # 固定Emscripten 4.0.11。
out=${3:-$repo/tmp/minimum/runtime-proof} # 比較用の固定template。
case $src in /*) ;; *) src=$repo/$src ;; esac
case $emsdk_root in /*) ;; *) emsdk_root=$repo/$emsdk_root ;; esac

# POSIX shellでもSDK自身の位置を確実に解決して環境を読む。
current=$(pwd)
cd "$emsdk_root"
. ./emsdk_env.sh >/dev/null
cd "$current"

# 一つのoption正本をSConsへ順序どおり渡す。
set --
while IFS= read -r option; do
  case $option in ''|'#'*) continue ;; esac
  set -- "$@" "$option"
done < "$repo/build/runtime.options"
(cd "$src" && scons "-j$SCONS_JOBS" "$@")

# build結果を決定的packageと由来manifestへ変換する。
mkdir -p "$out"
suffix=$(sed -n 's/^extra_suffix=//p' "$repo/build/runtime.options") # build成果物の一意suffix。
archive=$(find "$src/bin" -maxdepth 1 -type f -name "*.$suffix.zip" | LC_ALL=C sort | tail -1)
test -n "$archive"
export YWEB_BROTLI_QUALITY=$BROTLI_QUALITY
node "$repo/build/package_runtime.cjs" "$archive" "$out"
