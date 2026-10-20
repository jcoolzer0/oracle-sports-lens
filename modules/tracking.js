import { kickoff } from "./data.js";
export const STORAGE = "oracle-predictions-v1";
export function recordPrediction(
  records,
  prediction,
  game,
  bank,
  now = new Date().toISOString(),
) {
  const start = kickoff(game),
    collected = bank.manifest.collected_at;
  if (
    !start ||
    game.status === "final" ||
    Date.parse(now) >= Date.parse(start) ||
    !Number.isFinite(Date.parse(collected)) ||
    Date.parse(collected) > Date.parse(now) ||
    !prediction.winner || prediction.p === null || prediction.p === 0.5
  )
    throw Error("Only timestamped, available pregame evidence can be recorded");
  if (!Number.isFinite(prediction.p) || prediction.p < 0 || prediction.p > 1)
    throw Error("Invalid probability");
  const key = [prediction.lens, prediction.version, game.game_id].join(":");
  if (records.some((r) => r.key === key)) return records;
  const record = {
    key,
    lens: prediction.lens,
    version: prediction.version,
    game: game.game_id,
    season: game.season,
    home: game.home_team,
    away: game.away_team,
    matchupType: game.div_game ? "division" : "non-division",
    createdAt: now,
    cutoff: now,
    kickoff: start,
    sourceCollectedAt: collected,
    sourceHashes: bank.manifest.files_sha256,
    probabilityHome: prediction.p,
    winner: prediction.winner,
    models: prediction.models,
    motifs: prediction.motifs,
    evidence: prediction.evidence,
  };
  return [...records, JSON.parse(JSON.stringify(record))];
}
export function summary(rows) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const correct = rows.filter(
    (r) => (r.probabilityHome > 0.5 ? 1 : 0) === r.actual,
  ).length;
  const bins = Array.from({ length: 5 }, (_, i) => {
    const xs = rows.filter(
      (r) => Math.min(4, Math.floor(r.probabilityHome * 5)) === i,
    );
    return {
      range: [i / 5, (i + 1) / 5],
      n: xs.length,
      predicted: xs.length
        ? xs.reduce((s, r) => s + r.probabilityHome, 0) / xs.length
        : null,
      observed: xs.length
        ? xs.reduce((s, r) => s + r.actual, 0) / xs.length
        : null,
    };
  });
  const rate = correct / n,
    z = 1.96,
    den = 1 + (z * z) / n,
    center = (rate + (z * z) / (2 * n)) / den,
    half =
      (z * Math.sqrt((rate * (1 - rate)) / n + (z * z) / (4 * n * n))) / den;
  return {
    n,
    correct,
    incorrect: n - correct,
    accuracy: rate,
    accuracy95: [center - half, center + half],
    brier:
      rows.reduce((s, r) => s + (r.probabilityHome - r.actual) ** 2, 0) / n,
    calibration: bins,
  };
}
export function evaluate(records, games, cohorts = []) {
  const outcomes = new Map(
    games
      .filter(
        (g) =>
          g.status === "final" &&
          Number.isFinite(g.home_score) &&
          Number.isFinite(g.away_score),
      )
      .map((g) => [g.game_id, g]),
  );
  let rows = records
    .filter(
      (r) =>
        Date.parse(r.createdAt) < Date.parse(r.kickoff) &&
        Date.parse(r.sourceCollectedAt) <= Date.parse(r.cutoff) &&
        r.createdAt === r.cutoff &&
        Number.isFinite(r.probabilityHome) &&
        r.probabilityHome >= 0 &&
        r.probabilityHome <= 1 && r.probabilityHome !== 0.5,
    )
    .flatMap((r) => {
      const g = outcomes.get(r.game);
      if (!g || g.home_score === g.away_score || kickoff(g) !== r.kickoff)
        return [];
      return [
        {
          ...r,
          actual: g.home_score > g.away_score ? 1 : 0,
          cohort: r.lens + "@" + r.version,
        },
      ];
    });
  if (cohorts.length > 1) {
    const key = (r) => JSON.stringify([r.game, r.cutoff, r.sourceHashes]);
    const sets = cohorts.map(
      (c) => new Set(rows.filter((r) => r.cohort === c).map(key)),
    );
    rows = rows.filter(
      (r) => cohorts.includes(r.cohort) && sets.every((s) => s.has(key(r))),
    );
  }
  const group = (fn) =>
    Object.fromEntries(
      [...new Set(rows.flatMap(fn))].map((k) => [
        k,
        summary(rows.filter((r) => fn(r).includes(k))),
      ]),
    );
  return {
    overall: summary(rows),
    byLens: group((r) => [r.cohort]),
    byTeam: group((r) => [r.home, r.away]),
    byMatchup: group((r) => [r.matchupType]),
    byMotif: group((r) => r.motifs),
    byModel: Object.fromEntries(
      [
        ...new Set(
          rows.flatMap((r) =>
            r.models.map((m) => m.id + "@" + (m.version ?? r.version)),
          ),
        ),
      ].map((id) => [
        id,
        summary(
          rows.flatMap((r) => {
            const m = r.models.find(
              (m) => m.id + "@" + (m.version ?? r.version) === id,
            );
            return Number.isFinite(m?.p) && m.p >= 0 && m.p <= 1 && m.p !== 0.5
              ? [{ ...r, probabilityHome: m.p }]
              : [];
          }),
        ),
      ]),
    ),
    tiesExcluded: true,
    note: "No superiority claims. Signals without recorded probabilities are descriptive only. Comparisons require identical games, evidence snapshots and cutoffs.",
  };
}
