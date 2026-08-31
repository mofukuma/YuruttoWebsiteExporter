#!/bin/sh
# 開発中のoverlay変更をすぐ試すため、Hostでエクスポートテンプレートを差分ビルドする。
# sourceを作り直さずSConsのobject cacheを活かすことだけを狙い、再現性は配布buildへ任せる設計。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # sourceと成果物を結ぶproject root。
. "$repo/build/source.lock"
. "$repo/build/distribution.lock"
level=${1:-dom} # dom、3dのいずれか。
src=$repo/tmp/dev-source # 開発用に保つGodot source。
emsdk=$repo/tmp/dev-emsdk # 開発用Emscripten SDK。
out=$repo/tmp/dev-template/$level # 展開確認先。
archive=$repo/tmp/godot-$GODOT_VERSION.tar.xz # 配布buildと共有するsource archive。
cache=$repo/tmp/dev-scons-cache # レベルを切り替えても残すコンパイル成果物。

# 未知のlevelを準備処理の前に止める。
awk -v want="$level" '!/^#/ && $1 == want { found = 1 } END { exit !found }' "$repo/build/levels.options"

# source archiveを配布buildと同じhashで用意する。
mkdir -p "$repo/tmp"
if test ! -f "$archive"; then
	curl -fL "https://github.com/godotengine/godot/releases/download/$GODOT_VERSION/godot-$GODOT_VERSION.tar.xz" -o "$archive.part"
	printf '%s  %s\n' "$GODOT_ARCHIVE_SHA256" "$archive.part" | shasum -a 256 -c -
	mv "$archive.part" "$archive"
fi

# 公式source、patch、overlayのfile構成が同じ間は展開済みsourceを使う。
source_key=$(cd "$repo" && { shasum -a 256 build/source.lock build/patches/web_yweb_text.patch; find build/overlay -type f | LC_ALL=C sort; } | shasum -a 256 | awk '{print $1}') # source構成の識別値。
if test ! -f "$src/version.py" || test "$(cat "$src/.yweb-source-key" 2>/dev/null || true)" != "$source_key"; then
	rm -rf "$src"
	work=$(mktemp -d "$repo/tmp/dev-source.XXXXXX")
	tar -xJf "$archive" -C "$work"
	mv "$work/godot-$GODOT_VERSION" "$src"
	rmdir "$work"
	printf '%s\n' "$source_key" > "$src/.yweb-source-key"
fi

# Emscriptenを固定版で一度用意する。
if test ! -x "$emsdk/emsdk"; then
	git clone https://github.com/emscripten-core/emsdk.git "$emsdk"
fi
sdk_key=$EMSDK_COMMIT:$EMSDK_VERSION # 導入済みtoolchainを判断する識別値。
sdk_stamp=$emsdk/.yweb-sdk-key # 同じSDKの再導入を省く記録。
if test "$(cat "$sdk_stamp" 2>/dev/null || true)" != "$sdk_key" || test ! -f "$emsdk/emsdk_env.sh"; then
	git -C "$emsdk" checkout --detach "$EMSDK_COMMIT" >/dev/null 2>&1
	"$emsdk/emsdk" install "$EMSDK_VERSION" >/dev/null
	"$emsdk/emsdk" activate "$EMSDK_VERSION" >/dev/null
	printf '%s\n' "$sdk_key" > "$sdk_stamp"
fi

# overlayとpatchを既存sourceへ重ねる。変更したfileだけがSConsの再compile対象になる。
sh "$repo/build/apply_overlay.sh" "$src"
# 配布物は固定環境のbuildだけが作る。開発buildの成果物はtmp/へ留める。
YWEB_COMPILE_ENV=host-$SCONS_VERSION YWEB_PUBLISH=0 YWEB_SCONS_CACHE=$cache sh "$repo/build/build_template.sh" "$level" "$src" "$emsdk" "$out"
