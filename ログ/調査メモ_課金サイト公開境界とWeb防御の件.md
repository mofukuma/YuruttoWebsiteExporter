# 課金サイト公開境界とWeb防御

決済を含む実サービスで、静的なGodot Web成果物が担う範囲と、信頼できるserverへ渡す範囲を分けるために公式資料を確認した。

## 確認した仕様

- [Stripe Checkoutの流れ](https://docs.stripe.com/payments/checkout/how-checkout-works)は、Checkout Sessionをserverで作り、Stripe-hosted pageへ移動し、完了後の履行をWebhookで行う構成を示している。
- [Stripeの履行手順](https://docs.stripe.com/checkout/fulfillment)は、完了画面への到達を支払確定に使わず、署名検証したWebhookを信頼するよう求めている。
- [Stripeのセキュリティガイド](https://docs.stripe.com/security/guide)は、秘密鍵をclientへ置かず、Webhook署名を検証し、HTTPSを使うよう説明している。
- [OWASP HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html)は、CSP、`nosniff`、frame制限、referrer制限、HTTPSでのHSTSを主要なBrowser防御として挙げている。
- [OWASP CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html)は、HTTP headerでの配信を優先し、scriptやstyleの読込元を明示する構成を推奨している。
- [Godot Web export](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)は、WASMを`application/wasm`、PCKを`application/octet-stream`で配信し、thread利用時には追加のcross-origin isolation headerが必要としている。

## 採用する境界

- Godot/WASM/PCKは公開clientとして扱い、価格、支払済み判定、権限付与、秘密鍵、Webhook秘密を置かない。
- 課金導線はHTTPSのhosted checkoutへ移動するLinkButtonとし、注文確定と提供処理は署名検証済みWebhookを受けるserverへ委ねる。
- 本番書き出しはHTTPS、外部assetの安全なscheme、外部scriptのintegrity、秘密情報の不在を検査する。
- 書き出し成果物へ静的host用security headerと機械可読な検査結果を含め、開発serverでも同じheaderを返す。
- CSPは生成HTML内で実行するscriptからhashを算出し、GodotのWASMとDOM style更新に必要な範囲を明示する。

## 合格条件

- `javascript:`、`data:`などの実行URIがLinkButtonや追加assetからBrowserへ入らない。
- 外部scriptはHTTPS、integrity、anonymous CORSを満たす。
- 本番URLはHTTPSで、既知の秘密形式を含むprojectはexport前に停止する。
- Hosted checkoutの価格・支払確定をclientへ持たせないことをREADMEと生成監査情報で明示する。
- PlaywrightでCSP違反、危険URI、header欠落、通常routeと外部checkout導線を一括検査する。
