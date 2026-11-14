import { officialRecord } from "./forecast-journal.js";
import { promotionReview } from "./promotion.js";
import { compareMarket } from './market.js';
import { shadowValidation } from './adaptive-shadow.js';
const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const pct=p=>Number.isFinite(p)?`${(p*100).toFixed(1)}%`:'no call';
const favorite=(p,g)=>!Number.isFinite(p)?'No supported call':Math.abs(p-.5)<=.005?'No clear favorite':`${p>.5?g.home_team:g.away_team} ${pct(Math.max(p,1-p))}`;
export function renderMarket(root,g,p,market) {
  const c=compareMarket(g,p,market), section=el('section','');
  section.append(el('h3','Oracle vs. independent market'),el('p',`Oracle: ${favorite(p,g)}. Market is comparison only; it never trains or selects observers.`));
  if(!c.available)section.append(el('p',`${c.label}: ${c.reason}`));
  else {
    section.append(el('p',`${c.label} · Market: ${favorite(c.quote.home_probability,g)} · ${g.home_team} Oracle − market: ${c.deltaHomePP===null?'unavailable':`${c.deltaHomePP>=0?'+':''}${c.deltaHomePP.toFixed(1)} percentage points`}.`),el('p',`${c.provider} · home spread (${g.home_team}): ${Number.isFinite(c.quote.home_spread)?c.quote.home_spread:'unavailable'} · observed ${c.quote.observed_at} · ${c.reference}.`),el('p',`Positive differences mean Oracle rates ${g.home_team} higher; negative differences mean it rates ${g.away_team} higher. Disagreement is not evidence of a profitable bet.`));
    if(c.movement)section.append(el('p',c.movement.note??`Comparable provider movement: ${c.movement.homePP.toFixed(1)} home percentage points since ${c.movement.from}.`));
    else section.append(el('p','Movement unavailable: no earlier comparable snapshot loaded.'));
  }
  const details=el('details','');details.append(el('summary','Market coverage and collection status'),el('pre',JSON.stringify({source:market?.source??null,loadedObservations:market?.observations?.length??0,status:market?.status??null,quote:c.quote??null},null,2)));section.append(details);root.append(section);
}
export function renderShadow(root,s,game,promotion) {
  if(!s)return;
  if(promotion)s={...s,version:"team-weighted-active-1.2.0",config:{...s.config,maxBlend:promotion.config.candidateBlend},probabilityHome:promotion.candidateHome,probabilityAway:promotion.candidateAway};
  const d=el('details','');d.append(el('summary',promotion?'Team-specific observer influence · active candidate':'Team-specific observer influence · shadow experiment'),el('p',`Production ${game.home_team}: ${pct(s.baselineHome)}. Candidate ${game.home_team}: ${pct(s.probabilityHome)}; ${game.away_team}: ${pct(s.probabilityAway)}. ${s.trainingN} previously settled games. ${promotion?"The candidate may be promoted under the policy below; frozen calls never change.":"Production and frozen calls remain authoritative."}`),el('p',promotion?'Derived alignment/convergence are never extra votes. Active candidate blends 50% baseline with 50% team-weighted pool; a change of favorite is possible.':s.note));
  const wrap=el('div','');wrap.className='table-wrap';const table=el('table','');table.append(el('caption','One influence per observer; team evidence shrinks toward global evidence'));
  const head=el('thead',''),hr=el('tr','');for(const text of ['Observer','Availability / influence','Global evidence','Home-team evidence','Away-team evidence','Fallback']) {const th=el('th',text);th.scope='col';hr.append(th);}head.append(hr);table.append(head);
  const body=el('tbody','');
  const stats=r=>`n=${r.n}; accuracy ${r.n?pct(r.accuracy):'pending'}; Brier ${r.n?r.brier.toFixed(3):'pending'}; shrunk loss ${r.loss.toFixed(3)}`;
  for(const x of s.diagnostics){const tr=el('tr',''),name=el('th',x.id);name.scope='row';tr.append(name,el('td',x.eligible?`${pct(x.weight)} of candidate pool`:'Abstains · no influence'),el('td',`${stats(x.global)}; coverage ${x.global.n}/${x.global.available}; recent n=${x.global.recent.n}, accuracy ${x.global.recent.n?pct(x.global.recent.accuracy):"pending"}, Brier ${x.global.recent.n?x.global.recent.brier.toFixed(3):"pending"}`),el('td',stats(x.home)),el('td',stats(x.away)),el('td',x.fallback));body.append(tr);}table.append(body);wrap.append(table);d.append(wrap,el('pre',JSON.stringify({version:s.version,config:s.config,cutoff:s.cutoff},null,2)));root.append(d);
}
export function renderShadowReview(root,events,cutoff) {
  const v=shadowValidation(events,cutoff),d=el('details','');d.append(el('summary','Pattern evidence and prospective shadow validation'));
  for(const [name,s] of Object.entries(v.patterns))d.append(el('p',`${name}: ${s.correct??0}/${s.n} correct${s.n?` · ${pct(s.accuracy)} · 95% interval ${s.accuracy95.map(pct).join('–')}`:''}; ${s.n}/${v.eligible} settled-game coverage. Derived lens, not an independent observer.`));
  d.append(el('p',`Paired prospective shadow games: ${v.paired}. ${v.note}`),el('pre',JSON.stringify(v,null,2)));root.append(d);
}
export function renderMarketReview(root,{games,predictions,records,market,cutoff,lens,version}) {
  const counts={}, gaps=[];let covered=0;
  for(const g of games){const r=officialRecord(records,g.game_id,lens,version), p=r?r.probabilityHome:predictions.get(g.game_id)?.p,c=compareMarket(g,p,market,cutoff);if(!c.available)continue;covered++;counts[c.label]=(counts[c.label]??0)+1;if(c.largeDisagreement)gaps.push(`${g.away_team} at ${g.home_team}: ${g.home_team} ${c.deltaHomePP>=0?'+':''}${c.deltaHomePP.toFixed(1)} pp`);}
  const d=el('details','');d.append(el('summary',`Market comparison review · ${covered}/${games.length} matchups covered`),el('p',covered===games.length?'Complete loaded matchup coverage.':covered?'Partial coverage; unmatched games have no market comparison.':'Market observations unavailable; no comparison results are invented.'),el('p','Uses frozen Oracle calls where available, otherwise labeled current/historical previews. Quotes must predate kickoff. These descriptive groups do not train or promote observers.'),el('pre',JSON.stringify(counts,null,2)));
  if(gaps.length)d.append(el('p',`Large gaps: ${gaps.join('; ')}`));root.append(d);
}
export function renderPromotion(root,p,game) {
  if(!p)return;
  const section=el('section','');
  section.append(el('h3',`Adaptive promotion · ${p.policy.state}`),
    el('p',`Official ${game.home_team}: ${pct(p.officialHome)} · ${game.away_team}: ${pct(p.officialAway)}. Selected ${p.selected}. Baseline ${pct(p.baselineHome)} → candidate ${pct(p.candidateHome)} (${p.deltaHomePP===null?'no supported call':`${p.deltaHomePP>=0?'+':''}${p.deltaHomePP.toFixed(2)} home percentage points`}).`),
    el('p',`${p.policy.reason}. ${p.policy.n} settled prospective pairs; training through ${p.policy.trainedThrough??'none yet'}.`),
    el('p',`Effective official influence: ${p.effectiveWeights.map(x=>`${x.id}: ${pct(x.weight)}`).join('; ')}. All observers use home orientation; away is its complement.`));
  root.append(section);
}
export function renderPromotionReview(root,events,cutoff) {
  const p=promotionReview(events,cutoff),d=el('details','');
  d.append(el('summary',`Adaptive promotion and baseline comparison · ${p.state}`),
    el('p','Active trial by user authorization; improvement is not established. Only genuine frozen 1.2 forecasts settled before cutoff enter this comparison. The candidate continues recording during fallback. Model 1.1 remains available in the scorecard version selector.'),
    el('p',`${p.n} paired games. Baseline Brier: ${p.overall.n?p.overall.baseline.brier.toFixed(4):'pending'}; candidate Brier: ${p.overall.n?p.overall.candidate.brier.toFixed(4):'pending'}. Lower is better. Accuracy: baseline ${p.overall.n?pct(p.overall.baseline.accuracy):'pending'}, candidate ${p.overall.n?pct(p.overall.candidate.accuracy):'pending'}.`),
    el('p','After 20 settled pairs, return to baseline if overall Brier worsens by more than .005, recent-20 Brier worsens by more than .010, or recent accuracy falls more than 5 percentage points. Resume only after 10 new settlements and a recent Brier gain of at least .005 with accuracy at least baseline. The threshold guard is a conservative policy, not a statistical guarantee.'),
    el('p','Approximate paired Brier intervals and calibration are below. Small, correlated samples limit conclusions; market prices never affect this decision.'),
    el('pre',JSON.stringify(p,null,2)));
  root.append(d);
}
