# 調査メモ 限定Godotエンジンの件

Godot本体を機能限定して事前ビルドする方式の効果と、gdwebへ採用できる境界の確認。
調査日: 2026-08-12

## 結論

限定Godotエンジンを先に作る方式を第一候補とする。

本家のSceneTree、Node、Resource、GDScript VMを残し、3D、物理、ネットワーク、不要形式、GLESをビルドから除外。空のDummy描画器をDOM・Canvas 2D用の描画器へ差し替える。独自GDScript VMは先に作らず、限定版の容量と起動時間が基準を満たさない場合だけ再検討。

## 指定記事の確認

[Godot Web エクスポートの index.wasm 容量削減メモ](https://fujiyamahanbun.hatenablog.com/entry/2026/01/16/192038)は、Godot 4.5の機能検出から`.gdbuild`を生成し、3Dを手動で外して次を実行。

```sh
scons platform=web target=template_release threads=no build_profile=<name>.gdbuild
```

記事の実測は`index.wasm`が約37MBから約19MB。未圧縮値で約49%削減。Brotliは試行の記述だけで、圧縮後サイズ、配信設定、起動時間の再現値なし。

判断。

- 機能限定ビルドの効果を示す有効な実測
- 19MBは通過点。3D削除と自動検出だけではgdwebの最小構成ではない
- 記事のビルドは本家Web描画を残すため、WebGL 2を使う
- gdwebでは同じ入口を使い、GLESと不要moduleも除外する必要

## 本家が用意する削減手段

[公式のサイズ最適化文書](https://docs.godotengine.org/en/stable/engine_details/development/compiling/optimizing_for_size.html)で確認できる手段。

- Web既定の`optimize=size`
- Godot 4.5以降の`optimize=size_extra`
- `lto=full`
- `debug_symbols=no`
- `build_profile=<file>.gdbuild`
- `disable_3d=yes`
- `disable_advanced_gui=yes`
- `disable_physics_2d=yes`
- 高機能文字組み、画像形式、音声形式、通信などのmodule除外
- 配信時のBrotliまたはgzip

公式文書の目安では、3D削除だけで約15%。機能検出は中から大、LTOとサイズ最適化も大きな削減候補。値は加算できないため、同じ基準作品から一つずつ変更して計測する。

`.gdbuild`は`disabled_build_options`と`disabled_classes`を持つJSON。本家`SConstruct`はその値をビルド環境へ反映し、無効クラス一覧を生成する。

- [SConstructのbuild profile読込](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/SConstruct#L645-L659)
- [公式のCompilation Configuration Editor](https://docs.godotengine.org/en/stable/tutorials/editor/using_engine_compilation_configuration_editor.html)

自動検出は、実行時生成スクリプト、Expression、GDExtension、外部PCKの利用を検出できない。gdwebは自動検出を製品profileの正本にせず、対応機能の固定許可表を使用。遅延PCKも書き出し時に全内容を検査し、manifest外のPCKは対象外。

## OpenGLなしで動かす入口

本家Web版は`GLES3_ENABLED`時だけWebGL 2 contextを生成。`opengl3=no`なら`RasterizerDummy`を選ぶ。

- [Web DisplayServerの分岐](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/display_server_web.cpp#L1117-L1162)
- [WebGL用ビルドフラグ](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/detect.py#L255-L266)

ただし`opengl3=no`だけでは、project側の既定名`gl_compatibility`と`opengl3`が残り得る。gdweb buildではWeb DisplayServerが対応driverとして`dummy`だけを返し、project起動設定も`rendering_method=dummy`、`rendering_driver=dummy`へ固定。`GDWEB_2D_ENABLED`時だけDummyの代わりにgdweb描画器を選ぶ。これで名前、選択、実体の全経路からGLESを排除。

さらに本家WebのJavaScriptは、C++の`opengl3`設定とは別にWebGLコードを常時含む。

- `features.js`が起動前に`getContext('webgl2')`で必須機能を検査
- `platform/web/SCsub`が`library_godot_webgl2.js`とGL patchを常時登録
- `library_godot_display.js`がEmscriptenの`$GL`へ依存し、WebGL検査とcontext lost処理を保持

参照。

- [features.js](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/js/engine/features.js#L1-L105)
- [Web SCsub](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/SCsub#L36-L54)
- [library_godot_display.js](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/js/libs/library_godot_display.js#L232-L313)

判断。`GDWEB_2D_ENABLED`のビルド分岐でWebGL library、extern、patchを登録せず、機能検査と画面操作をCanvas 2D専用JSへ置換。C++とJavaScriptの両方を成果物検査。

Dummyの`RasterizerCanvasDummy::canvas_render_items()`は空。Godot側では、カリングと並び替え後の2D描画項目がこの一関数へ渡る。

- [RasterizerCanvasDummy](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/servers/rendering/dummy/rasterizer_canvas_dummy.h#L35-L61)
- [RendererCanvasRenderの境界](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/servers/rendering/renderer_canvas_render.h#L506-L553)

画像もDummy texture storageがdecode済み`Ref<Image>`を保持可能。ただしブラウザーがdecodeしたImageBitmapやURLとの対応はない。初期版は一画像形式の本家decoderを残し、`TextureStorageGDWeb`がRGBAをJavaScriptへ一度だけ渡して画像handleをRIDへ対応付け。browser decodeによるdecoder削除は実測後の別判断。

1. `RasterizerGDWeb`を小さな`RendererCompositor`として追加し、Dummy storageを再利用
2. `RasterizerCanvasGDWeb`で対応する矩形、画像、多角形、変換命令だけを列挙
3. Emscripten境界へ一括命令列を渡し、JavaScriptでCanvas 2D描画
4. DOM対象nodeは別の表示アダプターで安定IDと差分を渡す
5. 未対応描画命令は警告ではなく書き出しエラー

これはRenderingServer全体の再実装ではない。SceneTree、2Dカリング、描画順、GDScript実行を本家に残したまま、最後の描画だけ置換する方式。

## 遅延資産の接続

本家Engine JavaScriptは起動後の`copyToFS(path, buffer)`を公開済み。gdwebは遅延単位ごとに生成した小さいPCKをfetchし、hash確認後にEmscripten FSへ配置。C++側で`ProjectSettings::load_resource_pack(path, false)`を呼び、上書きなしで追記mountしてからResourceLoaderを開始。

- [Engine.copyToFS](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/platform/web/js/engine/engine.js#L212-L223)
- [ProjectSettings::load_resource_pack](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/core/config/project_settings.cpp#L581-L598)

任意の外部PCKは許可しない。書き出し器の固定manifestにあるhash付きPCKだけを対象とし、path衝突とhash不一致をmount前に拒否。

Godot 4.7.1にはpack単位のunmount APIがない。mount後にResourceLoaderが失敗した場合はPCKを削除せず、groupを失敗状態へ固定して同じsessionで再試行しない。完全rollback用の独自unmountは初期版で作らない方針。

## 音声の接続

初期版は本家`AudioDriverWeb`と対応形式一つのdecoderを残す。AudioStreamPlayerからWeb Audioまでの本家契約を維持。HTMLAudioElementへ切り替えるには専用AudioStreamPlaybackとvolume、seek、終了通知の橋渡しが必要なため、初期版へ混在させない。

## GDScriptの扱い

本家Web出力は`.gd`を直接Wasm命令へ変換しない。Editorは既定でGDScriptを圧縮済みbinary tokenへ変え、Web側の本家Parser、Analyzer、Compiler、VMが実行形式を作る。

- [binary tokenの書き出し](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/modules/gdscript/register_types.cpp#L83-L117)
- [実行時parse、analyze、compile](https://github.com/godotengine/godot/blob/a13da4feb8d8aefc283c3763d33a2f170a18d541/modules/gdscript/gdscript.cpp#L811-L850)

よってGDScript互換を保つ最小リスクの第一段階は、本家GDScript moduleを丸ごと残すこと。Parser削除を先に行うと、実行形式の直列化とloaderを新設する必要が生じ、独自VMに近い開発量となる。

## 事前ビルドの単位

記事のproject専用templateは小さくできる一方、作品ごとにWasmの内容hashが変わる。gdwebは対応機能を極端に限定した共通templateをリリースごとに一度だけ作る。

- 同じgdweb版の作品で同一Wasm
- hash付き共通URLから長期cache
- 静的HTMLはWasmを待たず表示
- 操作不要のページはWasmを取得しない
- 作品差分は小さい初期packと遅延資産へ分離

共通templateが大きすぎる場合だけ、さらに小さい`dom`と`canvas2d`の二種類へ分割。projectごとの自動ビルドは再現性、配布cache、待ち時間を悪化させるため初期案にしない。

## 実測結果と残る計測

同一の最小作品と2D基準作品で次を比較。

| 構成 | 目的 |
|---|---|
| 本家4.7.1 release | 基準値 |
| 記事相当の自動`.gdbuild` | 記事の削減幅を再確認 |
| 固定許可表、GLESなし、Dummy | エンジン実行系の下限確認 |
| 固定許可表、gdweb描画器 | 製品候補の実測 |

Godot 4.7.1とEmscripten 4.0.11を`.tmp/`へ固定し、Canvas 2D縦切りとDOM GUI縦切りを実ビルド。親子DOM、静的HTML接続、Button契約を含む最新版はWasm 11,971,171 B、gzip 3,334,833 B、Brotli 2,261,988 B。生成JavaScriptは193,844 B、gzip 50,278 B、Brotli 44,365 B。

文字metrics、RGBA画像、z-index、font同期、安全なLink URI fallbackを統合した実証版はWasm 12,655,030 B、Brotli 2,501,444 B。生成JavaScriptは202,699 B、Brotli 46,305 B。前段の値は各機能差分を追う基準として保持。

Chromium 145を`--disable-gpu`で起動し、GDScript、Node2D矩形、DOMのControl・Label・Button、Button clickからGDScript signalを確認。Canvas context要求は`2d`だけ。詳細は[GUIのDOM変換とGPU完全排除実証](調査メモ_GUIのDOM変換とGPU完全排除実証の件.md)。

本家releaseと最終gdwebを同じtoolchainで比較済み。Chromiumのcold・warm各7回、CPU 4倍低速化、20 Mbit/s、40 ms遅延で、初回描画はcold 55.26%、warm 54.23%短縮。記事相当profile単独の起動時間は未測定。詳細は[初期表示速度比較](調査メモ_初期表示速度比較の件.md)。

## 採否

限定Godot方式を採用。

独自VMへ進む条件は、GLES、不要module、不要classを除いた製品候補でも、Brotli後の容量または操作可能時刻が合意した上限を超える場合だけ。先に上流互換を捨てる判断なし。
