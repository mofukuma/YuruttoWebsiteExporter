#!/bin/sh
# 指定levelのエクスポートテンプレートを固定Godot sourceから作る。
# 共通optionへlevelの差分を重ね、同じsourceから描画能力の違う成果物を得る設計。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # sourceと成果物を結ぶproject root。
. "$repo/build/distribution.lock"
level=${1:?level required} # dom、3dのいずれか。
src=${2:-tmp/godot-minimum-source} # 公式sourceと文字同期差分。
emsdk_root=${3:-tmp/emsdk} # 固定Emscripten SDK。
out=${4:-$repo/tmp/minimum/template-proof} # 比較用の固定template。
cache=${YWEB_SCONS_CACHE:-$repo/tmp/scons-cache} # レベルをまたいで使うコンパイル成果物。
case $src in /*) ;; *) src=$repo/$src ;; esac
case $emsdk_root in /*) ;; *) emsdk_root=$repo/$emsdk_root ;; esac

# 共通optionへlevelの差分を重ね、順序どおりSConsへ渡す。
set --
while IFS= read -r option; do
  case $option in ''|'#'*) continue ;; esac
  set -- "$@" "$option"
done < "$repo/build/template.options"
extra=$(awk -v want="$level" '$1 == want { $1 = ""; print substr($0, 2) }' "$repo/build/levels.options")
test -n "$extra"
for option in $extra; do set -- "$@" "$option"; done

# 入力が同じ完成済みarchiveはそのまま使い、SConsの起動も省く。
mkdir -p "$out" "$src/bin"
suffix=$(printf '%s\n' $extra | sed -n 's/^extra_suffix=//p') # build成果物の一意suffix。
archive=$(find "$src/bin" -maxdepth 1 -type f -name "*.$suffix.zip" | LC_ALL=C sort | tail -1)
key=$(node "$repo/build/template_key.cjs" "$level" "${YWEB_COMPILE_ENV:-}") # このレベルへ効く入力の識別値。
stamp=$src/bin/.yweb-$level-key # 完成済みarchiveと入力を結ぶ記録。
current=$(cat "$stamp" 2>/dev/null || true)
if test -z "$archive" || test "$current" != "$key"; then
	# POSIX shellでもSDK自身の位置を確実に解決して環境を読む。
	before=$(pwd)
	cd "$emsdk_root"
	. ./emsdk_env.sh >/dev/null
	cd "$before"
	mkdir -p "$cache"
	set -- "$@" "cache_path=$cache" "cache_limit=$SCONS_CACHE_GB"
	(cd "$src" && scons "-j$SCONS_JOBS" "$@")
	archive=$(find "$src/bin" -maxdepth 1 -type f -name "*.$suffix.zip" | LC_ALL=C sort | tail -1)
	test -n "$archive"
	printf '%s\n' "$key" > "$stamp"
else
	printf 'コンパイル再利用: %s\n' "$level"
fi

# 開発成果物のZIP入力も同じなら、展開、Brotli、再圧縮を省く。
built=$out/yweb-$level-template.zip # tmpへ置く完成ZIP。
proof=$out/yweb-$level-manifest.json # 完成ZIPの入力とhash。
artifact=$(node "$repo/build/template_key.cjs" --artifact "$level" "${YWEB_COMPILE_ENV:-}") # ZIPへ効く入力の識別値。
proof_key=$(sed -n 's/.*"artifactKey": "\([^"]*\)".*/\1/p' "$proof" 2>/dev/null || true)
proof_sha=$(sed -n 's/.*"sha256": "\([^"]*\)".*/\1/p' "$proof" 2>/dev/null | head -1 || true)
actual_sha=$(shasum -a 256 "$built" 2>/dev/null | awk '{print $1}' || true)
if test "${YWEB_PUBLISH:-1}" = 0 && test "$proof_key" = "$artifact" && test "$proof_sha" = "$actual_sha"; then
	printf 'パッケージ再利用: %s\n' "$level"
else
	# build結果を決定的packageと由来manifestへ変換する。
	export YWEB_BROTLI_QUALITY=$BROTLI_QUALITY
	node "$repo/build/package_template.cjs" "$archive" "$out" "$level"
fi
