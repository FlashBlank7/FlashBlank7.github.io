let language=document.documentElement.lang==='en'?'en':'zh';
function copy(){
  language=document.documentElement.lang==='en'?'en':'zh';
  document.querySelectorAll('[data-copy-zh]').forEach(e=>{const text=e.dataset[language==='en'?'copyEn':'copyZh']||e.dataset.copyZh;if(e.textContent!==text)e.textContent=text;});
}
copy();addEventListener('site-languagechange',copy);
const observer=new MutationObserver(copy);observer.observe(document.body,{childList:true,subtree:true});
// Existing opening dialogs keep their music controls and timing; only editable headings change.
fetch('/site-ui.json').then(r=>r.json()).then(config=>{
  let route='';
  document.addEventListener('click',event=>{
    const trigger=event.target.closest('[data-panel],[data-go]');
    if(trigger){const value=trigger.dataset.panel||trigger.dataset.go;route=value==='fiction'?'library':value;update();}
  });
  function update(){
    const page=config.pages.find(p=>p.route===route);const heading=document.getElementById('detail-title');
    if(!page||!heading)return;heading.setAttribute('translate','no');heading.textContent=page.title[language]||page.title.zh;
    const body=document.getElementById('detail-body');
    if(route==='research')body.querySelectorAll(':scope > p').forEach((p,i)=>{if(i<2){p.setAttribute('translate','no');p.textContent=page[i===0?'subtitle':'description'][language]||page[i===0?'subtitle':'description'].zh;}});
    if(route==='library'){const p=body.querySelector(':scope > p');if(p){p.setAttribute('translate','no');p.textContent=page.subtitle[language]||page.subtitle.zh;}}
  }
  addEventListener('site-languagechange',update);
}).catch(()=>{});
