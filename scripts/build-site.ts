import {readFile,writeFile,readdir,mkdir,rm} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
import {load} from 'cheerio';
import {snapshotSchema,requireCore,type ContentDoc} from '../admin/shared/content.ts';
import {localized,escape,docHTML,themeCSS,allMedia} from '../admin/shared/render.ts';
const root=process.env.SITE_BUILD_ROOT?resolve(process.env.SITE_BUILD_ROOT):resolve(import.meta.dirname,'..'),dist=resolve(root,'dist'),templates=resolve(root,'site-templates');
const snapshot=requireCore(snapshotSchema.parse(JSON.parse(await readFile(resolve(root,'content/published.json'),'utf8'))));
const appearance=snapshot.items.appearance;
if(appearance.kind!=='appearance')throw new Error('Missing appearance');
const pages=Object.values(snapshot.items).filter(x=>x.kind==='page'),projects=Object.values(snapshot.items).filter(x=>x.kind==='project').sort((a,b)=>a.order-b.order);
const posts=Object.values(snapshot.items).filter(x=>x.kind==='post').sort((a,b)=>b.date.localeCompare(a.date)||a.order-b.order);
async function files(p:string):Promise<string[]>{return(await Promise.all((await readdir(p,{withFileTypes:true})).map(e=>e.isDirectory()?files(resolve(p,e.name)):[resolve(p,e.name)]))).flat();}
const write=async(path:string,html:string)=>{const to=resolve(dist,path);if(!to.startsWith(dist+ '/' )&&!to.startsWith(dist+'\\'))throw new Error('Invalid output path');await mkdir(dirname(to),{recursive:true});await writeFile(to,html);};
// Only the two generated collections are replaced; original novels and audio are untouched.
for(const folder of ['blog','research/projects']){const target=resolve(dist,folder);if(!target.startsWith(dist+sep))throw new Error('Unsafe generated output path');await rm(target,{recursive:true,force:true});}
const nav=appearance.nav.map(n=>`<a href="/${n.route}/">${localized(n.label)}</a>`).join('');
const shared=(raw:string,path:string)=>{
  const $=load(raw);$('.site-nav nav').html(nav);$(`.site-nav nav a[href="/${path.split('/')[0]}/"]`).attr('aria-current','page');
  $('head').append('<link rel="stylesheet" href="/site-theme.css"><script type="module" src="/site-settings.js"></script>');
  return $;
};
for(const f of await files(templates)){
  if(!f.endsWith('.html'))continue;const path=relative(templates,f).replaceAll('\\','/'),$=shared(await readFile(f,'utf8'),path);
  const route=path==='index.html'?'home':path.split('/')[0];
  const page=pages.find(p=>p.route===route);
  if(page&&(path==='index.html'||path===`${route}/index.html`)){
    if(route==='home'){
      $('.intro-copy').html(localized(page.title));
      const nodes=new Map<string,string>();for(const name of ['research','library','music']){const n=$(`.destinations button[data-panel="${name==='library'?'fiction':name}"]`);nodes.set(name,n.toString());}
      $('.destinations').html(appearance.nav.map(n=>n.route==='blog'?`<a class="blog-destination" href="/blog/"><span class="destination-no">04</span><span>${localized(n.label,'strong')}<small>JOURNAL</small></span><span>↗</span></a>`:nodes.get(n.route)||'').join(''));
      appearance.nav.forEach(n=>$(`.destinations button[data-panel="${n.route==='library'?'fiction':n.route}"] strong`).html(localized(n.label)));
    }else{
      $('h1').html(localized(page.title));$('title').text(`${page.title.zh} · FlashBlank7`).attr('data-copy-zh',`${page.title.zh} · FlashBlank7`).attr('data-copy-en',`${page.title.en||page.title.zh} · FlashBlank7`);
      $('.lede').html(localized(page.subtitle));
      if(route==='research'){
        $('.research-intro .statement').html(localized(page.subtitle));$('.research-intro p').last().html(localized(page.description));$('.lede').empty();
        const about=$('.about-grid > div').last();about.find('p').slice(0,2).remove();about.prepend(localized(page.about,'p'));
        $('.projects').html('<p class="eyebrow">SELECTED PROJECTS</p>'+projects.map((d,i)=>`<article class="project"><span class="project-index">${String(i+1).padStart(2,'0')}</span><div><p class="meta">${escape(d.category)}</p>${localized(d.title,'h2')}${localized(d.summary,'p')}<ul class="tags">${d.tags.map(t=>`<li>${escape(t)}</li>`).join('')}</ul>${d.body.trim()?`<a class="text-link" href="/research/projects/${d.id}/">${localized({zh:'项目案例 ↗',en:'Case study ↗'})}</a> · `:''}${d.url?`<a class="text-link" href="${escape(d.url)}" rel="noopener noreferrer" target="_blank">GitHub ↗</a>`:''}</div></article>`).join(''));
      }else if(page.description.zh||page.description.en)$('.page-heading').append(localized(page.description,'p'));
    }
  }
  await write(path,$.html());
}
function shell(title:string,body:string,path:string,titleEn=title){return shared(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title data-copy-zh="${escape(title)} · FlashBlank7" data-copy-en="${escape(titleEn)} · FlashBlank7" translate="no">${escape(title)} · FlashBlank7</title><link rel="stylesheet" href="/content.css"><link rel="stylesheet" href="/i18n.css"><script type="module" src="/i18n.js"></script></head><body class="content-page"><a class="skip-link" href="#content">跳到内容</a><header class="site-nav"><a class="brand" href="/">F/B7</a><nav></nav></header><main id="content">${body}</main><footer class="site-footer"><a href="/">FLASHBLANK7</a><a href="#content">↑</a></footer></body></html>`,path).html();}
const blog=snapshot.items['page-blog'];
if(blog.kind!=='page')throw new Error('Missing blog page');
await write('blog/index.html',shell(blog.title.zh,`${localized(blog.title,'h1')}${localized(blog.subtitle,'p')}${localized(blog.description,'p')}${posts.length?posts.map(p=>`<article class="journal-card"><p class="meta">${p.date}</p><a href="/blog/${p.id}/">${localized(p.title,'h2')}</a>${localized(p.summary,'p')}</article>`).join(''):localized({zh:'这里还没有公开的随记。',en:'No journal entries published yet.'},'p')}`,'blog/index.html',blog.title.en||blog.title.zh));
for(const p of posts)await write(`blog/${p.id}/index.html`,shell(p.title.zh,`<p class="meta">${p.date}</p>${docHTML(p)}`,`blog/${p.id}/index.html`,p.title.en||p.title.zh));
for(const p of projects)if(p.body.trim())await write(`research/projects/${p.id}/index.html`,shell(p.title.zh,docHTML(p),`research/projects/${p.id}/index.html`,p.title.en||p.title.zh));
await write('site-theme.css',`${themeCSS(appearance)}\n.cover,.prose img{max-width:100%;height:auto;border-radius:8px}.journal-card{padding:25px 0;border-bottom:1px solid var(--line)}[data-copy-zh]{white-space:pre-line}.blog-destination{display:flex;gap:16px;align-items:center;color:inherit;padding:15px;border-bottom:1px solid #ffffff20}.blog-destination small{display:block;font-size:9px;letter-spacing:.2em}.site-nav nav{flex-wrap:wrap}.prose pre{overflow:auto}.prose img{display:block;margin:24px auto}\n@media(max-width:760px){.site-nav{gap:15px}.site-nav nav{gap:12px}.destinations{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px;bottom:12%}.destinations button,.destinations .blog-destination{width:100%;min-width:0;padding:10px 0;gap:8px;align-items:center}.destinations .destination-arrow,.blog-destination>span:last-child{margin-left:auto}}`);
await write('site-ui.json',JSON.stringify({pages:pages.map(p=>({route:p.route,title:p.title,subtitle:p.subtitle,description:p.description})),nav:appearance.nav}));
await write('release.json',JSON.stringify({version:1,pages:(await files(dist)).filter(f=>f.endsWith('.html')).map(f=>relative(dist,f).replaceAll('\\','/')),media:allMedia(snapshot)}));
console.log(`Built ${posts.length} posts and ${projects.filter(p=>p.body.trim()).length} case studies. Private content is never read by this build.`);
