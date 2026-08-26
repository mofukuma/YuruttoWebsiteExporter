#!/bin/sh
# addon導入とDOM only書き出しを一つのcommandで行う。

set -eu

root=$(cd "$(dirname "$0")" && pwd) # 作例の絶対path。
sh "$root/../../build/export_minimum.sh" "$root" "$root/output/index.html"
