import {test} from 'node:test';
import assert from 'node:assert/strict';
import {app} from '../worker/index.ts';
import {sha256} from '../worker/github.ts';
import {validateDoc,snapshotSchema,imageType,MAX_IMAGE} from '../shared/content.ts';
import {markdown} from '../shared/render.ts';
import {environment,seed} from './helpers.ts';
async function session(env:ReturnType<typeof environment>,expires=Date.now()+100000){await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256('session'),'csrf',expires).run();}
const request=(path:string,method='GET',extra:Record<string,string>={})=>new Request(`https://studio.example${path}`,{method,headers:{Cookie:'__Host-studio=session',...extra}});
test('anonymous and expired sessions cannot read drafts',async()=>{
  const env=environment();assert.equal((await app.fetch(new Request('https://studio.example/api/content'),env)).status,401);
  await session(env,Date.now()-1);assert.equal((await app.fetch(request('/api/content'),env)).status,401);
});
test('state-changing endpoints require same Origin and CSRF',async()=>{
  const env=environment();await session(env);
  for(const headers of [{},{Origin:'https://evil.test','X-CSRF-Token':'csrf'},{Origin:env.APP_ORIGIN,'X-CSRF-Token':'wrong'}])assert.equal((await app.fetch(request('/api/logout','POST',headers as any),env)).status,403);
  assert.equal((await app.fetch(request('/api/logout','POST',{Origin:env.APP_ORIGIN,'X-CSRF-Token':'csrf'}),env)).status,200);
  assert.equal((await app.fetch(request('/api/session'),env)).status,401);
});
test('revoke all sessions works',async()=>{const env=environment();await session(env);await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256('other'),'x',Date.now()+100000).run();await app.fetch(request('/api/logout-all','POST',{Origin:env.APP_ORIGIN,'X-CSRF-Token':'csrf'}),env);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<any>()).n,0);});
test('OAuth state is single-use and another GitHub user is rejected',async()=>{
  const env=environment(),state='state';await env.DB.prepare('INSERT INTO oauth_states VALUES(?,?)').bind(await sha256(state),Date.now()+100000).run();
  const old=globalThis.fetch;globalThis.fetch=async(input:any)=>String(input).includes('access_token')?Response.json({access_token:'fake'}):Response.json({id:999});
  try{const req=()=>new Request('https://studio.example/auth/callback?state=state&code=code',{headers:{Cookie:'__Host-studio-oauth=state'}});assert.equal((await app.fetch(req(),env)).status,403);assert.equal((await app.fetch(req(),env)).status,403);assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<any>()).n,0);}finally{globalThis.fetch=old;}
});
test('owner login issues a protected cookie, without returning a GitHub token',async()=>{
  const env=environment();await env.DB.prepare('INSERT INTO oauth_states VALUES(?,?)').bind(await sha256('ownerstate'),Date.now()+100000).run();const old=globalThis.fetch;
  globalThis.fetch=async(input:any)=>String(input).includes('access_token')?Response.json({access_token:'SECRET-NOT-IN-BROWSER'}):Response.json({id:122159986});
  try{const res=await app.fetch(new Request('https://studio.example/auth/callback?state=ownerstate&code=code',{headers:{Cookie:'__Host-studio-oauth=ownerstate'}}),env);assert.equal(res.status,302);const cookie=res.headers.get('set-cookie')!;for(const flag of ['HttpOnly','Secure','SameSite=Lax','Max-Age=43200'])assert.ok(cookie.includes(flag));assert.ok(!cookie.includes('SECRET-NOT-IN-BROWSER'));}finally{globalThis.fetch=old;}
});
test('private endpoints have no-store and no-sniff headers; unknown endpoints do not serve SPA',async()=>{const env=environment();await session(env);const res=await app.fetch(request('/api/session'),env);assert.equal(res.headers.get('cache-control'),'no-store');assert.equal(res.headers.get('x-content-type-options'),'nosniff');assert.equal((await app.fetch(request('/api/unknown'),env)).status,404);});
test('misconfigured cloud deployment fails closed',async()=>{const env=environment();env.GITHUB_CLIENT_SECRET='';assert.equal((await app.fetch(request('/api/content'),env)).status,503);assert.equal((await app.fetch(request('/auth/login'),env)).status,503);});
test('Markdown cannot execute HTML, JS URLs, remote images or local-path links',()=>{
  const output=markdown('<script>alert(1)</script>\n[x](javascript:alert(1))\n![track](https://evil.test/tracker)\n[x](file:///secret)\n# Heading');
  assert.ok(!output.includes('<script>'));assert.ok(!output.includes('href="javascript:'));assert.ok(!output.includes('src="https://'));assert.ok(!output.includes('href="file:'));assert.match(output,/<h2>Heading/);
  const id='a'.repeat(64)+'.png';assert.match(markdown(`![a](media:${id})`),new RegExp(`/assets/uploads/${id}`));assert.match(markdown(`![a](media:${id})`,true),new RegExp(`/api/media/${id}`));
});
test('schemas prevent path traversal, hidden fields, scripts and invalid themes',()=>{
  const base=seed().items.utoo;assert.throws(()=>validateDoc({...base,id:'../.github/workflows/x'}));assert.throws(()=>validateDoc({...base,secret:'x'}));assert.throws(()=>validateDoc({...base,url:'javascript:alert(1)'}));assert.throws(()=>validateDoc({...seed().items.appearance,accent:'red;}body{display:none'}));
  assert.throws(()=>snapshotSchema.parse({...seed(),drafts:{secret:true}}));
});
test('spoofed and oversized uploads are rejected',()=>{assert.throws(()=>imageType(new TextEncoder().encode('<svg onload="alert(1)">')));assert.throws(()=>imageType(new Uint8Array(MAX_IMAGE+1)));assert.throws(()=>imageType(new Uint8Array([137,80,78,71])));});
