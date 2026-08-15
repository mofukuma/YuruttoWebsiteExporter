#!/bin/sh
# 3D境界を検査し、minimum templateとBrotliでWeb作品を書き出す。
# 検査、標準export、配信用圧縮を一つの失敗境界にまとめる。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # gdweb project root。
project=${1:?project path required} # 書き出すGodot project。
output=${2:-$repo/tmp/minimum/site/index.html} # Web成果物の出力先。
godot=${GODOT_BIN:-/Applications/Godot 4.7.1.app/Contents/MacOS/Godot} # 固定Godot editor。
template=$repo/tmp/minimum/runtime-proof/gdweb-minimum-template.zip # 再現build済みtemplate。
case $output in /*) ;; *) output=$repo/$output ;; esac

test -f "$template" || { echo "minimum templateなし。先に sh build/prepare_runtime.sh を実行" >&2; exit 1; }
node "$repo/build/check_minimum.cjs" "$project"
node "$repo/build/force_web_preset.cjs" "$project" Web
"$godot" --headless --path "$project" --export-release Web "$output"
cp "$repo/LICENSES/GODOT-MIT.txt" "$(dirname "$output")/GODOT_LICENSE.txt"
cp "$repo/LICENSES/GODOT-COPYRIGHT.txt" "$(dirname "$output")/GODOT_COPYRIGHT.txt"
cp "$repo/LICENSES/OFL-1.1.txt" "$(dirname "$output")/FONT_LICENSE.txt"
node "$repo/build/compress_web.cjs" "$(dirname "$output")"
