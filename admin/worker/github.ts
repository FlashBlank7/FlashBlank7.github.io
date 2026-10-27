import {OWNER,PRIVATE_REPO,PUBLIC_REPO} from '../shared/content.ts';
export interface Env {
  DB:D1Database; ASSETS:Fetcher; APP_ORIGIN:string;
  GITHUB_APP_ID:string; GITHUB_CLIENT_ID:string; GITHUB_CLIENT_SECRET:string;
  GITHUB_INSTALLATION_ID:string; GITHUB_PRIVATE_KEY:string;
}
export class Fault extends Error {constructor(public status:number,message:string){super(message);}}
export const sha256=async(v:string|Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof v==='string'?new TextEncoder().encode(v):v as BufferSource)),x=>x.toString(16).padStart(2,'0')).join('');
export const random=()=>crypto.randomUUID()+crypto.randomUUID();
export const b64=(a:Uint8Array)=>{let s='';for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(s);};
export const unb64=(s:string)=>Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0));
const enc=(s:string)=>btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
export async function appJWT(env:Env){
  const pem=env.GITHUB_PRIVATE_KEY;
  if(!pem?.includes('BEGIN PRIVATE KEY'))throw new Fault(503,'GitHub 私钥尚未配置为 PKCS#8 格式');
  const key=await crypto.subtle.importKey('pkcs8',unb64(pem.replace(/-----[^-]+-----/g,'')) as BufferSource,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const now=Math.floor(Date.now()/1000), data=`${enc(JSON.stringify({alg:'RS256',typ:'JWT'}))}.${enc(JSON.stringify({iat:now-60,exp:now+540,iss:env.GITHUB_APP_ID}))}`;
  const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(data));
  return `${data}.${b64(new Uint8Array(signature)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')}`;
}
export async function ghRequest(token:string,path:string,method='GET',body?:unknown):Promise<any>{
  const response=await fetch(`https://api.github.com${path}`,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','User-Agent':'FlashBlank7-Studio','X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  if(!response.ok){
    if(response.status===404)throw new Fault(404,'内容不存在或仓库未授权');
    if([409,422].includes(response.status))throw new Fault(409,'远端版本已变化，请重新加载后发布');
    if(response.status===429||response.headers.get('x-ratelimit-remaining')==='0')throw new Fault(429,'GitHub 请求额度暂时耗尽，请稍后重试');
    throw new Fault(502,`GitHub 服务请求失败（${response.status}），未确认成功`);
  }
  return response.status===204?null:response.json();
}
export class GitHub {
  private tokens=new Map<string,string>();
  constructor(private env:Env){}
  private async token(repo:string){
    if(repo!==PUBLIC_REPO&&repo!==PRIVATE_REPO)throw new Fault(403,'仓库未授权');
    if(!this.tokens.has(repo)){
      const result=await ghRequest(await appJWT(this.env),`/app/installations/${this.env.GITHUB_INSTALLATION_ID}/access_tokens`,'POST',{repositories:[repo],permissions:{contents:'write',...(repo===PUBLIC_REPO?{actions:'read'}:{})}});
      if(repo===PRIVATE_REPO){
        const metadata=await ghRequest(result.token,`/repos/${OWNER}/${repo}`);
        if(metadata.private!==true)throw new Fault(503,'内容仓库必须保持私有；后台已停止读写');
      }
      this.tokens.set(repo,result.token);
    }
    return this.tokens.get(repo)!;
  }
  async api(repo:string,path:string,method='GET',body?:unknown){return ghRequest(await this.token(repo),`/repos/${OWNER}/${repo}${path}`,method,body);}
  async head(repo:string){return (await this.api(repo,'/git/ref/heads/main')).object.sha as string;}
  async read(repo:string,path:string,ref='main'):Promise<{sha:string;value:any;bytes:Uint8Array}> {
    const file=await this.api(repo,`/contents/${path}?ref=${encodeURIComponent(ref)}`);
    if(file.type!=='file'||file.size>3*1024*1024)throw new Fault(400,'文件格式或大小不支持');
    const bytes=file.content?unb64(file.content):unb64((await this.api(repo,`/git/blobs/${file.sha}`)).content);
    let value:any;try{value=JSON.parse(new TextDecoder().decode(bytes));}catch{value=null;}
    return {sha:file.sha,value,bytes};
  }
  async optional(repo:string,path:string,ref='main'){try{return await this.read(repo,path,ref);}catch(e){if(e instanceof Fault&&e.status===404)return null;throw e;}}
  async writePrivate(path:string,value:unknown,sha?:string){
    if(!/^(content\/[a-z][a-z0-9-]{0,63}|releases\/[a-f0-9-]{36})\.json$/.test(path))throw new Fault(400,'不允许的内容路径');
    return this.api(PRIVATE_REPO,`/contents/${path}`,'PUT',{message:`studio: save ${path}`,content:b64(new TextEncoder().encode(JSON.stringify(value,null,2)+'\n')),branch:'main',...(sha?{sha}:{})});
  }
  async list(){
    const head=await this.head(PRIVATE_REPO), tree=await this.api(PRIVATE_REPO,`/git/trees/${head}?recursive=1`);
    if(tree.truncated)throw new Fault(413,'内容库过大，需要维护');
    return {head,entries:tree.tree.filter((x:any)=>/^content\/[a-z][a-z0-9-]{0,63}\.json$/.test(x.path)&&x.type==='blob').map((x:any)=>({id:x.path.slice(8,-5),revision:x.sha}))};
  }
  async blob(repo:string,bytes:Uint8Array){return (await this.api(repo,'/git/blobs','POST',{content:b64(bytes),encoding:'base64'})).sha as string;}
  async makeCommit(base:string,treeEntries:{path:string;sha:string}[],job:string){
    // No caller-controlled paths reach Git: only the release and content-addressed media.
    for(const e of treeEntries)if(e.path!=='content/published.json'&&!/^dist\/assets\/uploads\/[a-f0-9]{64}\.(png|jpg|webp)$/.test(e.path))throw new Fault(400,'不允许的发布路径');
    const parent=await this.api(PUBLIC_REPO,`/git/commits/${base}`);
    const tree=await this.api(PUBLIC_REPO,'/git/trees','POST',{base_tree:parent.tree.sha,tree:treeEntries.map(e=>({...e,mode:'100644',type:'blob'}))});
    return (await this.api(PUBLIC_REPO,'/git/commits','POST',{message:`studio: publish ${job}`,tree:tree.sha,parents:[base]})).sha as string;
  }
  async advance(commit:string){return this.api(PUBLIC_REPO,'/git/refs/heads/main','PATCH',{sha:commit,force:false});}
  async includes(commit:string,head:string){const result=await this.api(PUBLIC_REPO,`/compare/${commit}...${head}`);return result.status==='ahead'||result.status==='identical';}
}
