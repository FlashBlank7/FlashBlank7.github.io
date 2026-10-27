import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Fault,type Env} from '../worker/github.ts';
import {PRIVATE_REPO,PUBLIC_REPO,type Snapshot} from '../shared/content.ts';
export function db(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../migrations/0001.sql',import.meta.url),'utf8'));
  function statement(query:string,args:any[]=[]):any{return {
    bind:(...values:any[])=>statement(query,values),
    run:async()=>{const r=sql.prepare(query).run(...args);return {success:true,meta:{changes:Number(r.changes)}};},
    first:async()=>sql.prepare(query).get(...args)||null,
    all:async()=>({results:sql.prepare(query).all(...args)}),
  };}
  return {prepare:statement,exec:async(q:string)=>{sql.exec(q);return {};},batch:async(statements:any[])=>{sql.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}},sql} as unknown as D1Database&{sql:DatabaseSync};
}
export function environment():Env{return {DB:db(),ASSETS:{fetch:async()=>new Response('UI')} as any,APP_ORIGIN:'https://studio.example',GITHUB_APP_ID:'1',GITHUB_CLIENT_ID:'client',GITHUB_CLIENT_SECRET:'test-only',GITHUB_PRIVATE_KEY:'test-only',GITHUB_INSTALLATION_ID:'1'};}
export const seed=()=>JSON.parse(readFileSync(new URL('./fixtures/publication.json',import.meta.url),'utf8')) as Snapshot;
export const hash=(v:string)=>createHash('sha1').update(v).digest('hex');
export class FakeGitHub {
  main='a'.repeat(40);privateHead='b'.repeat(40);files=new Map<string,{sha:string;value:any;bytes:Uint8Array}>();blobs=new Map<string,Uint8Array>();commits=new Map<string,any>();advanceCount=0;loseAdvanceResponse=false;
  constructor(){this.set(PUBLIC_REPO,'content/published.json',seed());}
  set(repo:string,path:string,value:any){const bytes=new TextEncoder().encode(JSON.stringify(value));const file={sha:hash(JSON.stringify(value)),value,bytes};this.files.set(`${repo}/${path}`,file);return file;}
  async read(repo:string,path:string,ref?:string){const f=ref&&this.commits.get(ref)?.snapshot&&repo===PUBLIC_REPO?this.commits.get(ref).snapshot:this.files.get(`${repo}/${path}`);if(!f)throw new Fault(404,'missing');return structuredClone(f);}
  async optional(repo:string,path:string){return this.files.get(`${repo}/${path}`)||null;}
  async head(repo:string){return repo===PUBLIC_REPO?this.main:this.privateHead;}
  async writePrivate(path:string,value:any){const f=this.set(PRIVATE_REPO,path,value);return {content:{sha:f.sha}};}
  async blob(repo:string,bytes:Uint8Array){const sha=hash(Buffer.from(bytes).toString('base64'));this.blobs.set(sha,bytes);return sha;}
  async makeCommit(base:string,entries:any[],id:string){const sha=hash(id);const bytes=this.blobs.get(entries.find(e=>e.path==='content/published.json').sha)!;this.commits.set(sha,{base,snapshot:{sha:hash(new TextDecoder().decode(bytes)),value:JSON.parse(new TextDecoder().decode(bytes)),bytes}});return sha;}
  async advance(commit:string){const item=this.commits.get(commit);if(this.main!==item.base)throw new Fault(409,'conflict');this.main=commit;this.files.set(`${PUBLIC_REPO}/content/published.json`,item.snapshot);this.advanceCount++;if(this.loseAdvanceResponse){this.loseAdvanceResponse=false;throw new Fault(502,'response lost');}}
  async api(){return {workflow_runs:[{status:'completed',conclusion:'success'}]};}
  async includes(commit:string,head:string){while(head){if(head===commit)return true;head=this.commits.get(head)?.base;}return false;}
}
