# gdweb

Godot 4.7.1の標準Web描画を保ちながら、文字と入力だけを意味のあるHTMLへ重ねるWeb exporter実験実装。

## 特徴

- `Label`、`Button`、`LinkButton`の文字をDOMへ同期
- `LineEdit`と`TextEdit`をBrowser標準入力へ接続
- IME、focus、選択範囲、Theme変更、回転、物理移動へ追従
- 2D描画、物理、Shader、Button背景をGodot Canvasへ維持
- `LinkButton`を`a`、`Button`を`button`として出力
- ObjectID由来の安定したDOM ID
- WebAssemblyとJavaScriptのBrotli事前圧縮
- Adaptive CanvasによるBrowser全体表示
- 3Dを含むprojectの書き出し拒否

## 構成

- `build/`: Godot source差分、runtime build、Web書き出し、圧縮、配信処理
- `examples/`: 文字機能ラボと2D物理ゲーム
- `tests/`: Godot headless検査とPlaywright Browser実測
- `ログ/`: 設計、実装計画、公式資料の調査結果

## Web書き出し

前提はmacOS、Godot 4.7.1、Xcode Command Line Tools、Git、curl、uv。SConsはuvで導入。

```sh
uv tool install scons
sh build/prepare_runtime.sh
```

初回準備では固定Godot source、Emscripten 4.0.11を`tmp/`へ取得し、minimum Web templateを生成。その後にprojectを書き出し。

```sh
sh build/export_minimum.sh examples/omochi_game tmp/omochi-game/site/index.html
```

`Web` presetのtemplate pathを現在repositoryへ正規化し、CanvasをAdaptiveへ統一。成果物にはBrotli圧縮ファイル、検証用manifest、Godot・組込依存・fontのlicenseを生成。

## 対象範囲

対応下限はGodot 4.7.1。現行source lock、patch、回帰試験の実証対象は4.7.1-stable。新しいGodot releaseはsource差分と一括回帰の合格後に対応対象へ追加。

2D Web作品向け。3D、`RichTextLabel`のBBCode、任意Theme fontのDOM化は対象外。

## ライセンス

project codeは権利留保。[LICENSE](LICENSE)を参照。LINE Seed JPはSIL Open Font License 1.1。[Third-party notices](THIRD_PARTY_NOTICES.md)を参照。
