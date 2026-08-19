#!/bin/sh
# 固定Godot sourceとEmscriptenからminimum Web templateを再現する。
# 外部入力をhashとcommitで検証し、tmp内だけへ展開する。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # yweb project root。
. "$repo/build/source.lock"
build_root=${YWEB_BUILD_ROOT:-$repo/tmp} # Hostとcontainerを分離するtoolchain領域。
template_out=${YWEB_TEMPLATE_OUT:-$repo/tmp/minimum/template-proof} # 配布前の展開成果物。
archive=$build_root/godot-$GODOT_VERSION.tar.xz # Godot公式source archive。
source_root=$build_root/godot-minimum-source # overlay適用済みsource。
emsdk=$build_root/emsdk # 固定Emscripten SDK。
mkdir -p "$build_root"
work=$(mktemp -d "$build_root/template-source.XXXXXX") # source展開用一時領域。
trap 'rm -rf "$work"' EXIT

# sourceを作り直す必要がある入力だけを識別値にする。
# overlayは既存treeへ上書きするだけで足りるため、ここへ混ぜると差分compileが毎回捨てられる。
stamp=$(cd "$repo" && shasum -a 256 build/source.lock build/patches/web_yweb_text.patch | shasum -a 256 | awk '{print $1}')

# Godot archiveを公式releaseから取得してhashを検証する。
if test ! -f "$archive"; then
	curl -fL "https://github.com/godotengine/godot/releases/download/$GODOT_VERSION/godot-$GODOT_VERSION.tar.xz" -o "$archive.part"
	printf '%s  %s\n' "$GODOT_ARCHIVE_SHA256" "$archive.part" | shasum -a 256 -c -
	mv "$archive.part" "$archive"
fi
printf '%s  %s\n' "$GODOT_ARCHIVE_SHA256" "$archive" | shasum -a 256 -c -

# 不完全sourceまたは識別値が異なるsourceを一律退避する。
if test -e "$source_root"; then
	current=$(cat "$source_root/.yweb-source-stamp" 2>/dev/null || true)
	if test ! -f "$source_root/version.py" || test "$current" != "$stamp"; then
		mv "$source_root" "$work/stale-source"
	fi
fi
if test ! -f "$source_root/version.py"; then
	mkdir -p "$work/source"
	tar -xJf "$archive" -C "$work/source"
	mv "$work/source/godot-$GODOT_VERSION" "$source_root"
fi

# Emscripten SDKを固定commitとreleaseで準備する。
if test ! -x "$emsdk/emsdk"; then
	git clone https://github.com/emscripten-core/emsdk.git "$emsdk"
fi
git -C "$emsdk" checkout --detach "$EMSDK_COMMIT"
"$emsdk/emsdk" install "$EMSDK_VERSION"
"$emsdk/emsdk" activate "$EMSDK_VERSION"

sh "$repo/build/apply_overlay.sh" "$source_root"
printf '%s\n' "$stamp" > "$source_root/.yweb-source-stamp"
cmp "$repo/LICENSES/GODOT-MIT.txt" "$source_root/LICENSE.txt"
cmp "$repo/LICENSES/GODOT-COPYRIGHT.txt" "$source_root/COPYRIGHT.txt"
# 同じsourceから三段のlevelを順に作る。
for level in $(awk '!/^#/ && NF { print $1 }' "$repo/build/levels.options"); do
	sh "$repo/build/build_template.sh" "$level" "$source_root" "$emsdk" "$template_out/$level"
done
