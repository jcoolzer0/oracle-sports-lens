import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { loadBank, CODES } from '../modules/data.js';
import { loadHistory, legacySeason2 } from '../modules/legacy-season2.js';
import { adaptivePrecog } from '../modules/learning.js';
import { advanceJournal } from '../modules/forecast-journal.js';
const journalPath = new URL('../data/forecast-journal.json', import.meta.url);
// curl preserves system CA trust and the cloud's injected HTTPS proxy.
const payloads = {};
const fetcher = async (url) => {
  try {
    const body = typeof url==='string' && url.startsWith('data/') ? await readFile(new URL('../'+url,import.meta.url),'utf8')
      : execFileSync('curl',['--fail','--silent','--show-error','--location','--max-time','30',String(url)],{encoding:'utf8',maxBuffer:20*1024*1024,stdio:['ignore','pipe','pipe']});
    payloads[String(url)] = body;
    return {ok:true,text:async()=>body};
  } catch { return {ok:false,status:503}; }
};
let journal;
try { journal=JSON.parse(await readFile(journalPath,'utf8')); }
catch(e) { if(e.code!=='ENOENT') throw e; journal={schema:1,events:[]}; }
if(journal.schema!==1||!Array.isArray(journal.events)) throw Error('Invalid existing journal; refusing overwrite');
const bank=await loadBank(2026,fetcher);
const history=Object.fromEntries(await Promise.all(CODES.map(async t=>[t,await loadHistory(t,fetcher)])));
const now=new Date().toISOString();
const lenses=[adaptivePrecog,{id:'legacy-season2',version:'1.0.0',predict:args=>legacySeason2({...args,history})}];
const snapshot=JSON.stringify({bank,history,payloads:Object.fromEntries(Object.entries(payloads).sort(([a],[b])=>a.localeCompare(b)))},null,2)+'\n';
const snapshotId=createHash('sha256').update(snapshot).digest('hex');
await mkdir(new URL('../data/forecast-snapshots/',import.meta.url),{recursive:true});
const snapshotPath=new URL(`../data/forecast-snapshots/${snapshotId}.json`,import.meta.url);
const events=advanceJournal(journal.events,{bank,lenses,now,snapshot:`data/forecast-snapshots/${snapshotId}.json`});
if(events.length!==journal.events.length) {
  try { await writeFile(snapshotPath,snapshot,{flag:'wx'}); }
  catch(e) { if(e.code!=='EEXIST') throw e; if(await readFile(snapshotPath,'utf8')!==snapshot) throw Error('Archived snapshot content mismatch'); }
}
await writeFile(journalPath,JSON.stringify({schema:1,lastCheckedAt:now,sourceCollectedAt:bank.manifest.collected_at,events},null,2)+'\n');
console.log(`${events.length-journal.events.length} appended events; ${events.length} total; checked ${now}`);
