# Godot正常終了の件

## 結論

正常系全体は未合格。専用Editorの初回importとN11 2D物理の場面実行、書き出し、Chromiumは合格。残る機能画面を同じ監視条件で通すまで全体合格にしない。

## 落下原因

初回filesystem走査後の終了競合。`EditorHelp`の遅延した文書再生成threadが、破棄済みfilesystemを受け取り`EditorFileSystemDirectory::get_subdir_count()`でnull参照。LLDBで次の呼出順を確認。

```text
EditorHelp::_regen_script_doc_thread
  -> EditorHelp::_reload_scripts_documentation(nullptr)
  -> EditorFileSystemDirectory::get_subdir_count()
  -> EXC_BAD_ACCESS
```

修正境界は次のとおり。

- EditorHelp終了状態を一つの`SafeFlag`で管理
- 遅延callback入口とworker再起動を終了後に拒否
- filesystem解放前にloader thread、worker threadの順で回収
- EditorFileSystemのscan threadとsource scan threadを両方回収
- 終了後の文書更新を拒否
- EditorFileSystem singletonをdestructorで解除

## 初回import実証

専用fixtureを毎回複写し、`.godot`なしから`--headless --import`を7回実行。公式CLIの取込完了待ちを使い、`--editor --quit`へ依存しない。

| 項目 | 結果 |
|---|---:|
| 反復 | 7 / 7成功 |
| exit code | 全回0 |
| signal | 全回なし |
| `ERROR`・crash文言 | 0件 |
| 所有PIDのmacOS crash report | 0件 |
| 残留process | 0件 |
| `.godot`生成 | 全回あり |

検査binary SHA-256は`150d7ce658b3969d5600ef322e78c4dc85c35410717af461ea53ee3aae868930`。証跡は`.tmp/gdweb/normal-matrix/n11-fresh7-sxUiUh/result.json`。

Godot公式CLIも`--import`を「取込完了を待って終了」と定義。`--quit`の初回import不安定性は本家issueでも報告済み。

- [Godot issue #77508](https://github.com/godotengine/godot/issues/77508)
- [Godot issue #69511](https://github.com/godotengine/godot/issues/69511)

## 現在の正常系判定

| 経路 | 判定 |
|---|---|
| fresh Editor import | 合格 |
| GDScript場面実行 | N09、N11、I02で合格。他画面は未実証 |
| 2D物理 | native 7回、gdweb書き出し、Chromiumが完全一致 |
| 画像・Canvas 2D | N01、N02、I01、I02で合格。他画面は未実証 |
| 音声 | N12、I02で開始、終了、finishedが合格 |
| `--export-release gdweb` | N09、N11、I02で合格。他画面は未実証 |
| 書き出しHTMLのChromium実行 | N09、N11、I02で合格。他画面は未実証 |
| DOM GUI・IME・Tab | N09の合成composition、I01、I02のTabと操作が合格。実OS IME候補操作は未実証 |

## 正常終了を守る規則

- 正常系だけを先に実行
- エラーfixtureは正常15画面の完了まで実行対象外
- Playwrightのconsole errorとpage errorを合否判定
- 各commandに時間上限を設定
- browser、page、HTTP serverのclose完了を待機
- DiagnosticReportsを所有PID、起動時刻、実行ファイルの絶対pathで照合
- 子孫processと専用portの残留0件を確認
- exit codeだけでなくsignal、異常文言、crash報告を確認

N11のthreads無効runtimeでは物理group taskの所有Groupが未解放だったため、終了時にPagedAllocatorエラーを検出。呼出thread上の同期完了を確認後、待機APIが所有Groupを回収するよう修正。N11の再検査はconsole error、page error、Godot `ERROR`、残留processすべて0件。
