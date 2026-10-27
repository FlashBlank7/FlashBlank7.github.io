/** One-time migration. Existing templates and publication are never overwritten. */
import {readFile,writeFile,mkdir,readdir,access} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {load} from 'cheerio';
import {snapshotSchema,type ContentDoc,type Snapshot} from '../admin/shared/content.ts';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'dist');
const has=async(p:string)=>{try{await access(p);return true;}catch{return false;}};
async function files(p:string):Promise<string[]>{return(await Promise.all((await readdir(p,{withFileTypes:true})).map(e=>e.isDirectory()?files(resolve(p,e.name)):e.name.endsWith('.html')?[resolve(p,e.name)]:[]))).flat();}
const originals=await files(dist);
for(const f of originals){const to=resolve(root,'site-templates',relative(dist,f));if(!await has(to)){await mkdir(dirname(to),{recursive:true});await writeFile(to,await readFile(f));}}
await mkdir(resolve(root,'content'),{recursive:true});
const baseline=resolve(root,'content/baseline-pages.json');
if(!await has(baseline))await writeFile(baseline,JSON.stringify(originals.map(f=>relative(dist,f).replaceAll('\\','/')).sort(),null,2)+'\n');
const publication=resolve(root,'content/published.json');
if(await has(publication)){console.log('Publication exists; migration leaves it unchanged.');process.exit(0);}
const {messages}=await import(pathToFileURL(resolve(dist,'i18n-messages.js')).href);
const bi=(s:string)=>({zh:s,en:messages[s]?.[1]||s});
const items:Snapshot['items']={};
for(const [order,route] of ['home','research','library','music','blog'].entries()){
  const file=route==='home'?'index.html':`${route}/index.html`;
  const $=load(route==='blog'?'':await readFile(resolve(dist,file),'utf8'));
  items[`page-${route}`]={id:`page-${route}`,kind:'page',order,title:bi(route==='home'?$('.intro-copy').text():route==='blog'?'随记':$('h1').text()),route:route as any,subtitle:bi(route==='research'?$('.research-intro .statement').text():$('.lede').text()),description:bi(route==='research'?$('.research-intro p').last().text():''),about:bi(route==='research'?$('.about-grid > div').last().find('p').slice(0,2).map((_,e)=>$(e).text()).get().join('\n\n'):'')};
}
items['page-blog'].title={zh:'随记',en:'Journal'};
const $=load(await readFile(resolve(dist,'research/index.html'),'utf8'));
$('.project').each((i,e)=>{const card=$(e),id=['lilies-in-the-box','utoo','lilies','coc-room'][i];items[id]={kind:'project',id,title:bi(card.find('h2').text()),order:i,summary:bi(card.find('p:not(.meta)').text()),body:'',category:card.find('.meta').text(),tags:card.find('li').map((_,li)=>$(li).text()).get(),url:card.find('a').attr('href')||'',cover:null};});
items.appearance={id:'appearance',kind:'appearance',title:{zh:'网站外观',en:'Appearance'},order:0,preset:'lilies',accent:'#cfb0ed',background:null,position:'center',overlay:0.7,nav:[{route:'research',label:bi('研究与项目')},{route:'library',label:bi('小说与世界')},{route:'music',label:bi('音乐')},{route:'blog',label:{zh:'随记',en:'Journal'}}]};
await writeFile(publication,JSON.stringify(snapshotSchema.parse({version:1,items}),null,2)+'\n');
console.log(`Migrated ${originals.length} pages and ${Object.keys(items).length} editable entries.`);
