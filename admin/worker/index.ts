import {Hono} from 'hono';
import {bodyLimit} from 'hono/body-limit';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import {z,ZodError} from 'zod';
import {OWNER_ID,PRIVATE_REPO,PUBLIC_REPO,idSchema,validateDoc,snapshotSchema,imageType,MAX_IMAGE} from '../shared/content.ts';
import {docHTML,themeCSS,escape} from '../shared/render.ts';
import {GitHub,Fault,sha256,random,b64,ghRequest,type Env} from './github.ts';
import {audit,prepare,confirm,step,refresh,cancel,getJob,selectionSchema} from './publishing.ts';
type Vars={session:{hash:string;csrf:string;expires:number};gh:GitHub};
export const app=new Hono<{Bindings:Env;Variables:Vars}>();
const COOKIE='__Host-studio', OAUTH='__Host-studio-oauth';
const cookieOptions={httpOnly:true,secure:true,sameSite:'Lax' as const,path:'/'};
const csp="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'";
app.use('*',async(c,next)=>{
  c.header('Cache-Control','no-store');c.header('Referrer-Policy','no-referrer');c.header('X-Content-Type-Options','nosniff');
  c.header('Content-Security-Policy',csp);c.header('X-Frame-Options','SAMEORIGIN');
  c.header('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(new URL(c.req.url).protocol==='https:')c.header('Strict-Transport-Security','max-age=31536000');
  c.set('gh',new GitHub(c.env));await next();
});
app.use('/api/*',bodyLimit({maxSize:MAX_IMAGE+32768,onError:c=>c.json({error:'请求过大'},413)}));
app.onError((e,c)=>c.json({error:e instanceof Fault?e.message:e instanceof ZodError?'输入格式不正确，请检查必填项、链接和大小':'服务暂时不可用；操作未确认成功'},e instanceof Fault?e.status as 400:e instanceof ZodError?400:503));
const configured=(e:Env)=>e.APP_ORIGIN?.startsWith('https://')&&!e.APP_ORIGIN.includes('CONFIGURE')&&!!e.GITHUB_CLIENT_ID&&!!e.GITHUB_CLIENT_SECRET&&!!e.GITHUB_PRIVATE_KEY&&!!e.GITHUB_INSTALLATION_ID;
async function limited(env:Env,key:string,max:number){
  const now=Date.now();
  await env.DB.prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN ? ELSE expires END').bind(key,now+60000,now,now,now+60000).run();
  const row=await env.DB.prepare('SELECT count FROM rate_limits WHERE key=?').bind(key).first<{count:number}>();
  if((row?.count||0)>max)throw new Fault(429,'操作过于频繁，请稍后重试');
}
app.get('/auth/login',async c=>{
  if(!configured(c.env))throw new Fault(503,'后台尚未完成云端认证配置；目前不允许登录');
  await limited(c.env,`login:${await sha256(c.req.header('CF-Connecting-IP')||'unknown')}`,10);
  const state=random(), hash=await sha256(state);
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM oauth_states WHERE expires<?').bind(Date.now()),c.env.DB.prepare('INSERT INTO oauth_states(hash,expires) VALUES(?,?)').bind(hash,Date.now()+600000)]);
  setCookie(c,OAUTH,state,{...cookieOptions,maxAge:600});
  const url=new URL('https://github.com/login/oauth/authorize');
  url.search=new URLSearchParams({client_id:c.env.GITHUB_CLIENT_ID,redirect_uri:`${c.env.APP_ORIGIN}/auth/callback`,state}).toString();
  return c.redirect(url.toString());
});
app.get('/auth/callback',async c=>{
  const state=c.req.query('state'),code=c.req.query('code');
  if(!configured(c.env)||!state||state!==getCookie(c,OAUTH)||!code||state.length>200||code.length>500)throw new Fault(403,'登录验证失败，请重新登录');
  const result=await c.env.DB.prepare('DELETE FROM oauth_states WHERE hash=? AND expires>? RETURNING hash').bind(await sha256(state),Date.now()).first();
  deleteCookie(c,OAUTH,cookieOptions);
  if(!result)throw new Fault(403,'登录链接已失效');
  const response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:c.env.GITHUB_CLIENT_ID,client_secret:c.env.GITHUB_CLIENT_SECRET,code,redirect_uri:`${c.env.APP_ORIGIN}/auth/callback`})});
  const token:any=await response.json();if(!response.ok||!token.access_token)throw new Fault(403,'GitHub 登录未完成');
  const user=await ghRequest(token.access_token,'/user');
  // The user token is used only for identity; never sent to the browser or persisted.
  if(user.id!==OWNER_ID)throw new Fault(403,'此后台仅对网站所有者开放');
  const secret=random(),csrf=random(),hash=await sha256(secret);
  await c.env.DB.batch([c.env.DB.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),c.env.DB.prepare('INSERT INTO sessions(hash,csrf,expires) VALUES(?,?,?)').bind(hash,csrf,Date.now()+43200000)]);
  setCookie(c,COOKIE,secret,{...cookieOptions,maxAge:43200});await audit(c.env,'login',String(OWNER_ID));
  return c.redirect('/');
});
app.use('/api/*',async(c,next)=>{
  if(!configured(c.env))throw new Fault(503,'后台尚未完成认证配置');
  const raw=getCookie(c,COOKIE);if(!raw||raw.length>200)throw new Fault(401,'请先登录');
  const session=await c.env.DB.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').bind(await sha256(raw),Date.now()).first<Vars['session']>();
  if(!session)throw new Fault(401,'登录已过期，请重新登录');
  c.set('session',session);
  if(!['GET','HEAD'].includes(c.req.method)){
    if(c.req.header('Origin')!==c.env.APP_ORIGIN||c.req.header('X-CSRF-Token')!==session.csrf)throw new Fault(403,'请求来源验证失败');
    await limited(c.env,'writes',90);
  }
  await next();
});
app.get('/api/session',c=>c.json({user:'FlashBlank7',csrf:c.get('session').csrf,expires:c.get('session').expires}));
app.post('/api/logout',async c=>{await c.env.DB.prepare('DELETE FROM sessions WHERE hash=?').bind(c.get('session').hash).run();deleteCookie(c,COOKIE,cookieOptions);return c.json({ok:true});});
app.post('/api/logout-all',async c=>{await c.env.DB.exec('DELETE FROM sessions');deleteCookie(c,COOKIE,cookieOptions);await audit(c.env,'logout-all','sessions');return c.json({ok:true});});
app.get('/api/content',async c=>c.json(await c.get('gh').list()));
app.get('/api/content/:id',async c=>{const id=idSchema.parse(c.req.param('id'));const f=await c.get('gh').read(PRIVATE_REPO,`content/${id}.json`);return c.json({doc:validateDoc(f.value),revision:f.sha});});
app.put('/api/content/:id',async c=>{
  const id=idSchema.parse(c.req.param('id')),data=z.object({doc:z.unknown(),revision:z.string().regex(/^[a-f0-9]{40}$/).nullable()}).strict().parse(await c.req.json());
  const doc=validateDoc(data.doc);if(doc.id!==id)throw new Fault(400,'ID 不匹配');
  const gh=c.get('gh'),old=await gh.optional(PRIVATE_REPO,`content/${id}.json`);
  if((old?.sha||null)!==data.revision)return c.json({error:'另一台设备已经修改了此内容，请保存本地副本后重新加载',remote:old?{doc:old.value,revision:old.sha}:null},409);
  const saved=await gh.writePrivate(`content/${id}.json`,doc,data.revision||undefined);await audit(c.env,'save',id);
  return c.json({revision:saved.content.sha});
});
app.get('/api/published',async c=>c.json(snapshotSchema.parse((await c.get('gh').read(PUBLIC_REPO,'content/published.json')).value)));
app.post('/api/import-current',async c=>{
  const gh=c.get('gh'),snap=snapshotSchema.parse((await gh.read(PUBLIC_REPO,'content/published.json')).value);
  const existing=new Set((await gh.list()).entries.map((x:any)=>x.id));
  const next=Object.values(snap.items).find(d=>!existing.has(d.id));
  if(next)await gh.writePrivate(`content/${next.id}.json`,next);
  return c.json({imported:next?.id||null,remaining:Object.keys(snap.items).filter(id=>!existing.has(id)&&id!==next?.id).length});
});
app.post('/api/media',async c=>{
  const bytes=new Uint8Array(await c.req.arrayBuffer()),ext=imageType(bytes),id=`${await sha256(bytes)}.${ext}`,gh=c.get('gh');
  const old=await gh.optional(PRIVATE_REPO,`media/${id}`);
  if(!old)await gh.api(PRIVATE_REPO,`/contents/media/${id}`,'PUT',{message:`studio: upload ${id}`,content:b64(bytes),branch:'main'});
  await audit(c.env,'upload',id);return c.json({id});
});
app.get('/api/media/:id',async c=>{
  const id=c.req.param('id');if(!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(id))throw new Fault(400,'无效图片');
  const {bytes}=await c.get('gh').read(PRIVATE_REPO,`media/${id}`),type=imageType(bytes);
  return new Response(bytes as BodyInit,{headers:{'Content-Type':`image/${type==='jpg'?'jpeg':type}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}});
});
app.post('/api/preview',async c=>{
  const doc=validateDoc(await c.req.json());return c.json({html:docHTML(doc,true),css:themeCSS(doc,true)});
});
app.get('/api/export',async c=>{
  const gh=c.get('gh'), {head,entries}=await gh.list();
  // Export is streamed client-side one item at a time; this manifest contains no credentials.
  return c.json({repository:PRIVATE_REPO,revision:head,entries,notice:'正文与图片通过已认证接口逐项导出；完整历史可用 GitHub 私有仓库下载。'});
});
app.post('/api/publish/prepare',async c=>{const data=z.object({selections:selectionSchema}).strict().parse(await c.req.json());return c.json(await prepare(c.env,c.get('gh'),data.selections));});
app.post('/api/publish/restore',async c=>{const data=z.object({commit:z.string().regex(/^[a-f0-9]{40}$/)}).strict().parse(await c.req.json());return c.json(await prepare(c.env,c.get('gh'),[],data.commit));});
app.get('/api/jobs',async c=>c.json((await c.env.DB.prepare('SELECT * FROM jobs ORDER BY created DESC LIMIT 50').all()).results));
app.get('/api/jobs/:id',async c=>c.json(await refresh(c.env,c.get('gh'),c.req.param('id'))));
app.post('/api/jobs/:id/confirm',async c=>c.json(await confirm(c.env,c.get('gh'),c.req.param('id'))));
app.post('/api/jobs/:id/step',async c=>c.json(await step(c.env,c.get('gh'),c.req.param('id'))));
app.post('/api/jobs/:id/cancel',async c=>c.json(await cancel(c.env,c.get('gh'),c.req.param('id'))));
app.get('/api/jobs/:id/preview',async c=>{
  const job=await getJob(c.env,c.req.param('id')),file=await c.get('gh').read(PRIVATE_REPO,`releases/${job.id}.json`);
  if(file.sha!==job.candidate_sha)throw new Fault(409,'快照已变化');
  return c.json({job,snapshot:snapshotSchema.parse(file.value)});
});
app.all('/api/*',c=>c.json({error:'接口不存在'},404));
app.get('*',async c=>{
  const res=await c.env.ASSETS.fetch(c.req.raw);return new Response(res.body,{status:res.status,headers:{...Object.fromEntries(res.headers),'Cache-Control':'no-store','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
});
export default app;
