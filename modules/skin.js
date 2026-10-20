const el = (tag, text) => {
  const n = document.createElement(tag);
  n.textContent = text;
  return n;
};
export function renderPrediction(
  root,
  { prediction: p, game: g, bank, cutoff, onGame, onTeam, record },
) {
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
  if (record) {
    const saved = el(
      "p",
      `${record.recording === "automatic" ? "Frozen automatic pregame call" : "Personal pregame call"}: ${record.winner ?? "No call"} · ${Number.isFinite(record.probabilityHome) ? Math.round(Math.max(record.probabilityHome, 1 - record.probabilityHome) * 100)+"%" : "abstention"} · saved ${record.createdAt}. This original call is retained for evaluation.`,
    );
    saved.className = "warning";
    root.append(saved);
  }
  root.append(
    el(
      "p",
      `Observation cutoff: ${cutoff ?? "unavailable"}. No future games or season totals enter these calculations.`,
    ),
  );
  if (p.learning) root.append(el("p", `Learning: ${p.learning.n} eligible settled training games · observer weights ${Object.entries(p.learning.weights).map(([id,w])=>`${id} ${(w*100).toFixed(1)}%`).join(", ")} · trained through ${p.learning.trainedThrough ?? "no settled games yet"}.`));
  const grid = el("div", "");
  grid.className = "observer-grid";
  for (const m of p.models) {
    const card = el("article", "");
    card.className = "card";
    const names = {
      "baseline-margin": "Season baseline",
      "unit-efficiency": "Offense & defense",
      "recent-trajectory": "Recent trajectory",
    };
    const explanations = {
      "baseline-margin":
        "Compares scoring margins from all eligible prior games. Higher margin means a stronger scoring baseline.",
      "unit-efficiency":
        "Compares offensive EPA per passing attempt or carry minus opponent EPA per attempt or carry. EPA measures expected points added; higher net efficiency is favorable. Only games with both teams’ weekly statistics are included.",
      "recent-trajectory":
        "Compares scoring margins from the last three eligible games. Compare these averages with the season baseline to see improvement or drift.",
    };
    card.append(
      el("h3", names[m.id] ?? m.id),
      el(
        "p",
        m.p === null
          ? m.reason
          : `${g.home_team} ${Math.round(m.p * 100)}% · n=${m.n} · baseline ${m.home.toFixed(2)} vs ${m.away.toFixed(2)}`,
      ),
    );
    const explanation = el("details", "");
    explanation.append(
      el("summary", "How this observer works"),
      el("p", explanations[m.id] ?? "See this lens’s model documentation."),
      el(
        "p",
        `Model ${m.id} · version ${m.version ?? p.version}. Probabilities come from pairwise comparisons with symmetric smoothing; observations are correlated, not independent votes.`,
      ),
    );
    card.append(explanation);
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
        `Reality: ${g.away_team} ${g.away_score} – ${g.home_team} ${g.home_score}. ${record?.recording === "automatic" ? "Shown prediction is the frozen pregame forecast." : "Retrospective exploration, not a recorded pregame prediction."}`,
      ),
    );
  const teamsSection = el("section", "");
  teamsSection.append(el("h3", "Explore the teams and evidence"));
  for (const [side, team] of [
    ["away", g.away_team],
    ["home", g.home_team],
  ]) {
    const b = el("button", `Explore ${team} season`);
    b.className = "text-button";
    b.type = "button";
    b.onclick = () => onTeam?.(team);
    teamsSection.append(b);
    const evidence = el("details", "");
    evidence.className = "data-details";
    const ids = p.evidence?.[side + "Games"] ?? [];
    evidence.append(
      el(
        "summary",
        `${team}: ${ids.length} prior games supporting this observation`,
      ),
    );
    const wrap = el("div", "");
    wrap.className = "table-wrap";
    const table = el("table", "");
    table.className = "evidence-table";
    const caption = el(
      "caption",
      `${team} eligible prior results, before the observation cutoff`,
    );
    table.append(caption);
    const head = el("thead", ""),
      headRow = el("tr", "");
    for (const name of ["Game", "Points for / against", "Weekly data"]) {
      const th = el("th", name);
      th.scope = "col";
      headRow.append(th);
    }
    head.append(headRow);
    table.append(head);
    const body = el("tbody", "");
    for (const id of ids) {
      const prior = bank.games.find((x) => x.game_id === id);
      if (!prior) continue;
      const tr = el("tr", "");
      const matchup = el("td", "");
      const link = el(
        "button",
        `W${prior.week}: ${prior.away_team} at ${prior.home_team}`,
      );
      link.className = "text-button";
      link.type = "button";
      link.onclick = () => onGame?.(id);
      matchup.append(link);
      const home = prior.home_team === team;
      const scores = el(
        "td",
        `${home ? prior.home_score : prior.away_score} / ${home ? prior.away_score : prior.home_score}`,
      );
      const raw = el("td", "");
      const stats = bank.stats?.weekly?.find(
        (w) => w.game_id === id && w.team === team && w.season === g.season,
      );
      if (stats) {
        const details = el("details", "");
        details.append(
          el("summary", `${team} weekly source statistics`),
          el("pre", JSON.stringify(stats, null, 2)),
        );
        raw.append(details);
      } else raw.textContent = "Weekly statistics unavailable";
      tr.append(matchup, scores, raw);
      body.append(tr);
    }
    table.append(body);
    wrap.append(table);
    evidence.append(wrap);
    if (!ids.length)
      evidence.append(
        el("p", "No eligible prior games; no values are invented."),
      );
    teamsSection.append(evidence);
  }
  root.append(teamsSection);
  const source = el("details", "");
  source.className = "data-details";
  source.append(
    el("summary", "Inspect source data and validation metadata"),
    el(
      "p",
      "Schedule fields below describe the selected matchup; final outcomes are descriptive only and are never used to predict that same game.",
    ),
    el("pre", JSON.stringify({ game: g, manifest: bank.manifest }, null, 2)),
  );
  root.append(source);
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
