import MarkdownIt from 'markdown-it';
import {imageRefs,type ContentDoc,type Snapshot,type Bilingual} from './content.ts';
export const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const localized=(s:Bilingual,key='span')=>`<${key} data-copy-zh="${escape(s.zh)}" data-copy-en="${escape(s.en||s.zh)}" translate="no">${escape(s.zh)}</${key}>`;
export function markdown(body:string,privateMedia=false):string {
  const md=new MarkdownIt({html:false,linkify:false,typographer:false});
  // Only our media can be embedded; external links do not become tracking images.
  const base=md.renderer.rules.image!;
  md.renderer.rules.image=(tokens,i,opts,env,self)=>{
    const token=tokens[i], src=token.attrGet('src')||'';
    const id=src.match(/^media:([a-f0-9]{64}\.(?:png|jpg|webp))$/)?.[1];
    if(!id)return escape(token.content||'[图片地址无效]');
    token.attrSet('src',`${privateMedia?'/api/media/':'/assets/uploads/'}${id}`);
    token.attrSet('loading','lazy');token.attrSet('referrerpolicy','no-referrer');
    return base(tokens,i,opts,env,self);
  };
  const original=md.validateLink.bind(md);
  md.validateLink=(url)=>/^media:[a-f0-9]{64}\.(png|jpg|webp)$/.test(url) || ((/^https:\/\//.test(url)||/^#[a-zA-Z0-9_-]+$/.test(url)) && original(url));
  md.renderer.rules.heading_open=(tokens,i)=>`<h${Math.min(6,Number(tokens[i].tag.slice(1))+1)}>`;
  md.renderer.rules.heading_close=(tokens,i)=>`</h${Math.min(6,Number(tokens[i].tag.slice(1))+1)}>`;
  return md.render(body);
}
export function docHTML(doc:ContentDoc,privateMedia=false):string {
  const prefix=privateMedia?'/api/media/':'/assets/uploads/';
  if(doc.kind==='post'||doc.kind==='project')return `${localized(doc.title,'h1')}${localized(doc.summary,'p')}${doc.cover?`<img class="cover" alt="" src="${prefix}${doc.cover}">`:''}<div class="prose" data-original translate="no">${markdown(doc.body,privateMedia)}</div>`;
  if(doc.kind==='page')return `${localized(doc.title,'h1')}${localized(doc.subtitle,'p')}${localized(doc.description,'p')}${localized(doc.about,'p')}`;
  return `<h1>外观预览</h1><p>${escape(doc.preset)}</p><p>背景位置：${doc.position} · 遮罩：${Math.round(doc.overlay*100)}%</p><a href="#">强调色示例</a>`;
}
export function themeCSS(doc:ContentDoc|undefined,privateMedia=false):string {
  if(doc?.kind!=='appearance')return '';
  const bg={lilies:'#0d0d16','deep-space':'#091424',dusk:'#1b1024'}[doc.preset];
  return `:root{--bg:${bg};--accent:${doc.accent}}body{background-color:var(--bg)}${doc.background?`body{background-image:linear-gradient(rgb(0 0 0 / ${doc.overlay}),rgb(0 0 0 / ${doc.overlay})),url("${privateMedia?'/api/media/':'/assets/uploads/'}${doc.background}");background-position:${doc.position};background-size:cover;background-attachment:fixed}`:''}`;
}
export function allMedia(snapshot:Snapshot):string[]{return [...new Set(Object.values(snapshot.items).flatMap(imageRefs))].sort();}
