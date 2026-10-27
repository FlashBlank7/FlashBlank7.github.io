/** Local, one-time GitHub App setup. App credentials never leave memory except to Worker Secrets. */
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createPrivateKey,createSign,randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const configPath=resolve(root,process.argv[2]||'admin/wrangler.local.jsonc');
const config=JSON.parse(await readFile(configPath,'utf8'));
const origin=config.vars.APP_ORIGIN;
if(!/^https:\/\/flashblank7-studio\.[a-z0-9-]+\.workers\.dev$/.test(origin))throw new Error('Configure the deployed Worker origin before setting up GitHub.');
const ownerID=122159986, repositories=['FlashBlank7.github.io','flashblank7-site-content'];
const nonce=randomBytes(32).toString('hex'),local='http://127.0.0.1:8977';
const expires=Date.now()+55*60_000;
const manifest={
  name:`FlashBlank7 Studio ${randomBytes(3).toString('hex')}`,url:origin,
  description:'Private single-owner website studio; drafts stay in a separate private repository.',
  public:false,hook_attributes:{url:`${origin}/unused-webhook`,active:false},
  redirect_url:`${local}/callback`,callback_urls:[`${origin}/auth/callback`],
  setup_url:`${local}/installed/${nonce}`,setup_on_update:true,
  default_permissions:{contents:'write',actions:'read'},default_events:[],request_oauth_on_install:false,
};
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function page(title,body){return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{background:#101019;color:#e9e4f0;font:16px/1.8 system-ui;max-width:760px;padding:40px 24px;margin:8vh auto}h1{font-weight:400}button,a{display:inline-block;color:#e4c9ff;background:#282032;border:1px solid #987aaa;padding:12px 20px;border-radius:8px;font:inherit}code{color:#bdb0d1}li{margin:12px 0}</style><h1>${escape(title)}</h1>${body}</html>`;}
function respond(res,status,html,headers={}){res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action https://github.com; frame-ancestors 'none'; base-uri 'none'",...headers});res.end(html);}
async function github(path,token,method='GET',body){
  const r=await fetch(`https://api.github.com${path}`,{method,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json','User-Agent':'FlashBlank7-Studio-Setup','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!r.ok)throw new Error(`GitHub returned ${r.status}. No credentials were printed.`);
  return r.json();
}
function jwt(app){const now=Math.floor(Date.now()/1000),enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url');const content=`${enc({alg:'RS256',typ:'JWT'})}.${enc({iat:now-60,exp:now+540,iss:app.id})}`;const sign=createSign('RSA-SHA256');sign.update(content);return `${content}.${sign.sign(app.pem).toString('base64url')}`;}
async function wrangler(args,input){
  return new Promise((done,reject)=>{
    const child=spawn(process.execPath,[resolve(root,'node_modules/wrangler/bin/wrangler.js'),...args,'--config',configPath],{cwd:root,env:{...process.env,WRANGLER_SEND_METRICS:'false'},stdio:['pipe','pipe','pipe']});
    // Never print command output from a credential upload, even on failure.
    child.stdout.resume();child.stderr.resume();child.stdin.end(input||'');
    child.on('error',()=>reject(new Error('Unable to start Wrangler.')));child.on('exit',code=>code===0?done():reject(new Error(`Wrangler failed (${code}). Cloudflare configuration may need a retry.`)));
  });
}
let app=null,busy=false,converted=false,installed=false;
const server=createServer(async(req,res)=>{
  try{
    if(req.headers.host!=='127.0.0.1:8977'||req.method!=='GET')return respond(res,403,'Forbidden');
    if(Date.now()>expires)return respond(res,410,page('设置链接已过期','<p>请重新启动设置流程。</p>'));
    const url=new URL(req.url,local);
    if(url.pathname===`/start/${nonce}`){
      if(converted)return respond(res,409,page('应用已创建','<p>请继续已打开的 GitHub 安装页面，不要重复创建。</p>'));
      return respond(res,200,page('连接你自己的 GitHub 应用',`<p>在下一页登录 <strong>FlashBlank7</strong>，点击 <strong>Create GitHub App</strong>。名称和权限已填好。</p><p>随后选择 <strong>Only select repositories</strong>，只勾选：</p><ul>${repositories.map(r=>`<li>${escape(r)}</li>`).join('')}</ul><form action="https://github.com/settings/apps/new?state=${nonce}" method="post"><input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest))}"><button>前往 GitHub 创建私有应用 →</button></form><p>密钥由本机设置程序直接存入 Cloudflare Secrets，无需复制到聊天。</p>`),{'Set-Cookie':`studio-setup=${nonce}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3300`});
    }
    if(!req.headers.cookie?.split(';').map(s=>s.trim()).includes(`studio-setup=${nonce}`))return respond(res,403,page('设置会话不匹配','<p>请在最初打开设置页的同一个浏览器中继续。</p>'));
    if(busy)return respond(res,409,page('正在处理','<p>请等待当前操作完成，不要重复点击。</p>'));
    if(url.pathname==='/callback'){
      if(converted||url.searchParams.get('state')!==nonce||!/^[-a-zA-Z0-9]{10,200}$/.test(url.searchParams.get('code')||''))return respond(res,403,'Invalid setup state');
      busy=true;
      try{
        const result=await github(`/app-manifests/${url.searchParams.get('code')}/conversions`,null,'POST');
        if(result.owner?.id!==ownerID||!result.pem||!result.client_secret||!result.client_id)throw new Error('The app must belong to FlashBlank7 and include complete credentials.');
        if(!/^[a-z0-9-]+$/.test(result.slug))throw new Error('Invalid GitHub App slug.');
        if(result.permissions?.contents!=='write'||result.permissions?.actions!=='read'||Object.keys(result.permissions||{}).some(k=>!['contents','actions','metadata'].includes(k)))throw new Error('Unexpected GitHub App permissions.');
        app=result;converted=true;
        console.log(JSON.stringify({stage:'app-created',id:app.id,slug:app.slug}));
        return respond(res,302,'',{'Location':`https://github.com/apps/${app.slug}/installations/new`});
      }finally{busy=false;}
    }
    if(url.pathname===`/installed/${nonce}`){
      if(installed)return respond(res,200,page('已完成',`<p>后台已配置。</p><a href="${origin}">打开管理后台 →</a>`));
      const id=url.searchParams.get('installation_id');
      if(!app||!/^\d+$/.test(id||''))return respond(res,400,page('缺少安装信息','<p>请从 GitHub 应用安装页面继续。</p>'));
      busy=true;
      try{
        const token=jwt(app),installation=await github(`/app/installations/${id}`,token);
        if(installation.account?.id!==ownerID||installation.app_id!==app.id||installation.repository_selection!=='selected')throw new Error('Select only the two website repositories in your own account.');
        const access=await github(`/app/installations/${id}/access_tokens`,token,'POST');
        const list=await github('/installation/repositories',access.token);
        if(list.total_count!==2||!repositories.every(name=>list.repositories.some(r=>r.name===name&&r.owner?.id===ownerID)))throw new Error('Installation must include exactly the public website and the private content repository.');
        if(!list.repositories.find(r=>r.name==='flashblank7-site-content')?.private)throw new Error('The content repository must remain private.');
        const key=createPrivateKey(app.pem).export({type:'pkcs8',format:'pem'});
        await wrangler(['secret','bulk'],JSON.stringify({GITHUB_CLIENT_SECRET:app.client_secret,GITHUB_PRIVATE_KEY:key}));
        config.vars.GITHUB_APP_ID=String(app.id);config.vars.GITHUB_CLIENT_ID=app.client_id;config.vars.GITHUB_INSTALLATION_ID=id;
        await writeFile(configPath,JSON.stringify(config,null,2)+'\n');
        app=null;
        await wrangler(['deploy']);installed=true;
        console.log(JSON.stringify({stage:'configured-and-deployed',origin}));
        return respond(res,200,page('后台已配置',`<p>现在可以用你的 GitHub 账号登录。只有 FlashBlank7 能进入。</p><a href="${origin}/auth/login">登录管理后台 →</a><p>回到 Codex 后，我会继续验证发布流程。</p>`));
      }finally{busy=false;}
    }
    return respond(res,404,'Not found');
  }catch(error){
    // Errors use fixed descriptions and status codes; credentials/callback URLs are never logged.
    console.error('Setup operation failed; credentials were not printed.');
    return respond(res,400,page('设置尚未完成',`<p>${escape(error instanceof Error?error.message:'Unexpected error')}</p><p>请回到 Codex 告诉我这一步没有完成。不要发送密钥或回调地址。</p>`));
  }
});
server.listen(8977,'127.0.0.1',()=>console.log(JSON.stringify({stage:'ready',url:`${local}/start/${nonce}`})));
server.on('error',()=>{console.error('Local setup port 8977 is unavailable.');process.exitCode=1;});
setTimeout(()=>{app=null;server.close();},55*60_000).unref();
