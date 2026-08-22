# 全nodeの棚卸し

画面へ何かを描くGodotのnodeを、DOM onlyでの扱いごとに並べる。
一覧は`tests/node_inventory.gd`がClassDBから作り、`tests/node_inventory.cjs`が確かめる。

## DOM onlyの達成率

DOM onlyは`disable_3d=yes`で組むため、3Dのnodeはそもそも入っていない。
母数はCanvasItemの系統のうち、書き出した作品へ実際に出るものとする。

| 区分 | 数 |
| --- | --- |
| 対応済 | 74 |
| 未対応 | 8 |
| **達成率** | **90.2%** |

## 対応済の内訳

### 文字をDOMへ出す (20)

`Button` `CheckBox` `CheckButton` `CodeEdit` `ColorPickerButton` `FoldableContainer` `ItemList` `Label` `LineEdit` `LinkButton` `MenuBar` `MenuButton` `OptionButton` `ProgressBar` `RichTextLabel` `SpinBox` `TabBar` `TabContainer` `TextEdit` `Tree`

### 面と枠をDOMの箱へ出す (13)

`ColorRect` `HScrollBar` `HSeparator` `HSlider` `NinePatchRect` `Panel` `PanelContainer` `ReferenceRect` `TextureProgressBar` `VScrollBar` `VSeparator` `VSlider` `VirtualJoystick`

### 絵をDOMのimgへ出す (4)

`AnimatedSprite2D` `Sprite2D` `TextureButton` `TextureRect`

### 描画命令や形をDOMへ写す (7)

`Line2D` `MeshInstance2D` `MultiMeshInstance2D` `Polygon2D` `TileMap` `TileMapLayer` `TouchScreenButton`

### 位置を決めるのが役目で自分は描かない (30)

`AspectRatioContainer` `AudioListener2D` `BaseButton` `BoxContainer` `Camera2D` `CanvasGroup` `CanvasModulate` `CenterContainer` `Container` `Control` `FlowContainer` `GridContainer` `HBoxContainer` `HFlowContainer` `HSplitContainer` `MarginContainer` `Marker2D` `Node2D` `Parallax2D` `ParallaxLayer` `Path2D` `PathFollow2D` `Range` `RemoteTransform2D` `ScrollContainer` `SplitContainer` `SubViewportContainer` `VBoxContainer` `VFlowContainer` `VSplitContainer`

## 未対応と、その理由

| node | なぜ出せていないか |
| --- | --- |
| `CPUParticles2D` | 粒子は数が多く、DOMでは重くなる |
| `ColorPicker` | 色見本の並びが細かく、DOMで作り直す価値が薄い |
| `GPUParticles2D` | 粒子はGPUで動くため位置を取り出せない |
| `GraphEdit` | 編集器向けで作品には出ない |
| `GraphElement` | 編集器向けで作品には出ない |
| `GraphFrame` | 編集器向けで作品には出ない |
| `GraphNode` | 編集器向けで作品には出ない |
| `VideoStreamPlayer` | 動画の再生はDOMのvideoが要る |

## 作品には出ないもの

当たり判定、骨、音、XRの装置など。Editorでは見えるが、書き出したページには出ない。
数は91種。達成率の母数には入れない。

## 3Dのnode

3D levelのみが持つ。DOM onlyには入らない。

| 区分 | 数 | node |
| --- | --- | --- |
| 形 | 11 | `AnimatedSprite3D` `CSGBox3D` `CSGCombiner3D` `CSGCylinder3D` `CSGMesh3D` `CSGPolygon3D` `CSGSphere3D` `CSGTorus3D` `GridMap` `MeshInstance3D` `MultiMeshInstance3D` |
| 光と環境 | 13 | `AreaLight3D` `Camera3D` `Decal` `DirectionalLight2D` `DirectionalLight3D` `FogVolume` `LightOccluder2D` `LightmapGI` `OmniLight3D` `PointLight2D` `ReflectionProbe` `SpotLight3D` `VoxelGI` |

