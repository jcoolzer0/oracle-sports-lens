import test from 'node:test';
import assert from 'node:assert/strict';
import { classify,compareMarket,loadMarket } from '../modules/market.js';
import { teamShadow,evidenceRows,shadowValidation } from '../modules/adaptive-shadow.js';
import { adaptivePrecog } from '../modules/learning.js';
import { advanceJournal,frozenRecords } from '../modules/forecast-journal.js';
const game={game_id:'2026_11_CHI_GB',season:2026,week:11,home_team:'GB',away_team:'CHI',gameday:'2026-11-22',gametime:'13:00',status:'scheduled'};
const quote={...game,kickoff:'2026-11-22T18:00:00Z',home_probability:.6,away_probability:.4,observed_at:'2026-11-21T18:00:00Z',sportsbooks:[{sportsbook_id:'1',sportsbook:'Example book'}],home_spread:-3};
const modelIds=['baseline-margin','unit-efficiency','recent-trajectory'];
const prediction={p:.65,models:modelIds.map((id,i)=>({id,p:[.8,.55,.6][i]}))};
function history(n=1){return Array.from({length:n},(_,i)=>{
 const id='g'+i,identity={game:id,lens:'precog',version:'1.1.0'};
 return [{...identity,id:id+'f',type:'forecast',createdAt:'2026-10-18T00:00:00Z',home:'GB',away:'CHI',kickoff:'2026-10-20T18:00:00Z',payload:{sourceCollectedAt:'2026-10-17T00:00:00Z',probabilityHome:.65,models:prediction.models,motifs:['alignment','3-observer-convergence']}},
 {...identity,id:id+'z',type:'freeze',forecastId:id+'f',deadline:'2026-10-20T15:00:00Z',kickoff:'2026-10-20T18:00:00Z'},
 {...identity,type:'settlement',freezeId:id+'z',createdAt:'2026-10-21T00:00:00Z',homeScore:24,awayScore:10}];}).flat();}
test('classification precedence handles ties, conviction and contrarian favorites',()=>{
 for(const [o,m,label] of [[.51,.49,'Toss-Up'],[.7,.3,'Contrarian Underdog'],[.6,.4,'Opposing Favorites'],[.8,.65,'Oracle Conviction'],[.65,.8,'Market Conviction'],[.7,.7,'Strong Agreement'],[.6,.6,'Moderate Agreement'],[.5,.8,'Toss-Up / one source neutral']])assert.equal(classify(o,m),label);
});
test('canonical identity, orientation, pregame timestamps and pp differences',()=>{
 const c=compareMarket(game,.4,{observations:[quote]},'2026-11-22T00:00:00Z');assert.ok(c.available);assert.ok(Math.abs(c.deltaHomePP+20)<1e-10);assert.match(c.provider,/Example book.*single-book/);
 for(const patch of [{game_id:'different'},{home_team:'CHI',away_team:'GB'},{season:2025},{week:1},{observed_at:'2026-11-22T18:00:00Z'},{observed_at:'bad'},{away_probability:.6},{kickoff:'2026-11-22T19:00:00Z'}])assert.equal(compareMarket(game,.7,{observations:[{...quote,...patch}]},'2026-11-24').available,false);
 assert.equal(compareMarket(game,.7,{observations:[quote]},'2026-11-20').available,false);
 assert.match(compareMarket(game,.7,{observations:[quote]},'2026-11-22T17:00:00Z').reference,/Fresh/);
 assert.match(compareMarket(game,.7,{observations:[{...quote,observed_at:'2026-11-20'}]},'2026-11-22T17:00:00Z').reference,/Stale/);
 assert.match(compareMarket({...game,status:'final'},.7,{observations:[quote]},'2026-11-24').reference,/Retained/);
});
test('movement requires unchanged bookmaker composition and earlier pregame quotes',()=>{
 const previous={...quote,observed_at:'2026-11-20',home_probability:.55,away_probability:.45};
 const c=compareMarket(game,.7,{observations:[quote,previous]},'2026-11-22');assert.ok(Math.abs(c.movement.homePP-5)<1e-10);
 assert.match(compareMarket(game,.7,{observations:[quote,{...previous,sportsbooks:[{sportsbook_id:'2'}]}]},'2026-11-22').movement.note,/composition/);
 assert.match(compareMarket(game,.7,{observations:[{...quote,sportsbooks:[...quote.sportsbooks,{sportsbook_id:'2',sportsbook:'Other'}]}]},'2026-11-22').provider,/2 available-book consensus/);
});
test('market outage stays optional and preserves status transparently',async()=>{
 const m=await loadMarket(2026,async url=>({ok:String(url).endsWith('status.json'),status:404,text:async()=>JSON.stringify({status:'unavailable',errors:['upstream outage']})}));assert.equal(m.observations.length,0);assert.match(m.error,/upstream outage/);
});
test('shadow shrinks sparse teams, excludes derived/pick-only votes and maintains probability pair',()=>{
 const derived=teamShadow({...prediction,models:[...prediction.models,{id:'alignment',p:.99},{id:'pick-only',pick:'GB'}]},game,[],'2026-11-21');assert.equal(derived.diagnostics.length,3);
 const events=history(),before=JSON.stringify(events),s=teamShadow(prediction,game,events,'2026-11-21');assert.equal(s.trainingN,1);assert.equal(s.probabilityHome+s.probabilityAway,1);assert.ok(s.diagnostics.every(d=>d.weight>=1/6&&d.weight<=2/3));assert.ok(s.diagnostics[0].global.loss>.2);assert.equal(before,JSON.stringify(events));
 const missing=teamShadow({...prediction,models:prediction.models.map((m,i)=>i?{...m,p:null}:m)},game,[],'2026-11-21');assert.equal(missing.diagnostics[1].weight,0);assert.match(missing.diagnostics[0].fallback,/No settled/);
 assert.equal(teamShadow({...prediction,p:null},game,events,'2026-11-21').probabilityHome,null);
 const sparse=teamShadow(prediction,{...game,home_team:'NYJ'},events,'2026-11-21');assert.equal(sparse.diagnostics[0].home.n,0);assert.equal(sparse.diagnostics[0].home.loss,sparse.diagnostics[0].global.loss);
});
test('settlement cutoff and target exclusions prevent future leakage',()=>{
 const events=history(3);assert.equal(evidenceRows(events,'2026-10-20').length,0);assert.equal(evidenceRows(events,'2026-10-21T00:00:00Z').length,0);assert.equal(evidenceRows(events,'2026-11-21','g0').length,2);
 const future=[...events,...history().map(e=>({...e,game:'future',createdAt:'2027-01-01'}))];assert.deepEqual(teamShadow(prediction,game,events,'2026-11-21'),teamShadow(prediction,game,future,'2026-11-21'));
 assert.equal(shadowValidation(events,'2026-11-21').paired,0);assert.equal(shadowValidation(events,'2026-11-21').patterns.alignment.n,3);
});
test('market isolation and shadow preserve production and immutable frozen history',()=>{
 const bank={games:[game],stats:{weekly:[]},manifest:{collected_at:'2026-11-16',files_sha256:{}}},cutoff='2026-11-17T00:00:00Z';
 const p=adaptivePrecog.predict({bank,game,cutoff,journal:[]});assert.deepEqual(p,adaptivePrecog.predict({bank:{...bank,market:{observations:[quote]}},game,cutoff,journal:[]}));
 let events=advanceJournal([],{bank,lenses:[adaptivePrecog],now:cutoff});const original=JSON.stringify(events);
 events=advanceJournal(events,{bank,lenses:[adaptivePrecog],now:'2026-11-22T15:01:00Z'});assert.equal(JSON.stringify(events.slice(0,1)),original);const frozen=frozenRecords(events)[0];assert.deepEqual(frozen.predictionSnapshot.shadow,p.shadow);
 assert.equal(frozen.probabilityHome,p.p);
});
test('prospective validation scores identical frozen pairs and rejects mismatched provenance',()=>{
 const events=history(3);
 for(const e of events.filter(e=>e.type==='forecast'))e.payload.predictionSnapshot={shadow:{version:'team-reliability-shadow-v1',mode:'shadow',cutoff:e.createdAt,game:e.game,baselineHome:e.payload.probabilityHome,probabilityHome:.7}};
 const v=shadowValidation(events,'2026-11-21');assert.equal(v.paired,3);assert.equal(v.baseline.n,v.adaptive.n);assert.equal(v.adaptive.correct,3);assert.ok(v.pairedBrierDelta<0);
 events.find(e=>e.type==='forecast').payload.predictionSnapshot.shadow.cutoff='2027-01-01';assert.equal(shadowValidation(events,'2026-11-21').paired,2);
});
