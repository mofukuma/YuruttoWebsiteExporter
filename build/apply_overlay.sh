#!/bin/sh
# 再現用overlayを公式Godot sourceへ同じpathで適用する。
# 定義をbuild/へ保持し、tmp/のsourceをいつでも再生成可能にする。

set -eu

root=$(cd "$(dirname "$0")/.." && pwd) # gdweb project root。
source_root=${1:-$root/tmp/godot-minimum-source} # overlay適用先の公式Godot source。
overlay=$root/build/overlay # 再現可能な追加source。
patch_file=$root/build/patches/web_gdweb_text.patch # Label文字同期だけの差分。

test -f "$source_root/version.py"
find "$overlay" -type f | while IFS= read -r file; do
	rel=${file#"$overlay"/}
	mkdir -p "$source_root/$(dirname "$rel")"
	cp "$file" "$source_root/$rel"
done

# 標準Web rendererへLabel文字同期だけを一度適用する。
if ! grep -q 'BoolVariable("gdweb_text_dom"' "$source_root/platform/web/detect.py"; then
	patch -d "$source_root" -p1 < "$patch_file"
fi
