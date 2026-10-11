import { loadBank, CODES, canonical, kickoff } from "./data.js";
import { loadHistory, legacySeason2 } from "./legacy-season2.js";
import { filterGames, predictionLabel, predictionKind } from "./schedule.js";
import { recordPrediction, STORAGE } from "./tracking.js";
const $ = (id) => document.getElementById(id),
  el = (tag, text) => {
    const e = document.createElement(tag);
    e.textContent = text;
    return e;
  };
let bank,
  history = {},
  selected,
  cutoff,
  prediction,
  ready,
  nextGameId;
function records() {
  const r = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
  if (!Array.isArray(r)) throw Error("Invalid journal");
  return r;
}
function team() {
  return canonical($("teamSel").value);
}
function toggle() {
  const current = $("legacySeason").value === "2026";
  $("legacy2026").hidden = !current;
  $("legacy2025").hidden = current;
  $("gameSel").closest("label").hidden = current;
  document
    .querySelectorAll(".legacy-season1-control")
    .forEach((e) => (e.hidden = current));
  $("legacySeasonTag").textContent = current
    ? "Season 2 · 2026/27"
    : "Season 1 · 2025";
  const bottom = $("bottomNav");
  if (bottom) bottom.hidden = current;
  if (current) refresh();
}
function observe(id, focus = false) {
  selected = bank.games.find((g) => g.game_id === id);
  if (!selected) return;
  cutoff = new Date().toISOString();
  prediction = legacySeason2({ bank, game: selected, cutoff, history });
  const root = $("legacy2026Observation");
  root.replaceChildren();
  root.append(
    el(
      "h3",
      `${selected.away_team} at ${selected.home_team} · Week ${selected.week}`,
    ),
    el("p", `${predictionLabel(prediction)} · experimental, uncalibrated`),
    el("p", predictionKind(selected, cutoff)),
  );
  for (const side of [prediction.away, prediction.home])
    root.append(
      el(
        "p",
        `${side.team}: ${side.wins} wins-equivalent from ${side.n} eligible 2026 games. 2025 baseline: ${side.history.n} internally consistent archived games; ${side.history.rejected} rejected. Historical contribution: ${(side.historyShare * 100).toFixed(1)}% of posterior evidence (maximum one equivalent game).`,
      ),
    );
  root.append(
    el(
      "p",
      "At least three prior current-season games per team are required for a call. A symmetric Beta(1,1) prior and weak 2025 win-rate baseline are updated with current wins/ties; relative team rates are compared using the log5 formula. This is a new Legacy Season 2 bridge, not the archived 2025 oracle model. No historical predictions, motifs, season totals or future results are model inputs.",
    ),
    el(
      "p",
      "The 2025 archive may be partial and is not independently verified. Score/result consistency does not prove upstream accuracy. Rosters, coaching, injuries, weather and opponent-strength changes are not modeled; early predictions remain uncertain.",
    ),
  );
  const details = el("details", "");
  details.append(
    el("summary", "Inspect evidence and historical baseline source"),
    el(
      "pre",
      JSON.stringify(
        { cutoff, prediction, sourceCollectedAt: bank.manifest.collected_at },
        null,
        2,
      ),
    ),
  );
  root.append(details);
  try {
    const saved = records().find(
      (r) =>
        r.lens === prediction.lens &&
        r.version === prediction.version &&
        r.game === id,
    );
    if (saved)
      root.append(
        el("p", `Recorded call retained: ${saved.winner} · ${saved.createdAt}`),
      );
  } catch {}
  $("legacy2026Save").disabled =
    prediction.p === null ||
    !prediction.winner ||
    selected.status === "final" ||
    !kickoff(selected) ||
    Date.parse(kickoff(selected)) <= Date.now();
  if (focus) {
    $("legacy2026Heading").focus();
    $("legacy2026Detail").scrollIntoView({ block: "start" });
  }
}
async function refresh() {
  if ($("legacySeason").value !== "2026") return;
  try {
    if (!ready)
      ready = Promise.all([
        loadBank(),
        Promise.all(CODES.map(async (t) => [t, await loadHistory(t)])),
      ]);
    const [b, h] = await ready;
    bank = b;
    history = Object.fromEntries(h);
    const games = filterGames(bank.games, { team: team() });
    const tbody = $("legacy2026Table").querySelector("tbody");
    tbody.replaceChildren();
    const now = new Date().toISOString();
    for (const g of games) {
      const p = legacySeason2({ bank, game: g, cutoff: now, history }),
        row = el("tr", "");
      row.dataset.game = g.game_id;
      const week = el("th", `W${g.week} · ${g.gameday}`);
      week.scope = "row";
      const matchup = el("td", `${g.away_team} at ${g.home_team}`),
        cell = el("td", ""),
        button = el("button", predictionLabel(p));
      button.type = "button";
      button.className = "text-button";
      button.setAttribute(
        "aria-label",
        `Inspect ${g.away_team} at ${g.home_team}, week ${g.week}`,
      );
      button.onclick = () => observe(g.game_id, true);
      cell.append(button, el("small", predictionKind(g, now)));
      row.append(
        week,
        matchup,
        cell,
        el(
          "td",
          g.status === "final"
            ? `${g.away_score} – ${g.home_score}`
            : "Upcoming",
        ),
      );
      tbody.append(row);
    }
    $("legacy2026Status").textContent =
      `${team()} · ${games.length} scheduled games · data collected ${bank.manifest.collected_at}. Historical baselines are weak and may be incomplete.`;
    const next =
      games.find(
        (g) =>
          g.status !== "final" &&
          kickoff(g) &&
          Date.parse(kickoff(g)) > Date.now(),
      ) ?? games.at(-1);
    if (next) {
      observe(next.game_id);
      nextGameId = next.game_id;
      $("legacy2026NextSummary").textContent =
        `${next.status === "final" ? "Latest available matchup" : "Next matchup"}: ${next.away_team} at ${next.home_team} · ${next.gameday} · ${predictionLabel(prediction)}`;
      $("legacy2026Next").disabled = false;
    }
  } catch (e) {
    ready = null;
    $("legacy2026Status").textContent =
      `Season 2 unavailable: ${e.message}. Season 1 remains available.`;
  }
}
$("legacySeason").onchange = toggle;
$("teamSel").addEventListener("change", refresh);
$("refresh").addEventListener("click", () => {
  ready = null;
  refresh();
});
for (const id of ["prevTeam", "nextTeam", "bottomNextTeam"])
  $(id)?.addEventListener("click", refresh);
window.addEventListener("message", (e) => {
  if (
    e.origin === location.origin &&
    e.source === parent &&
    e.data?.type === "team"
  ) {
    setTimeout(refresh, 0);
  }
});
$("legacy2026Save").onclick = () => {
  try {
    observe(selected.game_id);
    localStorage.setItem(
      STORAGE,
      JSON.stringify(
        recordPrediction(records(), prediction, selected, bank, cutoff),
      ),
    );
    $("legacy2026Status").textContent =
      "Pregame call saved; original calls are retained.";
    observe(selected.game_id);
  } catch (e) {
    $("legacy2026Status").textContent = `Not saved: ${e.message}`;
  }
};
toggle();

$("legacy2026Next").onclick = () => {
  if (nextGameId) observe(nextGameId, true);
};
