import {test} from 'node:test';
import assert from 'node:assert/strict';
import {app} from '../worker/index.ts';
import {GitHub,sha256,Fault} from '../worker/github.ts';
import {environment,seed,hash} from './helpers.ts';
test('two device saves preserve remote contents and return local conflict evidence',async()=>{
  const env=environment();await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256('s'),'csrf',Date.now()+100000).run();
  let current={value:seed().items.utoo,sha:'a'.repeat(40)};
  const oldOptional=GitHub.prototype.optional,oldWrite=GitHub.prototype.writePrivate;
  GitHub.prototype.optional=async()=>({...current,bytes:new Uint8Array()});
  GitHub.prototype.writePrivate=async(_path,value,revision)=>{if(revision!==current.sha)throw new Fault(409,'conflict');current={value:value as any,sha:hash(JSON.stringify(value))};return {content:{sha:current.sha}};};
  const put=(body:any)=>app.fetch(new Request('https://studio.example/api/content/utoo',{method:'PUT',headers:{Cookie:'__Host-studio=s',Origin:env.APP_ORIGIN,'X-CSRF-Token':'csrf','Content-Type':'application/json'},body:JSON.stringify(body)}),env);
  try{
    const original=current.sha,remote={...current.value,body:'From phone'};
    assert.equal((await put({doc:remote,revision:original})).status,200);
    const conflict=await put({doc:{...remote,body:'From laptop'},revision:original});
    assert.equal(conflict.status,409);assert.equal((await conflict.json() as any).remote.doc.body,'From phone');assert.equal((current.value as any).body,'From phone');
  }finally{GitHub.prototype.optional=oldOptional;GitHub.prototype.writePrivate=oldWrite;}
});
test('an arbitrary content path and a mismatched ID never reach GitHub writes',async()=>{
  const env=environment();await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256('s'),'csrf',Date.now()+100000).run();
  const req=new Request('https://studio.example/api/content/utoo',{method:'PUT',headers:{Cookie:'__Host-studio=s',Origin:env.APP_ORIGIN,'X-CSRF-Token':'csrf','Content-Type':'application/json'},body:JSON.stringify({doc:{...seed().items.utoo,id:'other'},revision:null})});assert.equal((await app.fetch(req,env)).status,400);
});
