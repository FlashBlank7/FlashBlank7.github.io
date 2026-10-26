import { createAudioProgress } from './audio-progress.js';
import { createAudioSourceLoader } from './audio-source.js';
(() => {
  const body = document.body;
  const canvas = document.getElementById('cosmos');
  const ctx = canvas.getContext('2d');
  const audio = document.getElementById('music-audio');
  const dialog = document.getElementById('detail');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = media.matches, paused = false, ready = false;
  let start = performance.now(), lastFrame = 0, elapsed = 0, w = 0, h = 0, stars = [];
  let lastTick = performance.now(), track = 'v68', currentPanel = '', lastFocus = null;
  const introLength = 7200;
  const status = document.getElementById('live-status');
  const progress = document.querySelector('.progress i');
  const sources = {v68:{src:'assets/galaxynoiiro-v68.mp3',type:'audio/mpeg'}, inspiration:{src:'assets/inspiration.m4a',type:'audio/mp4'}};
  let audioLoading = false, playbackPending = false, playbackRequest = 0;
  const titles = {v68:'galaxynoiiro · v68', inspiration:'灵感'};
  const safeSession = {get(){try{return sessionStorage.getItem('fb7-lilies-seen')==='1'}catch{return false}},set(){try{sessionStorage.setItem('fb7-lilies-seen','1')}catch{}}};
  function finish(){ready=true;body.dataset.phase='ready';body.classList.add('appearing','threading');body.classList.remove('greeting');progress.style.width='100%';status.textContent='首页已展开。可以探索研究、小说和音乐。';safeSession.set();}
  function replay(){if(dialog.open)dialog.close();ready=false;elapsed=0;start=performance.now();lastTick=start;body.dataset.phase='intro';body.classList.remove('appearing','threading','greeting');progress.style.width='0';status.textContent='重新播放 Lilies 的相遇。';if(reduced){finish();return}requestAnimationFrame(()=>body.classList.add('appearing'));}
  body.classList.toggle('reduced', reduced);
  document.getElementById('skip').addEventListener('click',()=>{finish();document.querySelector('.explore').focus({preventScroll:true});});
  document.getElementById('replay').addEventListener('click',()=>{paused=false;body.classList.remove('paused');updateMotion();replay()});
  function updateMotion(){const b=document.getElementById('motion');b.textContent=paused?'继续动效':reduced?'启用动效':'暂停动效';b.setAttribute('aria-pressed',String(paused||reduced));}
  document.getElementById('motion').addEventListener('click',()=>{if(reduced){reduced=false;body.classList.remove('reduced');paused=false}else paused=!paused;body.classList.toggle('paused',paused);updateMotion();});
  media.addEventListener('change',e=>{reduced=e.matches;body.classList.toggle('reduced',reduced);if(reduced)finish();updateMotion()});
  document.addEventListener('visibilitychange',()=>{lastTick=performance.now()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open&&!ready){finish();document.querySelector('.explore').focus({preventScroll:true})}});
  const image = document.getElementById('lilies');
  image.addEventListener('error',()=>{finish();status.textContent='角色图暂时无法载入，仍可使用作品入口。'});
  function resize(){w=innerWidth;h=Math.max(innerHeight,document.getElementById('main').offsetHeight);const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0);stars=Array.from({length:w<760?100:230},()=>({x:Math.random(),y:Math.random(),r:Math.random()*1.1+.2,a:Math.random()*.5+.1,phase:Math.random()*6.28}));}
  resize();addEventListener('resize',resize);
  let px=0,py=0;addEventListener('pointermove',e=>{px=(e.clientX/w-.5)*2;py=(e.clientY/h-.5)*2},{passive:true});
  function draw(t){if(!ctx)return;ctx.clearRect(0,0,w,h);const time=reduced?0:t*.00014;for(const s of stars){const x=s.x*w+(reduced?0:px*(s.r*6)),y=(s.y*h+Math.sin(time+s.phase)*6);const alpha=s.a*(.75+.25*Math.sin(time*3+s.phase));ctx.fillStyle=`rgba(206,199,232,${alpha})`;ctx.beginPath();ctx.arc(x,y,s.r,0,Math.PI*2);ctx.fill();if(s.r>1.15){ctx.strokeStyle=`rgba(191,178,217,${alpha*.35})`;ctx.beginPath();ctx.moveTo(x-4,y);ctx.lineTo(x+4,y);ctx.moveTo(x,y-4);ctx.lineTo(x,y+4);ctx.stroke();}}
    const cx=w*(ready?.64:.5),cy=h*.48,rx=w*.34,ry=h*.30;
    for(let ring=0;ring<3;ring++){ctx.save();ctx.translate(cx,cy);ctx.rotate(-.42+ring*.08);ctx.strokeStyle=`rgba(${ring===1?'128,187,210':'171,135,204'},${.045+ring*.01})`;ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(0,0,rx*(1+ring*.17),ry*(.5+ring*.12),0,0,Math.PI*2);ctx.stroke();const a=time*(ring===1?-.28:.2)+ring*2.4;ctx.fillStyle=ring===1?'#a3d4e5':'#d9b4ed';ctx.shadowBlur=12;ctx.shadowColor=ctx.fillStyle;ctx.beginPath();ctx.arc(Math.cos(a)*rx*(1+ring*.17),Math.sin(a)*ry*(.5+ring*.12),1.4,0,Math.PI*2);ctx.fill();ctx.restore();}
  }
  function frame(t){const dt=Math.min(t-lastTick,100);lastTick=t;if(!document.hidden&&!paused){if(!ready&&!reduced){elapsed+=dt;body.classList.toggle('appearing',elapsed>100);body.classList.toggle('threading',elapsed>1300);body.classList.toggle('greeting',elapsed>2100&&elapsed<5900);progress.style.width=Math.min(elapsed/introLength*100,100)+'%';if(elapsed>=introLength)finish();}if(t-lastFrame>32){draw(t);lastFrame=t;}}requestAnimationFrame(frame);}
  requestAnimationFrame(frame);if(reduced||safeSession.get())finish();updateMotion();
  function updateAudio(){const playing=!audio.paused;body.dataset.playing=String(playing);const button=document.getElementById('sound');button.setAttribute('aria-pressed',String(playing||playbackPending));document.getElementById('sound-label').textContent=audioLoading?'载入音乐…':playing?'音乐播放中':'开启音乐';document.querySelectorAll('[data-track]').forEach(b=>{const active=b.dataset.track===track;b.setAttribute('aria-pressed',String(active&&(playing||playbackPending)));b.setAttribute('aria-busy',String(active&&audioLoading));b.querySelector('.track-symbol').textContent=active&&audioLoading?'…':active&&playing?'Ⅱ':'▷'});if(audioLoading){const total=document.getElementById('duration');if(total)total.textContent='载入中…';}}
  const audioSource = createAudioSourceLoader(audio, sources, {onLoading:loading=>{audioLoading=loading;updateAudio()},onError:()=>{status.textContent='音乐载入失败，请点击曲目重试。'}});
  async function toggleAudio(selected=track){const request=++playbackRequest;if(selected===track&&(!audio.paused||playbackPending)){playbackPending=false;audio.pause();updateAudio();return;}track=selected;playbackPending=true;updateAudio();try{if(await audioSource.select(selected)&&request===playbackRequest)await audio.play();}catch{if(request===playbackRequest)status.textContent='暂时无法播放音乐，请稍后重试。'}if(request===playbackRequest)playbackPending=false;updateAudio();}
  document.getElementById('sound').addEventListener('click',()=>toggleAudio());['play','pause','ended'].forEach(e=>audio.addEventListener(e,updateAudio));
  const audioProgress = createAudioProgress(audio, () => ({scrub:document.getElementById('scrub'),elapsed:document.getElementById('elapsed'),total:document.getElementById('duration')}));
  function openPanel(panel){finish();currentPanel=panel;if(!dialog.open)lastFocus=document.activeElement;const heading=document.getElementById('detail-title'),content=document.getElementById('detail-body'),kicker=document.getElementById('detail-kicker');
    if(panel==='research'){kicker.textContent='01 / RESEARCH & PROJECTS';heading.textContent='理之道，就在其中';content.innerHTML='<p>agent，deep learning modeling</p><p>世界会被重新认识</p><p>钟昊洋 · Haoyang Zhong<br>东京大学 · 调控基因组学与 DNA 序列建模</p><ul class="book-list"><li><span>Lilies in the box</span><small>桌面伴侣</small></li><li><span>UTOO</span><small>校园社区</small></li><li><span>Lilies / CoC Room</span><small>建模与跑团工具</small></li></ul><p><a href="/research/">研究与项目主页 ↗</a></p>';}
    else if(panel==='fiction'){kicker.textContent='02 / STORIES & WORLDS';heading.textContent='世界之外的平行世界';content.innerHTML='<p>发于生活，高于生活</p><ul class="book-list"><li><a href="/library/heart-tale/">Heart Tale ↗</a><small>忘却大陆</small></li><li><a href="/library/inspiration/">从灵开始 ↗</a><small>忘却大陆</small></li><li><a href="/library/magic-school/">我们没有办法一起学习魔法！ ↗</a><small>忘却大陆</small></li><li><a href="/library/kaleidoscope/">少女气泡万花筒 ↗</a><small>卷一全文 · 插画</small></li><li><a href="/library/love-and-death/">爱与死亡的颂歌 ↗</a><small>短篇集</small></li><li><a href="/library/new-year/">新年小说 ↗</a><small>2021 / 2022</small></li></ul><p><a href="/worlds/forgotten/">忘却大陆 · 世界设定 ↗</a></p><p><a href="/library/">浏览完整书库 ↗</a></p>';}
    else if(panel==='music'){kicker.textContent='03 / SOUND & RESONANCE';heading.textContent='一些音乐碎片';content.innerHTML='<button class="track" data-track="v68" aria-pressed="false"><span class="track-symbol">▷</span><span><strong>galaxynoiiro</strong><small>VERSION 68</small></span><span class="track-time">原创</span></button><button class="track" data-track="inspiration" aria-pressed="false"><span class="track-symbol">▷</span><span><strong>灵感</strong><small>INSPIRATION</small></span><span class="track-time">原创</span></button><input class="scrub" id="scrub" type="range" min="0" max="1000" value="0" step="1" disabled aria-label="当前曲目播放进度"><div class="time-row"><span id="elapsed">0:00</span><span id="duration">0:00</span></div><p><a href="/music/">进入音乐库 · 2 首原创与 25 个翻唱版本 ↗</a></p>';content.querySelectorAll('[data-track]').forEach(b=>b.addEventListener('click',()=>toggleAudio(b.dataset.track)));audioProgress.attach();audioSource.select(track);updateAudio();}
    else{kicker.textContent='CHOOSE YOUR ORBIT';heading.textContent='你想先去哪里？';content.innerHTML='<p>沿着 Lilies 的红绳，进入研究、故事与声音。</p><div class="panel-choices"><button data-go="research">研究与项目 <span>↗</span></button><button data-go="fiction">小说与世界 <span>↗</span></button><button data-go="music">听听我的音乐 <span>↗</span></button></div>';content.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.go)));}
    if(!dialog.open)dialog.showModal();document.getElementById('close').focus();
  }
  document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
  document.getElementById('close').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
  dialog.addEventListener('close',()=>{currentPanel='';if(lastFocus instanceof HTMLElement)lastFocus.focus({preventScroll:true})});
})();
