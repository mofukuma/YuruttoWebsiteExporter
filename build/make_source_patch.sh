#!/bin/sh
# 改変済みGodot sourceから本家差分patchを決定的に再生成する。
# 対象fileを固定し、重複hunkや手編集ずれを残さない。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # gdweb project root。
source_root=${1:-$repo/tmp/godot-minimum-source} # 文字同期を適用したGodot source。
archive=$repo/tmp/godot-4.7.1-stable.tar.xz # 固定本家source。
output=$repo/build/patches/web_gdweb_text.patch # 再現buildへ使う差分。
work=$(mktemp -d "$repo/tmp/patchgen.XXXXXX") # 比較専用の一時展開先。
trap 'rm -rf "$work"' EXIT

files='platform/web/detect.py
platform/web/SCsub
platform/web/display_server_web.cpp
scene/gui/control.cpp
scene/gui/label.cpp'

# 本家fileだけを一回のarchive走査で展開する。
set --
for file in $files; do set -- "$@" "godot-4.7.1-stable/$file"; done
tar -xJf "$archive" -C "$work" --strip-components=1 "$@"

# 同じ順序でunified diffへ連結する。
: > "$work/patch"
for file in $files; do
	diff -U0 --label "a/$file" --label "b/$file" "$work/$file" "$source_root/$file" >> "$work/patch" || test $? -eq 1
done
mv "$work/patch" "$output"
