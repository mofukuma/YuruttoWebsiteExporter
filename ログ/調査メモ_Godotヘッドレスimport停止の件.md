# Godotヘッドレスimport停止の調査メモ

画面比較を安定して短時間で始めるため、Mac版Godot 4.7.1の`--headless --import`が初回素材取込中に不定期停止する条件を調べたよ。

## 分かったこと

- Godot公式資料では`--import`が全素材の取込完了を待って終了する正規の命令だよ。`--headless`も画面を持たない自動処理向けとされている。
- Godot 4.7 stableのmacOSでは、import中の複数popupがrelease版を落とす未解決報告があり、4.6.2と4.7 debugでは再現しないと報告されている。
- 複数fontの初回importでもworker threadが不定期にSIGSEGVとなる確認済み報告がある。比較projectは共通fontを毎回新規取込していたため、同じ危険区間を繰り返していた。
- `--recovery-mode`はtool script、editor plugin、GDExtensionを止めて起動時の停止要因を減らす公式機能だよ。

## 採る方法

比較projectの`.godot`取込cacheを`tmp/`へ保存し、次回はGodot自身の変更検知で差分取込する。Web書き出しを撮影より先に実行し、その工程が作った取込結果を撮影へ渡す。fixture本体へ生成cacheは置かない。これで不安定な独立import起動と同じfontの全再取込を省き、Godotの取込結果を正本として保つ。

## 参考

- https://docs.godotengine.org/en/latest/tutorials/editor/command_line_tutorial.html
- https://github.com/godotengine/godot/issues/120716
- https://github.com/godotengine/godot/issues/111039
- https://github.com/godotengine/godot/issues/111592
