import {z} from 'zod';
export const OWNER = 'FlashBlank7';
export const OWNER_ID = 122159986;
export const PRIVATE_REPO = 'flashblank7-site-content';
export const PUBLIC_REPO = 'FlashBlank7.github.io';
export const MAX_IMAGE = 2 * 1024 * 1024;
export const idSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export const biSchema = z.object({zh: z.string().max(3000), en: z.string().max(6000)}).strict();
const media = z.string().regex(/^[a-f0-9]{64}\.(png|jpg|webp)$/);
const common = {id:idSchema, title:biSchema, order:z.number().int().min(0).max(999)};
const link = z.string().max(500).refine(v=>!v || /^https:\/\/[^\s"<>]+$/i.test(v), 'Use an HTTPS URL');
export const docSchema = z.discriminatedUnion('kind', [
  z.object({...common, kind:z.literal('post'), summary:biSchema, body:z.string().max(100_000), date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/), cover:media.nullable()}).strict(),
  z.object({...common, kind:z.literal('project'), summary:biSchema, body:z.string().max(100_000), category:z.string().max(150), tags:z.array(z.string().max(60)).max(12), url:link, cover:media.nullable()}).strict(),
  z.object({...common, kind:z.literal('page'), route:z.enum(['home','research','library','music','blog']), subtitle:biSchema, description:biSchema, about:biSchema}).strict(),
  z.object({id:z.literal('appearance'), kind:z.literal('appearance'), title:biSchema, order:z.literal(0), preset:z.enum(['lilies','deep-space','dusk']), accent:z.string().regex(/^#[0-9a-fA-F]{6}$/), background:media.nullable(), position:z.enum(['center','top','bottom']), overlay:z.number().min(0.25).max(0.95), nav:z.array(z.object({route:z.enum(['research','library','music','blog']), label:biSchema})).length(4)}).strict(),
]);
export type ContentDoc = z.infer<typeof docSchema>;
export type Bilingual = z.infer<typeof biSchema>;
export const snapshotSchema = z.object({version:z.literal(1), items:z.record(idSchema,docSchema)}).strict().superRefine((s,c)=>{
  const routes=new Set<string>();
  for(const [id,d] of Object.entries(s.items)) {
    if(id!==d.id)c.addIssue({code:'custom',message:'Mismatched content ID'});
    if(d.kind==='page'){if(routes.has(d.route))c.addIssue({code:'custom',message:'Duplicate page route'});routes.add(d.route);}
    if(d.kind==='appearance' && new Set(d.nav.map(x=>x.route)).size!==4)c.addIssue({code:'custom',message:'Duplicate navigation route'});
  }
  if(Object.keys(s.items).length>200)c.addIssue({code:'custom',message:'Maximum 200 entries'});
});
export type Snapshot=z.infer<typeof snapshotSchema>;
export function validateDoc(input:unknown):ContentDoc {
  const doc=docSchema.parse(input);
  if(doc.kind==='appearance' && new Set(doc.nav.map(x=>x.route)).size!==4)throw new Error('导航不能重复');
  if(doc.kind==='page' && doc.id!==`page-${doc.route}`)throw new Error('页面 ID 不可更改');
  return doc;
}
export function imageRefs(doc:ContentDoc):string[] {
  const ids=new Set<string>();
  if('cover' in doc && doc.cover)ids.add(doc.cover);
  if(doc.kind==='appearance' && doc.background)ids.add(doc.background);
  if('body' in doc)for(const m of doc.body.matchAll(/media:([a-f0-9]{64}\.(?:png|jpg|webp))/g))ids.add(m[1]);
  return [...ids];
}
export function requireCore(s:Snapshot):Snapshot {
  for(const r of ['home','research','library','music','blog'])if(s.items[`page-${r}`]?.kind!=='page')throw new Error('不能撤下固定页面');
  if(s.items.appearance?.kind!=='appearance')throw new Error('缺少外观设置');
  for(const doc of Object.values(s.items))if(!doc.title.zh.trim()&&!doc.title.en.trim())throw new Error('发布内容必须填写标题');
  return s;
}
export function imageType(bytes:Uint8Array):'png'|'jpg'|'webp' {
  if(!bytes.length || bytes.length>MAX_IMAGE)throw new Error('图片上限为 2 MiB');
  const t=new TextDecoder('ascii');
  if(bytes.length>=24 && [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v) && t.decode(bytes.slice(12,16))==='IHDR')return 'png';
  if(bytes.length>=12 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255 && bytes.at(-2)===255 && bytes.at(-1)===217)return 'jpg';
  if(bytes.length>=16 && t.decode(bytes.slice(0,4))==='RIFF' && t.decode(bytes.slice(8,12))==='WEBP' && t.decode(bytes.slice(12,15))==='VP8')return 'webp';
  throw new Error('仅支持有效的 JPG、PNG 或 WebP 图片');
}
