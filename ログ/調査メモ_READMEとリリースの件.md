# READMEとリリースの調査メモ

READMEを現在の配布物に合わせ、同じcommitをGitHub Releaseとして公開しよう。

## 確認結果

- 配布ZIPには`addons/yurutto_website_exporter`が入る。開発用serverは入らない。
- DOM onlyは対応する絵と文字をHTMLとCSSで表示し、3DはCanvasとWebGLを使う。
- Browser試験はChromium、Firefox、WebKitを起動する。
- GitHub CLIは指定tagと配布fileからReleaseを作れる。workflowはmainの候補を試験した後に公開する。
- Godot公式資料ではWebAssemblyのBrotli事前圧縮が案内され、配信側の正しいheader設定が必要になる。

## 根拠

- https://cli.github.com/manual/gh_release_create
- https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
