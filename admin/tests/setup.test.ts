import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {once} from 'node:events';
import {get} from 'node:http';
import {load} from 'cheerio';
test('local GitHub setup is cookie-bound and requests only the intended app permissions',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'fb7-setup-test-'));
  const config=join(folder,'config.json');
  await writeFile(config,JSON.stringify({vars:{APP_ORIGIN:'https://flashblank7-studio.test.workers.dev'}}));
  const child=spawn(process.execPath,[resolve(import.meta.dirname,'../../scripts/configure-github-app.mjs'),config],{stdio:['ignore','pipe','pipe']});
  try{
    const start=await new Promise<string>((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Setup server did not start')),10000);let log='';
      child.stdout.on('data',chunk=>{log+=chunk.toString();try{const result=JSON.parse(log.trim());if(result.stage==='ready'){clearTimeout(timeout);resolve(result.url);}}catch{}});
      child.on('exit',()=>{clearTimeout(timeout);reject(new Error('Setup server stopped unexpectedly'));});
    });
    const response=await fetch(start);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const cookie=response.headers.get('set-cookie')!;assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('SameSite=Lax'));
    const $=load(await response.text());const manifest=JSON.parse($('input[name="manifest"]').attr('value')!);
    assert.equal(manifest.public,false);assert.equal(manifest.hook_attributes.active,false);
    assert.deepEqual(manifest.default_permissions,{contents:'write',actions:'read'});
    assert.deepEqual(manifest.callback_urls,['https://flashblank7-studio.test.workers.dev/auth/callback']);
    assert.equal((await fetch('http://127.0.0.1:8977/callback?state=wrong&code=not-a-real-code')).status,403);
    assert.equal((await fetch('http://127.0.0.1:8977/callback?state=wrong&code=not-a-real-code',{headers:{Cookie:cookie.split(';')[0]}})).status,403);
    const wrongHostStatus=await new Promise<number|undefined>((resolve,reject)=>{const req=get(start,{headers:{Host:'attacker.example'}},response=>{response.resume();resolve(response.statusCode);});req.on('error',reject);});
    assert.equal(wrongHostStatus,403);
  }finally{
    if(child.exitCode===null&&child.signalCode===null){const stopped=once(child,'exit');child.kill();await stopped;}
    assert.ok(resolve(folder).startsWith(resolve(tmpdir())+sep)&&basename(folder).startsWith('fb7-setup-test-'));
    await rm(folder,{recursive:true,force:true});
  }
});
