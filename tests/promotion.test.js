import test from 'node:test';
import assert from 'node:assert/strict';
import { promotionPolicy,promotionPairs,promotedPrecog,PROMOTION_CONFIG } from '../modules/promotion.js';
import { adaptivePrecog } from '../modules/learning.js';
import { advanceJournal,frozenRecords,officialRecord } from '../modules/forecast-journal.js';
const game={game_id:'2026_11_CHI_GB',season:2026,home_team:'GB',away_team:'CHI',week:11,gameday:'2026-11-22',gametime:'13:00',status:'scheduled'};
const cutoff='2026-11-17T00:00:00Z';
const previous=Array.from({length:6},(_,i)=>({...game,game_id:'prior'+i,week:i+1,gameday:`2026-10-${String(i+1).padStart(2,'0')}`,status:'final',home_score:30+i,away_score:10+i}));
const bank={games:[...previous,game],manifest:{collected_at:'2026-11-16',files_sha256:{}},stats:{weekly:[]}};
const pairs=(n,base=.6,candidate=.2)=>Array.from({length:n},(_,i)=>({game:'g'+i,actual:1,baseline:base,candidate,official:candidate,settledAt:`2026-10-${String(Math.floor(i/3)+1).padStart(2,'0')}T00:00:00Z`}));
function journal(n=20){return pairs(n).flatMap((r,i)=>{
 const identity={game:r.game,lens:'precog',version:'1.2.0'},forecastAt='2026-10-01T00:00:00Z',kickoff='2026-10-02T18:00:00Z';
 return [{...identity,id:r.game+'f',type:'forecast',createdAt:forecastAt,kickoff,payload:{sourceCollectedAt:'2026-09-30',probabilityHome:r.candidate,predictionSnapshot:{promotion:{config:PROMOTION_CONFIG,cutoff:forecastAt,game:r.game,baselineHome:r.baseline,candidateHome:r.candidate}}}},
 {...identity,id:r.game+'z',type:'freeze',forecastId:r.game+'f',kickoff,deadline:'2026-10-02T15:00:00Z'},
 {...identity,type:'settlement',freezeId:r.game+'z',createdAt:'2026-10-03T00:00:00Z',homeScore:24,awayScore:10}];});}
test('promotion begins as authorized trial, falls back after poor results and resumes with hysteresis',()=>{
 assert.equal(promotionPolicy([]).state,'active-trial');assert.equal(promotionPolicy(pairs(19)).active,true);
 const bad=pairs(20);assert.equal(promotionPolicy(bad).state,'baseline-fallback');
 assert.equal(promotionPolicy([...bad,...pairs(9,.6,.9)]).active,false);
 const recovered=promotionPolicy([...bad,...pairs(20,.6,.9)]);assert.equal(recovered.active,true);assert.equal(recovered.transitions.length,2);
 assert.equal(promotionPolicy(pairs(20,.6,.7)).state,'adaptive');
 assert.equal(promotionPolicy([], {...PROMOTION_CONFIG,enabled:false}).active,false);
});
test('only original frozen prospective comparisons and prior settlements inform promotion',()=>{
 const events=journal();assert.equal(promotionPairs(events,'2026-10-03T00:00:00Z').length,0);assert.equal(promotionPairs(events,cutoff).length,20);assert.equal(promotionPairs(events,cutoff,'g0').length,19);
 events[0].payload.predictionSnapshot.promotion.cutoff='2027-01-01';assert.equal(promotionPairs(events,cutoff).length,19);
 events[3].payload.sourceCollectedAt='2027-01-01';assert.equal(promotionPairs(events,cutoff).length,18);
});
test('active forecast stores baseline, coherent candidate, influence and revert decision without changing baseline',()=>{
 const args={bank,game,cutoff,journal:[]},baseline=adaptivePrecog.predict(args),p=promotedPrecog.predict(args);
 assert.equal(p.version,'1.2.1');assert.equal(p.promotion.baselineHome,baseline.p);assert.equal(p.p,p.promotion.candidateHome);assert.equal(p.promotion.selected,'adaptive');assert.equal(p.p+p.promotion.officialAway,1);
 assert.ok(Math.abs(p.promotion.effectiveWeights.reduce((s,w)=>s+w.weight,0)-1)<1e-12);
 assert.equal(p.promotion.effectiveWeights.find(w=>w.id==='unit-efficiency').weight,0);
 const degraded=promotedPrecog.predict({...args,journal:journal()});assert.equal(degraded.p,baseline.p);assert.equal(degraded.promotion.selected,'baseline');
 assert.deepEqual(p,promotedPrecog.predict({...args,bank:{...bank,market:{home_probability:.01}}}));
 const noCall=promotedPrecog.predict({...args,bank:{...bank,games:[game]}});assert.equal(noCall.p,null);assert.equal(noCall.winner,null);
});
test('parallel baseline and adaptive recording preserves frozen evidence and exposes prior version calls',()=>{
 let events=advanceJournal([],{bank,lenses:[adaptivePrecog,promotedPrecog],now:cutoff});const original=JSON.stringify(events);
 events=advanceJournal(events,{bank,lenses:[adaptivePrecog,promotedPrecog],now:'2026-11-22T15:01:00Z'});
 assert.equal(JSON.stringify(events.slice(0,2)),original);const records=frozenRecords(events);assert.equal(records.length,2);
 assert.equal(officialRecord(records,game.game_id,'precog','1.2.1').version,'1.2.1');
 assert.equal(officialRecord(records.filter(r=>r.version==='1.1.0'),game.game_id,'precog','1.2.0').version,'1.1.0');
 const old=JSON.stringify(events);events=advanceJournal(events,{bank,lenses:[adaptivePrecog,promotedPrecog],now:'2026-11-22T16:00:00Z'});assert.equal(JSON.stringify(events),old);
});
