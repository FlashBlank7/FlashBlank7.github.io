import {z} from 'zod';
import {idSchema,snapshotSchema,requireCore,validateDoc,imageType,PRIVATE_REPO,PUBLIC_REPO,type Snapshot} from '../shared/content.ts';
import {allMedia} from '../shared/render.ts';
import {Fault,GitHub,sha256,type Env} from './github.ts';
const revision=z.string().regex(/^[a-f0-9]{40}$/);
export const selectionSchema=z.array(z.object({id:idSchema,revision:revision.nullable(),action:z.enum(['publish','remove'])}).strict()).min(1).max(30).refine(a=>new Set(a.map(x=>x.id)).size===a.length,'重复选择');
type Selection=z.infer<typeof selectionSchema>;
export interface Job {id:string;kind:string;status:string;base_sha:string;candidate_sha:string;selections:string;media:string;cursor:number;blobs:string;commit_sha:string|null;message:string|null;created:number;updated:number;}
export async function audit(env:Env,action:string,target:string){await env.DB.prepare('INSERT INTO audit(action,target,created) VALUES(?,?,?)').bind(action,target,Date.now()).run();}
export async function getJob(env:Env,id:string){if(!/^[a-f0-9-]{36}$/.test(id))throw new Fault(400,'无效任务');const job=await env.DB.prepare('SELECT * FROM jobs WHERE id=?').bind(id).first<Job>();if(!job)throw new Fault(404,'发布任务不存在');return job;}
export async function prepare(env:Env,gh:GitHub,selections:Selection,restore?:string){
  const base=await gh.head(PUBLIC_REPO);
  const current=requireCore(snapshotSchema.parse((await gh.read(PUBLIC_REPO,'content/published.json',base)).value));
  let candidate:Snapshot=structuredClone(current);
  if(restore){
    revision.parse(restore);
    const past=await env.DB.prepare("SELECT id FROM jobs WHERE commit_sha=? AND status='live'").bind(restore).first();
    if(!past)throw new Fault(400,'只能恢复已确认上线的版本');
    candidate=requireCore(snapshotSchema.parse((await gh.read(PUBLIC_REPO,'content/published.json',restore)).value));
  } else {
    const privateHead=await gh.head(PRIVATE_REPO);
    for(const s of selections){
      if(s.action==='remove'){
        if(s.id.startsWith('page-')||s.id==='appearance')throw new Fault(400,'不能撤下固定页面或外观');
        delete candidate.items[s.id];
      }else{
        const file=await gh.read(PRIVATE_REPO,`content/${s.id}.json`,privateHead);
        if(file.sha!==s.revision)throw new Fault(409,'草稿已更新，请重新预览');
        candidate.items[s.id]=validateDoc(file.value);
      }
    }
  }
  requireCore(snapshotSchema.parse(candidate));
  const id=crypto.randomUUID();
  const result=await gh.writePrivate(`releases/${id}.json`,candidate);
  const old=new Set(allMedia(current));
  const media=restore?[]:allMedia(candidate).filter(id=>!old.has(id));
  const now=Date.now();
  await env.DB.prepare("INSERT INTO jobs(id,kind,status,base_sha,candidate_sha,selections,media,created,updated) VALUES(?,?,'prepared',?,?,?,?,?,?)")
    .bind(id,restore?'restore':'publish',base,result.content.sha,JSON.stringify(selections),JSON.stringify(media),now,now).run();
  await audit(env,'prepare',id);
  return {job:await getJob(env,id),snapshot:candidate};
}
export async function confirm(env:Env,gh:GitHub,id:string){
  const job=await getJob(env,id);
  if(job.status!=='prepared')return job;
  if(Date.now()-job.created>86400_000)throw new Fault(409,'预览已过期，请重新生成');
  if(await gh.head(PUBLIC_REPO)!==job.base_sha)throw new Fault(409,'网站已更新，请重新预览');
  if(job.kind!=='restore')for(const s of JSON.parse(job.selections) as Selection){
    if(s.action==='publish'&&(await gh.read(PRIVATE_REPO,`content/${s.id}.json`)).sha!==s.revision)throw new Fault(409,'预览后草稿发生变化，请重新预览');
  }
  const lock=await env.DB.prepare('UPDATE publish_lock SET job_id=?,lease=0 WHERE id=1 AND (job_id IS NULL OR job_id=?)').bind(id,id).run();
  if(!lock.meta.changes)throw new Fault(409,'已有发布正在进行，请先继续或取消');
  await env.DB.prepare("UPDATE jobs SET status='uploading',updated=? WHERE id=? AND status='prepared'").bind(Date.now(),id).run();
  return getJob(env,id);
}
export async function step(env:Env,gh:GitHub,id:string){
  const lease=Date.now()+300_000;
  const lock=await env.DB.prepare('UPDATE publish_lock SET lease=? WHERE id=1 AND job_id=? AND lease<?').bind(lease,id,Date.now()).run();
  if(!lock.meta.changes)throw new Fault(409,'此发布正在处理或已结束，请刷新状态');
  try{
    const job=await getJob(env,id);
    if(job.status==='uploading'){
      const media=JSON.parse(job.media) as string[],blobs=JSON.parse(job.blobs) as {path:string;sha:string}[];
      if(job.cursor<media.length){
        const name=media[job.cursor], file=await gh.read(PRIVATE_REPO,`media/${name}`);
        if(await sha256(file.bytes)!==name.split('.')[0]||imageType(file.bytes)!==name.split('.')[1])throw new Fault(400,'图片内容校验失败');
        const sha=await gh.blob(PUBLIC_REPO,file.bytes);
        blobs.push({path:`dist/assets/uploads/${name}`,sha});
        await env.DB.prepare('UPDATE jobs SET cursor=cursor+1,blobs=?,updated=? WHERE id=?').bind(JSON.stringify(blobs),Date.now(),id).run();
      }else{
        const release=await gh.read(PRIVATE_REPO,`releases/${id}.json`);
        if(release.sha!==job.candidate_sha)throw new Fault(409,'预览快照已变化，请取消后重新预览');
        requireCore(snapshotSchema.parse(release.value));
        blobs.push({path:'content/published.json',sha:await gh.blob(PUBLIC_REPO,release.bytes)});
        if(await gh.head(PUBLIC_REPO)!==job.base_sha)throw new Fault(409,'远端有新修改，发布停止；请重新预览');
        const commit=await gh.makeCommit(job.base_sha,blobs,id);
        // Persist the intended commit before advancing main, so a lost response is recoverable.
        await env.DB.prepare("UPDATE jobs SET status='committing',commit_sha=?,updated=? WHERE id=?").bind(commit,Date.now(),id).run();
      }
    }else if(job.status==='committing'){
      const head=await gh.head(PUBLIC_REPO);
      if(head!==job.commit_sha){
        if(head===job.base_sha)await gh.advance(job.commit_sha!);
        else if(!await gh.includes(job.commit_sha!,head))throw new Fault(409,'远端版本变化，请检查发布记录后取消重试');
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE jobs SET status='submitted',message=NULL,updated=? WHERE id=?").bind(Date.now(),id),
        env.DB.prepare('UPDATE publish_lock SET job_id=NULL,lease=0 WHERE id=1 AND job_id=?').bind(id),
      ]);
      await audit(env,'submit',id);
    }
    return getJob(env,id);
  } catch(e){
    const message=e instanceof Fault?e.message:'处理未完成；可重试当前步骤，不要重复创建发布';
    await env.DB.prepare('UPDATE jobs SET message=?,updated=? WHERE id=?').bind(message,Date.now(),id).run();
    throw e;
  }finally{await env.DB.prepare('UPDATE publish_lock SET lease=0 WHERE id=1 AND job_id=? AND lease=?').bind(id,lease).run();}
}
export async function refresh(env:Env,gh:GitHub,id:string){
  const job=await getJob(env,id);
  if(['submitted','building'].includes(job.status)&&job.commit_sha){
    const runs=await gh.api(PUBLIC_REPO,`/actions/workflows/pages-deploy.yml/runs?head_sha=${job.commit_sha}&per_page=5`);
    const run=runs.workflow_runs?.[0];
    if(run){
      const status=run.status==='completed'?(run.conclusion==='success'?'live':'failed'):'building';
      await env.DB.prepare('UPDATE jobs SET status=?,message=?,updated=? WHERE id=?').bind(status,status==='failed'?`构建未上线：${run.conclusion}`:null,Date.now(),id).run();
    }
  }
  return getJob(env,id);
}
export async function cancel(env:Env,gh:GitHub,id:string){
  const job=await getJob(env,id);
  if(!['prepared','uploading','committing'].includes(job.status))throw new Fault(409,'此任务不能取消；已发布内容请撤下或恢复版本');
  const lease=Date.now()+300_000;
  if(job.status!=='prepared'){
    const lock=await env.DB.prepare('UPDATE publish_lock SET lease=? WHERE job_id=? AND lease<?').bind(lease,id,Date.now()).run();
    if(!lock.meta.changes)throw new Fault(409,'步骤正在运行，请稍后取消');
  }
  try{if(job.commit_sha){
    const head=await gh.head(PUBLIC_REPO);
    if(head!==job.base_sha)throw new Fault(409,'提交可能已经生效，请继续任务以确认状态');
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE jobs SET status='cancelled',updated=? WHERE id=?").bind(Date.now(),id),
    env.DB.prepare('UPDATE publish_lock SET job_id=NULL,lease=0 WHERE job_id=?').bind(id),
  ]);
  await audit(env,'cancel',id);return getJob(env,id);
  }finally{await env.DB.prepare('UPDATE publish_lock SET lease=0 WHERE job_id=? AND lease=?').bind(id,lease).run();}
}
