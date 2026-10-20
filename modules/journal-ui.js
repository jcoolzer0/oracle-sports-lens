import { frozenRecords, journalReview, POLICY } from './forecast-journal.js';
const el=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
const pct=x=>`${Math.round(x*100)}%`;
export function renderJournalStatus(root, shared, error) {
  root.replaceChildren();
  root.append(el('p',`Automatic shared recorder · starts ${POLICY.horizonHours/24} days ahead · freezes ${POLICY.freezeHours} hours before kickoff. Scheduled every 30 minutes; GitHub can delay runs. No missed calls are backfilled.`));
  if (shared.lastCheckedAt && Date.now()-Date.parse(shared.lastCheckedAt)>90*60000)
    root.append(el('p','Recorder check is over 90 minutes old. Check the recording workflow; automatic capture may have stopped.'));
  root.append(el('p',error ? `Shared recorder unavailable: ${error}. This is not a zero-accuracy result.`
    : `Last recorder check: ${shared.lastCheckedAt ?? 'not yet run'} · source collected: ${shared.sourceCollectedAt ?? 'unknown'}. Calls are public repository records and survive closing this browser.`));
}
export function renderLearning(root, events, lens, version) {
  root.replaceChildren();
  const r=journalReview(events,lens,version);
  root.append(el('h3','Early calls, frozen calls & learning'));
  root.append(el('p',`Earliest calls: ${r.early.correct??0}/${r.early.n} correct. Frozen calls: ${r.frozen.correct??0}/${r.frozen.n} correct. ${r.paired} settled games with both: ${r.flips} direction changes, ${r.strengthened} stronger and ${r.weakened} weaker final confidence.`));
  for(const b of r.leadBands) root.append(el('p',`${b.name} early lead: ${b.correct??0}/${b.n} correct${b.n?` · ${pct(b.accuracy)}`:''}.`));
  root.append(el('p',`Scoring offense signal: ${r.offense.correct}/${r.offense.n}; scoring defense signal: ${r.defense.correct}/${r.defense.n}. These test whether the side with better pregame scoring form won; they do not independently prove offensive or defensive causation. Points forecast MAE: ${r.pointsMAE===null?'awaiting settled forecasts':r.pointsMAE.toFixed(1)+' points per team'}. Offense baseline MAE: ${r.offenseMAE===null?"pending":r.offenseMAE.toFixed(1)}; defense allowed baseline MAE: ${r.defenseMAE===null?"pending":r.defenseMAE.toFixed(1)} points per team. No bookmaker spread, injury or weather forecast is invented.`));
  root.append(el('p',lens==='precog' ? 'Pre-Cog 1.1 learns observer weights from settled frozen 1.1 calls only. After 20 games with all three non-neutral observer forecasts, Brier losses adjust weights with shrinkage and a uniform component. Old calls never change. Retrospective previews do not train these weights. This is experimental adaptation, not demonstrated improvement.' : 'Legacy keeps its versioned win-rate model. Its automatic record and scoring diagnostics support the same honest review; Pre-Cog adapts observer weights separately.'));
}
export function renderForecastHistory(root, events, game, lens, version) {
  const own=events.filter(e=>e.game===game.game_id&&e.lens===lens&&e.version===version);
  const freeze=own.find(e=>e.type==='freeze');
  const records=frozenRecords(events);
  const frozen=records.find(r=>r.game===game.game_id&&r.lens===lens&&r.version===version);
  const first=own.find(e=>e.type==='forecast'&&Number.isFinite(e.payload.probabilityHome)&&e.payload.probabilityHome!==.5);
  const d=el('details','');d.append(el('summary','Automatic pregame timeline and frozen evidence'));
  const label=p=>Number.isFinite(p)&&p!==.5?`${p>.5?game.home_team:game.away_team} ${pct(Math.max(p,1-p))}`:'No call';
  d.append(el('p',freeze?`Frozen deadline ${freeze.deadline}. ${frozen?label(frozen.probabilityHome):'No forecast'}. Original forecast time ${frozen?.createdAt??'unknown'}.`:'No frozen call yet. If there is no eligible snapshot three hours before kickoff, this game stays unrecorded.'));
  if(first)d.append(el('p',`Earliest supported call: ${label(first.payload.probabilityHome)} at ${first.createdAt}.`));
  for(const e of own.filter(e=>e.type==='forecast')) d.append(el('p',`${e.createdAt} · ${label(e.payload.probabilityHome)} · source ${e.payload.sourceCollectedAt}`));
  if(frozen){const s=own.find(e=>e.type==='settlement');if(s)d.append(el('p',`Final ${s.awayScore}–${s.homeScore} (away–home). ${s.homeScore===s.awayScore?'Tie excluded':!Number.isFinite(frozen.probabilityHome)||frozen.probabilityHome===.5?'No call; excluded':(frozen.probabilityHome>.5)===(s.homeScore>s.awayScore)?'Frozen call correct':'Frozen call incorrect'}.`));
    if(s && frozen.diagnostic) {
      const p=frozen.diagnostic;
      d.append(el('p',`Pregame points estimate: ${game.away_team} ${p.pointsAway.toFixed(1)}, ${game.home_team} ${p.pointsHome.toFixed(1)}. Actual: ${s.awayScore}–${s.homeScore}. Estimated home margin ${(p.pointsHome-p.pointsAway).toFixed(1)}; actual ${s.homeScore-s.awayScore}. This is a model margin, not an offered betting spread.`));
      for(const [team,form,scored,allowed] of [[game.home_team,p.home,s.homeScore,s.awayScore],[game.away_team,p.away,s.awayScore,s.homeScore]])
        d.append(el('p',`${team}: offense baseline ${form.offense.toFixed(1)} → actual ${scored} (${(scored-form.offense).toFixed(1)} change); defense allowed baseline ${form.defense.toFixed(1)} → actual ${allowed} (${(allowed-form.defense).toFixed(1)} change; lower allowed is better).`));
    }
    d.append(el('pre',JSON.stringify({frozen,settlement:s??null},null,2)));}
  root.append(d);
}
