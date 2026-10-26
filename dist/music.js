import {tracks} from './music-catalog.js';
import {createAudioSourceLoader} from './audio-source.js';
import {createAudioProgress} from './audio-progress.js';
const audio=document.getElementById('music-audio');
const toggle=document.getElementById('player-toggle');
const status=document.getElementById('player-status');
const sources=Object.fromEntries(tracks.map(t=>[t.id,t]));
let selected=tracks[0].id, loading=false, pending=false, request=0;
audio.volume=.8;
function sync(){
  const playing=!audio.paused;
  toggle.textContent=loading?'…':playing?'Ⅱ':'▷';
  toggle.setAttribute('aria-label',playing?'暂停':'播放');
  toggle.setAttribute('aria-pressed',String(playing||pending));
  document.querySelectorAll('.play-track').forEach(b=>{const active=b.dataset.track===selected;b.setAttribute('aria-pressed',String(active&&(playing||pending)));b.textContent=active&&loading?'载入中…':active&&playing?'暂停 Ⅱ':'播放 ▷';});
}
const loader=createAudioSourceLoader(audio,sources,{onLoading:value=>{loading=value;status.textContent=value?'载入音频，完成后可拖动进度':'可以点击或拖动进度条';sync();},onError:()=>{status.textContent='载入失败，请再次点击播放重试。'}});
const progress=createAudioProgress(audio,()=>({scrub:document.getElementById('scrub'),elapsed:document.getElementById('elapsed'),total:document.getElementById('duration')}));
progress.attach();
async function play(id){
  const token=++request;
  if(id===selected&&(!audio.paused||pending)){pending=false;audio.pause();sync();return;}
  selected=id;pending=true;
  document.getElementById('now-title').textContent=sources[id].title;
  document.getElementById('now-version').textContent=sources[id].version;
  sync();
  try{if(await loader.select(id)&&token===request)await audio.play();}catch{if(token===request)status.textContent='播放失败，请再点击播放。';}
  if(token===request)pending=false;
  sync();
}
toggle.addEventListener('click',()=>play(selected));
for(const event of ['play','pause','ended'])audio.addEventListener(event,sync);
audio.addEventListener('error',()=>{status.textContent='这个文件暂时无法播放，请切换版本或重试。'});
document.getElementById('volume').addEventListener('input',e=>audio.volume=Number(e.target.value));
document.querySelectorAll('.play-track').forEach(b=>b.addEventListener('click',()=>play(b.dataset.track)));
document.querySelectorAll('.track-version').forEach(select=>select.addEventListener('change',()=>{const button=select.closest('.music-card').querySelector('.play-track');button.dataset.track=select.value;sync();}));
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('.music-card').forEach(card=>{card.hidden=button.dataset.filter!=='all'&&card.dataset.group!==button.dataset.filter});}));
addEventListener('pagehide',()=>{audio.pause();loader.dispose()},{once:true});
