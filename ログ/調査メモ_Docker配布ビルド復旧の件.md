# Docker配布ビルド復旧

固定環境の配布ビルドを再開するため、Docker Desktopの復旧手順を確認した。

## 症状

`containerd` の `meta.db` 書き込みが `input/output error` で失敗し、配布用イメージを生成できない。

## 判断

最初にDocker Desktopを再起動する。リポジトリやDocker内のデータは削除しない。再起動後も同じI/Oエラーになる場合、診断を採取し、既存イメージやvolumeの扱いを確認してからデータ初期化を判断する。

## 根拠

- [Docker Troubleshoot](https://docs.docker.com/desktop/troubleshoot-and-support/troubleshoot/): 最初の復旧手段としてRestart Docker Desktopを案内している。データ消去と工場出荷状態への初期化は別の操作として明示されている。
- [Docker Desktop restart](https://docs.docker.com/reference/cli/docker/desktop/restart/): 公式CLIで待機時間を指定して再起動できる。
- [Docker Desktop for Mac FAQ](https://docs.docker.com/desktop/troubleshoot-and-support/faqs/macfaqs/): コンテナとイメージはMac側の一つのディスクイメージへ保存されるため、内部データの削除は復旧の最終手段にする。
