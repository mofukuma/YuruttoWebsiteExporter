# 公開成果物の安全な切替とScene採取

エクスポート失敗中も公開siteを壊さず、複数Sceneの初期文書を短時間で採取するために公式仕様を確認した。

## 確認した仕様

- [Godot OS](https://docs.godotengine.org/en/stable/classes/class_os.html) は `create_process()` が独立processのIDを返し、`is_process_running()`、`get_process_exit_code()`、`kill()`で監視と回収ができるとしている。
- [POSIX rename](https://pubs.opengroup.org/onlinepubs/9799919799/functions/rename.html) は同一file system内のrenameを原子的な操作として定義している。失敗時は置換先を変えない。
- [POSIX directory operations](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html) はdirectory entryの生成、削除、renameを原子的かつ直列化可能な操作としている。
- [Microsoft ReplaceFile](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilea) は、既存fileの退避、置換、旧file削除を一つのAPIで行い、元の属性とACLも維持すると説明している。

## 採用する構成

- 公開directoryと重ならないtmpで全成果物を完成させる。project内tmpが公開先に含まれる場合はOSのtmpへ退避し、自己再帰を避ける。
- 公開tree内のsymlinkは辿らず、組立開始時に不正pathとして止める。循環と公開先外への操作を防ぐ。
- file置換は一時名へcopyしてから、POSIXではrename、Windowsでは一回のPowerShellから`System.IO.File.Replace`で切り替える。Windows側は例外を停止扱いにして終了値1を返す。新規fileは外部processを使わない。新しいhash資源、設定、HTMLの順に反映し、旧hash資源と削除pageは最後に回収する。
- 反映対象は事前に全退避し、途中失敗時も同じ原子的な置換で元へ戻す。同一内容のfileは書き換えず、cacheとinodeを維持する。
- Scene採取は外部状態も初期文書へ反映できるよう毎export実行する。Scene間のstatic、Autoload、環境状態を混ぜないためprocessを分け、同時起動数を3、待機上限を一Scene15秒に制限する。

## 検査条件

- 早い設定失敗と、画像回収後のHTML生成失敗で公開tree全fileのSHA-256が不変であること。
- `res://tmp/index.html` への書き出しが自己再帰せず完了すること。
- 親向きsymlinkを含む公開treeが5秒以内に失敗し、循環しないこと。
- 同じPCKでも環境値を変えた2回目のHTMLが新しい値になること。
- 新しいBrotli内容がrawへ復元でき、同じ画像はinodeとmtimeが変わらないこと。
