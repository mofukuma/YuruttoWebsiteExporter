# Webサイト書き出し実装計画

## 目的

Godot sceneをpageとして扱い、Web exportだけで検索、共有、直リンク、Browser履歴に対応する静的siteを生成。

対応下限はGodot 4.7.1。初期実証版は4.7.1-stableへ固定し、新しいreleaseはsource lockと回帰結果を追加して対応。Canvasは常にBrowser全体へ追従するAdaptive。

## 設計原則

- Godotの`SceneTree.current_scene`を表示内容の正本にする。
- JSONのscene keyとscene fileを一対一にする。
- 初期HTMLへSEO情報を静的出力し、scene遷移後だけDOM headを差分更新する。
- `/uri/`とHistory APIを標準にし、`/#uri`は限定配布向けfallbackにする。
- 既知routeごとにHTMLを生成し、OGP crawlerへJavaScript不要の情報を返す。
- 文字DOMとCanvas物理の所有境界を変えない。

## Exporter設定

`EditorExportPlatformWeb::get_export_options()`へ次の項目を追加。

| 設定 | 型 | 内容 |
|---|---|---|
| `site/enabled` | bool | site書き出しの有効化 |
| `site/metadata_source` | enum | JSON file、inline JSON |
| `site/metadata_file` | file | scene情報JSON |
| `site/metadata_json` | multiline | preset内へ保持するJSON |
| `site/base_url` | string | canonical、OGP、sitemapのorigin |
| `site/routing` | enum | History、Hash |
| `site/static_routes` | bool | route別HTML生成 |
| `site/sitemap` | bool | `sitemap.xml`生成 |
| `site/robots` | bool | `robots.txt`生成 |
| `site/server_examples` | bool | nginx設定例と配信説明の生成 |
| `site/strict_validation` | bool | 不足、重複、不正URLで書き出し停止 |

`site/enabled=false`ではsite項目を非表示。JSON fileとinline JSONは選択方式だけを表示。設定警告へJSON parse error、scene不足、URI重複、base URL不正を表示。

`html/canvas_resize_policy`は設定画面から除外し、生成configの`canvasResizePolicy`を常に`2`へ固定。CLI wrapperもpresetを`2`へ正規化。

## JSON形式

scene名をkeyにし、scene fileで同名衝突を検査。

```json
{
  "version": 1,
  "site": {
    "name": "Example Site",
    "locale": "ja_JP",
    "default_scene": "Home",
    "favicon": "res://web/favicon.svg",
    "styles": [{ "href": "/assets/site.css" }],
    "scripts": [{ "src": "/assets/site.js", "type": "module" }]
  },
  "scenes": {
    "Home": {
      "scene": "res://pages/home.tscn",
      "uri": "/",
      "title": "ホーム | Example Site",
      "description": "サイトの概要",
      "canonical": "/",
      "robots": "index,follow",
      "meta": [{ "name": "theme-color", "content": "#07101f" }],
      "og": {
        "title": "ホーム | Example Site",
        "type": "website",
        "image": "/assets/og/home.png",
        "description": "サイトの概要"
      },
      "twitter": { "card": "summary_large_image" },
      "json_ld": [{ "@context": "https://schema.org", "@type": "WebPage" }],
      "styles": [{ "href": "/assets/home.css" }],
      "scripts": [{ "src": "/assets/home.js", "type": "module" }],
      "summary": "JavaScript開始前にも表示するpage概要"
    },
    "About": {
      "scene": "res://pages/about.tscn",
      "uri": "/about/",
      "title": "概要 | Example Site",
      "description": "このサイトについて",
      "canonical": "/about/",
      "og": { "type": "website", "image": "/assets/og/about.png" }
    }
  }
}
```

global値をscene値で上書き。`canonical`、OGP URL、asset URLは`site/base_url`から絶対URL化。title、description、URI、scene fileを必須化。

## Head生成

各routeのHTMLへ次をexport時に埋め込む。

- `title`
- `meta description`、robots、theme-color、任意meta
- `link canonical`、favicon、apple-touch-icon、任意style
- Open Graph、Twitter Card
- `script type="application/ld+json"`
- global scriptとscene script
- `html lang`
- preload対象font、JavaScript、WebAssembly

値と属性をHTML escape。tag名と属性をallowlistで検証。inline scriptとstyleは明示指定時だけ許可し、Content Security Policy用hashを生成。

## Static route生成

一回のexportで次を生成。

```text
index.html
about/index.html
404.html
gdweb-site.json
gdweb-site.js
sitemap.xml
robots.txt
favicon.svg
nginx-gdweb.conf.example
```

route HTMLは同じ`.wasm`、`.pck`、JavaScriptを参照。相対path差をなくすためasset URLをsite root基準へ統一。`summary`は起動前の`main`と`noscript`へ配置し、Godot開始後に除去。画面内容と異なるcrawler専用文面は禁止。

## SceneとBrowser履歴の同期

### GodotからBrowser

1. `SceneTree.current_scene.scene_file_path`からJSON keyを取得。
2. 初回は`history.replaceState`、通常遷移は`history.pushState`。
3. `document.title`、description、canonical、OGP、Twitter、JSON-LDを差分更新。
4. scene styleを交換。scriptはIDまたはURLごとに一回だけ読み込み。
5. `gdweb:scene-leave`と`gdweb:scene-enter`を通知し、script側の後処理を可能にする。

### BrowserからGodot

1. 初期pathnameまたはhashからscene fileを決定。
2. 起動時に対応sceneへ切り替え。
3. `popstate`または`hashchange`をWeb bridgeからGodotへ通知。
4. `change_scene_to_file`をdeferred実行。
5. Browser起点の変更では`pushState`を抑止し、履歴loopを防止。

同一originの内部routeだけを制御。外部URL、download、target指定linkはBrowser標準動作。

## Routing方式

### History

推奨方式。URLは`https://example.com/about/`。既知routeには静的`about/index.html`があるため、一般的なstatic hostingでも直リンク可能。

未知routeや単一shell運用ではnginxへ次を案内。

```nginx
location / {
    try_files $uri $uri/ $uri/index.html /index.html;
}
```

`.wasm`は`application/wasm`、`.br`は元fileのContent-Typeと`Content-Encoding: br`で配信。route HTMLは短いcache、content hash付きassetは長期cache。

### Hash

URL rewrite不能な配布先向け。`https://example.com/#/about/`。検索URLと静的OGPの品質が落ちるため非推奨表示。

## SEO付属物

- route別canonical
- `sitemap.xml`
- `robots.txt`とsitemap URL
- JSON-LD
- Open GraphとTwitter Card
- faviconと複数icon size
- locale別`hreflang`
- semanticな起動前summary
- 404 pageと不明scene fallback
- content hash付きassetとcache指針
- Brotli必須配信gate

## Site構築に必要な追加提案

- Navigation用`LinkButton.uri`へ内部routeを設定し、実`a href`をcrawlerへ公開。
- page固有の主見出しを`h1`として一つだけ指定できるmetadata。
- OGP画像の寸法、容量、絶対URL検査。
- 構造化dataのpage type別template。
- accessibility用lang、landmark、focus順、skip link。
- CSP、Referrer-Policy、Permissions-Policy、X-Content-Type-Optionsの配信例。
- analyticsは同意管理後に読み込むglobal scriptとして分離。
- Search Console、Rich Results Test、共有debuggerの公開後checklist。

## 実装単位

### M1 設定と検証

- Adaptive固定
- Exporter設定追加
- JSON parser、schema version、escape、URL正規化
- scene、URI、canonical、assetの重複・不足検査

### M2 静的site生成

- default shellへのhead埋め込み
- route別HTML、404、sitemap、robots生成
- favicon、OGP、style、script copy
- Brotliとcontent hash manifest連携

### M3 runtime同期

- scene変更bridge
- title、URI、head差分更新
- `pushState`、`replaceState`、`popstate`
- HistoryとHashの切り替え
- style lifecycle、script一回読込、scene event

### M4 配信資料

- nginx設定例
- static hosting別route案内
- MIME、Brotli、cache、security header案内

### M5 一括検査

- JSON parse、escape、重複、必須値のunit test
- raw HTMLでtitle、description、canonical、OGP、JSON-LDを検査
- Playwrightで直リンク、scene遷移、戻る、進む、再読込を検査
- HistoryとHashを各一回検査
- script一回読込、style交換、DOM重複なしを検査
- DPR 1/2とdesktop/mobileでCanvasがBrowser全体に一致
- sitemap、robots、404、Brotli headerを検査
- Browser errorと残留HTTP listenerが0

## 完了条件

- Exporter設定だけでroute別静的siteを生成。
- 全Web exportで`canvasResizePolicy=2`。
- scene変更後1 frame以内にtitle、URI、metadataを更新。
- 戻る・進む・直リンクが対応sceneを表示。
- JavaScript無効でもroute固有title、description、canonical、OGPを取得可能。
- JSONの全sceneがsitemapとroute HTMLへ一度だけ出力。
- 不正JSON、重複URI、存在しないscene、不完全OGPをexport前に拒否。
- Brotli必須gate、Playwright一括試験、残留process 0。
