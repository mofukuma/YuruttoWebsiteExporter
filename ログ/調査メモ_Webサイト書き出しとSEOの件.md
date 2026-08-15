# Webサイト書き出しとSEOの調査

## 目的

Godot sceneを検索、共有、Browser履歴に対応するWeb pageとして書き出す構成。

## 公式根拠

- [Godot Custom HTML page](https://docs.godotengine.org/en/latest/tutorials/platform/web/customizing_html5_shell.html): `$GODOT_HEAD_INCLUDE`でheadを追加可能。`canvasResizePolicy`でCanvas resizeを指定可能。
- [Godot Web exporter](https://docs.godotengine.org/en/4.7/classes/class_editorexportplatformweb.html): AdaptiveはCanvasをWeb pageへ自動適合する設定。
- [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics): JavaScriptによるtitle、description、canonical、JSON-LD更新に対応。fragmentではなくHistory APIを推奨。
- [Google Dynamic Rendering](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering): crawler別の動的描画より静的描画、server-side rendering、hydrationを推奨。
- [MDN History API](https://developer.mozilla.org/en-US/docs/Web/API/History_API/Working_with_the_History_API): `pushState`は同一originのURLを履歴へ追加し、戻る・進むは`popstate`で受信。
- [Open Graph protocol](https://ogp.me/): page共有には`og:title`、`og:type`、`og:image`、`og:url`を基本情報として使用。
- [Sitemaps protocol](https://www.sitemaps.org/protocol.html): site内の正規URLをXMLで列挙し、更新情報をcrawlerへ通知可能。
- [nginx try_files](https://nginx.org/en/docs/http/ngx_http_core_module.html#try_files): 実fileを順番に確認し、見つからないrequestを指定URIへ内部転送可能。

## 判断

- Browser全体表示は`html/canvas_resize_policy=2`のAdaptiveへ固定。
- 公開URLは`/scene/`形式とHistory APIを標準。hash形式はserver設定不能な配布先だけのfallback。
- sceneごとの静的HTMLを生成し、JavaScript非実行でもtitle、description、canonical、OGPを取得可能にする。
- Browser遷移は同じGodot instanceを維持し、scene変更時にheadと履歴だけを差分更新。
- 固定sceneは静的routeへ出力。未知routeはnginxの`try_files`でroot shellへ転送。
- per-scene scriptは一度だけ読み込み、styleはscene単位で交換。外部scriptの副作用は自動削除しない。
- sitemap、robots、JSON-LD、favicon、404、配信設定を同じJSONから生成。
