# 実2D Web書き出し経路の件

## 結論

Godot 4.7.1本家の`EditorExportPlatform`と`save_pack()`を使い、専用`gdweb` presetから静的HTML、作品PCK、限定Godot JS・Wasmを一回のheadless commandで生成可能。

生成物をChromiumで起動し、本家PCK内のPackedSceneとGDScript、Canvas 2D描画、静的DOM接続、Button signal、Label更新を確認。要求contextは`2d`だけ。Node3Dはpack生成前に出力失敗。

## 実装境界

- 所在: `.tmp/godot-source/modules/gdweb`
- 登録: Editor初期化時に`EditorExport`へ専用platformを一回追加
- 作品データ: 本家`EditorExportPlatform::save_pack()`と選択sceneの推移的依存
- 実行template: `template/source_dir`で指定した事前build済み限定JS・Wasm
- 先行表示: main sceneの採用Control 24型から意味を持つ静的DOMを生成
- 検査: runtimeと同じexact native型の`Node`、`Node2D`、採用Control 24型だけを許可
- 警告: 採用GUI型の対応不能値。node path、property、固定fallbackを出力
- 拒否: 3D、Shader資源、GPU系token、動的`load`、実行時directory走査、JavaScriptBridge、対応外Canvas API

書き出し器はEditor専用module。Web runtime buildへmoduleを含めず、既存Web platformの出力処理も変更しない構成。

## 実行結果

Godot Editor build。

```text
scons platform=macos target=editor arch=arm64 vulkan=no angle=no module_gdweb_enabled=yes -j8
scons: done building targets.
Godot 4.7.1.stable.custom_build.a13da4feb
```

実書き出し。

```text
godot --headless --path <project> --export-release gdweb <absolute-output>/index.html
savepack: greeting.gdc, main.gdc, main.scn, project.binary
exit 0
```

生成容量。

| file | byte数 |
|---|---:|
| `index.html` | 10,808 B |
| `index.pck` | 7,328 B |
| `index.js` | 202,699 B |
| `index.wasm` | 12,655,030 B |
| `index.font.woff2` | 64,100 B |
| audio worklet二点 | 10,271 B |

Chromium実行結果。

```json
{"contexts":["2d"],"requests":["/","/index.js","/index.wasm","/index.pck","/index.font.woff2"],"status":"export click","canvas":[500,280]}
```

同一入力から二回書き出し、HTML、PCK、JS、Wasm、font、workletのSHA-256が全件一致。両書き出しと専用Editorの`--headless --editor --quit`は終了code 0、ERROR・WARNING・crash 0。

Node3D、全資産filter、CanvasItemMaterial fixtureはpack生成前に終了code 1。到達不能な`GDWEB_UNREACHED_SENTINEL`はPCKに不在。`preload`先の`greeting.gdc`はPCKに存在。

採用GUI型の対応不能値は書き出しを止めない。Labelのellipsis、LineEditの`max_length`、HSliderのtick、Panelのborder、危険なLink URIを同時に指定し、終了code 0と5警告を確認。各警告は`scene.node.property`と固定fallbackを含む。生成HTMLと実行時DOMのLink URIは`#`。型、Resource、API自体がruntimeにない場合は表示欠落を防ぐためエラーを維持。`draw_string` fixtureは終了code 1、出力なし。

```text
res://main.tscn: unsupported API or resource token: Node3D
Project export for preset "gdweb" failed.
exit 1
```

## 現在の不足

- 遅延scene・asset用の複数PCKとmanifestは未実装
- API検査はGDScript token単位。完全な構文木に基づく意味解析は未実装
- templateは12.66 MB raw、Brotli後2.50 MB。圧縮配信と共有cacheを前提

この実証は初期sceneの実export経路、固定許可表、到達依存PCKの成立確認。遅延分割の完了判定ではない。

## 実証物

- `.tmp/gdweb/export-proof/project`
- `.tmp/gdweb/export-proof/invalid`
- `.tmp/gdweb/export-proof/out`
- `.tmp/gdweb/export-proof/test.cjs`

## 本家で確認した契約

- `.tmp/godot-source/editor/export/editor_export_platform.h`
- `.tmp/godot-source/editor/export/editor_export_platform.cpp`
- `.tmp/godot-source/editor/export/editor_export.cpp`
- `.tmp/godot-source/editor/editor_node.cpp`
- `.tmp/godot-source/platform/web/export/export_plugin.cpp`
