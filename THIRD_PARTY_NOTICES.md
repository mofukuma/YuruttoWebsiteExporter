# Third-party notices

## Godot Engine

- Version: 4.7.1-stable
- Source: [godotengine/godot](https://github.com/godotengine/godot/tree/4.7.1-stable)
- License: MIT
- License text: [LICENSES/GODOT-MIT.txt](LICENSES/GODOT-MIT.txt)
- Built-in dependency notices: [LICENSES/GODOT-COPYRIGHT.txt](LICENSES/GODOT-COPYRIGHT.txt)

Fontはrepositoryへ含めず、検査では`build/fetch_webfont.cjs`がGoogle Fonts CDNから取得する。
Export時にprojectから公開されるWeb fontのlicense通知は、各projectで用意する。
`LICENSES/OFL-1.1.txt`はOFL fontを公開するprojectが同梱するための本文として保持。
