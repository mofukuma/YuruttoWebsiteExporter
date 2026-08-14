#!/bin/sh
# 3D境界を検査し、minimum templateでWeb作品を一括書き出しする。
# 検査成功時だけ標準Godot exporterへ処理を渡す。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # gdweb project root。
project=${1:?project path required} # 書き出すGodot project。
output=${2:-$repo/tmp/minimum/site/index.html} # Web成果物の出力先。
godot=${GODOT_BIN:-/Applications/Godot 4.7.1.app/Contents/MacOS/Godot} # 固定Godot editor。

node "$repo/build/check_minimum.cjs" "$project"
"$godot" --headless --path "$project" --export-release Web "$output"
