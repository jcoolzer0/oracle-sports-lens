import { frozenRecords, isCall } from "./forecast-journal.js";
import { kickoff } from "./data.js";
import { precog } from "./precog.js";
// Prequential adaptation: only outcomes first observed before this forecast, never retrospective previews.
export function learnedWeights(events, cutoff) {
  const modelIds = ["baseline-margin", "unit-efficiency", "recent-trajectory"];
  const rows = frozenRecords(events).filter(r => r.lens === "precog" && r.version === "1.1.0").flatMap(r => {
    const s = events.find(e=>e.type === "settlement" && e.freezeId === r.key && Date.parse(e.createdAt)<Date.parse(cutoff));
    return s && s.homeScore!==s.awayScore && modelIds.every(id=>isCall(r.models.find(m=>m.id===id)?.p))
      ? [{r,y:s.homeScore>s.awayScore?1:0,s}] : [];
  });
  const losses = modelIds.map(id=> rows.reduce((sum,{r,y})=>sum+(r.models.find(m=>m.id===id).p-y)**2,0));
  // Twenty paired games before adaptation; 20 pseudo-games at .25 Brier shrink small samples.
  const raw = losses.map(loss=> rows.length<20?1:Math.exp(-4*(loss+5)/(rows.length+20)));
  const total=raw.reduce((s,x)=>s+x,0);
  // Half uniform, half learned: no inversion or runaway single-observer weights.
  return {weights:Object.fromEntries(modelIds.map((id,i)=>[id,1/6+raw[i]/(2*total)])), n:rows.length,
    policy:"paired-brier-shrinkage-v1", trainedThrough:rows.map(x=>x.s.createdAt).sort().at(-1)??null};
}
export const adaptivePrecog = { ...precog, version:"1.1.0", predict(args) {
  const p=precog.predict(args);
  const learningCutoff = kickoff(args.game) && Date.parse(kickoff(args.game)) < Date.parse(args.cutoff) ? kickoff(args.game) : args.cutoff;
  const learning=learnedWeights((args.journal??[]).filter(e=>e.game!==args.game.game_id),learningCutoff);
  const valid=p.models.filter(m=>Number.isFinite(m.p));
  const total=valid.reduce((s,m)=>s+learning.weights[m.id],0);
  const pooled=total?valid.reduce((s,m)=>s+m.p*learning.weights[m.id],0)/total:null;
  // Keep original minimum evidence / majority abstention contract.
  const probability=p.p===null || pooled===.5 || Math.sign(pooled-.5)!==Math.sign(p.p-.5)?null:pooled;
  return {...p,version:"1.1.0",p:probability,winner:probability===null?null:probability>.5?args.game.home_team:args.game.away_team,learning};
}};
