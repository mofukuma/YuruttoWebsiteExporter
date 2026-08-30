#!/bin/sh
# 書き出し済み作例をBrotli対応の静的serverで試す。
# 公開前のBrowser確認を本番に近いheaderと経路で行う設計。

set -eu

root=$(cd "$(dirname "$0")" && pwd) # 作例の絶対path。
node "$root/../../build/serve_web.cjs" "$root/output" "${1:-4173}"
