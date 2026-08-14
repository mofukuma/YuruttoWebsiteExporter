# Wasm暖機測定

## 目的

同じ配布物を初回取得と再取得に分け、BrowserのHTTP cacheが効いた状態の初期表示を測る。

## 根拠

- [Playwright BrowserContext](https://playwright.dev/docs/api/class-browsercontext): `browser.newContext()`は独立した非永続session。context内のpageは同じsessionへ所属。
- [Playwright Fixtures](https://playwright.dev/docs/api/class-fixtures): 試験間の新規contextにより、毎回新しい環境を保証。
- `browserContext.route()`はHTTP cacheを無効化するため不使用。

## 測定設計

1組ごとに新規BrowserContextを作り、cold条件を固定。同じcontextにwarm pageを先に作ってからcold pageを閉じ、同じURLを測定。HTTP cacheを保持しつつ、表示対象を一つにしてBrowserのpaint観測を安定させる。組の終了時にcontextを破棄。gdwebと本家full Webを各7組測る。

Resource Timingの転送量に加え、HTTP server側で要求数と実file byteを計数。cache命中を推定値ではなく、serverへ到達した通信で判定する。
