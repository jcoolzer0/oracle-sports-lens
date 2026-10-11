import test from "node:test";
import assert from "node:assert/strict";
import { canonical, kickoff, priorGames } from "../modules/data.js";
import { predict } from "../modules/precog.js";
import { recordPrediction, evaluate } from "../modules/tracking.js";
import { Registry } from "../modules/registry.js";
const game = {
  game_id: "2026_06_ATL_GB",
  season: 2026,
  week: 6,
  gameday: "2026-10-18",
  gametime: "13:00",
  away_team: "ATL",
  home_team: "GB",
  status: "scheduled",
  div_game: 0,
};
const games = Array.from({ length: 4 }, (_, i) => ({
  game_id: "g" + i,
  season: 2026,
  week: i + 1,
  gameday: `2026-09-${13 + i * 2}`,
  status: "final",
  home_team: "GB",
  away_team: "ATL",
  home_score: 30,
  away_score: 10,
}));
const bank = {
  games: [...games, game],
  manifest: {
    collected_at: "2026-10-11T12:00:00Z",
    files_sha256: { schedule: "abc" },
  },
  stats: { weekly: [] },
};
const now = "2026-10-11T18:00:00Z";
test("canonical aliases and ambiguous cities", () => {
  assert.equal(canonical("LA"), "LAR");
  assert.equal(canonical("WAS"), "WSH");
  assert.equal(canonical("New York"), null);
  assert.equal(canonical("LV"), "LV");
});
test("Eastern kickoff respects daylight and standard time", () => {
  assert.equal(kickoff(game), "2026-10-18T17:00:00.000Z");
  assert.equal(
    kickoff({ ...game, gameday: "2026-12-20" }),
    "2026-12-20T18:00:00.000Z",
  );
  assert.equal(kickoff({ ...game, gametime: null }), null);
});
test("future, target and same-day outcomes cannot change a prediction", () => {
  const first = predict({ bank, game, cutoff: now });
  const dirty = {
    ...bank,
    games: [
      ...bank.games,
      {
        ...game,
        game_id: "leak",
        status: "final",
        home_score: 500,
        away_score: 0,
      },
      { ...games[0], game_id: "same", gameday: "2026-10-11", home_score: 999 },
    ],
  };
  assert.deepEqual(predict({ bank: dirty, game, cutoff: now }), first);
  assert.equal(priorGames(dirty, game, now).length, 4);
  assert.equal(first.models[1].p, null);
  assert.equal(first.winner, "GB");
});
test("missing data abstains; zero scores are real values", () => {
  assert.equal(
    predict({ bank: { ...bank, games: [] }, game, cutoff: now }).p,
    null,
  );
  assert.equal(
    priorGames(
      { ...bank, games: [{ ...games[0], home_score: 0, away_score: 0 }] },
      game,
      now,
    ).length,
    1,
  );
});
test("pregame journal is append-only per lens/version/game", () => {
  const p = predict({ bank, game, cutoff: now });
  const r = recordPrediction([], p, game, bank, now);
  assert.deepEqual(recordPrediction(r, { ...p, p: 0.1 }, game, bank, now), r);
  assert.throws(() =>
    recordPrediction([], p, { ...game, status: "final" }, bank, now),
  );
  assert.throws(() =>
    recordPrediction([], p, game, bank, "2026-10-18T18:00:00Z"),
  );
  assert.throws(() =>
    recordPrediction(
      [],
      p,
      game,
      { ...bank, manifest: { collected_at: "2026-10-12" } },
      now,
    ),
  );
});
test("evaluation includes actual games, Brier and equivalent cohorts only", () => {
  const p = predict({ bank, game, cutoff: now });
  const r = recordPrediction([], p, game, bank, now);
  const reality = [
    { ...game, status: "final", home_score: 20, away_score: 10 },
  ];
  const result = evaluate(r, reality);
  assert.equal(result.overall.n, 1);
  assert.equal(result.overall.accuracy, 1);
  assert.equal(result.overall.brier, (p.p - 1) ** 2);
  assert.equal(evaluate(r, reality, ["precog@1.0.0", "other@1"]).overall.n, 0);
  const other = { ...r[0], lens: "other", version: "1", key: "other" };
  assert.equal(
    evaluate([...r, other], reality, ["precog@1.0.0", "other@1"]).overall.n,
    2,
  );
  assert.equal(
    evaluate([...r, { ...other, cutoff: "2026-10-10" }], reality, [
      "precog@1.0.0",
      "other@1",
    ]).overall.n,
    0,
  );
  assert.equal(evaluate(r, [{ ...reality[0], away_score: 20 }]).overall.n, 0);
});
test("extensions reject duplicate identities", () => {
  const r = new Registry();
  r.addLens({ id: "x", version: "1", predict });
  assert.throws(() => r.addLens({ id: "x", version: "2", predict }));
});
import { loadBank, normalize, CODES } from "../modules/data.js";
test("weekly efficiency joins eligible games and ignores injected future statistics", () => {
  const weekly = games.flatMap((g) => [
    {
      game_id: g.game_id,
      team: "GB",
      season: 2026,
      passing_epa: 20,
      rushing_epa: 10,
      attempts: 30,
      carries: 20,
    },
    {
      game_id: g.game_id,
      team: "ATL",
      season: 2026,
      passing_epa: -10,
      rushing_epa: 0,
      attempts: 30,
      carries: 20,
    },
  ]);
  const withStats = { ...bank, stats: { weekly } };
  const p = predict({ bank: withStats, game, cutoff: now });
  assert.ok(p.models[1].p > 0.5);
  const poisoned = {
    ...withStats,
    stats: {
      weekly: [
        ...weekly,
        {
          game_id: game.game_id,
          team: "GB",
          passing_epa: -999,
          rushing_epa: 0,
          attempts: 1,
          carries: 1,
        },
      ],
    },
  };
  assert.deepEqual(predict({ bank: poisoned, game, cutoff: now }), p);
});
test("schema rejects duplicate schedule games", () => {
  assert.throws(() =>
    normalize(
      { season: 2026, games: [game, game] },
      { teams: CODES.map((team) => ({ team, name: team })) },
      { schema_version: 2, season: 2026 },
      null,
    ),
  );
});
test("snapshot loader validates checksums and falls back as a whole bundle", async () => {
  const payloads = {
    schedule: JSON.stringify({ season: 2026, games: [game] }),
    teams: JSON.stringify({
      teams: CODES.map((team) => ({ team, name: team })),
    }),
    team_stats: JSON.stringify({ weekly: [] }),
  };
  const hashes = {};
  for (const [name, text] of Object.entries(payloads)) {
    hashes[name + ".json"] = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
  }
  payloads.manifest = JSON.stringify({
    schema_version: 2,
    season: 2026,
    files_sha256: hashes,
  });
  const requests = [];
  const fetcher = async (url) => {
    requests.push(url);
    if (url.includes("github.io"))
      return new Response("blocked", { status: 403 });
    return new Response(payloads[url.split("/").pop().replace(".json", "")]);
  };
  const b = await loadBank(2026, fetcher);
  assert.equal(b.games.length, 1);
  assert.ok(b.source.includes("raw.githubusercontent"));
  assert.ok(requests.some((u) => u.includes("github.io")));
  await assert.rejects(
    () =>
      loadBank(
        2026,
        async (url) =>
          new Response(
            url.endsWith("manifest.json")
              ? payloads.manifest
              : JSON.stringify({ tampered: true }),
          ),
      ),
    /checksum/,
  );
});
