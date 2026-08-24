# ThemeとScrollBarとParticlesの調査メモ

DOM表示をGodotの確定値へ揃えるため、Themeの通知経路、ScrollBarの描画計算、粒子の保持場所を確認したよ。

## 結論

- Theme resourceのsetterは変更通知を出し、Controlの枝へ`NOTIFICATION_THEME_CHANGED`が伝わる。DOM同期は毎frame現在値を読むため、通常・hover・pressed・disabled・focusの選択と複数の描画層を揃えれば途中切り替えに追従できる。
- ScrollBarは`value`、`min_value`、`max_value`、`page`、ThemeのStyleBox・icon・余白からtrackとgrabberを決める。Godot本体と同じ計算結果をDOM用getterで渡すと、横・縦を共通経路で扱える。
- CPUParticles3Dは各生存粒子のTransform3DとColorをCPU配列に保持する。DOM用の読み取り口を小さく設け、既存Mesh投影を粒子ごとに呼べる。
- GPUParticles3Dの生存粒子TransformはRenderingServer側にあり、公開APIは個別値を返さない。DOM onlyの空描画機器ではGPU simulationも動かないため、ParticleProcessMaterialの標準設定をCPUで再現する経路が必要になる。独自Shader、trail、衝突、sub-emitterは同じ結果を保証できないので、対応率へ混ぜず別候補にする。

## Themeで拾う要素

- Button系: `normal`、`hover`、`pressed`、`disabled`、`focus`と状態別文字色・icon。
- LineEditとTextEdit: `normal`、`read_only`、`focus`、文字・placeholder・選択・caret。
- ProgressBar: `background`と`fill`。
- Slider: `slider`、`grabber_area`、highlight/disabled系grabber。
- ScrollBar: `scroll`、`scroll_focus`、grabber三状態、増減button三状態。
- Panel、Separator、Container内部Control: それぞれが現在参照するStyleBoxとicon。

## 参照

- [Godot Theme](https://docs.godotengine.org/en/stable/classes/class_theme.html)
- [Godot ScrollBar](https://docs.godotengine.org/en/4.7/classes/class_scrollbar.html)
- [Godot Slider](https://docs.godotengine.org/en/latest/classes/class_slider.html)
- [Godot CPUParticles3D](https://docs.godotengine.org/en/stable/classes/class_cpuparticles3d.html)
- [Godot GPUParticles3D](https://docs.godotengine.org/en/latest/classes/class_gpuparticles3d.html)
