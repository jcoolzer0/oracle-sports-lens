// Active, explicitly authorized trial. Sportsbook data is never an input.
import { adaptivePrecog as baselinePrecog } from './learning.js';
import { frozenRecords, isCall } from './forecast-journal.js';
import { kickoff } from './data.js';
import { summary } from './tracking.js';
export const PROMOTION_VERSION = '1.2.0';
export const PROMOTION_CONFIG = Object.freeze({
  id: 'team-promotion-guard-v1', enabled: true, candidateBlend: .5, minPairs: 20, recentGames: 20,
  brierTolerance: .005, recentBrierTolerance: .01,
  accuracyTolerance: .05, resumeBrierGain: .005, recoveryGames: 10,
});
export function promotionPairs(events, cutoff, target = null) {
  return frozenRecords(events).filter(r => r.lens === 'precog' && r.version === PROMOTION_VERSION && r.game !== target).flatMap(r => {
    const p = r.predictionSnapshot?.promotion;
    const settlement = events.find(e => e.type === 'settlement' && e.freezeId === r.key);
    if (!p || p.config?.id !== PROMOTION_CONFIG.id || p.cutoff !== r.createdAt || p.game !== r.game ||
        !(Date.parse(r.sourceCollectedAt) <= Date.parse(r.createdAt) && Date.parse(r.createdAt) < Date.parse(r.kickoff)) ||
        !settlement || !(Date.parse(settlement.createdAt) > Date.parse(r.kickoff) && Date.parse(settlement.createdAt) < Date.parse(cutoff)) ||
        !Number.isFinite(settlement.homeScore) || !Number.isFinite(settlement.awayScore) || settlement.homeScore === settlement.awayScore ||
        !isCall(p.baselineHome) || !isCall(p.candidateHome)) return [];
    return [{ game: r.game, actual: settlement.homeScore > settlement.awayScore ? 1 : 0,
      baseline: p.baselineHome, candidate: p.candidateHome, official: r.probabilityHome,
      settledAt: settlement.createdAt, forecastAt: r.createdAt }];
  }).sort((a,b) => Date.parse(a.settledAt)-Date.parse(b.settledAt) || a.game.localeCompare(b.game));
}
function pairStats(rows) {
  const score = key => summary(rows.map(r => ({probabilityHome:r[key],actual:r.actual})));
  const baseline=score('baseline'), candidate=score('candidate');
  const differences=rows.map(r=>(r.candidate-r.actual)**2-(r.baseline-r.actual)**2);
  const delta=rows.length?differences.reduce((s,x)=>s+x,0)/rows.length:null;
  const half=rows.length>1?1.96*Math.sqrt(differences.reduce((s,x)=>s+(x-delta)**2,0)/(rows.length-1)/rows.length):null;
  return {n:rows.length,baseline,candidate,brierDelta:delta,brierDelta95:half===null?null:[delta-half,delta+half]};
}
export function promotionPolicy(pairs, config = PROMOTION_CONFIG) {
  // Reconstruct the guard chronologically from settled prospective pairs. Hysteresis
  // requires ten new settlements and a measurable recent gain before resuming.
  let active=config.enabled, suspendedAt=null, transitions=[];
  for(let n=config.minPairs;n<=pairs.length;n++) {
    const all=pairStats(pairs.slice(0,n)), recent=pairStats(pairs.slice(Math.max(0,n-config.recentGames),n));
    const worse=all.brierDelta>config.brierTolerance || recent.brierDelta>config.recentBrierTolerance ||
      recent.candidate.accuracy+config.accuracyTolerance < recent.baseline.accuracy;
    if(active && worse) {active=false;suspendedAt=n;transitions.push({n,state:'baseline',at:pairs[n-1].settledAt});}
    else if(config.enabled && !active && suspendedAt!==null && n-suspendedAt>=config.recoveryGames &&
      recent.brierDelta<=-config.resumeBrierGain && recent.candidate.accuracy>=recent.baseline.accuracy) {
      active=true;transitions.push({n,state:'adaptive',at:pairs[n-1].settledAt});
    }
  }
  return {active,state:!config.enabled?'disabled':active?pairs.length<config.minPairs?'active-trial':'adaptive':'baseline-fallback',
    n:pairs.length,reason:!config.enabled?'Adaptive promotion disabled in configuration':active?'User-authorized bounded adaptive trial; benefit is not yet established':'Settled paired results triggered the baseline safety guard',
    overall:pairStats(pairs),recent:pairStats(pairs.slice(-config.recentGames)),transitions,
    trainedThrough:pairs.at(-1)?.settledAt??null};
}
export function promotionReview(events, cutoff, target = null) {
  return promotionPolicy(promotionPairs(events,cutoff,target));
}
export const promotedPrecog = { ...baselinePrecog, version:PROMOTION_VERSION, predict(args) {
  const baseline=baselinePrecog.predict(args);
  const cutoff=kickoff(args.game) && Date.parse(kickoff(args.game))<Date.parse(args.cutoff)?kickoff(args.game):args.cutoff;
  const policy=promotionReview(args.journal??[],cutoff,args.game.game_id);
  const contributors=baseline.shadow.diagnostics.filter(d=>d.eligible);
  const pool=contributors.length?contributors.reduce((s,d)=>s+d.weight*baseline.models.find(m=>m.id===d.id).p,0):null;
  // Preserve eligibility and no-call/tie semantics, but allow a genuine change of
  // favorite in this newly versioned active model. Team estimates are never
  // independent probabilities: each observer supplies one home forecast.
  const candidate=isCall(baseline.p)&&pool!==null?(1-PROMOTION_CONFIG.candidateBlend)*baseline.p+PROMOTION_CONFIG.candidateBlend*pool:null;
  const useCandidate=policy.active && candidate!==null;
  const p=useCandidate?candidate:baseline.p;
  const promotion={version:PROMOTION_VERSION,config:PROMOTION_CONFIG,cutoff,game:args.game.game_id,
    baselineVersion:'1.1.0',baselineHome:baseline.p,candidateHome:candidate,officialHome:p,
    candidateAway:candidate===null?null:1-candidate,officialAway:p===null?null:1-p,
    deltaHomePP:isCall(candidate)&&isCall(baseline.p)?100*(candidate-baseline.p):null,
    directionChanged:isCall(candidate)&&isCall(baseline.p)&&Math.sign(candidate-.5)!==Math.sign(baseline.p-.5),
    selected:useCandidate?'adaptive':'baseline',policy,
    effectiveWeights:baseline.models.map(m=>({id:m.id,weight:0})),
  };
  // Renormalize production influence over available forecasts (including neutral
  // forecasts in baseline pooling). Abstentions never get an effective vote.
  const available=baseline.models.filter(m=>Number.isFinite(m.p));
  const total=available.reduce((s,m)=>s+(baseline.learning.weights[m.id]??0),0);
  for(const w of promotion.effectiveWeights) {
    const m=baseline.models.find(m=>m.id===w.id);
    const base=Number.isFinite(m.p)&&total?(baseline.learning.weights[m.id]??0)/total:0;
    w.weight=useCandidate ? (1-PROMOTION_CONFIG.candidateBlend)*base+PROMOTION_CONFIG.candidateBlend*(baseline.shadow.diagnostics.find(d=>d.id===w.id)?.weight??0):base;
  }
  return {...baseline,version:PROMOTION_VERSION,p,winner:!isCall(p)?null:p>.5?args.game.home_team:args.game.away_team,
    confidence:'Active adaptive experiment / uncalibrated',promotion};
}};
