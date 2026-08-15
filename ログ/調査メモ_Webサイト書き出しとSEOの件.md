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
- [Godot EditorExportPlugin](https://docs.godotengine.org/en/4.4/classes/class_editorexportplugin.html): plugin固有のexport option追加と強制上書きに対応。
- [Godot JavaScriptBridge callbacks](https://docs.godotengine.org/en/4.4/tutorials/platform/web/javascript_bridge.html): callbackは単一Array引数を取り、JavaScriptObject参照を保持する必要。
- [Godot Autoload](https://docs.godotengine.org/en/4.0/tutorials/scripting/singletons_autoload.html): Autoloadはcurrent sceneより先にrootへ追加。初期routeはcurrent scene生成後に適用する必要。
- [Open Graph structured properties](https://ogp.me/): `og:image`へURL、secure URL、MIME、幅、高さ、代替説明を付加可能。
- [LinkedIn share image](https://www.linkedin.com/help/linkedin/answer/a521928): 共有画像は幅1200px以上、1.91:1を推奨。複数共有先へ合わせ、Auto画像は1200×630を採用。
- [MDN font-family](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-family): generic familyを末尾に置くと、取得可能なfontがない場合もBrowserが適切な代替fontを選択。

## 判断

- Browser全体表示は`html/canvas_resize_policy=2`のAdaptiveへ固定。
- 初期値はserver設定不要のHash。SEO公開時は`/scene/`形式、route別HTML、History API、nginx fallbackを推奨。
- sceneごとの静的HTMLを生成し、JavaScript非実行でもtitle、description、canonical、OGPを取得可能にする。
- Browser遷移は同じGodot instanceを維持し、scene変更時にheadと履歴だけを差分更新。
- 固定sceneは静的routeへ出力。未知routeはnginxの`try_files`でroot shellへ転送。
- per-scene scriptは一度だけ読み込み、styleはscene単位で交換。外部scriptの副作用は自動削除しない。
- sitemap、robots、JSON-LD、favicon、404、配信設定を同じJSONから生成。
- OGPは一枚の画像からOpen Graphの全画像属性とTwitter Cardへ展開。
- OGP AutoはSceneを独立processで指定frameまで描画し、変形せず中央切り抜きした1200×630 PNGへ保存。
- Theme fontと同じdirectory、basenameの`.woff2`だけをDOM fontへ対応付け。未対応時もDOMを維持し、Browserの`sans-serif`へ委ねる。
- 通常nginxの未知URIは404。生成した`try_files`設定では未知URIをroot shellへ内部転送。既知URIは静的route HTMLを直接返す。
