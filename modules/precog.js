import { priorGames, teamRows } from "./data.js";
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
// Empirical pairwise comparison with a symmetric Beta(1,1) prior; ties contribute half.
function observer(id, home, away, value) {
  if (home.length < 3 || away.length < 3)
    return {
      id,
      p: null,
      n: Math.min(home.length, away.length),
      reason: "Needs at least three prior games per team",
    };
  let wins = 0;
  for (const h of home)
    for (const a of away) {
      const d = value(h) - value(a);
      wins += d > 0 ? 1 : d === 0 ? 0.5 : 0;
    }
  return {
    id,
    p: (wins + 1) / (home.length * away.length + 2),
    n: Math.min(home.length, away.length),
    home: mean(home.map(value)),
    away: mean(away.map(value)),
  };
}
export function predict({ bank, game, cutoff }) {
  const games = priorGames(bank, game, cutoff),
    h = teamRows(games, game.home_team),
    a = teamRows(games, game.away_team);
  // Use only weekly records joined to eligible completed games; never season totals.
  const weekly = bank.stats?.weekly ?? [];
  function units(rows, team) {
    return rows.flatMap((r) => {
      const g = games.find((g) => g.game_id === r.id),
        opp = g.home_team === team ? g.away_team : g.home_team;
      const own = weekly.find(
          (w) =>
            w.game_id === r.id && w.team === team && w.season === game.season,
        ),
        other = weekly.find(
          (w) =>
            w.game_id === r.id && w.team === opp && w.season === game.season,
        );
      function efficiency(w) {
        if (
          !w ||
          !["passing_epa", "rushing_epa", "attempts", "carries"].every((k) =>
            Number.isFinite(w[k]),
          ) ||
          w.attempts + w.carries <= 0
        )
          return null;
        return (w.passing_epa + w.rushing_epa) / (w.attempts + w.carries);
      }
      const offense = efficiency(own),
        allowed = efficiency(other);
      return offense === null || allowed === null
        ? []
        : [{ balance: offense - allowed }];
    });
  }
  const models = [
    observer("baseline-margin", h, a, (r) => r.for - r.against),
    observer(
      "unit-efficiency",
      units(h, game.home_team),
      units(a, game.away_team),
      (r) => r.balance,
    ),
    observer(
      "recent-trajectory",
      h.slice(-3),
      a.slice(-3),
      (r) => r.for - r.against,
    ),
  ];
  const valid = models.filter((m) => m.p !== null),
    home = valid.filter((m) => m.p > 0.5),
    away = valid.filter((m) => m.p < 0.5);
  const aligned = home.length >= 2 ? home : away.length >= 2 ? away : [];
  // Equal pooling avoids unsupported fitted weights; this is an uncalibrated foundation.
  const pooled = aligned.length ? mean(valid.map((m) => m.p)) : null;
  const p =
    pooled !== null &&
    ((home.length >= 2 && pooled > 0.5) || (away.length >= 2 && pooled < 0.5))
      ? pooled
      : null;
  return {
    lens: "precog",
    version: "1.0.0",
    p,
    winner:
      p === null || p === 0.5
        ? null
        : p > 0.5
          ? game.home_team
          : game.away_team,
    models: models.map((m) => ({ ...m, version: "1.0.0" })),
    motifs: [
      p !== null ? `${aligned.length}-observer-convergence` : "no-convergence",
      home.length && away.length ? "disagreement" : "alignment",
    ],
    confidence: "Experimental / uncalibrated",
    sample: Math.min(h.length, a.length),
    evidence: { homeGames: h.map((r) => r.id), awayGames: a.map((r) => r.id) },
    health: {
      home: h.length
        ? {
            offense: mean(h.map((r) => r.for)),
            defense: mean(h.map((r) => r.against)),
          }
        : null,
      away: a.length
        ? {
            offense: mean(a.map((r) => r.for)),
            defense: mean(a.map((r) => r.against)),
          }
        : null,
    },
    uncertainty: [
      "Observers share game evidence and are correlated; convergence is not independent confirmation.",
      "No injury feed: scoring form is not player health.",
      "Home advantage, rest and weather are context only until validated predictive effects exist.",
      "2025 archive predictions are preserved in Legacy and never treated as training truth.",
    ],
  };
}
export const precog = {
  id: "precog",
  label: "Pre-Cog",
  version: "1.0.0",
  predict,
};
