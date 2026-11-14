// Display-only boundary: analytical modules never import market data.
import { BASE, canonical, kickoff } from './data.js';
export const MARKET_CONFIG = { tie: .005, tossUp: .05, strong: .65, conviction: .10, contrarian: .65, staleHours: 24 };
const probability = p => Number.isFinite(p) && p >= 0 && p <= 1;
export function classify(oracle, market, c = MARKET_CONFIG) {
  const side = p => Math.abs(p-.5)<=c.tie ? 0 : Math.sign(p-.5);
  const o=side(oracle), m=side(market), oc=Math.max(oracle,1-oracle), mc=Math.max(market,1-market);
  // Precedence: toss-up, opposing/contrarian, conviction, strong, moderate.
  if (Math.abs(oracle-.5)<=c.tossUp && Math.abs(market-.5)<=c.tossUp) return 'Toss-Up';
  if (o && m && o!==m) return oc>=c.contrarian ? 'Contrarian Underdog' : 'Opposing Favorites';
  if (!o || !m) return 'Toss-Up / one source neutral';
  if (oc-mc>=c.conviction-1e-12) return 'Oracle Conviction';
  if (mc-oc>=c.conviction-1e-12) return 'Market Conviction';
  return oc>=c.strong && mc>=c.strong ? 'Strong Agreement' : 'Moderate Agreement';
}
export function eligibleObservation(o,g,asOf) {
  const start=kickoff(g);
  return o?.game_id===g.game_id && o.season===g.season && o.week===g.week && canonical(o.home_team)===g.home_team && canonical(o.away_team)===g.away_team && start && Date.parse(o.kickoff)===Date.parse(start) && Number.isFinite(Date.parse(o.observed_at)) && Date.parse(o.observed_at)<Date.parse(start) && Date.parse(o.observed_at)<=Date.parse(asOf) && probability(o.home_probability) && probability(o.away_probability) && Math.abs(o.home_probability+o.away_probability-1)<1e-6;
}
export function compareMarket(g,p,market,now=new Date().toISOString(),config=MARKET_CONFIG) {
  const observations=market?.observations??[];
  const eligible=observations.filter(o=>eligibleObservation(o,g,now)).sort((a,b)=>Date.parse(a.observed_at)-Date.parse(b.observed_at));
  const quote=eligible.at(-1);
  if (!quote) return {available:false, label:'Market unavailable', reason:market?.error??'No matching pregame observation', status:market?.status};
  const started=Date.parse(now)>=Date.parse(kickoff(g));
  const ageHours=(Date.parse(now)-Date.parse(quote.observed_at))/3600000;
  const books=quote.sportsbooks??[], composition=o=>JSON.stringify((o.sportsbooks??[]).map(b=>String(b.sportsbook_id)).sort());
  const previous=eligible.filter(o=>Date.parse(o.observed_at)<Date.parse(quote.observed_at)).at(-1);
  const movement=previous ? composition(previous)!==composition(quote) ? {note:'Provider composition changed; movement withheld'} : books.length ? {homePP:100*(quote.home_probability-previous.home_probability),from:previous.observed_at} : null : null;
  return {available:true,quote,ageHours,movement,reference:started?'Retained pregame reference (not guaranteed closing line)':ageHours>config.staleHours?'Stale pregame observation':'Fresh upcoming observation',
    provider:books.length===1?`${books[0].sportsbook} · single-book reference`:`${books.length} available-book consensus`,
    label:probability(p)?classify(p,quote.home_probability,config):'Oracle abstains', deltaHomePP:probability(p)?100*(p-quote.home_probability):null,
    largeDisagreement:probability(p)&&Math.abs(p-quote.home_probability)>=config.conviction};
}
export async function loadMarket(season=2026,fetcher=fetch) {
  const roots=[`${BASE}market/${season}/`,`https://raw.githubusercontent.com/jcoolzer0/packers-oracle-v0/main/docs/market/${season}/`];
  let status=null, archived=[];
  try { const r=await fetcher(new URL("../data/market-reference.json",import.meta.url),{cache:"no-store"});if(r.ok){const x=JSON.parse(await r.text());if(x.schema_version===1&&Array.isArray(x.observations))archived=x.observations;} } catch { /* optional independently retained quotes */ }
  for (const root of roots) {
    const read=async name=>{const r=await fetcher(root+name+'.json',{cache:'no-store'}); if(!r.ok)throw Error(`Market ${name}: HTTP ${r.status}`); return JSON.parse(await r.text());};
    try { status=await read('status'); } catch { /* independent optional status */ }
    try {const data=await read('latest');if(data.schema_version!==1||!Array.isArray(data.observations))throw Error('Invalid market schema');return {...data,observations:[...archived,...data.observations],status,source:root};}catch { /* optional reference never blocks predictions */ }
  }
  return {observations:archived,status,error:status?.errors?.join('; ')||'No public market observations available'};
}
