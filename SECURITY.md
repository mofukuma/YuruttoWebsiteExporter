# Security

YuruttoWebsiteExporterは公開前の安全検査を行うけれど、決済serverや運営体制までは作らないよ。課金siteでは、秘密鍵、価格決定、支払状態、利用権限をBrowserへ渡さず、署名済みWebhookを検証するserverで管理しよう。

Scene snapshotはproject codeを実行する。信頼していないprojectやpull requestを、決済鍵や配信鍵を持つCI jobでExportしないでね。Exportはcredentialのない分離jobで行い、networkも必要な取得先へ制限しよう。

公開時はhash資源、manifest、HTMLの順で反映し、疎通確認まで前世代を残そう。正常page、CSP、WASM起動、Hosted Checkoutへの遷移、HTTP 404と`noindex,nofollow`を確認し、失敗時は前世代へ戻そう。

## Supported version

安全性の修正は最新releaseへ入るよ。公開siteは最新releaseで再Exportし、生成された`_headers`を配信先で適用しよう。

## Reporting a vulnerability

脆弱性は公開Issueへ詳細を書かず、GitHubの`Security`画面にあるprivate vulnerability reportから知らせてほしい。再現条件、影響するversion、最小の再現projectを添えると確認しやすいよ。秘密鍵や個人情報は送らないでね。

報告後は受領を確認し、影響範囲と修正版の公開方法を同じprivate reportで共有するよ。修正版を公開する前に、第三者へ再現手順を広めないよう協力してほしい。
