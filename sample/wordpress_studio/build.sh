#!/bin/sh
# addon導入とDOM only書き出しを一つのcommandで行う。
# 作例の場所に依存せず、再現可能な公開物を作る設計。

set -eu

root=$(cd "$(dirname "$0")" && pwd) # 作例の絶対path。
sh "$root/../../build/export_minimum.sh" "$root" "$root/output/index.html"
