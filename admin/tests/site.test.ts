import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {load} from 'cheerio';
import {readFileSync} from 'node:fs';
const seed=()=>JSON.parse(readFileSync(new URL('../../content/published.json',import.meta.url),'utf8'));
import {snapshotSchema} from '../shared/content.ts';
const root=resolve(import.meta.dirname,'../..');
test('publication accepts only explicit content records, never private metadata',()=>{const snapshot=seed();snapshotSchema.parse(snapshot);assert.throws(()=>snapshotSchema.parse({...snapshot,sessions:['secret']}));assert.throws(()=>snapshotSchema.parse({...snapshot,drafts:{unselected:'private'}}));});
test('existing novels and music retain their original main content',async()=>{
  const baseline=JSON.parse(await readFile(resolve(root,'content/baseline-pages.json'),'utf8')) as string[];
  for(const path of baseline){
    if(path==='index.html'||path==='research/index.html'||path==='library/index.html'||path==='music/index.html')continue;
    const original=load(await readFile(resolve(root,'site-templates',path),'utf8')),built=load(await readFile(resolve(root,'dist',path),'utf8'));
    assert.equal(built('main').text(),original('main').text(),path);
    assert.equal(built('main').find('audio').length,original('main').find('audio').length,path);
  }
});
test('editable headings and navigation retain bilingual values and original destinations',async()=>{
  const $=load(await readFile(resolve(root,'dist/research/index.html'),'utf8'));
  assert.equal($('h1 [data-copy-zh]').attr('data-copy-zh'),seed().items['page-research'].title.zh);
  assert.ok($('h1 [data-copy-en]').attr('data-copy-en'));
  assert.deepEqual($('.site-nav nav a').map((_,e)=>$(e).attr('href')).get(),(seed().items.appearance as any).nav.map((x:any)=>`/${x.route}/`));
});
test('home preserves opening controls, audio source and accessibility hooks',async()=>{
  const $=load(await readFile(resolve(root,'dist/index.html'),'utf8'));
  for(const id of ['cosmos','sound','skip','motion','replay','music-audio','detail','detail-body','live-status'])assert.equal($(`#${id}`).length,1,id);
  assert.equal($('button[data-panel]').length,4);
  assert.equal($('a[href="/blog/"]').length,1);
});
