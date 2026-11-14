// No market imports or inputs. Existing production forecasts remain authoritative.
import { frozenRecords, isCall } from './forecast-journal.js';
import { summary } from './tracking.js';
const BASE_OBSERVER_IDS=['baseline-margin','unit-efficiency','recent-trajectory'];
export const SHADOW_VERSION='team-reliability-shadow-v1';
export const SHADOW_CONFIG={prior:20,teamPrior:20,recent:10,maxBlend:.25};
export function evidenceRows(events,cutoff,target=null) {
  return frozenRecords(events).filter(r=>r.lens==='precog'&&r.version==='1.1.0'&&r.game!==target && Date.parse(r.createdAt)<Date.parse(r.kickoff)&&Date.parse(r.kickoff)<Date.parse(cutoff)&&Date.parse(r.sourceCollectedAt)<=Date.parse(r.createdAt)).flatMap(r=>{
    const s=events.find(e=>e.type==='settlement'&&e.freezeId===r.key&&Date.parse(e.createdAt)<Date.parse(cutoff)&&Date.parse(e.createdAt)>Date.parse(r.kickoff));
    return s&&Number.isFinite(s.homeScore)&&Number.isFinite(s.awayScore)&&s.homeScore!==s.awayScore?[{...r,actual:s.homeScore>s.awayScore?1:0,settledAt:s.createdAt}]:[];
  }).sort((a,b)=>Date.parse(a.settledAt)-Date.parse(b.settledAt));
}
function reliability(rows,id,prior=.25,strength=20) {
  const xs=rows.flatMap(r=>{const m=r.models?.find(m=>m.id===id);return isCall(m?.p)?[{...r,probabilityHome:m.p}]:[];});
  const stats=summary(xs), recent=summary(xs.slice(-SHADOW_CONFIG.recent));
  const loss=(xs.reduce((s,r)=>s+(r.probabilityHome-r.actual)**2,0)+strength*prior)/(xs.length+strength);
  return {n:xs.length,available:rows.length,coverage:rows.length?xs.length/rows.length:0,...stats,loss,recent};
}
export function teamShadow(prediction,game,events,cutoff) {
  const rows=evidenceRows(events,cutoff,game.game_id);
  const diagnostics=prediction.models.filter(m=>BASE_OBSERVER_IDS.includes(m.id)).map(m=>{
    const global=reliability(rows,m.id);
    const home=reliability(rows.filter(r=>[r.home,r.away].includes(game.home_team)),m.id,global.loss);
    const away=reliability(rows.filter(r=>[r.home,r.away].includes(game.away_team)),m.id,global.loss);
    // One reliability per observer: equal team average, shrunk to global. Never two votes.
    const recentLoss=(global.recent.n ? (global.recent.n*global.recent.brier+20*global.loss)/(global.recent.n+20) : global.loss);
    const loss=.375*global.loss+.375*(home.loss+away.loss)/2+.25*recentLoss;
    return {id:m.id,eligible:isCall(m.p),global,home,away,score:Math.exp(-4*loss),fallback:!global.n?'No settled global evidence; conservative prior':!home.n||!away.n?'Sparse team evidence shrinks to global':'Team evidence shrunk toward global',weight:0};
  });
  const eligible=diagnostics.filter(d=>d.eligible), total=eligible.reduce((s,d)=>s+d.score,0);
  for(const d of eligible)d.weight=.5/eligible.length+.5*d.score/total;
  const pooled=total?eligible.reduce((s,d)=>s+d.weight*prediction.models.find(m=>m.id===d.id).p,0):null;
  let p=isCall(prediction.p)&&pooled!==null ? .75*prediction.p+.25*pooled:null;
  if(!isCall(p)||Math.sign(p-.5)!==Math.sign(prediction.p-.5))p=null;
  return {mode:'shadow',version:SHADOW_VERSION,config:SHADOW_CONFIG,cutoff,game:game.game_id,baselineHome:prediction.p,probabilityHome:p,probabilityAway:p===null?null:1-p,diagnostics,trainingN:rows.length,note:'Shared evidence: derived alignment/convergence are diagnostics, never additional votes. Maximum 25% blend; no production promotion.'};
}
export function shadowValidation(events,cutoff) {
  const rows=evidenceRows(events,cutoff),paired=rows.filter(r=>{
    const s=r.predictionSnapshot?.shadow;
    return s?.version===SHADOW_VERSION && s.mode==='shadow' && s.cutoff===r.createdAt && s.game===r.game && s.baselineHome===r.probabilityHome && isCall(s.probabilityHome) && isCall(r.probabilityHome);
  });
  const subset=fn=>summary(paired.map(r=>({...r,probabilityHome:fn(r)})));
  const patterns=Object.fromEntries(['alignment','3-observer-convergence'].map(m=>[m,summary(rows.filter(r=>r.motifs?.includes(m)&&isCall(r.probabilityHome)))]));
  const differences=paired.map(r=>(r.predictionSnapshot.shadow.probabilityHome-r.actual)**2-(r.probabilityHome-r.actual)**2);
  const delta=differences.length?differences.reduce((a,b)=>a+b,0)/differences.length:null;
  const half=differences.length>1?1.96*Math.sqrt(differences.reduce((s,x)=>s+(x-delta)**2,0)/(differences.length-1)/differences.length):null;
  return {mode:'shadow',pairedBrierDelta:delta,pairedBrierDelta95:half===null?null:[delta-half,delta+half],uncertainty:'Approximate paired normal interval; small and correlated game samples limit interpretation.',eligible:rows.length,paired:paired.length,baseline:subset(r=>r.probabilityHome),adaptive:subset(r=>r.predictionSnapshot.shadow.probabilityHome),patterns,note:'Prospectively recorded frozen pairs only; no retrospective reconstruction or automatic activation. Pattern cohorts overlap and derive from the same observers.'};
}
