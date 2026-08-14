# Canvas命令と2D資源網羅性の件

## 結論

Canvas command enum 10型をsourceから抽出。7型をCanvas 2D実装、3型をCPU代替実装待ちへ分類。未分類0。

実装対象はRECT、NINEPATCH、POLYGON、PRIMITIVE、TRANSFORM、CLIP_IGNORE、ANIMATION_SLICE。Mesh、MultiMesh、Particlesは限定buildで排除。分類は `gdweb/tests/canvas_coverage_static.cjs` が機械検査。

Texture、Font、StyleBox、Shape2D、PhysicsServer2DはClassDB登録とExporter許可が一致しない。登録済みであっても限定exportで使えるとは限らない。登録数を対応数として扱わないこと。

## Canvas command母集団

正本は `servers/rendering/renderer_canvas_render.h` の `Item::Command::Type`。

| command | 所有先 | Browser処理 | 正常試験 |
|---|---|---|---|
| RECT | Godot→Canvas 2D | 塗り、画像、Viewport画像、region、flip、transpose、tile、clip UV | N01/N02、N03/N04、N17、N19 |
| NINEPATCH | Godot→Canvas 2D | 9領域、stretch、tile、tile-fit、center有無 | N16、N19 |
| POLYGON | Godot→Canvas 2D | point、line、line strip、triangles、triangle strip、頂点色、UV画像 | N01/N02、N19 |
| PRIMITIVE | Godot→Canvas 2D | 1～4点、線形頂点色、UV画像 | N19 |
| TRANSFORM | Godot→Canvas 2D | Godot確定行列をCanvas 2Dへ設定 | N07/N08、N13、N17、N19 |
| CLIP_IGNORE | Godot→Canvas 2D | Godot確定clip矩形の解除と再設定 | N16、N19 |
| ANIMATION_SLICE | Godot→Canvas 2D | 本家と同じ時刻剰余によるcommand skip | N19 |
| MESH | CPU代替待ち | surfaceをCPU三角形へ展開 | N18-C追加対象 |
| MULTIMESH | CPU代替待ち | instance transformをCPU展開 | N18-C追加対象 |
| PARTICLES | CPU代替待ち | 時間更新と発生をCPU実装 | N18-C追加対象 |

Mesh系はDummy MeshStorageの頂点、index、UV、色、surface取得を実体化し、Canvas三角形へ展開する。MultiMeshは全instance transformをCPU展開。Particlesは時間更新、乱数、emission、collisionをCPU実装。Shader/GPUは禁止し、代替完成まで未実装扱い。

容量増分は最終build前のため未測定。推定値を置かない。最終source確定後、同じbuild条件のraw、gzip9、Brotli11差分で確定する。

## 色と透明度

Godot cullは親 `modulate` を乗算し、描画itemの `final_modulate` へ `self_modulate` を乗算。Canvas backendは全描画命令で次を使用。

`command color × item.final_modulate × canvas modulate`

塗りはRGBA、画像とSubViewportはRGB tintと `globalAlpha`。親子乗算、RGB変調、alpha 0を同じ経路へ通す。Godotは親modulate alphaが0.007未満ならcull。self_modulateやcommand alpha 0は透明命令としてCanvasへ到達。

N19は親modulate、子self_modulate、command色、alpha 0を同じ画面へ置く。異色頂点のCanvas 2D表現は三角形ごとの線形gradient。texture付き頂点色はCanvas 2Dにbarycentric tintがないため三角形平均色。全画面MAE 1%未満を合格条件とし、命令別領域MAEも推定せず記録する。

SubViewportも通常画像と同じtint経路。子targetのclearや描画がroot targetを消さないよう、targetごとにOffscreenCanvasを所有。親RECT命令位置で `drawImage` 合成し、最後のGodot blitだけHTML Canvasへ表示。

## 画像資源

scene登録sourceからTexture系37型を機械抽出。限定ExporterはTexture2D基底を検査入口とし、実許可を次の4具象型へ限定。

- ImageTexture
- CompressedTexture2D
- PortableCompressedTexture2D
- AtlasTexture

ViewportTextureはSubViewportContainer内部経路として限定backendが所有。通常scene propertyとしての任意利用はExporter許可表と別契約。

次は登録済みでも限定exportで排除。

- MeshTexture: Mesh命令依存
- CameraTexture、ExternalTexture: 外部画像面依存
- DrawableTexture2D: 書込み可能描画面依存
- Texture3D、TextureLayeredと全派生: 3D/GPU対象
- Texture2DRDとRD派生: RenderingDevice対象
- CanvasTexture: normal/specular/shininessとshader相当合成
- AnimatedTexture: deprecated=no

CurveTexture、GradientTexture、DPITexture、PlaceholderTexture2Dも現Exporterのexact許可外。必要ならImageTextureへ事前変換して初期PCKへ格納する契約が先。暗黙許可しない。

## FontとStyleBox

登録はFont系4型、StyleBox系5型。FontFile、FontVariation、SystemFontはGodot側の文字計量に使用。表示文字はDOMを正本とし、TextServerFallbackが生成した通常、LCD、MSDF、outlineのglyph atlas RIDを印付けしてCanvas描画を抑止。検索、選択、Tab、入力をBrowserへ残す。

StyleBoxEmpty、StyleBoxFlat、StyleBoxLineはRECT、PRIMITIVE、POLYGONへ変換。StyleBoxTextureはNINEPATCHへ変換。ThemeとControlの配置判断はGodot、文字と入力欄だけDOM。

## Shape2Dと2D物理

source登録はShape2D基底と具象8型、合計9型。

- WorldBoundaryShape2D
- SegmentShape2D
- SeparationRayShape2D
- CircleShape2D
- RectangleShape2D
- CapsuleShape2D
- ConvexPolygonShape2D
- ConcavePolygonShape2D

GodotPhysics2D moduleは有効だが、限定Exporterのscene resource許可はRectangleShape2Dだけ。N11もRectangleShape2Dで重力、衝突、signalを実証。残り7型はengine登録済み、限定export排除、正常試験なし。

PhysicsServer2D登録はManager、基底、Extensionの3型。scene nodeの限定許可はRigidBody2D、StaticBody2D、CollisionShape2D。Area2D、CharacterBody2D、AnimatableBody2D、CollisionPolygon2D、RayCast2D、ShapeCast2D、Joint2D群は現在の限定export外。

したがって「Godot engineに存在」と「gdweb作品で許可」を分ける。全Shape2Dや全Physics2D nodeを採用する場合は、Exporter exact表、各形状fixture、query/contact/signal比較を同時に追加してから分類を変更する。

## 機械検査

`node gdweb/tests/canvas_coverage_static.cjs`

検査内容。

- command enum母集団の自動抽出
- 実装または排除への全件分類
- C++分岐とJS operationの存在
- N19正常fixtureによる実装7型の命令生成入口
- profileまたはExporterによるMesh、MultiMesh、Particles排除根拠
- rect、nine-patch、primitive、polygon、SubViewportのmodulate経路
- 実装済みdraw APIが旧禁止表へ残らないこと
- Texture、Font、StyleBox、Shape2D、PhysicsServer2DのClassDB登録とExporter exact許可

現結果はcommand 10、実装7、排除3、未分類0、正常fixture未割当0。N19のnative/Web実測は最終runtime build後に一回だけ実施する。
