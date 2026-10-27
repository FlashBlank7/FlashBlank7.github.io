import {readFile} from 'node:fs/promises';
import {createPrivateKey} from 'node:crypto';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const [keyPath,configPath]=process.argv.slice(2);
if(!keyPath||!configPath){console.error('Usage: node scripts/upload-app-key.mjs <downloaded-key.pem> <wrangler.local.jsonc>');process.exit(1);}
const key=createPrivateKey(await readFile(resolve(keyPath))).export({format:'pem',type:'pkcs8'});
const child=spawn(process.execPath,[resolve('node_modules/wrangler/bin/wrangler.js'),'secret','put','GITHUB_PRIVATE_KEY','--config',resolve(configPath)],{stdio:['pipe','inherit','inherit'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
child.stdin.end(key);child.on('exit',code=>process.exit(code||0));child.on('error',()=>{console.error('Unable to start Wrangler. No key material was printed.');process.exit(1);});
