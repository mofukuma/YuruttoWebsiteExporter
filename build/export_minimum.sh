#!/bin/sh
# 独立したゆるっとWebでWeb作品を書き出す。
# アドオン導入、preset準備、固定runtime書き出しを一つにまとめる。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # yweb project root。
project=${1:?project path required} # 書き出すGodot project。
output=${2:-$repo/tmp/minimum/site/index.html} # Web成果物の出力先。
godot=${GODOT_BIN:-/Applications/Godot 4.7.1.app/Contents/MacOS/Godot} # 固定Godot editor。
case $output in /*) ;; *) output=$repo/$output ;; esac

mkdir -p "$(dirname "$output")"
node "$repo/build/install_site_addon.cjs" "$project"
node "$repo/build/prepare_yweb_preset.cjs" "$project" Web
"$godot" --headless --path "$project" --export-release Web "$output"
