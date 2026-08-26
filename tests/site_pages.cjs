// ページ設定画面が、主要項目を更新しつつ詳細JSONを保持することを検査する。
// Godot ControlへButton操作を送り、保存後のfileを一度に確認する。

'use strict';

const assert = require('node:assert/strict');
const child = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..'); // project root。
const work = path.join(repo, 'tmp/site-pages'); // 検査用project。
const outside = path.join(repo, 'tmp/site-pages-outside.json'); // project境界外への書込検査先。
const { godot } = require('./godot.cjs'); // 対応版Godot。

// addonと2ページのJSONを持つ最小projectを用意する。
fs.rmSync(work, { recursive: true, force: true });
fs.rmSync(outside, { force: true });
fs.mkdirSync(path.join(work, 'addons'), { recursive: true });
fs.mkdirSync(path.join(work, 'web'), { recursive: true });
fs.cpSync(path.join(repo, 'addons/yurutto_website_exporter'), path.join(work, 'addons/yurutto_website_exporter'), { recursive: true });
fs.writeFileSync(path.join(work, 'project.godot'), '[application]\nconfig/name="Pages Test"\nrun/main_scene="res://main.tscn"\n');
fs.writeFileSync(path.join(work, 'main.tscn'), '[gd_scene format=3]\n\n[node name="Main" type="Node"]\n');
fs.writeFileSync(path.join(work, 'about.tscn'), '[gd_scene format=3]\n\n[node name="About" type="Node"]\n');
fs.writeFileSync(path.join(work, 'temporary.tscn'), '[gd_scene format=3]\n\n[node name="Temporary" type="Node"]\n');
fs.writeFileSync(path.join(work, 'company.tscn'), '[gd_scene format=3]\n\n[node name="Company" type="Node"]\n');
fs.writeFileSync(path.join(work, 'main.gd'), '# ページ設定画面を起動する最小projectのscript。\n# 画面試験に不要な動作を持たない入口として使う。\n\nextends Node\n');
fs.writeFileSync(path.join(work, 'export_presets.cfg'), '[preset.0]\n\nname="Web"\nplatform="Yurutto Website"\nrunnable=true\nexport_filter="all_resources"\ninclude_filter=""\nexclude_filter=""\nscript_export_mode=2\n\n[preset.0.options]\n\nyweb/site/config="res://web/pages.json"\n');
fs.writeFileSync(path.join(work, 'web/pages.json'), JSON.stringify({
  version: 1,
  site: { name: 'Kept site', locale: 'ja_JP' },
  scenes: {
    Home: { scene: 'res://main.tscn', uri: '/', title: 'Home' },
    About: {
      scene: 'res://about.tscn', uri: '/about/', title: 'About',
      meta: [{ name: 'author', content: 'Kept author' }],
      json_ld: { '@context': 'https://schema.org', '@type': 'AboutPage' },
    },
  },
}, null, 2));
fs.writeFileSync(path.join(work, 'web/other.json'), JSON.stringify({ version: 1, scenes: {} }, null, 2));
fs.writeFileSync(path.join(work, 'web/bad.json'), JSON.stringify({ version: 1, scenes: { Bad: 'not an object' } }, null, 2));

const output = child.execFileSync(godot, ['--headless', '--path', work, '--script', path.join(repo, 'tests/site_pages_scene.gd')], { encoding: 'utf8', timeout: 20000 });
const line = output.trim().split('\n').findLast((value) => value.startsWith('{'));
const result = JSON.parse(line);

assert.equal(result.preferred, 'res://web/pages.json', 'Export presetのJSONを開いていない');
assert.equal(result.path_options, 2, '複数presetのJSONを画面で選べない');
assert.deepEqual(result.path_switch, ['Autosaved About', true, true], 'JSON切替前の入力または一覧操作を保存していない');
assert.deepEqual(result.initial, ['Home', 'About'], 'JSONのページ順を画面へ出していない');
assert.equal(result.controls, true, 'ページ入力欄が不足している');
assert.equal(result.duplicate, 'URI is already used', '重複URIを画面で止めていない');
assert.deepEqual(result.saved, ['Home', 'Company'], '改名または追加削除が保存されていない');
assert.equal(result.home.page, false, 'ページではないSceneの設定が保存されていない');
assert.equal(result.page_fields_disabled, true, 'ページではないSceneで公開項目が有効なまま');
assert.deepEqual(result.ignored, ['res://about.tscn', 'res://temporary.tscn'], '削除または差替えたSceneの自動再追加を止めていない');
assert.equal(result.bad_path, 'JSON path must be a res:// .json file', 'JSON以外の保存先を拒否していない');
assert.equal(result.traversal, 'JSON path must be a res:// .json file', 'project境界外のJSONを拒否していない');
assert.equal(result.bad_entry, 'Scene entry must be an object: Bad', 'Scene項目のobject型を検査していない');
assert.equal(result.active_path, 'res://web/pages.json', '読込失敗後に保存先が変わった');
assert.match(result.main_safe, /extends Node\n$/, '読込失敗後の保存でproject fileを上書きした');
assert.equal(fs.existsSync(outside), false, 'project境界外へJSONを書いた');
assert.equal(fs.existsSync(path.join(work, 'web/pages.json.tmp')), false, '一時JSONが保存後に残った');
assert.deepEqual(result.company, {
  scene: 'res://company.tscn', uri: '/company/', title: 'Company title',
  meta: [{ name: 'author', content: 'Kept author' }],
  json_ld: { '@context': 'https://schema.org', '@type': 'AboutPage' },
  description: 'Company description', summary: 'Company summary', robots: 'noindex,follow',
}, '画面項目の更新時に詳細JSONを保持できていない');
assert.deepEqual(result.site, { name: 'Kept site', locale: 'ja_JP' }, 'site全体の設定が消えた');
assert.equal(result.advanced['@type'], 'AboutPage', '画面外の構造化データが消えた');
assert.equal(result.status, 'Saved 2 pages', '保存完了を画面へ表示していない');
const plugin = fs.readFileSync(path.join(repo, 'addons/yurutto_website_exporter/plugin.gd'), 'utf8');
assert.match(plugin, /add_control_to_bottom_panel\(pages, MENU\)/, 'ページ画面をEditor下部へ登録していない');
assert.match(plugin, /remove_control_from_bottom_panel\(pages\)/, 'plugin終了時にページ画面を回収していない');

console.log(JSON.stringify({ ok: true, pages: result.saved, controls: 9, advanced: true, nonPage: 1 }));
