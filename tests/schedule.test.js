import test from "node:test";
import assert from "node:assert/strict";
import {
  filterGames,
  predictionKind,
  predictionLabel,
} from "../modules/schedule.js";
const fixtures = [
  {
    game_id: "one",
    week: 1,
    gameday: "2026-09-13",
    gametime: "13:00",
    home_team: "GB",
    away_team: "ATL",
    status: "final",
  },
  {
    game_id: "two",
    week: 2,
    gameday: "2026-09-20",
    gametime: "16:25",
    home_team: "ATL",
    away_team: "LV",
    status: "scheduled",
  },
  {
    game_id: "three",
    week: 2,
    gameday: "2026-09-20",
    gametime: "13:00",
    home_team: "NE",
    away_team: "GB",
    status: "scheduled",
  },
];
test("full schedule preserves games and orders by week/date/time", () => {
  assert.deepEqual(
    filterGames(fixtures).map((g) => g.game_id),
    ["one", "three", "two"],
  );
  assert.equal(fixtures[1].game_id, "two");
});
test("week, outcome and selected team filters compose without hiding other weeks by default", () => {
  assert.deepEqual(
    filterGames(fixtures, { week: "2", team: "GB", state: "upcoming" }).map(
      (g) => g.game_id,
    ),
    ["three"],
  );
  assert.equal(filterGames(fixtures, { state: "final" }).length, 1);
  assert.equal(filterGames(fixtures, { team: "LAR" }).length, 0);
});
test("historical, cutoff-passed and unknown kickoff projections are distinctly labeled", () => {
  assert.equal(predictionKind(fixtures[0], "2026-09-21"), "Historical preview");
  assert.equal(predictionKind(fixtures[1], "2026-09-19"), "Live projection");
  assert.equal(
    predictionKind(fixtures[1], "2026-09-21"),
    "In progress / cutoff passed",
  );
  assert.equal(
    predictionKind({ ...fixtures[1], gametime: null }, "2026-09-19"),
    "Kickoff unconfirmed",
  );
});
test("prediction summary presents either a supported winner or explicit abstention", () => {
  assert.equal(predictionLabel({ winner: "GB", p: 0.7 }), "GB · 70%");
  assert.equal(predictionLabel({ winner: "ATL", p: 0.3 }), "ATL · 70%");
  assert.equal(
    predictionLabel({ winner: null, p: null }),
    "No call — view reasons",
  );
});
