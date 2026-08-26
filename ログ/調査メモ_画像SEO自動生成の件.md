# 画像SEO自動生成の調査メモ

## 目的

Godotへ描く主要画像を、検索エンジンが取得できる初期HTMLにも安全に出す方法を決める。

## 公式情報

- Googleは画像を見つけられるHTMLと、内容を説明するaltを推奨している。`og:image`や構造化データの画像も、pageを代表する取得可能なURLである必要がある。
  - https://developers.google.com/search/docs/appearance/google-images
- JavaScript実行前のHTMLに内容を持つ事前生成は、利用者とcrawlerの待ち時間を減らせる。
  - https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- 遅延読込は操作を待たず、表示領域へ入った時点で取得できる方式が必要になる。HTML標準の`loading="lazy"`を使える。
  - https://developers.google.com/search/docs/crawling-indexing/javascript/lazy-loading

## 採用する判断

1. 3フレーム目で表示中の`TextureRect`、`NinePatchRect`、`Sprite2D`、`AnimatedSprite2D`、`Sprite3D`、`AnimatedSprite3D`を候補にする。親を含む実効alphaが0の画像は除外する。
2. `Background`、`Icon`、`Mask`など装飾を示す名前は検索用HTMLへ出さない。
   個別に除外する場合は`yweb_seo_image=false` metadataを使う。
3. altは`yweb_alt` metadata、対応するCaption系Label、画像file名、親Node名の順で決める。複数Captionは名前の共通語を優先し、次にツリー上の距離と後続位置で対応付ける。
4. 元画像を専用directoryへ複製し、内容SHA-256をfile名へ付ける。Scene間で同じ画像は共有する。
5. page内の先頭画像は`loading="eager"`と`fetchpriority="high"`、残りは`loading="lazy"`とする。
6. source pathを持たない実行時生成textureは公開fileを作れないため対象外にする。
7. Atlas、Spriteのregion、複数frameのspritesheetは元画像全体と表示範囲が一致しないため、誤った画像を公開せず対象外にする。
8. DOMは画像要素を初期文書へ直接置き、Godotの配置階層は複製しない。
