#!/bin/sh
# 素のGodot Web templateをtmpへ用意する。
# 見た目と負荷を「ゆるっとWeb版」と比べる検査は、比べる相手にこれを使う。
# Godotの導入先へは入れない。手元のGodotの設定を書き換えずに済ませる設計。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # yweb project root。
. "$repo/build/source.lock"
out=$repo/tmp/godot-templates # 検査が直に指す置き場。
archive=$out/templates.tpz # 公式配布の全platform一括package。
version=${GODOT_VERSION%-*} # 4.7.1-stable から 4.7.1 を取り出す。
label=${GODOT_VERSION#*-} # stable のような版の種別。

mkdir -p "$out"

# 一括packageを一度だけ落とす。中身は公式releaseそのまま。
if test ! -f "$archive"; then
	curl -fL "https://github.com/godotengine/godot/releases/download/$GODOT_VERSION/Godot_v${version}-${label}_export_templates.tpz" -o "$archive.part"
	mv "$archive.part" "$archive"
fi

# 検査が使うWeb分を取り出す。threadsの有無でGodotが選ぶ側が変わるため両方置く。
unzip -o -j -q "$archive" 'templates/web_nothreads_release.zip' 'templates/web_release.zip' -d "$out"

printf 'Godot %s の素のWeb templateを用意した: %s\n' "$GODOT_VERSION" "$out"
