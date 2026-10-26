import {languageKey,resolveLanguage,translateText} from './i18n-core.js';
const textCache=new WeakMap(),attributeCache=new WeakMap();
const skip='script,style,noscript,textarea,option,[data-original],[translate="no"],[data-language-switcher]';
let saved=null;
try{saved=localStorage.getItem(languageKey)}catch{}
let language=resolveLanguage({query:new URL(location.href).searchParams.get('lang'),saved,languages:navigator.languages||[navigator.language]});
if(new URL(location.href).searchParams.has('lang')){try{localStorage.setItem(languageKey,language)}catch{}}

function translateNode(node){
  const current=node.data;
  const previous=textCache.get(node);
  const source=previous&&current===previous.output?previous.source:current;
  const output=translateText(source,language);
  textCache.set(node,{source,output});
  if(current!==output)node.data=output;
}
function translateAttributes(element){
  const attributes=['aria-label','title','placeholder'];
  if(element.matches('meta[name="description"],meta[property="og:description"]'))attributes.push('content');
  let records=attributeCache.get(element);
  if(!records){records=new Map();attributeCache.set(element,records)}
  for(const name of attributes){
    if(!element.hasAttribute(name))continue;
    const current=element.getAttribute(name),previous=records.get(name);
    const source=previous&&current===previous.output?previous.source:current;
    const output=translateText(source,language);
    records.set(name,{source,output});
    if(current!==output)element.setAttribute(name,output);
  }
}
export function translateTree(root=document){
  if(root.nodeType===3){if(!root.parentElement?.closest(skip))translateNode(root);return;}
  if(root.nodeType===1&&root.closest(skip))return;
  function visit(node){
    if(node.nodeType===3){translateNode(node);return;}
    if(node.nodeType===1){if(node.matches(skip))return;translateAttributes(node);}
    for(const child of node.childNodes||[])visit(child);
  }
  visit(root);
}
function updateLinks(root=document){
  const links=root.querySelectorAll?.('a[href]')||[];
  for(const a of links){
    const raw=a.getAttribute('href');
    if(!raw||raw.startsWith('#'))continue;
    const url=new URL(raw,location.href);
    if(url.origin!==location.origin||url.pathname.startsWith('/assets/')||!(/\/$|\.html$/.test(url.pathname)))continue;
    url.searchParams.set('lang',language);
    const href=url.pathname+url.search+url.hash;
    if(raw!==href)a.setAttribute('href',href);
  }
}
function updateSwitchers(){
  for(const group of document.querySelectorAll('[data-language-switcher]')){
    group.setAttribute('aria-label',language==='en'?'Interface language':'界面语言');
    group.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.language===language)));
  }
}
export function setLanguage(next){
  if(next!=='zh'&&next!=='en')return;
  language=next;
  try{localStorage.setItem(languageKey,language)}catch{}
  const url=new URL(location.href);url.searchParams.set('lang',language);
  try{history.replaceState(history.state,'',url.pathname+url.search+url.hash)}catch{}
  applyLanguage();
  dispatchEvent(new CustomEvent('site-languagechange',{detail:{language}}));
}
function applyLanguage(){
  document.documentElement.lang=language==='en'?'en':'zh-CN';
  translateTree();updateLinks();updateSwitchers();
}
function switcher(){
  const group=document.createElement('div');group.className='language-switcher';group.dataset.languageSwitcher='';group.setAttribute('role','group');
  for(const [value,label,lang,description] of [['zh','中文','zh-CN','切换为中文'],['en','EN','en','Switch to English']]){
    const button=document.createElement('button');button.type='button';button.dataset.language=value;button.lang=lang;button.textContent=label;button.setAttribute('aria-label',description);button.addEventListener('click',()=>setLanguage(value));group.append(button);
  }
  return group;
}
const header=document.querySelector('.top-controls')||document.querySelector('.site-nav');
if(header)header.append(switcher());
const dialogTop=document.querySelector('.dialog-top');
if(dialogTop)dialogTop.insertBefore(switcher(),document.getElementById('close'));
applyLanguage();

// Translate new panels and live status messages in place; never rebuild controls,
// restart the animation, change an audio source, or replace manuscript nodes.
const observer=new MutationObserver(records=>{
  const roots=new Set();
  for(const record of records){
    if(record.type==='childList')record.addedNodes.forEach(node=>{if(node.nodeType===1||node.nodeType===3)roots.add(node)});
    else roots.add(record.target);
  }
  for(const root of roots){if(!root.isConnected)continue;translateTree(root);if(root.nodeType===1)updateLinks(root);}
});
observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder']});
addEventListener('storage',event=>{if(event.key===languageKey&&(event.newValue==='zh'||event.newValue==='en')){language=event.newValue;applyLanguage();}});
