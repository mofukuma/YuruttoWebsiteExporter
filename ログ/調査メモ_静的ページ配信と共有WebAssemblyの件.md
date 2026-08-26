# 静的ページ配信と共有WebAssemblyの調査メモ

## 目的

各URLを実HTMLとして直接開けるようにし、Godotの実行物は全ページで共有して静的ホストへそのまま配置できる構成を決める。

## 確認した仕様

- [Godot Custom HTML shell](https://docs.godotengine.org/en/latest/tutorials/platform/web/customizing_html5_shell.html) は、WASM初期化とPCK読込を別URLで並行実行できる。JS、WASM、PCKは同じdirectory名へ固定する必要がない。
- [Godot HTML5 shell class reference](https://docs.godotengine.org/en/latest/tutorials/platform/web/html5_shell_classref.html) は、`executable`と`mainPack`を起動設定として受け取る。HTMLごとに初期sceneを選びながら実行物を共有できる。
- [MDN Cache-Control](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control) は、内容hash付きURLを長期保存し、HTMLを再検証する構成を推奨する。同じ名前を更新し続ける構成より静的ホスト間の差が小さい。
- Godotのrelease JSはEmscripten最適化済みで、追加の難読化は秘匿にならない。埋込site runtimeは既に空白を詰めた短いコードなので、再変換工程を増やさない。

## 採用する構成

- `/index.html`と`/about/index.html`を実fileとして生成する。
- 初回HTMLはURLに対応するsceneを選び、起動後はHistory APIとSceneTreeの切替で再読込を避ける。
- ルート直下へ`yweb-<hash>.js`、`yweb-<hash>.wasm`、`site-<hash>.pck`と関連workletを置く。
- hashは共有実行物の内容から決め、HTML内の`executable`と容量表も同じ名前へ更新する。
- nginx設定は生成せず、既知URLの物理HTML、`404.html`、一般的な静的ホストで完結させる。
- raw成果物とBrotli成果物は残し、配信側が対応する場合に圧縮版を選べる状態を保つ。

## 検査条件

- 複数HTMLが同じhash付きJS、WASM、PCKを参照する。
- 実行物の内容が変わると名前が変わり、同じ内容では名前が変わらない。
- `/about/`への直アクセス、サイト内scene遷移、戻る操作でBrowserを再読込しない。
- nginx用fileとcontainer依存testを削除し、Nodeの静的serverとPlaywrightで全経路を検査する。
