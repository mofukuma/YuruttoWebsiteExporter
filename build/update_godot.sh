#!/bin/sh
# 外部依存であるGodot公式releaseを、別のstableへ固定し直す。
# 入力はtag名だけとし、commit、archive hash、license本文は実物から取る設計。

set -eu

version=${1:-} # 固定したいGodot tag。例: 4.8-stable
if test -z "$version"; then
	echo "使い方: sh build/update_godot.sh <godot-tag>" >&2
	exit 1
fi

repo=$(cd "$(dirname "$0")/.." && pwd) # yweb project root。
lock=$repo/build/source.lock # 外部入力の固定値。
work=$repo/tmp/godot-update # 取得と展開の作業領域。
archive=$work/godot-$version.tar.xz # Godot公式source archive。
mkdir -p "$work"

# tagが指す実commitを取る。annotated tagは実体側を優先。
refs=$(git ls-remote https://github.com/godotengine/godot "refs/tags/$version" "refs/tags/$version^{}")
commit=$(printf '%s\n' "$refs" | awk '$2 ~ /\^\{\}$/ { print $1 }' | head -1)
if test -z "$commit"; then
	commit=$(printf '%s\n' "$refs" | awk '{ print $1 }' | head -1)
fi
if test -z "$commit"; then
	echo "Godot tagが見つかりません: $version" >&2
	exit 1
fi

# 公式releaseのsource archiveを取得し、その場でhashを確定する。
if test ! -f "$archive"; then
	curl -fL "https://github.com/godotengine/godot/releases/download/$version/godot-$version.tar.xz" -o "$archive.part"
	mv "$archive.part" "$archive"
fi
sha=$(shasum -a 256 "$archive" | awk '{ print $1 }')

# 配布へ同梱する通知を、その版のsourceそのものへ合わせる。
tar -xJf "$archive" -C "$work" "godot-$version/LICENSE.txt" "godot-$version/COPYRIGHT.txt"
cp "$work/godot-$version/LICENSE.txt" "$repo/LICENSES/GODOT-MIT.txt"
cp "$work/godot-$version/COPYRIGHT.txt" "$repo/LICENSES/GODOT-COPYRIGHT.txt"

# 固定値を書き戻す。他の外部入力は触らない。
awk -v version="$version" -v commit="$commit" -v sha="$sha" '
	/^GODOT_VERSION=/ { print "GODOT_VERSION=" version; next }
	/^GODOT_COMMIT=/ { print "GODOT_COMMIT=" commit; next }
	/^GODOT_ARCHIVE_SHA256=/ { print "GODOT_ARCHIVE_SHA256=" sha; next }
	{ print }
' "$lock" > "$lock.new"
mv "$lock.new" "$lock"

echo "Godotを固定しました: $version $commit"
echo "次: sh build/build_distribution.sh でエクスポートテンプレートを作り直す"
