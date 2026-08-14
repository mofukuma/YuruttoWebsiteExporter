# 調査メモ Godot本家Web出力の件

Godot 4.7.1のWeb出力が重くなる構造と、gdwebで再利用できる境界の確認。
調査日: 2026-08-12

## 同期物

- 場所: `.tmp/godot-source/`
- upstream: [godotengine/godot](https://github.com/godotengine/godot.git)
- tag: `4.7.1-stable`
- commit: `a13da4feb8d8aefc283c3763d33a2f170a18d541`
- 方式: `--depth=1 --filter=blob:none --sparse`
- 対象: `platform/web`、`modules/gdscript`、`scene/2d`、`scene/gui`、`servers/rendering`、`core/config`、`core/io`、`core/object`、`main`、`editor`、`misc`
- 使用量: 約88MiB

空き容量を守るため、履歴と3D資産を除いた部分同期。実装調査に必要な本家コードはローカル検索可能。

## 確認結果

### 1. Web版の実体

Web向けビルドはEmscriptenを使う`wasm32`。既定初期メモリー32MiB、Wasm stack 5MiB、サイズ優先`-Os`。[本家detect.py](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/detect.py#L38-L94)

書き出し物は少なくともエンジン`.wasm`とプロジェクト`.pck`。書き出し器自身も両方のサイズを読んで進捗表示へ渡す構造。[本家export_plugin.cpp](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/export/export_plugin.cpp#L525-L561)

公式文書も`.wasm`をエンジン、`.pck`をゲーム本体として説明。カスタムshellでも通常はWasm初期化とPCK先読込を並行実行。[Godot Custom HTML shell](https://docs.godotengine.org/en/latest/tutorials/platform/web/customizing_html5_shell.html)

判断。毎回の大きな初期ロードは描画だけの問題ではない。共通エンジンWasmとPCKの一括取得が構造上の要因。

### 2. OpenGLを切るだけでは表示不能

Webの`DisplayServer`が公開する描画ドライバーは`opengl3`だけ。[本家display_server_web.cpp](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/display_server_web.cpp#L1004-L1010)

初期化時にWebGL 2 contextを作り、成功時は`RasterizerGLES3`、失敗時またはGLES3無効時は`RasterizerDummy`。[本家display_server_web.cpp](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/display_server_web.cpp#L1117-L1162)

トップのビルド設定には`opengl3`無効化があるが、無効化後にCanvas 2DやDOMの代替描画は存在しない。[本家SConstruct](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/SConstruct#L189-L203)

判断。`opengl3=no`は必要だが十分ではない。専用の描画命令生成とJavaScript側DOM・Canvas 2D実装が必要。

### 3. GDScriptは直接Wasm化されない

本家READMEが示す処理段階はTokenizer、Parser、Analyzer、Compiler、VM。既定の書き出し物はEditorで生成した圧縮binary tokenであり、Web側でparse、analyze、compileしてVMで実行。[本家GDScript README](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/modules/gdscript/README.md#L19-L27)

Compilerは`GDScriptByteCodeGenerator`でVM用バイトコードを生成。[本家GDScript README](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/modules/gdscript/README.md#L86-L96)

つまりWasmなのはC++製エンジンとGDScript VM。`.gd`が直接Wasm関数になるわけではない。

判断。まず本家のbinary token、Parser、Analyzer、Compiler、VMを限定Wasmへ残し、互換性を優先。解析器の削除は容量実測が基準を超えた場合だけ再評価。

### 4. 本家バイトコードのそのまま保存は不向き

本家Compilerは`GDScriptFunction`や実行時クラス情報を組み立てる。型が確定した呼び出しには関数ポインターやGDScript関数オブジェクトも保持。[本家GDScript README](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/modules/gdscript/README.md#L86-L94)

公開された永続バイトコード仕様ではないため、そのままWebへ直列化する方式は本家内部構造への強い依存。

判断。本家実行形式は永続形式にできないため、初期版で事前compile済み形式を新設しない。binary tokenを本家実行系へ渡す。

### 5. 再利用できる境界

- Godot Editorの場面・資産編集
- GDScript Tokenizer、Parser、Analyzer
- Transform2D、Vector2、Colorなどの意味
- SceneTreeの更新順とsignalの試験基準
- Web側の入力、音声、fetch実装の考え方
- `disable_3d`、モジュール除外、LTOなどのビルド知見

### 6. 書き出し器はC++ moduleが必要

`GDScriptParser`と`GDScriptAnalyzer`は本家内部のC++クラス。通常のEditorプラグインへ公開されたAPIではない。[本家GDScriptParser](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/modules/gdscript/gdscript_parser.h) / [本家GDScriptAnalyzer](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/modules/gdscript/gdscript_analyzer.h)

判断。gdweb書き出し器と変換器は`modules/gdweb`相当のC++ moduleとしてGodot 4.7.1へ組み込み、専用Editorをビルド。Editor画面とheadless CLIは同じ変換処理を呼ぶ構成。

### 7. 再利用しない部分

- `drivers/gles3`
- `DisplayServerWeb`のWebGL context生成分岐
- 単一PCKの初期先読込
- 互換維持用のdeprecated API

再利用する部分は、RenderingServerの2D描画列、GLES無効時のDisplayServerWeb、本家GDScriptのParser、Analyzer、Compiler、VM。

## 結論

本家Web templateを極端に限定する方式を第一候補とする。`opengl3=no`のDummy描画器をCanvas 2D描画器へ置換し、DOM表示アダプターを追加。SceneTree、Resource、GDScript実行系は本家を使用。

独自小型VMは、限定Wasmの容量と起動時間が基準を超えた場合だけ比較する後段案。
