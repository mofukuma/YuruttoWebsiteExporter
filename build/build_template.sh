#!/bin/sh
# 指定levelのエクスポートテンプレートを固定Godot sourceから作る。
# 共通optionへlevelの差分を重ね、同じsourceから描画能力の違う成果物を得る設計。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # sourceと成果物を結ぶproject root。
. "$repo/build/distribution.lock"
level=${1:?level required} # dom、2d、3dのいずれか。
src=${2:-tmp/godot-minimum-source} # 公式sourceと文字同期差分。
emsdk_root=${3:-tmp/emsdk} # 固定Emscripten SDK。
out=${4:-$repo/tmp/minimum/template-proof} # 比較用の固定template。
case $src in /*) ;; *) src=$repo/$src ;; esac
case $emsdk_root in /*) ;; *) emsdk_root=$repo/$emsdk_root ;; esac

# POSIX shellでもSDK自身の位置を確実に解決して環境を読む。
current=$(pwd)
cd "$emsdk_root"
. ./emsdk_env.sh >/dev/null
cd "$current"

# 共通optionへlevelの差分を重ね、順序どおりSConsへ渡す。
set --
while IFS= read -r option; do
  case $option in ''|'#'*) continue ;; esac
  set -- "$@" "$option"
done < "$repo/build/template.options"
extra=$(awk -v want="$level" '$1 == want { $1 = ""; print substr($0, 2) }' "$repo/build/levels.options")
test -n "$extra"
for option in $extra; do set -- "$@" "$option"; done
(cd "$src" && scons "-j$SCONS_JOBS" "$@")

# build結果を決定的packageと由来manifestへ変換する。
mkdir -p "$out"
suffix=$(printf '%s\n' $extra | sed -n 's/^extra_suffix=//p') # build成果物の一意suffix。
archive=$(find "$src/bin" -maxdepth 1 -type f -name "*.$suffix.zip" | LC_ALL=C sort | tail -1)
test -n "$archive"
export YWEB_BROTLI_QUALITY=$BROTLI_QUALITY
node "$repo/build/package_template.cjs" "$archive" "$out" "$level"
