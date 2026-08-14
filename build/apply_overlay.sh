#!/bin/sh
# 再現用overlayを公式Godot sourceへ同じpathで適用する。
# 定義をbuild/へ保持し、tmp/のsourceをいつでも再生成可能にする。

set -eu

root=$(cd "$(dirname "$0")/.." && pwd) # gdweb project root。
source_root=${1:-$root/tmp/godot-source} # overlay適用先のGodot source。
overlay=$root/build/overlay # 再現可能な追加source。
patch_file=$root/build/patches/web_gdweb_2d.patch # 本家Web経路への限定差分。

test -f "$source_root/version.py"
find "$overlay" -type f | while IFS= read -r file; do
	rel=${file#"$overlay"/}
	mkdir -p "$source_root/$(dirname "$rel")"
	cp "$file" "$source_root/$rel"
done

# GPU初期化を外すsource差分を一度だけ適用する。
if ! grep -q 'BoolVariable("gdweb_2d"' "$source_root/platform/web/detect.py"; then
	patch -d "$source_root" -p1 < "$patch_file"
fi

# 本家Display入力処理を維持したCanvas 2D専用JSを毎回再生成する。
node "$root/build/make_web_display.cjs" \
	"$source_root/platform/web/js/libs/library_godot_display.js" \
	"$source_root/platform/web/js/libs/library_gdweb_display.js"

# 起動前のGPU能力検査を外し、Canvas 2D用loaderを生成する。
node "$root/build/make_web_engine.cjs" \
	"$source_root/platform/web/js/engine/features.js" \
	"$source_root/platform/web/js/engine/engine.js" \
	"$source_root/platform/web/js/engine/gdweb_features.js" \
	"$source_root/platform/web/js/engine/gdweb_engine.js"
