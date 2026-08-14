# Playwright操作待機

## 現象

500 msの固定上限内にDOM操作自体は完了するが、Playwrightのnavigation待機中にtimeout。`mount delayed`と`video next`で同じ状態を確認。

## 根拠

- [Playwright Locator.click](https://playwright.dev/docs/api/class-locator): actionability確認、scroll、mouse操作、開始されたnavigationの待機を一つのtimeoutへ含める。
- [Playwright Auto-waiting](https://playwright.dev/docs/actionability): 必要条件がtimeout内に完了しない操作は`TimeoutError`。

## 対応

画面内状態だけを変え、navigationを起こさない操作へ`noWaitAfter: true`を指定。対話画面内の意味操作はDOM `click()`を直接発火。actionabilityを含む既定上限は1,000 ms、機能結果は個別条件で判定する。
