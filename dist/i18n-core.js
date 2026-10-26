import {messages} from './i18n-messages.js';
export const languageKey='fb7-language';
export function resolveLanguage({query,saved,languages=[]}={}){
  if(query==='zh'||query==='en')return query;
  if(saved==='zh'||saved==='en')return saved;
  return !languages.length||String(languages[0]).toLowerCase().startsWith('zh')?'zh':'en';
}
export function translateText(value,language){
  const original=String(value);
  const text=original.trim();
  const index=language==='en'?1:0;
  let result=messages[text]?.[index];
  if(result===undefined){
    const versions=text.match(/^(原创|翻唱) \/ (\d+) 个版本$/);
    if(versions)result=language==='en'?`${versions[1]==='原创'?'Original':'Cover'} / ${versions[2]} ${versions[2]==='1'?'version':'versions'}`:text;
    else if(text.startsWith('继续阅读 · '))result=(language==='en'?'Continue reading · ':'继续阅读 · ')+text.slice(7);
    else if(text.endsWith('版本')&&text!=='选择版本')result=language==='en'?`Version for ${text.slice(0,-2)}`:text;
    else if(text.endsWith(' · FlashBlank7'))result=translateText(text.slice(0,-14),language)+' · FlashBlank7';
  }
  if(result===undefined)return original;
  return original.slice(0,original.indexOf(text))+result+original.slice(original.indexOf(text)+text.length);
}
