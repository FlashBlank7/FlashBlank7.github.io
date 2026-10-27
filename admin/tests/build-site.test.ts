import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {load} from 'cheerio';
import {seed} from './helpers.ts';
test('publishing a post and case renders routes safely; removing them removes generated pages',async()=>{
  const temp=await mkdtemp(join(tmpdir(),'fb7-site-test-')),root=resolve(import.meta.dirname,'../..');
  try{
    await cp(join(root,'site-templates'),join(temp,'site-templates'),{recursive:true});
    await mkdir(join(temp,'content'));await mkdir(join(temp,'dist'));
    const snapshot=seed();snapshot.items['test-post']={id:'test-post',kind:'post',title:{zh:'测试随记',en:'Test journal'},summary:{zh:'简介',en:'Summary'},order:0,date:'2026-10-28',cover:null,body:'# A heading\n\n<script>alert(1)</script>\n\n![tracker](https://evil.test/x)'};
    (snapshot.items.utoo as any).body='## Case\n\nConcrete work.';
    const run=()=>execFileSync(process.execPath,[join(root,'node_modules/tsx/dist/cli.mjs'),join(root,'scripts/build-site.ts')],{env:{...process.env,SITE_BUILD_ROOT:temp},stdio:'pipe'});
    await writeFile(join(temp,'content/published.json'),JSON.stringify(snapshot));run();
    const $=load(await readFile(join(temp,'dist/blog/test-post/index.html'),'utf8'));
    assert.equal($('h1').text(),'测试随记');assert.equal($('.prose h2').text(),'A heading');assert.equal($('.prose script').length,0);assert.equal($('.prose img').length,0);assert.equal($('h1').attr('data-copy-en'),'Test journal');
    assert.match(await readFile(join(temp,'dist/research/projects/utoo/index.html'),'utf8'),/Concrete work/);
    delete snapshot.items['test-post'];(snapshot.items.utoo as any).body='';await writeFile(join(temp,'content/published.json'),JSON.stringify(snapshot));run();
    await assert.rejects(readFile(join(temp,'dist/blog/test-post/index.html')));await assert.rejects(readFile(join(temp,'dist/research/projects/utoo/index.html')));
  }finally{assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep)&&basename(temp).startsWith('fb7-site-test-'));await rm(temp,{recursive:true,force:true});}
});
