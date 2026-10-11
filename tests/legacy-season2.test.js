import test from "node:test";
import assert from "node:assert/strict";
import {
  historicalBaseline,
  legacySeason2,
} from "../modules/legacy-season2.js";
const archive = {
  summary: { season: 2025, team: "GB" },
  games: [
    {
      week: 1,
      opponent: "ATL",
      score: "21-10",
      result: "W",
      oracle: { pregame_pick: "L" },
    },
    { week: 2, opponent: "LV", score: "10-21", result: "L" },
    { week: 3, opponent: "NE", score: "14-14", result: "T" },
  ],
};
const game = {
  game_id: "target",
  home_team: "GB",
  away_team: "ATL",
  week: 6,
  gameday: "2026-10-18",
  gametime: "13:00",
  season: 2026,
  status: "scheduled",
};
const games = Array.from({ length: 4 }, (_, i) => ({
  game_id: "prior" + i,
  home_team: "GB",
  away_team: "ATL",
  week: i + 1,
  gameday: `2026-09-${13 + i * 2}`,
  home_score: 20,
  away_score: 10,
  status: "final",
}));
const bank = { games: [...games, game] };
const cutoff = "2026-10-11T18:00:00Z";
test("historical baseline uses score-consistent regular-season results, never oracle predictions", () => {
  const b = historicalBaseline(archive, "GB");
  assert.equal(b.n, 3);
  assert.equal(b.rate, 0.5);
  assert.deepEqual(
    historicalBaseline(
      {
        ...archive,
        games: archive.games.map((g) => ({
          ...g,
          oracle: { pregame_pick: "W", pregame_expected_win_rate: 999 },
        })),
      },
      "GB",
    ),
    b,
  );
});
test("invalid, duplicate, future-season and inconsistent archive rows are excluded", () => {
  const b = historicalBaseline(
    {
      ...archive,
      games: [
        ...archive.games,
        { ...archive.games[0] },
        { week: 4, opponent: "ATL", score: "3-7", result: "W" },
        { week: 19, opponent: "LV", score: "3-0", result: "W" },
      ],
    },
    "GB",
  );
  assert.equal(b.n, 3);
  assert.equal(b.rejected, 3);
  assert.equal(
    historicalBaseline(
      { ...archive, summary: { team: "GB", season: 2026 } },
      "GB",
    ).n,
    0,
  );
});
test("history is capped at one equivalent game and declines as current evidence grows", () => {
  const history = { GB: { rate: 0.1, n: 100 }, ATL: { rate: 0.9, n: 100 } };
  const p = legacySeason2({ bank, game, cutoff, history });
  assert.ok(p.p > 0.5);
  assert.equal(p.home.historyShare, 1 / 7);
  assert.equal(p.home.n, 4);
  assert.equal(p.evidence.historyStrengthEquivalentGames, 1);
  const more = {
    ...bank,
    games: [
      ...games,
      { ...games[0], game_id: "extra", week: 5, gameday: "2026-10-01" },
    ],
  };
  assert.ok(
    legacySeason2({ bank: more, game, cutoff, history }).home.historyShare <
      p.home.historyShare,
  );
});
test("last year alone cannot generate calls and future results cannot alter predictions", () => {
  const history = { GB: { rate: 0.9, n: 17 }, ATL: { rate: 0.1, n: 17 } };
  assert.equal(
    legacySeason2({ bank: { games: [] }, game, cutoff, history }).p,
    null,
  );
  const p = legacySeason2({ bank, game, cutoff, history });
  assert.deepEqual(
    legacySeason2({
      bank: {
        games: [
          ...bank.games,
          {
            ...game,
            game_id: "future",
            status: "final",
            home_score: 999,
            away_score: 0,
          },
        ],
      },
      game,
      cutoff,
      history,
    }),
    p,
  );
});
