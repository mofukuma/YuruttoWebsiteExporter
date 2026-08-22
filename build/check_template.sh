#!/bin/sh
# 選んだ書き出しレベルの開発テンプレートと実画面検査を続けて行う。
# addon配布物を変えず、関係するGodotビルドと一つのBrowser検査へ絞る設計。

set -eu

repo=$(cd "$(dirname "$0")/.." && pwd) # yweb project root。
level=${1:-dom} # 検査するdom、2d、3dのいずれか。

# レベルごとに描画境界を実際に通る検査を一つ選ぶ。
case $level in
	dom) test_file=dom_only_match.cjs ;;
	2d) test_file=rotate_label.cjs ;;
	3d) test_file=scene_3d.cjs ;;
	*) printf '書き出しlevelが不正: %s\n' "$level" >&2; exit 2 ;;
esac

sh "$repo/build/dev_template.sh" "$level"
template=$repo/tmp/dev-template/$level/yweb-$level-template.zip # 今作った未配布template。
YWEB_LEVEL=$level YWEB_TEMPLATE=$template node "$repo/tests/$test_file"
