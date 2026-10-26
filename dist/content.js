const storage={get(key){try{return localStorage.getItem(key)}catch{return null}},set(key,value){try{localStorage.setItem(key,value)}catch{}}};
const wideLayout=matchMedia('(min-width:901px)');
function arrangeTOC(){document.querySelectorAll('.toc details').forEach(d=>d.open=wideLayout.matches)}
arrangeTOC();wideLayout.addEventListener('change',arrangeTOC);
const article=document.querySelector('.novel');
if(article){
  const book=article.dataset.book;
  const key=`fb7-reading:${book}`;
  let fontSize=Math.max(15,Math.min(24,Number(storage.get('fb7-font-size'))||18));
  let light=storage.get('fb7-reading-theme')==='light';
  const theme=document.getElementById('reading-theme');
  function apply(){document.documentElement.style.setProperty('--read-size',fontSize+'px');document.body.dataset.readingTheme=light?'light':'dark';theme.textContent=light?'深色阅读':'浅色阅读';theme.setAttribute('aria-pressed',String(light));}
  apply();
  document.querySelectorAll('[data-size]').forEach(b=>b.addEventListener('click',()=>{fontSize=Math.max(15,Math.min(24,fontSize+Number(b.dataset.size)));storage.set('fb7-font-size',fontSize);apply();}));
  theme.addEventListener('click',()=>{light=!light;storage.set('fb7-reading-theme',light?'light':'dark');apply();});
  let pending=false;
  function save(){pending=false;const start=article.offsetTop;const distance=Math.max(1,article.offsetHeight-innerHeight);const ratio=Math.max(0,Math.min(1,(scrollY-start)/distance));document.getElementById('reading-progress').textContent=Math.round(ratio*100)+'%';storage.set(key,JSON.stringify({path:location.pathname,title:document.title.split(' · ')[0],ratio}));}
  let prior=null;
  try{prior=JSON.parse(storage.get(key))}catch{}
  if(prior?.path===location.pathname&&location.hash==='#resume')requestAnimationFrame(()=>{scrollTo({top:article.offsetTop+Math.max(0,Math.min(1,Number(prior.ratio)||0))*Math.max(1,article.offsetHeight-innerHeight),behavior:'instant'});save();});
  else save();
  addEventListener('scroll',()=>{if(!pending){pending=true;requestAnimationFrame(save)}},{passive:true});
}
document.querySelectorAll('.resume-reading').forEach(a=>{try{const saved=JSON.parse(storage.get(`fb7-reading:${a.dataset.book}`));if(saved?.path?.startsWith(`/library/${a.dataset.book}/`)&&/^\/library\/[a-z0-9-]+\/[a-z0-9-]+(?:\.html)?$/.test(saved.path)){a.href=saved.path+'#resume';a.textContent=`继续阅读 · ${saved.title}`;a.hidden=false}}catch{}});
