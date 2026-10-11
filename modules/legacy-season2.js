import { canonical, priorGames, teamRows, BASE } from "./data.js";
// Archive oracle fields are never training inputs. Require score/result consistency.
export function historicalBaseline(data, team) {
  if (data?.summary?.season !== 2025 || canonical(data.summary.team) !== team)
    return { rate: 0.5, n: 0, rejected: data?.games?.length ?? 0 };
  const seen = new Set();
  let wins = 0,
    n = 0,
    rejected = 0;
  for (const g of data.games ?? []) {
    const opponent = canonical(g.opponent),
      score =
        typeof g.score === "string"
          ? g.score.match(/^(\d+)\s*-\s*(\d+)$/)
          : null;
    const key = String(g.week);
    if (
      !opponent ||
      opponent === team ||
      !Number.isInteger(g.week) ||
      g.week < 1 ||
      g.week > 18 ||
      seen.has(key) ||
      !score
    ) {
      rejected++;
      continue;
    }
    seen.add(key);
    const pf = Number(score[1]),
      pa = Number(score[2]),
      result = pf > pa ? "W" : pf < pa ? "L" : "T";
    if (g.result !== result) {
      rejected++;
      continue;
    }
    n++;
    wins += result === "W" ? 1 : result === "T" ? 0.5 : 0;
  }
  return { rate: (wins + 1) / (n + 2), n, rejected };
}
export async function loadHistory(team, fetcher = fetch) {
  const key = ({ LAR: "la", WSH: "was" }[team] ?? team).toLowerCase();
  for (const url of [`${BASE}history/2025/${key}.json`, `data/${key}.json`])
    try {
      const r = await fetcher(url, { cache: "no-store" });
      if (!r.ok) throw Error("unavailable");
      const text = await r.text();
      const baseline = historicalBaseline(JSON.parse(text), team);
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      return { ...baseline, source: url, sha256: hash };
    } catch {}
  return { rate: 0.5, n: 0, rejected: 0, source: "unavailable", sha256: null };
}
export function legacySeason2({ bank, game, cutoff, history = {} }) {
  const prior = priorGames(bank, game, cutoff);
  const side = (team) => {
    const rows = teamRows(prior, team),
      old = history[team] ?? { rate: 0.5, n: 0, rejected: 0 };
    const wins = rows.reduce(
      (s, r) => s + (r.for > r.against ? 1 : r.for === r.against ? 0.5 : 0),
      0,
    );
    // Symmetric Beta(1,1) base + at most one equivalent game from 2025.
    const strength = old.n >= 3 ? 1 : 0,
      rate = (wins + 1 + strength * old.rate) / (rows.length + 2 + strength);
    return {
      team,
      rate,
      n: rows.length,
      wins,
      history: old,
      historyShare: strength / (rows.length + 2 + strength),
      ids: rows.map((r) => r.id),
    };
  };
  const home = side(game.home_team),
    away = side(game.away_team);
  const numerator = home.rate * (1 - away.rate),
    den = numerator + away.rate * (1 - home.rate);
  const p = home.n >= 3 && away.n >= 3 ? numerator / den : null;
  return {
    lens: "legacy-season2",
    version: "1.0.0",
    p,
    winner: p === null || p === 0.5 ? null : p > 0.5 ? home.team : away.team,
    models: [
      {
        id: "weak-history-win-baseline",
        version: "1.0.0",
        p,
        n: Math.min(home.n, away.n),
      },
    ],
    motifs: ["weak-2025-baseline"],
    sample: Math.min(home.n, away.n),
    home,
    away,
    evidence: {
      homeGames: home.ids,
      awayGames: away.ids,
      history: { home: home.history, away: away.history },
      historyStrengthEquivalentGames: 1,
    },
  };
}
