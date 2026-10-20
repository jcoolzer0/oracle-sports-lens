import { kickoff } from "./data.js";
export function filterGames(
  games,
  { week = "all", state = "all", team = null } = {},
) {
  return games
    .filter(
      (g) =>
        (week === "all" || String(g.week) === String(week)) &&
        (state === "all" ||
          (state === "final" ? g.status === "final" : g.status !== "final")) &&
        (!team || [g.home_team, g.away_team].includes(team)),
    )
    .sort(
      (a, b) =>
        a.week - b.week ||
        a.gameday.localeCompare(b.gameday) ||
        (a.gametime ?? "99:99").localeCompare(b.gametime ?? "99:99") ||
        a.game_id.localeCompare(b.game_id),
    );
}
export function predictionLabel(p) {
  return p.winner && Number.isFinite(p.p)
    ? `${p.winner} · ${Math.round(Math.max(p.p, 1 - p.p) * 100)}%`
    : "No call — view reasons";
}
export function predictionKind(g, now) {
  const start = kickoff(g);
  return g.status === "final"
    ? "Historical preview"
    : !start
      ? "Kickoff unconfirmed"
      : Date.parse(start) <= Date.parse(now)
        ? "In progress / cutoff passed"
        : "Live projection";
}
const el = (tag, text) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
function button(text, label, action) {
  const b = el("button", text);
  b.type = "button";
  b.className = "text-button";
  b.setAttribute("aria-label", label);
  b.onclick = action;
  return b;
}
export function renderSchedule(
  root,
  { games, predictions, records = [], lens, version, cutoff, onGame, onTeam },
) {
  root.replaceChildren();
  for (const g of games) {
    const p = predictions.get(g.game_id),
      saved = records.find(
        (r) => r.game === g.game_id && r.lens === lens && r.version === version,
      );
    const row = el("tr", "");
    row.dataset.game = g.game_id;
    const date = el("th", `Week ${g.week}`);
    date.scope = "row";
    date.append(el("div", `${g.gameday} · ${g.gametime ?? "time TBD"} ET`));
    const teams = el("td", "");
    teams.append(
      button(g.away_team, `Explore ${g.away_team} season`, () =>
        onTeam(g.away_team),
      ),
      document.createTextNode(" at "),
      button(g.home_team, `Explore ${g.home_team} season`, () =>
        onTeam(g.home_team),
      ),
    );
    const prediction = el("td", "");
    prediction.append(
      button(
        predictionLabel(
          saved ? { winner: saved.winner, p: saved.probabilityHome } : p,
        ),
        `View observations for ${g.away_team} at ${g.home_team}, week ${g.week}`,
        () => onGame(g.game_id),
      ),
      el("small", saved ? saved.recording === "automatic" ? "Frozen pregame call" : "Personal pregame call" : predictionKind(g, cutoff)),
    );
    const evidence = el(
      "td",
      `${p.sample} prior games minimum · ${p.models.filter((m) => m.p !== null).length}/${p.models.length} observers available`,
    );
    if (g.status === "final")
      evidence.append(
        el(
          "div",
          `Final: ${g.away_team} ${g.away_score} – ${g.home_team} ${g.home_score}`,
        ),
      );
    else
      evidence.append(
        el(
          "div",
          p.motifs.includes("disagreement")
            ? "Observers disagree"
            : "See observation details",
        ),
      );
    if (saved?.recording === "automatic" && g.status === "final" && Number.isFinite(g.home_score) && Number.isFinite(g.away_score)) {
      evidence.append(el("div", g.home_score === g.away_score ? "Tie · excluded" : !Number.isFinite(saved.probabilityHome) || saved.probabilityHome === .5 ? "Frozen no-call · excluded" : (saved.probabilityHome > .5) === (g.home_score > g.away_score) ? "Frozen call correct" : "Frozen call incorrect"));
    }
    row.append(date, teams, prediction, evidence);
    root.append(row);
  }
  if (!games.length) {
    const row = el("tr", ""),
      cell = el(
        "td",
        "No games match these filters. Choose “Show full season” to reset.",
      );
    cell.colSpan = 4;
    row.append(cell);
    root.append(row);
  }
}
