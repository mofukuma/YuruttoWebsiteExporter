# 配布runtimeビルド 実装計画

## 目的

Godot版と独自機能から生成されるWeb runtimeを、固定環境で再現し、addonが対応版と内容を検証できる配布構成。

## 入力

- `build/source.lock`：Godot、Emscripten、source archive。
- `build/distribution.lock`：Docker、Node.js、SCons、再現timestamp。
- `build/runtime.options`：SCons build option。
- `build/patches/`と`build/overlay/`：独自DOM機能。

## build

1. Linux amd64 Docker imageをdigestで固定。
2. 検証済みGodot source archiveを展開。
3. 固定Emscriptenを準備。
4. patchとoverlayを適用。
5. `runtime.options`だけをSConsへ渡してrelease templateを生成。
6. raw runtimeへBrotli quality 6を生成。
7. 全entryのmtimeと順序を固定してZIP化。
8. template、入力hash、toolchain、featureを`runtime.json`へ記録。

## Exporter検証

- Editorのmajor、minor、patch、status、commitをmanifestと照合。
- template file名、SHA-256、byte数を照合。
- 不一致時はExport設定画面へ再buildまたは対応addon導入を案内。
- platform codeへGodot versionを直書きせず、manifestを正本とする。

## Web font

- runtimeは一種類。
- ONは対応WOFF2とfont mapを追加。
- OFFまたはfileなしはBrowser標準font。
- ON、OFF、fileなしの3成果物でJS、WASM、各Brotli hashが完全一致。
- WOFF2へ追加のHTTP Brotliを生成しない。

## 自動化

- `build/build_distribution.sh`でDocker buildとruntime生成を一括実行。
- GitHub Actionsの手動workflowで配布artifactを生成。
- `tests/runtime_distribution.cjs`でmanifest、lock、ZIP、raw、Brotliを完全照合。
- `tests/webfont.cjs`でruntime一種類と外部font差分を検証。

## 完了条件

- 配布runtimeの全入力と出力hashを追跡可能。
- Godot版またはcommit不一致をExport前に拒否。
- 同じ固定環境の連続buildで同一template SHA-256。
- addon利用時は従来どおりGodot 4.7.1だけでExport可能。
- Web font有無による不要なruntime二重配布なし。
