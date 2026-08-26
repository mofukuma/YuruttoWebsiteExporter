# Web初期表示高速化の調査メモ

## 目的

初期HTMLの表示を保ったまま、WASM/PCKの取得開始と転送量を減らす。Scene準備時間は別の指標として記録する。

## 公式情報

- WebAssemblyは`instantiateStreaming`で転送とcompileを並行できる。WASMは`application/wasm`で配信する必要がある。
  - https://web.dev/articles/loading-wasm
- preloadはHTMLから重要resourceを早く発見させるために使う。
  - https://html.spec.whatwg.org/multipage/links.html#link-type-preload

## 基準値

- sampleの初期HTML表示は43ms、Godot Scene準備は1276msだった。
- 初回転送10,489,010 byteのうち、WASMは7,369,799 byte、PCKは2,775,956 byteだった。
- WASMとPCKの取得開始はHTML解析開始から約14ms、JSは約5msだった。
- 現WASMをBrotli品質6から9へ変える試算は7,369,802 byteから7,194,232 byteで、175,570 byte、2.4%減だった。圧縮時間は350msから1287msになった。

## 採用する判断

1. 内容hash付きWASMとPCKを`head`からpreloadし、JS評価前に転送を開始する。
2. full LTOは使わない。linux/amd64の固定builderをApple Silicon上で試すと、最終linkが長時間化してDockerの応答も止まるため、手元で再現しやすい配布条件に合わない。
3. Brotli品質を9へ上げる。配布生成は約1秒増えるが、利用者の初回転送を優先する。
4. 変更前後でBrotli、template、起動時間を同じsampleから比較する。

## 実測結果

- DOM WASMのBrotliは7,369,799 byteから7,194,232 byteへ175,567 byte、2.38%減った。
- DOM template ZIPは16,387,544 byteから16,211,658 byteへ175,886 byte、1.07%減った。
- sampleではWASMとPCKが`link`起点になり、開始時刻は約14msから6.4msへ7.5ms早まった。JSは6.5ms開始だった。
- `/about/`直リンクもWASM 6.5ms、PCK 6.6msで始まり、404と重複取得は0件だった。
- Scene準備はcold 1517–1548ms、warm 1313msだった。手元のHTTPに通信往復時間がない条件では、変更前のcold 1276ms、warm 1165msより短くならず、起動全体の改善は実証できなかった。
