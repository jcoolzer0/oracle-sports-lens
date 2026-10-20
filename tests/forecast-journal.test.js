import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceJournal, frozenRecords, journalReview, POLICY } from '../modules/forecast-journal.js';
import { learnedWeights } from '../modules/learning.js';
import { evaluate } from '../modules/tracking.js';
const game={game_id:'target',season:2026,home_team:'GB',away_team:'CHI',week:7,gameday:'2026-10-25',gametime:'13:00',status:'scheduled'};
const bank={games:[game],manifest:{collected_at:'2026-10-18T00:00:00Z',files_sha256:{}},stats:{weekly:[]}};
const models=p=>['baseline-margin','unit-efficiency','recent-trajectory'].map(id=>({id,p,n:3}));
const lens=(p)=>({id:'precog',version:'1.1.0',predict:()=>({lens:'precog',version:'1.1.0',p,winner:p===null?null:p>.5?'GB':'CHI',models:models(p),motifs:['alignment'],evidence:{homeGames:[],awayGames:[]}})});
const run=(events,now,p=.6,b=bank)=>advanceJournal(events,{bank:b,lenses:[lens(p)],now});
test('seven-day policy rejects historical, started, far-future, untimestamped and future sources',()=>{
 assert.equal(POLICY.freezeHours,3);
 assert.equal(run([],'2026-10-17T00:00:00Z',.6,{...bank,manifest:{collected_at:'2026-10-16'}}).length,0);
 assert.equal(run([],'2026-10-25T18:00:00Z').length,0);
 assert.equal(run([],'2026-10-25T15:00:00Z').length,0); // missed three-hour deadline
 assert.equal(run([],'2026-10-20T00:00:00Z',.6,{...bank,games:[{...game,status:'final'}]}).length,0);
 assert.throws(()=>run([],'2026-10-17T00:00:00Z'),/future/);
 assert.throws(()=>run([],'2026-10-20',.6,{...bank,manifest:{}}),/timestamp/);
});
test('earliest, revisions, final freeze and settlement remain append-only; no double counting',()=>{
 const a=run([],'2026-10-20T00:00:00Z',.6);
 assert.equal(a.length,1);
 const unchanged=run(a,'2026-10-20T00:30:00Z',.6);
 assert.deepEqual(unchanged,a);
 const b=run(a,'2026-10-25T13:00:00Z',.3); // 4h before kickoff, eligible
 const frozen=run(b,'2026-10-25T14:05:00Z',.9); // cannot use new .9 at 2h55
 assert.equal(frozenRecords(frozen)[0].probabilityHome,.3);
 assert.equal(frozenRecords(frozen,{early:true})[0].probabilityHome,.6);
 assert.deepEqual(frozen.slice(0,a.length),a);
 const reality={...bank,games:[{...game,status:'final',home_score:24,away_score:10}]};
 const settled=run(frozen,'2026-10-26T01:00:00Z',.9,reality);
 assert.equal(settled.filter(e=>e.type==='settlement').length,1);
 assert.deepEqual(run(settled,'2026-10-26T02:00:00Z',.1,reality),settled);
 assert.equal(evaluate(frozenRecords(settled),reality.games).overall.n,1);
 const review=journalReview(settled,'precog','1.1.0');
 assert.equal(review.early.correct,1);assert.equal(review.frozen.correct,0);assert.equal(review.flips,1);
});
test('a late scheduler freezes only previously recorded evidence, never backdates a missed call',()=>{
 const early=run([],'2026-10-20T00:00:00Z');
 const finalBank={...bank,games:[{...game,status:'final',home_score:20,away_score:10}]};
 const late=run(early,'2026-10-26T00:00:00Z',.1,finalBank);
 assert.equal(frozenRecords(late)[0].createdAt,'2026-10-20T00:00:00Z');
 assert.equal(late.find(e=>e.type==='freeze').createdAt,'2026-10-26T00:00:00Z');
 assert.equal(run([],'2026-10-26T00:00:00Z',.1,finalBank).length,0);
});
test('no-call at freeze stays an abstention even when an early call existed; ties excluded',()=>{
 const early=run([],'2026-10-20T00:00:00Z');
 const noCall=run(early,'2026-10-25T13:00:00Z',null);
 const frozen=run(noCall,'2026-10-25T14:01:00Z');
 assert.equal(frozenRecords(frozen)[0].probabilityHome,null);
 const tied=run(frozen,'2026-10-26T00:00:00Z',.9,{...bank,games:[{...game,status:'final',home_score:20,away_score:20}]});
 assert.equal(journalReview(tied,'precog','1.1.0').early.n,0);
});
test('rescheduled kickoff does not reuse a snapshot for a different kickoff before freezing',()=>{
 const early=run([],'2026-10-20T00:00:00Z');
 const moved={...bank,games:[{...game,gametime:'16:00'}]};
 const events=run(early,'2026-10-25T17:30:00Z',.9,moved);
 assert.equal(events.filter(e=>e.type==='freeze').length,0);
});
test('adaptive weights use only earlier settled frozen calls with all three observers, shrink and never invert',()=>{
 let events=[];
 for(let i=0;i<20;i++){
  const id='g'+i;
  const r={id:id+':forecast',type:'forecast',game:id,lens:'precog',version:'1.1.0',createdAt:'2026-10-20T00:00:00Z',kickoff:'2026-10-25T17:00:00Z',payload:{probabilityHome:.6,models:[{id:'baseline-margin',p:.9},{id:'unit-efficiency',p:.1},{id:'recent-trajectory',p:.6}]}};
  events.push(r,{id:id+':freeze',type:'freeze',game:id,lens:r.lens,version:r.version,kickoff:r.kickoff,deadline:'2026-10-25T14:00:00Z',forecastId:r.id},{type:'settlement',freezeId:id+':freeze',createdAt:'2026-10-26T00:00:00Z',homeScore:20,awayScore:10});
 }
 assert.equal(learnedWeights(events,'2026-10-25T00:00:00Z').n,0);
 const learned=learnedWeights(events,'2026-10-27T00:00:00Z');
 assert.equal(learned.n,20);
 assert.ok(learned.weights['baseline-margin']>learned.weights['unit-efficiency']);
 assert.ok(Object.values(learned.weights).every(w=>w>=1/6&&w<=2/3));
 assert.ok(Math.abs(Object.values(learned.weights).reduce((a,b)=>a+b,0)-1)<1e-12);
 assert.deepEqual(learnedWeights(events.slice(0,-3),'2026-10-27T00:00:00Z').weights,{'baseline-margin':1/3,'unit-efficiency':1/3,'recent-trajectory':1/3});
});
test('early calls are visible while pending and scoring baselines are evaluated numerically',()=>{
 const previous=[1,2,3].map(i=>({game_id:'prior'+i,season:2026,home_team:'GB',away_team:'CHI',week:i,gameday:`2026-09-0${i}`,gametime:'13:00',status:'final',home_score:30,away_score:10}));
 const b={...bank,games:[...previous,game]};
 const events=run([],'2026-10-20T00:00:00Z',.6,b);
 assert.equal(frozenRecords(events).length,0);
 assert.equal(frozenRecords(events,{early:true}).length,1);
 const frozen=run(events,'2026-10-25T14:01:00Z',.6,b);
 const settled=run(frozen,'2026-10-26T00:00:00Z',.6,{...b,games:[...previous,{...game,status:'final',home_score:24,away_score:14}]});
 const review=journalReview(settled,'precog','1.1.0');
 assert.equal(review.pointsMAE,5);assert.equal(review.offenseMAE,5);assert.equal(review.defenseMAE,5);
});
