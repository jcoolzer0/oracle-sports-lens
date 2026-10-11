const el = (tag, text) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
export function renderPrediction(root, { prediction: p, game: g, bank }) {
  root.replaceChildren();
  root.append(
    el("h2", `${g.away_team} at ${g.home_team} · Week ${g.week}`),
    el("p", `${g.gameday} ${g.gametime ?? "time TBD"} ET · ${g.status}`),
  );
  root.append(
    el(
      "h3",
      p.winner
        ? `${p.winner} favored · ${Math.round((p.p > 0.5 ? p.p : 1 - p.p) * 100)}% empirical probability`
        : "No supported prediction: awaiting convergence",
    ),
    el(
      "p",
      `${p.confidence} · ${p.sample} prior games per team (minimum) · ${p.motifs.join(", ")}`,
    ),
  );
  const grid = el("div", "");
  grid.className = "observer-grid";
  for (const m of p.models) {
    const card = el("article", "");
    card.className = "card";
    card.append(
      el("h3", m.id),
      el(
        "p",
        m.p === null
          ? m.reason
          : `${g.home_team} ${Math.round(m.p * 100)}% · n=${m.n} · baseline ${m.home.toFixed(2)} vs ${m.away.toFixed(2)}`,
      ),
    );
    grid.append(card);
  }
  root.append(grid);
  for (const [side, team] of [
    ["home", g.home_team],
    ["away", g.away_team],
  ]) {
    const h = p.health[side];
    root.append(
      el(
        "p",
        `${team} scoring form: ${h ? `${h.offense.toFixed(1)} points for / ${h.defense.toFixed(1)} allowed per game` : "unavailable"} · injury health unavailable`,
      ),
    );
  }
  root.append(
    el(
      "p",
      `Context: ${g.location === "Home" ? "home venue" : "neutral/unknown venue"} · rest ${g.away_rest ?? "unknown"} / ${g.home_rest ?? "unknown"} days (away/home). Weather withheld: feed has no pregame forecast timestamp.`,
    ),
  );
  if (g.status === "final")
    root.append(
      el(
        "p",
        `Reality: ${g.away_team} ${g.away_score} – ${g.home_team} ${g.home_score}. Retrospective exploration, not a recorded pregame prediction.`,
      ),
    );
  const list = el("ul", "");
  for (const reason of p.uncertainty) list.append(el("li", reason));
  root.append(
    list,
    el(
      "p",
      `Data collected: ${bank.manifest.collected_at} · statistics: ${bank.manifest.statistics_status}. Quality flags: ${bank.manifest.quality?.missing_game_statistics?.length ?? 0} missing game-stat records.`,
    ),
  );
}
