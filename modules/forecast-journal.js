import { kickoff, priorGames, teamRows } from "./data.js";
import { summary } from "./tracking.js";
export const POLICY = { id: "seven-day-three-hour-v1", horizonHours: 168, freezeHours: 3 };
export const JOURNAL_STORAGE = "oracle-forecast-events-v1";
const ms = (x) => Date.parse(x);
const hours = 3600000;
export const isCall = (p) => Number.isFinite(p) && p >= 0 && p <= 1 && p !== 0.5;
const keyOf = (x) => `${x.lens}@${x.version}:${x.game}`;
const clone = (x) => JSON.parse(JSON.stringify(x));
export function scoringForecast(bank, game, cutoff) {
  const rows = priorGames(bank, game, cutoff);
  const form = (team) => {
    const r = teamRows(rows, team);
    return r.length >= 3 ? { n: r.length, offense: r.reduce((s,x)=>s+x.for,0)/r.length, defense: r.reduce((s,x)=>s+x.against,0)/r.length } : null;
  };
  const home = form(game.home_team), away = form(game.away_team);
  if (!home || !away) return null;
  return { home, away, pointsHome: (home.offense + away.defense)/2,
    pointsAway: (away.offense + home.defense)/2,
    offenseSide: Math.sign(home.offense-away.offense),
    defenseSide: Math.sign(away.defense-home.defense),
    note: "Scoring-form diagnostics; points are not player health, EPA, or bookmaker spreads." };
}
// Pure append-only transition. No clock backdating; forecasts at/after the freeze deadline are never eligible.
export function advanceJournal(events, { bank, lenses, now = new Date().toISOString(), snapshot = null }) {
  if (!Number.isFinite(ms(now))) throw Error("Invalid observation time");
  const next = [...events];
  const collected = bank.manifest.collected_at;
  if (!Number.isFinite(ms(collected)) || ms(collected) > ms(now)) throw Error("Source timestamp unavailable or in the future");
  for (const game of bank.games) {
    const start = kickoff(game);
    if (!start) continue;
    for (const lens of lenses) {
      const identity = { game: game.game_id, season: game.season, lens: lens.id, version: lens.version };
      const own = next.filter((e) => keyOf(e) === keyOf(identity));
      const deadline = ms(start) - POLICY.freezeHours*hours;
      let frozen = own.find((e) => e.type === "freeze");
      if (!frozen && ms(now) >= deadline) {
        const candidates = own.filter((e) => e.type === "forecast" && e.kickoff === start && ms(e.createdAt) <= deadline && ms(e.createdAt) < ms(start));
        const chosen = candidates.at(-1);
        if (chosen) {
          frozen = { ...identity, id: `${keyOf(identity)}:freeze`, type: "freeze", createdAt: now,
            forecastId: chosen.id, kickoff: start, deadline: new Date(deadline).toISOString(), policy: POLICY.id };
          next.push(frozen);
        }
      }
      if (frozen) {
        if (!own.some((e) => e.type === "settlement") && game.status === "final" && Number.isFinite(game.home_score) && Number.isFinite(game.away_score) && ms(now) > ms(frozen.kickoff)) {
          next.push({ ...identity, id: `${keyOf(identity)}:settlement`, type: "settlement", createdAt: now,
            freezeId: frozen.id, homeScore: game.home_score, awayScore: game.away_score,
            sourceCollectedAt: collected, sourceHashes: bank.manifest.files_sha256, snapshot });
        }
        continue;
      }
      if (game.status !== "scheduled" || ms(now) > deadline || ms(start)-ms(now) > POLICY.horizonHours*hours) continue;
      const prediction = lens.predict({ bank, game, cutoff: now, journal: events });
      const diagnostic = scoringForecast(bank, game, now);
      const payload = { probabilityHome: prediction.p, winner: prediction.winner, models: prediction.models,
        motifs: prediction.motifs, evidence: prediction.evidence, predictionSnapshot: prediction, diagnostic, learning: prediction.learning ?? null,
        sourceCollectedAt: collected, sourceHashes: bank.manifest.files_sha256, snapshot, kickoff: start };
      const previous = own.filter((e) => e.type === "forecast").at(-1);
      if (previous && JSON.stringify(previous.payload) === JSON.stringify(payload)) continue;
      next.push({ ...identity, id: `${keyOf(identity)}:${now}`, type: "forecast", createdAt: now,
        cutoff: now, home: game.home_team, away: game.away_team, week: game.week,
        kickoff: start, policy: POLICY.id, payload });
    }
  }
  return clone(next);
}
export function frozenRecords(events, { early = false } = {}) {
  const freezes = events.filter((e)=>e.type === "freeze");
  const groups = early ? [...new Map(events.filter(e=>e.type === "forecast").map(e=>[keyOf(e), e])).values()].map(e=> freezes.find(f=>keyOf(f)===keyOf(e)) ?? {
    ...e, id: `${keyOf(e)}:freeze`, createdAt: null, deadline: new Date(ms(e.kickoff)-POLICY.freezeHours*hours).toISOString()
  }) : freezes;
  return groups.flatMap((f)=> {
    const eligible = events.filter((e)=>e.type === "forecast" && keyOf(e) === keyOf(f) && e.kickoff === f.kickoff && ms(e.createdAt) <= ms(f.deadline));
    const forecast = early ? eligible.find((e)=>isCall(e.payload.probabilityHome)) : eligible.find((e)=>e.id === f.forecastId);
    if (!forecast) return [];
    const p = forecast.payload;
    return [{ ...forecast, ...p, key: f.id, game: f.game, createdAt: forecast.createdAt, cutoff: forecast.createdAt,
      matchupType: "unknown", frozenAt: f.createdAt, freezeDeadline: f.deadline,
      leadHours: (ms(f.kickoff)-ms(forecast.createdAt))/hours, recording: "automatic" }];
  });
}
export function journalReview(events, lens, version) {
  const frozen = frozenRecords(events).filter((r)=>r.lens===lens && r.version===version);
  const settled = (records) => records.flatMap((r)=> {
    const s = events.find((e)=>e.type === "settlement" && e.freezeId === r.key);
    return s && s.homeScore !== s.awayScore && isCall(r.probabilityHome) ? [{...r,actual:s.homeScore>s.awayScore?1:0,settlement:s}] : [];
  });
  const rows=settled(frozen);
  const early=settled(frozenRecords(events,{early:true}).filter((r)=>r.lens===lens && r.version===version));
  const diagnostic = rows.filter((r)=>r.diagnostic);
  const sideScore=(field)=> {
    const xs=diagnostic.filter(r=>r.diagnostic[field]!==0);
    return {n:xs.length,correct:xs.filter(r=>(r.diagnostic[field]>0?1:0)===r.actual).length};
  };
  const leadBands = [["3–24 hours",3,24],["1–3 days",24,72],["3–7 days",72,169]].map(([name,min,max])=>({name,...summary(early.filter(r=>r.leadHours>=min&&r.leadHours<max))}));
  const paired=early.flatMap(e=> {const f=rows.find(r=>r.game===e.game);return f?[{early:e,frozen:f}]:[];});
  return { frozen:summary(rows), early:summary(early), leadBands,
    offense:sideScore("offenseSide"), defense:sideScore("defenseSide"),
    offenseMAE:diagnostic.length ? diagnostic.reduce((s,r)=>s+Math.abs(r.diagnostic.home.offense-r.settlement.homeScore)+Math.abs(r.diagnostic.away.offense-r.settlement.awayScore),0)/(2*diagnostic.length):null,
    defenseMAE:diagnostic.length ? diagnostic.reduce((s,r)=>s+Math.abs(r.diagnostic.home.defense-r.settlement.awayScore)+Math.abs(r.diagnostic.away.defense-r.settlement.homeScore),0)/(2*diagnostic.length):null,
    pointsMAE:diagnostic.length ? diagnostic.reduce((s,r)=>s+Math.abs(r.diagnostic.pointsHome-r.settlement.homeScore)+Math.abs(r.diagnostic.pointsAway-r.settlement.awayScore),0)/(2*diagnostic.length):null,
    paired:paired.length, flips:paired.filter(r=>Math.sign(r.early.probabilityHome-.5)!==Math.sign(r.frozen.probabilityHome-.5)).length,
    strengthened:paired.filter(r=>Math.abs(r.frozen.probabilityHome-.5)>Math.abs(r.early.probabilityHome-.5)).length,
    weakened:paired.filter(r=>Math.abs(r.frozen.probabilityHome-.5)<Math.abs(r.early.probabilityHome-.5)).length };
}
export function mergeEvents(shared, local) {
  // Shared committed history wins conflicts; local entries never replace it.
  const ids = new Set(shared.map(e=>e.id));
  return [...shared, ...local.filter(e=>!ids.has(e.id))];
}
export async function loadSharedJournal(fetcher = fetch) {
  const response = await fetcher(new URL("../data/forecast-journal.json", import.meta.url), {cache:"no-store"});
  if (!response.ok) throw Error(`Shared journal HTTP ${response.status}`);
  const data = await response.json();
  if (data.schema !== 1 || !Array.isArray(data.events)) throw Error("Invalid shared journal");
  return data;
}
