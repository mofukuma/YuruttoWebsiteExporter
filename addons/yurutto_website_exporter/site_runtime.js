// Scene resource pathをURL、SEO head、Browser履歴へ同期する。
// HTML末尾へ埋め込み、許可済み属性からpage固有要素を安全に構築する設計。

(() => {
'use strict';

const cfg = JSON.parse(document.getElementById('yweb-site-config').textContent);
globalThis.YWEB_SEMANTIC_SNAPSHOT = true;
const pages = cfg.scenes;
const attrs = {
  LINK: new Set(['href', 'media', 'integrity', 'crossorigin', 'referrerpolicy']),
  SCRIPT: new Set(['src', 'type', 'defer', 'async', 'integrity', 'crossorigin', 'referrerpolicy']),
};
let callback = null;
let pending = '';
let current = '';
let semantics = null;
let semanticsRequest = null;

// いまのURLに一致するpage名を返し、不明なURLは空にする。
const route = () => {
  let path = location.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {}
  const offset = cfg.root.length - 1;
  let uri = path.slice(offset);
  if (!uri.startsWith('/')) uri = `/${uri}`;
  if (!uri.endsWith('/')) uri += '/';
  return Object.entries(pages).find(([, page]) => page.uri === uri)?.[0] || '';
};

// 既存head要素の属性を更新する。
const set = (selector, name, value) => {
  const node = document.querySelector(selector);
  if (node) node.setAttribute(name, value);
};

// 外部assetはHTTPS、同一site資源は相対URLに限定する。
const safeAsset = value => {
  const url = String(value || '').trim();
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  return url && !url.startsWith('//') && (!scheme || scheme === 'https');
};

// 許可済みの属性をDOM要素へ移す。
const fill = (node, values, tag) => {
  for (const [name, value] of Object.entries(values)) {
    if (!attrs[tag].has(name)) continue;
    if ((name === 'href' || name === 'src') && !safeAsset(value)) continue;
    if (value === true) node.setAttribute(name, '');
    else if (value !== false) node.setAttribute(name, value);
  }
};

// 同じ外部資源を二重に読み込まずheadへ加える。
const load = (items, tag) => {
  for (const item of items || []) {
    const keyName = tag === 'LINK' ? 'href' : 'src';
    const values = typeof item === 'string' ? {[keyName]: item} : item;
    const key = values.href || values.src;
    if (!key || document.querySelector(`[data-yweb-asset="${CSS.escape(key)}"]`)) continue;
    const node = document.createElement(tag);
    fill(node, values, tag);
    node.dataset.ywebAsset = key;
    document.head.appendChild(node);
  }
};

// JSON-LDとpage固有metaを現在のpageへ入れ替える。
const updateMeta = page => {
  document.title = page.title;
  set('meta[name="description"]', 'content', page.description);
  set('meta[name="robots"]', 'content', page.robots);
  set('link[rel="canonical"]', 'href', page.canonical);
  set('meta[property="og:title"]', 'content', page.title);
  set('meta[property="og:url"]', 'content', page.canonical);
  set('meta[property="og:description"]', 'content', page.description);
  set('meta[name="twitter:title"]', 'content', page.title);
  set('meta[name="twitter:description"]', 'content', page.description);
  const jsonLd = document.getElementById('yweb-json-ld');
  if (jsonLd) jsonLd.textContent = JSON.stringify(page.json_ld);
};

// 前のpage固有metaを消して新しい値を加える。
const replaceMeta = page => {
  document.querySelectorAll('[data-yweb-scene-meta]').forEach(node => node.remove());
  for (const meta of page.meta || []) {
    const node = document.createElement('meta');
    node.setAttribute(meta.name ? 'name' : 'property', meta.name || meta.property);
    node.content = meta.content;
    node.dataset.ywebSceneMeta = 'true';
    document.head.appendChild(node);
  }
};

// 前のpage固有styleを消して新しい資源を加える。
const replaceAssets = page => {
  document.querySelectorAll('[data-yweb-scene-asset]').forEach(node => node.remove());
  for (const item of page.styles || []) {
    const values = typeof item === 'string' ? {href: item} : item;
    const node = document.createElement('link');
    node.rel = 'stylesheet';
    fill(node, values, 'LINK');
    node.dataset.ywebSceneAsset = 'true';
    document.head.appendChild(node);
  }
  load(page.scripts, 'SCRIPT');
};

// Scene遷移後の読み上げ文書を、Export時に確定した安全な要素へ入れ替える。
const replaceSummary = page => {
  const summary = document.getElementById('yweb-site-summary');
  if (!summary || summary.dataset.ywebScene === page.scene) return;
  const heading = document.createElement('h1');
  const body = document.createElement('p');
  heading.textContent = page.title;
  body.textContent = page.description;
  summary.replaceChildren(heading, body);
  summary.dataset.ywebScene = page.scene;
  if (summary.dataset.ywebReady === 'true') hideSummaryLinks(summary);
  semanticsRequest ||= fetch(`${cfg.root}yweb-semantics.json`, {credentials: 'same-origin'})
    .then(response => response.ok ? response.json() : {})
    .then(value => semantics = value)
    .catch(() => semantics = {});
  semanticsRequest.then(() => installSummary(page));
};

// 共有fileの意味文書を、遷移先が変わっていない時に反映する。
const installSummary = page => {
  const summary = document.getElementById('yweb-site-summary');
  const markup = semantics?.[page.scene];
  if (!summary || summary.dataset.ywebScene !== page.scene || !markup) return;
  const template = document.createElement('template');
  template.innerHTML = markup;
  const next = template.content.querySelector('#yweb-site-summary');
  if (!next) return;
  summary.replaceChildren(...next.childNodes);
  if (summary.dataset.ywebReady === 'true') hideSummaryLinks(summary);
};

// 画面外の静的LinkButtonをTab操作と読み上げから外す。
const hideSummaryLinks = summary => {
  summary.querySelectorAll('a').forEach(link => {
    link.tabIndex = -1;
    link.setAttribute('aria-hidden', 'true');
  });
};

// page変更をheadと利用側の通知へ反映する。
const apply = name => {
  const page = pages[name];
  if (!page) return;
  const changed = current !== name;
  if (changed && current) {
    document.dispatchEvent(new CustomEvent('yweb:scene-leave', {
      detail: {name: current, page: pages[current]},
    }));
  }
  updateMeta(page);
  replaceMeta(page);
  replaceAssets(page);
  replaceSummary(page);
  if (!changed) return;
  current = name;
  document.dispatchEvent(new CustomEvent('yweb:scene-enter', {detail: {name, page}}));
};

// Engine表示後も初期文書を残し、検索向け内容を画面外へ移したと記録する。
const ready = () => requestAnimationFrame(() => requestAnimationFrame(() => {
  const summary = document.getElementById('yweb-site-summary');
  if (!summary) return;
  summary.dataset.ywebReady = 'true';
  hideSummaryLinks(summary);
}));

// 表示中pageの物理URLへBrowser履歴を進める。
const address = (page, replace) => {
  const url = cfg.root.replace(/\/$/, '') + page.uri;
  const method = replace ? history.replaceState : history.pushState;
  method.call(history, {yweb: true}, '', url);
};

// URL変更をheadとGodotのScene切替へ伝える。
const emit = () => {
  const name = route();
  if (!name || cfg.notFound) return;
  pending = name;
  apply(name);
  callback?.(pages[name].scene);
};

// GodotとBrowserのScene状態を双方向へつなぐ。
window.YWebSite = {
  bind(fn) {
    callback = fn;
    emit();
  },
  initialScene() {
    return pages[route()]?.scene || '';
  },
  scene(path) {
    if (cfg.notFound) return;
    const found = Object.entries(pages).find(([, page]) => page.scene === path);
    if (!found) return;
    const [name, page] = found;
    if (pending) {
      if (pending !== name) return;
      pending = '';
      apply(name);
      ready();
      return;
    }
    apply(name);
    ready();
    address(page, false);
  },
};

addEventListener('popstate', emit);
if (!cfg.notFound) apply(route());
})();
