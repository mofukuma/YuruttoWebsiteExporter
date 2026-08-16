# Node不要ゆるっとWebの調査

## 結論

Export時の処理はGodot 4.7.1のGDScriptだけで実現可能。3D検査、設定読込、SEO HTML、route、asset、Web font、配信設定をEditor内で直接生成する構成。

Brotli圧縮だけはGodot 4.7.1で生成不可。`FileAccess.COMPRESSION_BROTLI`は展開専用であり、固定Web runtimeのJavaScriptとWebAssemblyをアドオン作成時に圧縮してZIPへ同梱する方式が確実。[Godot FileAccess](https://docs.godotengine.org/en/stable/classes/class_fileaccess.html#enum-fileaccess-compressionmode)

## Export時の処理境界

- project検査：GDScriptの文字検索と`ResourceLoader`によるbinary resource走査。
- site生成：`EditorExportPreset`の値、`ProjectSettings`、`yuruttoweb-site.json`からGDScriptで生成。
- Browser同期：小さなJavaScriptをHTMLへ直接埋込。
- Brotli：固定runtimeの`.br`を内蔵ZIPから展開。project assetは隣接`.br`がある場合だけ同時配置し、ない場合は通常fileを配信。
- 配信：`Accept-Encoding`に応じて`.br`または通常fileを選ぶnginx設定。

## Brotliの根拠

Godot 4.7.1 sourceの`core/io/compression.cpp`はBrotli圧縮要求をエラーとし、展開だけを実装。Export中にWASMを再圧縮する方法は標準APIに存在しない。

Web runtimeはアドオン内で固定されるため、同じhashのJavaScriptとWebAssemblyには同じ`.br`を対応付け可能。Export先のbasename変更はraw fileと`.br`へ同時適用可能。

## 安全性

- 外部process起動なし。
- project外pathの読込禁止。
- 3D、C#、GDExtensionをExport前に拒否。
- 内蔵runtime ZIPをSHA-256で検証。
- HTML属性を許可listへ限定。
- JSON中の`<`をescapeし、script終了文字列の混入を防止。
- ZIP内の絶対pathと親directory参照を拒否。

## 配布物

利用者に必要なものはGodot 4.7.1と`addons/yuruttoweb_site`だけ。Node.js、公式Export template、repository内build scriptを利用時の前提にしない構成。
