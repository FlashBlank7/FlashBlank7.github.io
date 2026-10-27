import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {type ContentDoc,type Snapshot,type Bilingual,imageRefs,MAX_IMAGE} from '../shared/content.ts';
import {docHTML,themeCSS} from '../shared/render.ts';
import './studio.css';
type RecordItem={doc:ContentDoc;revision:string|null};
type Job={id:string;status:string;commit_sha:string|null;message:string|null;created:number;selections:string;cursor:number;media:string};
const statuses:Record<string,string>={prepared:'等待确认',uploading:'准备资源',committing:'提交中',submitted:'已提交',building:'构建中',live:'已上线',failed:'构建失败',cancelled:'已取消'};
let csrf='';
class ApiError extends Error {constructor(public status:number,public data:any){super(data.error||'请求失败');}}
async function api(path:string,method='GET',data?:any):Promise<any>{
  const res=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{...(method!=='GET'?{'X-CSRF-Token':csrf}:{}),...(data instanceof Blob?{'Content-Type':data.type}:data?{'Content-Type':'application/json'}:{})},body:data instanceof Blob?data:data?JSON.stringify(data):undefined});
  let result:any;try{result=await res.json();}catch{throw new Error('服务未返回有效结果；保存或发布尚未确认成功');}
  if(!res.ok)throw new ApiError(res.status,result);return result;
}
const errorText=(e:unknown)=>e instanceof Error?e.message:'操作失败';
function download(name:string,text:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function Bi({name,value,onChange}:{name:string;value:Bilingual;onChange:(v:Bilingual)=>void}){return <fieldset><legend>{name}</legend><label>中文<input value={value.zh} onChange={e=>onChange({...value,zh:e.target.value})}/></label><label>English<input value={value.en} onChange={e=>onChange({...value,en:e.target.value})}/></label></fieldset>;}
async function compress(file:File):Promise<Blob>{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('选择 20 MiB 以下的 JPG、PNG 或 WebP 图片');
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width*bitmap.height>40_000_000)throw new Error('图片像素过大，请先缩小');
    const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
    canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
    for(const quality of [.86,.72,.55]){const blob=await new Promise<Blob|null>(r=>canvas.toBlob(r,'image/webp',quality));if(blob&&blob.size<=MAX_IMAGE)return blob;}
    throw new Error('压缩后仍超过 2 MiB，请选择更小的图片');
  }finally{bitmap.close();}
}
function Preview({doc,appearance}:{doc:ContentDoc;appearance?:ContentDoc}){
  const css=themeCSS(doc.kind==='appearance'?doc:appearance,true);
  return <section className="preview" aria-label="私密预览"><style>{css.replaceAll(':root',' .preview').replaceAll('body','.preview')}</style><div dangerouslySetInnerHTML={{__html:docHTML(doc,true)}}/>{doc.kind==='appearance'&&<><p>旅行，求索</p><p>理之道，就在其中</p><p>这张背景和配色尚未公开。</p></>}</section>;
}
function App(){
  const [user,setUser]=useState<string|null>(null),[ready,setReady]=useState(false),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  const [records,setRecords]=useState<RecordItem[]>([]),[active,setActive]=useState<RecordItem|null>(null),[saved,setSaved]=useState(''),[saveState,setSaveState]=useState('已保存');
  const [section,setSection]=useState('post'),[showPreview,setShowPreview]=useState(false),[conflict,setConflict]=useState<RecordItem|null>(null);
  const [selected,setSelected]=useState<Record<string,'publish'|'remove'>>({}),[jobs,setJobs]=useState<Job[]>([]),[review,setReview]=useState<{job:Job;snapshot:Snapshot}|null>(null);
  const [published,setPublished]=useState<Snapshot|null>(null);const editor=useRef<HTMLTextAreaElement>(null),saveMutex=useRef(false),activeRef=useRef(active),savedRef=useRef(saved);
  activeRef.current=active;savedRef.current=saved;
  const dirty=!!active&&JSON.stringify(active.doc)!==saved;
  async function loadRecords(){const list=await api('/api/content');const values:RecordItem[]=[];for(const e of list.entries)values.push(await api(`/api/content/${e.id}`));setRecords(values);return values;}
  async function initialize(){try{const s=await api('/api/session');csrf=s.csrf;setUser(s.user);await loadRecords();setPublished(await api('/api/published'));}catch(e){setNotice(errorText(e));}finally{setReady(true);}}
  useEffect(()=>{void initialize();},[]);
  useEffect(()=>{const before=(e:BeforeUnloadEvent)=>{if(dirty){e.preventDefault();e.returnValue='';}};addEventListener('beforeunload',before);return()=>removeEventListener('beforeunload',before);},[dirty]);
  async function save():Promise<boolean>{
    const item=activeRef.current;if(!item||JSON.stringify(item.doc)===savedRef.current)return true;
    if(saveMutex.current)return false;
    saveMutex.current=true;setSaveState('保存中…');
    try{
      const result=await api(`/api/content/${item.doc.id}`,'PUT',item);
      const updated={doc:item.doc,revision:result.revision};
      setRecords(r=>[...r.filter(x=>x.doc.id!==item.doc.id),updated]);
      setActive(current=>current?.doc.id===item.doc.id?{doc:current.doc,revision:result.revision}:current);
      setSaved(JSON.stringify(item.doc));setSaveState('已保存到私有库');setConflict(null);return true;
    }catch(e){setSaveState('保存失败');setNotice(errorText(e));if(e instanceof ApiError&&e.status===409)setConflict(e.data.remote);return false;}
    finally{saveMutex.current=false;}
  }
  useEffect(()=>{if(!dirty||conflict||busy)return;const t=setTimeout(()=>void save(),15000);return()=>clearTimeout(t);},[active,dirty,conflict,busy]);
  useEffect(()=>{if(!user||section!=='jobs')return;const refresh=()=>api('/api/jobs').then(setJobs).catch(e=>setNotice(errorText(e)));void refresh();const t=setInterval(()=>void refresh(),15000);return()=>clearInterval(t);},[section,user]);
  async function navigate(next:string,item?:RecordItem){if(!await save())return;setSection(next);setActive(item||null);setSaved(item?JSON.stringify(item.doc):'');setSaveState('已保存');setConflict(null);setReview(null);}
  function edit(field:string,value:any){setActive(a=>a?{...a,doc:{...a.doc,[field]:value} as ContentDoc}:a);setSaveState('尚未保存');}
  async function create(kind:'post'|'project'){
    if(!await save())return;const id=`${kind}-${Date.now().toString(36)}`;
    const common={id,kind,title:{zh:'',en:''},summary:{zh:'',en:''},body:'',order:records.filter(x=>x.doc.kind===kind).length,cover:null};
    const doc:ContentDoc=kind==='post'?{...common,kind,date:new Date().toISOString().slice(0,10)}:{...common,kind,category:'',tags:[],url:''};
    setActive({doc,revision:null});setSaved('');setConflict(null);setShowPreview(false);
  }
  async function upload(file:File,target:'body'|'cover'|'background'){
    setBusy(true);setNotice('正在处理图片；原始文件不会上传。');
    try{const result=await api('/api/media','POST',await compress(file));if(target==='body'){const d=activeRef.current?.doc;if(d&&'body'in d)edit('body',d.body+`\n\n![图片说明](media:${result.id})\n`);}else edit(target,result.id);setNotice('图片已保存到私有库，发布前不会公开。');}catch(e){setNotice(errorText(e));}finally{setBusy(false);}
  }
  function format(before:string,after=''){const d=active?.doc;if(!d||!('body'in d)||!editor.current)return;const el=editor.current,start=el.selectionStart,end=el.selectionEnd;edit('body',d.body.slice(0,start)+before+d.body.slice(start,end)+after+d.body.slice(end));requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+before.length,end+before.length);});}
  async function prepareRelease(){
    if(!await save())return;setBusy(true);
    try{const latest=await api('/api/content');const revisions=new Map(latest.entries.map((e:any)=>[e.id,e.revision]));const selections=Object.entries(selected).map(([id,action])=>({id,action,revision:action==='publish'?revisions.get(id)||null:null}));setReview(await api('/api/publish/prepare','POST',{selections}));setNotice('请检查下方快照。只有这里列出的修改会公开。');}catch(e){setNotice(errorText(e));}finally{setBusy(false);}
  }
  async function runJob(id:string,confirm=false){
    setBusy(true);setNotice('发布中；可查看发布记录，关闭页面后可继续。');
    try{
      let job=confirm?await api(`/api/jobs/${id}/confirm`,'POST'):await api(`/api/jobs/${id}`);
      while(['uploading','committing'].includes(job.status)){job=await api(`/api/jobs/${id}/step`,'POST');setNotice(`${statuses[job.status]} · ${job.cursor}/${JSON.parse(job.media).length} 张新图片`);}
      setReview(null);setSelected({});setSection('jobs');setJobs(await api('/api/jobs'));setNotice('已提交，等待 GitHub 构建和部署；这还不代表已经上线。');
    }catch(e){setNotice(errorText(e));setSection('jobs');setJobs(await api('/api/jobs').catch(()=>[]));}finally{setBusy(false);}
  }
  async function exportContent(){
    setBusy(true);try{
      const items=await loadRecords(),media:Record<string,string>={};
      for(const id of new Set(items.flatMap(x=>imageRefs(x.doc)))){const r=await fetch(`/api/media/${id}`,{cache:'no-store'});if(!r.ok)throw new Error('图片导出失败');const blob=await r.blob();media[id]=await new Promise<string>((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(String(fr.result));fr.onerror=reject;fr.readAsDataURL(blob);});}
      download(`flashblank7-private-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify({version:1,items:items.map(x=>x.doc),media},null,2));setNotice('已导出私有内容，请妥善保存下载文件。');
    }catch(e){setNotice(errorText(e));}finally{setBusy(false);}
  }
  const appearance=active?.doc.kind==='appearance'?active.doc:records.find(x=>x.doc.kind==='appearance')?.doc;
  const d=active?.doc;
  if(!ready)return <main className="login"><p>正在连接 Studio…</p></main>;
  if(!user)return <main className="login"><span className="eyebrow">FLASHBLANK7 / PRIVATE STUDIO</span><h1>自己的世界，<br/>慢慢整理。</h1><p>博客、项目与网站外观的管理空间。</p><a className="button primary" href="/auth/login">使用 GitHub 登录 ↗</a><p className="hint">仅限 FlashBlank7。草稿与未发布图片不会公开。</p>{notice&&<p role="status" className="notice">{notice}</p>}<a href="https://flashblank7.github.io/" target="_blank" rel="noreferrer">查看个人网站 ↗</a></main>;
  return <div className="studio"><aside><a className="brand" href="/">F/B7 <small>STUDIO</small></a><p className="privacy">● 私有工作空间</p><nav>{[['post','随记'],['project','项目'],['page','页面'],['appearance','外观'],['jobs','发布记录']].map(([key,label])=><button key={key} disabled={busy} aria-current={section===key?'page':undefined} onClick={()=>void navigate(key,key==='appearance'?records.find(r=>r.doc.kind==='appearance'):undefined)}>{label}</button>)}</nav><div className="aside-bottom"><a href="https://flashblank7.github.io/" target="_blank" rel="noreferrer">查看网站 ↗</a><button disabled={busy} onClick={()=>void exportContent()}>导出私有内容</button><button disabled={busy} onClick={async()=>{if(!await save())return;await api('/api/logout','POST');location.reload();}}>退出此设备</button><button disabled={busy} onClick={async()=>{if(!await save())return;await api('/api/logout-all','POST');location.reload();}}>退出所有设备</button></div></aside>
    <main><header className="workspace-heading"><div><p className="eyebrow">CREATE / REFLECT / PUBLISH</p><h1>{{post:'一些随记',project:'项目与过程',page:'页面内容',appearance:'网站外观',jobs:'发布记录'}[section]}</h1></div><span className="account">FlashBlank7</span></header>
      {notice&&<div className="notice" role="status">{notice}<button aria-label="关闭提示" onClick={()=>setNotice('')}>×</button></div>}
      {!records.length&&<section className="empty"><h2>接入现有网站</h2><p>将当前已公开的介绍与外观导入私有内容库，不会覆盖已有草稿。</p><button disabled={busy} onClick={async()=>{setBusy(true);try{let r;do{r=await api('/api/import-current','POST');}while(r.remaining>0);await loadRecords();setNotice('导入完成。');}catch(e){setNotice(errorText(e));}finally{setBusy(false);}}}>导入现有内容</button></section>}
      {section==='jobs'?<section className="records">{!jobs.length&&<p className="empty">还没有发布记录。</p>}{jobs.map(j=><article key={j.id}><div><strong>{statuses[j.status]||j.status}</strong><p>{new Date(j.created).toLocaleString()} · {j.id.slice(0,8)}</p>{j.message&&<p className="error">{j.message}</p>}{j.commit_sha&&<a target="_blank" rel="noreferrer" href={`https://github.com/FlashBlank7/FlashBlank7.github.io/commit/${j.commit_sha}`}>查看提交 ↗</a>}</div><div className="actions"><button disabled={busy} onClick={async()=>{try{const v=await api(`/api/jobs/${j.id}`);setJobs(a=>a.map(x=>x.id===j.id?v:x));}catch(e){setNotice(errorText(e));}}}>刷新状态</button>{['uploading','committing'].includes(j.status)&&<button disabled={busy} onClick={()=>void runJob(j.id)}>继续发布</button>}{j.status==='prepared'&&<button onClick={async()=>setReview(await api(`/api/jobs/${j.id}/preview`))}>查看快照</button>}{['prepared','uploading','committing'].includes(j.status)&&<button disabled={busy} onClick={async()=>{try{await api(`/api/jobs/${j.id}/cancel`,'POST');setJobs(await api('/api/jobs'));}catch(e){setNotice(errorText(e));}}}>取消任务</button>}{j.status==='live'&&<button disabled={busy} onClick={async()=>{try{setReview(await api('/api/publish/restore','POST',{commit:j.commit_sha}));}catch(e){setNotice(errorText(e));}}}>预览恢复此版本</button>}</div></article>)}</section>:<>
      {['post','project'].includes(section)&&<div className="actions"><button disabled={busy} onClick={()=>void create(section as 'post'|'project')}>＋ 新建{section==='post'?'随记':'项目'}</button></div>}
      {section!=='appearance'&&<div className="collection">{records.filter(x=>x.doc.kind===section).sort((a,b)=>a.doc.order-b.doc.order).map(r=><article key={r.doc.id} className={d?.id===r.doc.id?'selected':''}><label className="check"><input type="checkbox" checked={!!selected[r.doc.id]} disabled={busy} onChange={e=>setSelected(s=>{const next={...s};if(e.target.checked)next[r.doc.id]='publish';else delete next[r.doc.id];return next;})}/><span className="sr-only">选择发布 {r.doc.title.zh}</span></label><button className="entry" disabled={busy} onClick={()=>void navigate(section,r)}><strong>{r.doc.title.zh||'未命名'}</strong><span>{published?.items[r.doc.id]?'已有公开版本 · 修改需发布':'私有草稿'}</span></button>{selected[r.doc.id]&&published?.items[r.doc.id]&&!['page','appearance'].includes(r.doc.kind)&&<select aria-label="发布操作" value={selected[r.doc.id]} onChange={e=>setSelected(s=>({...s,[r.doc.id]:e.target.value as any}))}><option value="publish">更新</option><option value="remove">撤下</option></select>}</article>)}</div>}
      {d&&<section className="editor"><div className="editor-head"><span>内容 ID · {d.id}</span><span role="status">{dirty?'有未保存修改 · ':''}{saveState}</span><button disabled={busy||saveMutex.current||!dirty} onClick={()=>void save()}>保存草稿</button><button onClick={()=>setShowPreview(!showPreview)}>{showPreview?'返回编辑':'私密预览'}</button></div>
      {conflict&&<div className="conflict"><h3>检测到其他设备的修改</h3><p>你的版本仍保留在编辑器中。先下载本地副本，再比较并加载远端版本；不会自动覆盖。</p><button onClick={()=>download(`${d.id}-local-copy.json`,JSON.stringify(d,null,2))}>下载当前副本</button><details><summary>查看远端内容</summary><pre>{JSON.stringify(conflict.doc,null,2)}</pre></details><button onClick={()=>{download(`${d.id}-local-copy.json`,JSON.stringify(d,null,2));setActive(conflict);setSaved(JSON.stringify(conflict.doc));setConflict(null);}}>备份当前内容并加载远端</button></div>}
      {showPreview?<Preview doc={d} appearance={appearance}/>:<div className="fields"><Bi name="标题" value={d.title} onChange={v=>edit('title',v)}/>
        {(d.kind==='post'||d.kind==='project')&&<label>显示顺序<input type="number" min="0" max="999" value={d.order} onChange={e=>edit('order',Number(e.target.value))}/></label>}
        {(d.kind==='post'||d.kind==='project')&&<><Bi name="简介" value={d.summary} onChange={v=>edit('summary',v)}/>{d.kind==='post'?<label>日期<input type="date" value={d.date} onChange={e=>edit('date',e.target.value)}/></label>:<><label>项目类型<input value={d.category} onChange={e=>edit('category',e.target.value)}/></label><label>技术标签（逗号分隔）<input key={d.id} defaultValue={d.tags.join(', ')} onBlur={e=>edit('tags',e.target.value.split(',').map(s=>s.trim()).filter(Boolean))}/></label><label>项目链接（HTTPS）<input value={d.url} onChange={e=>edit('url',e.target.value)}/></label></>}
        <label className="upload">上传封面<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0],'cover');e.target.value='';}}/></label>{d.cover&&<div className="image-row"><img alt="封面" src={`/api/media/${d.cover}`}/><button onClick={()=>edit('cover',null)}>移除封面</button></div>}
        <div className="markdown"><div className="toolbar"><button onClick={()=>format('**','**')}>粗体</button><button onClick={()=>format('\n## ')}>标题</button><button onClick={()=>format('\n- ')}>列表</button><button onClick={()=>format('\n> ')}>引用</button><button onClick={()=>format('`','`')}>代码</button><button onClick={()=>format('[','](https://example.com)')}>链接</button><label>插图<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0],'body');e.target.value='';}}/></label></div><label>正文 · Markdown<textarea ref={editor} value={d.body} onChange={e=>edit('body',e.target.value)} rows={22} placeholder="从一段真实的经历开始。支持 Markdown，不执行 HTML 或脚本。"/></label></div></>}
        {d.kind==='page'&&d.route!=='home'&&<><Bi name="副标题" value={d.subtitle} onChange={v=>edit('subtitle',v)}/><Bi name="介绍" value={d.description} onChange={v=>edit('description',v)}/>{d.route==='research'&&<Bi name="关于我" value={d.about} onChange={v=>edit('about',v)}/>}</>}
        {d.kind==='appearance'&&<><label>主题<select value={d.preset} onChange={e=>edit('preset',e.target.value)}><option value="lilies">现有 Lilies</option><option value="deep-space">深空蓝</option><option value="dusk">暮色紫</option></select></label><label>强调色<input type="color" value={d.accent} onChange={e=>edit('accent',e.target.value)}/></label><label className="upload">上传背景图<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={e=>{if(e.target.files?.[0])void upload(e.target.files[0],'background');e.target.value='';}}/></label>{d.background&&<div className="image-row"><img src={`/api/media/${d.background}`} alt="背景"/><button onClick={()=>edit('background',null)}>清除背景</button></div>}<label>背景位置<select value={d.position} onChange={e=>edit('position',e.target.value)}><option value="center">居中</option><option value="top">顶部</option><option value="bottom">底部</option></select></label><label>遮罩亮度 · {Math.round(d.overlay*100)}%<input type="range" min="0.25" max="0.95" step="0.01" value={d.overlay} onChange={e=>edit('overlay',Number(e.target.value))}/></label><h3>导航名称与顺序</h3>{d.nav.map((n,i)=><div className="nav-item" key={n.route}><Bi name={n.route} value={n.label} onChange={v=>edit('nav',d.nav.map(x=>x.route===n.route?{...x,label:v}:x))}/><button disabled={i===0} onClick={()=>{const nav=[...d.nav];[nav[i-1],nav[i]]=[nav[i],nav[i-1]];edit('nav',nav);}}>上移</button></div>)}<label className="check"><input type="checkbox" checked={!!selected.appearance} onChange={e=>setSelected(s=>{const next={...s};if(e.target.checked)next.appearance='publish';else delete next.appearance;return next;})}/>将外观加入本次发布</label></>}
      </div>}</section>}
      </>}
      {Object.keys(selected).length>0&&!review&&<div className="publish-bar"><span>已选择 {Object.keys(selected).length} 项修改</span><button className="primary" disabled={busy} onClick={()=>void prepareRelease()}>检查并预览发布 ↗</button></div>}
      {review&&<section className="release-review"><h2>确认发布快照</h2><p>这些内容将进入公开仓库和网站。未选中的草稿不会一起发布。撤下不能删除已经公开的 Git 历史。</p>{(JSON.parse(review.job.selections).length?JSON.parse(review.job.selections):Object.keys(review.snapshot.items).map(id=>({id,action:'publish'}))).map((s:any)=><details key={s.id} open><summary>{s.action==='remove'?'撤下':'发布'} · {review.snapshot.items[s.id]?.title.zh||s.id}</summary>{s.action!=='remove'&&<Preview doc={review.snapshot.items[s.id]} appearance={review.snapshot.items.appearance}/>}</details>)}<div className="actions"><button className="primary" disabled={busy} onClick={()=>void runJob(review.job.id,true)}>确认公开这些修改</button><button disabled={busy} onClick={()=>setReview(null)}>返回编辑</button></div></section>}
    </main></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
