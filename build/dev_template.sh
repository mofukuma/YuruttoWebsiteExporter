#!/bin/sh
# 開発中のoverlay変更をすぐ試すため、Hostでエクスポートテンプレートを差分ビルドする。
# sourceを作り直さずSConsのobject cacheを活かすことだけを狙い、再現性は配布buildへ任せる設計。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # sourceと成果物を結ぶproject root。
. "$repo/build/source.lock"
. "$repo/build/distribution.lock"
level=${1:-dom} # dom、2d、3dのいずれか。
src=$repo/tmp/dev-source # 開発用に保つGodot source。
emsdk=$repo/tmp/dev-emsdk # 開発用Emscripten SDK。
out=$repo/tmp/dev-template/$level # 展開確認先。
archive=$repo/tmp/godot-$GODOT_VERSION.tar.xz # 配布buildと共有するsource archive。

# source archiveを配布buildと同じhashで用意する。
mkdir -p "$repo/tmp"
if test ! -f "$archive"; then
	curl -fL "https://github.com/godotengine/godot/releases/download/$GODOT_VERSION/godot-$GODOT_VERSION.tar.xz" -o "$archive.part"
	printf '%s  %s\n' "$GODOT_ARCHIVE_SHA256" "$archive.part" | shasum -a 256 -c -
	mv "$archive.part" "$archive"
fi

# sourceは一度だけ展開する。以後はoverlayを上書きするだけで作り直さない。
if test ! -f "$src/version.py"; then
	rm -rf "$src"
	work=$(mktemp -d "$repo/tmp/dev-source.XXXXXX")
	tar -xJf "$archive" -C "$work"
	mv "$work/godot-$GODOT_VERSION" "$src"
	rmdir "$work"
fi

# Emscriptenを固定版で用意する。
if test ! -x "$emsdk/emsdk"; then
	git clone https://github.com/emscripten-core/emsdk.git "$emsdk"
fi
git -C "$emsdk" checkout --detach "$EMSDK_COMMIT" >/dev/null 2>&1
"$emsdk/emsdk" install "$EMSDK_VERSION" >/dev/null
"$emsdk/emsdk" activate "$EMSDK_VERSION" >/dev/null

# overlayとpatchを既存sourceへ重ねる。変更したfileだけがSConsの再compile対象になる。
sh "$repo/build/apply_overlay.sh" "$src"
# 配布物は固定環境のbuildだけが作る。開発buildの成果物はtmp/へ留める。
YWEB_PUBLISH=0 sh "$repo/build/build_template.sh" "$level" "$src" "$emsdk" "$out"
