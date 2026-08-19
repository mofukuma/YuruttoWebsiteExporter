#!/bin/sh
# 開発中の3D版テンプレートを手元のmacOSで組み立てる。
# 配布と違いDocker越しのエミュレーションを挟まないので、差分コンパイルが効いて待ち時間が短い。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # yweb project root。
. "$repo/build/source.lock"
profile=${YWEB_PROFILE:-3d} # 組み立てるテンプレートの種類。
options=$repo/build/template-$profile.options # この種類のSCons option正本。
test -f "$options"

build_root=$repo/tmp/dev-macos # 手元専用のtoolchainとsource置き場。
archive=$build_root/godot-$GODOT_VERSION.tar.xz # Godot公式source archive。
source_root=$build_root/godot-source # overlay適用済みsource。差分コンパイル用に残す。
emsdk=$build_root/emsdk # 固定Emscripten SDK。
out=${YWEB_TEMPLATE_OUT:-$repo/tmp/dev-macos/template-$profile} # 展開した成果物。
jobs=${YWEB_JOBS:-$(sysctl -n hw.ncpu)} # 手元のCPU数をそのまま使う。
mkdir -p "$build_root"

# lock、patch、overlayを一つのsource識別値へまとめる。
stamp=$(cd "$repo" && {
	shasum -a 256 build/source.lock build/patches/web_yweb_text.patch
	find build/overlay -type f | LC_ALL=C sort | xargs shasum -a 256
} | shasum -a 256 | awk '{print $1}')

# Godot archiveを公式releaseから取得してhashを検証する。
if test ! -f "$archive"; then
	curl -fL "https://github.com/godotengine/godot/releases/download/$GODOT_VERSION/godot-$GODOT_VERSION.tar.xz" -o "$archive.part"
	printf '%s  %s\n' "$GODOT_ARCHIVE_SHA256" "$archive.part" | shasum -a 256 -c -
	mv "$archive.part" "$archive"
fi

# sourceを展開するのは初回と、overlayやpatchが変わったときに限る。
# ここでsourceを消さずに残すことが、二回目以降のbuildが速い理由。
current=$(cat "$source_root/.yweb-source-stamp" 2>/dev/null || true)
if test ! -f "$source_root/version.py" || test "$current" != "$stamp"; then
	rm -rf "$source_root"
	work=$(mktemp -d "$build_root/source.XXXXXX")
	tar -xJf "$archive" -C "$work"
	mv "$work/godot-$GODOT_VERSION" "$source_root"
	rm -rf "$work"
	sh "$repo/build/apply_overlay.sh" "$source_root"
	printf '%s\n' "$stamp" > "$source_root/.yweb-source-stamp"
fi

# Emscripten SDKを配布と同じcommitとreleaseで揃える。
if test ! -x "$emsdk/emsdk"; then
	git clone https://github.com/emscripten-core/emsdk.git "$emsdk"
fi
if test "$(cat "$emsdk/.yweb-emsdk-stamp" 2>/dev/null || true)" != "$EMSDK_COMMIT$EMSDK_VERSION"; then
	git -C "$emsdk" fetch --tags origin
	git -C "$emsdk" checkout --detach "$EMSDK_COMMIT"
	"$emsdk/emsdk" install "$EMSDK_VERSION"
	"$emsdk/emsdk" activate "$EMSDK_VERSION"
	printf '%s\n' "$EMSDK_COMMIT$EMSDK_VERSION" > "$emsdk/.yweb-emsdk-stamp"
fi

current=$(pwd)
cd "$emsdk"
. ./emsdk_env.sh >/dev/null
cd "$current"

# 一つのoption正本をSConsへ順序どおり渡す。
set --
while IFS= read -r option; do
	case $option in ''|'#'*) continue ;; esac
	set -- "$@" "$option"
done < "$options"

# 変更したfileだけを組み直す。sourceを消さない限り二回目以降は速い。
(cd "$source_root" && scons "-j$jobs" "$@")

# 手元のEditorですぐ試せるよう、配布と同じ形のtemplateとmanifestへ変換する。
suffix=$(sed -n 's/^extra_suffix=//p' "$options")
built=$(find "$source_root/bin" -maxdepth 1 -type f -name "*.$suffix.zip" | LC_ALL=C sort | tail -1)
test -n "$built"
. "$repo/build/distribution.lock"
export YWEB_PROFILE=$profile
export YWEB_BROTLI_QUALITY=$BROTLI_QUALITY
node "$repo/build/package_template.cjs" "$built" "$out"
