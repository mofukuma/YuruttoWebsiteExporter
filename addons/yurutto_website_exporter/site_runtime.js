// Scene resource pathをURL、SEO head、Browser履歴へ同期する。
// HTML末尾へ直接埋め込み、外部runtime fileを増やさない設計。

(() => {
'use strict';
// 書き出し時に埋め込んだScene対応表を読む。
const cfg=JSON.parse(document.getElementById('yweb-site-config').textContent);
const list=cfg.scenes;let callback=null;let pending='';let current='';
// いまのURLから表示するscene名を決める。合わない場合は先頭のsceneへ寄せる。
const route=()=>{let p=cfg.mode==='Hash'?(location.hash.slice(1)||'/'):location.pathname.slice(cfg.root.length-1);if(!p.startsWith('/'))p='/'+p;if(!p.endsWith('/'))p+='/';return Object.entries(list).find(([,v])=>v.uri===p)?.[0]||Object.keys(list)[0]};
// headの既存tagの属性を差し替える。無ければ何もしない。
const set=(selector,attribute,value)=>{const node=document.querySelector(selector);if(node)node.setAttribute(attribute,value)};
// scene固有のscriptとstyleを、同じものを二重に足さないよう覚えながら追加する。
const load=(items,tag)=>{for(const item of items||[]){const v=typeof item==='string'?{[tag==='LINK'?'href':'src']:item}:item;const key=v.href||v.src;if(document.querySelector('[data-yweb-asset="'+CSS.escape(key)+'"]'))continue;const node=document.createElement(tag);for(const [name,value] of Object.entries(v)){if(value===true)node.setAttribute(name,'');else if(value!==false)node.setAttribute(name,value)}node.dataset.ywebAsset=key;document.head.appendChild(node)}};
// title、SEO tag、JSON-LD、scene固有の飾りを、いま見せるpageの内容へ入れ替える。
const apply=(name)=>{const page=list[name];if(!page)return;const changed=current!==name;if(changed&&current)document.dispatchEvent(new CustomEvent('yweb:scene-leave',{detail:{name:current,page:list[current]}}));document.title=page.title;set('meta[name="description"]','content',page.description);set('meta[name="robots"]','content',page.robots);set('link[rel="canonical"]','href',page.canonical);for(const key of ['title','url','description'])set('meta[property="og:'+key+'"]','content',key==='title'?page.title:key==='description'?page.description:page.canonical);set('meta[name="twitter:title"]','content',page.title);set('meta[name="twitter:description"]','content',page.description);const ld=document.getElementById('yweb-json-ld');if(ld)ld.textContent=JSON.stringify(page.json_ld);document.querySelectorAll('[data-yweb-scene-meta]').forEach(n=>n.remove());for(const meta of page.meta||[]){const node=document.createElement('meta');node.setAttribute(meta.name?'name':'property',meta.name||meta.property);node.content=meta.content;node.dataset.ywebSceneMeta='true';document.head.appendChild(node)}document.querySelectorAll('[data-yweb-scene-asset]').forEach(n=>n.remove());for(const style of page.styles||[]){const v=typeof style==='string'?{href:style}:style;const node=document.createElement('link');node.rel='stylesheet';for(const [key,value] of Object.entries(v))node.setAttribute(key,value);node.dataset.ywebSceneAsset='true';document.head.appendChild(node)}load(page.scripts,'SCRIPT');document.getElementById('yweb-site-summary')?.remove();if(changed){current=name;document.dispatchEvent(new CustomEvent('yweb:scene-enter',{detail:{name,page}}))}};
// 表示中のpageに合うURLへ履歴を進める。方式ごとに組み立てが変わる。
const address=(page,replace)=>{const url=cfg.mode==='Hash'?cfg.root+'#'+page.uri:cfg.root.replace(/\/$/,'')+page.uri;(replace?history.replaceState:history.pushState).call(history,{yweb:true},'',url)};
// URLが変わったとき、head更新とGodot側のscene切替をまとめて起こす。
const emit=()=>{const name=route();pending=name;apply(name);callback?.(list[name].scene)};
// Godotから呼ぶ入口。Browser側の履歴とGodotのscene切替を双方向へつなぐ。
window.YWebSite={bind(fn){callback=fn;emit()},initialScene(){return list[route()].scene},scene(path){const found=Object.entries(list).find(([,page])=>page.scene===path);if(!found)return;const [name,page]=found;if(pending){if(pending!==name)return;pending='';apply(name);return}apply(name);address(page,false)}};
// 戻る進むに追従し、最初の表示も同じ経路で整える。
addEventListener(cfg.mode==='Hash'?'hashchange':'popstate',emit);apply(route());
})();
