import { evaluate, summary } from "./tracking.js";

const callable = (p) => Number.isFinite(p) && p >= 0 && p <= 1 && p !== 0.5;
const final = (g) => g.status === "final" && Number.isFinite(g.home_score) && Number.isFinite(g.away_score);
export function performance({ games, predictions, records, lens, version, mode = "recorded" }) {
  const saved = records.filter((r) => r.lens === lens && r.version === version && games.some((g) => g.game_id === r.game));
  const rows = [], calls = [];
  for (const g of games) {
    const p = predictions.get(g.game_id);
    const r = saved.find((r) => r.game === g.game_id);
    if (mode === "recorded" && (!r || !callable(r.probabilityHome))) continue;
    if (mode !== "recorded" && (!p?.winner || !callable(p.p))) continue;
    const probabilityHome = mode === "recorded" ? r.probabilityHome : p.p;
    calls.push(g);
    if (!final(g) || g.home_score === g.away_score) continue;
    if (mode === "recorded" && !evaluate([r], [g]).overall.n) continue;
    rows.push({ game: g.game_id, home: g.home_team, away: g.away_team,
      actual: g.home_score > g.away_score ? 1 : 0, probabilityHome,
      models: (mode === "recorded" ? r.models : p.models) ?? [],
      motifs: (mode === "recorded" ? r.motifs : p.motifs) ?? [] });
  }
  const group = (names, pick) => names.map((name) => ({ name, ...summary(pick(name)) }));
  const teams = [...new Set(games.flatMap((g) => [g.home_team, g.away_team]))].sort();
  const models = [...new Set(rows.flatMap((r) => r.models.map((m) => m.id)))];
  const motifs = [...new Set(rows.flatMap((r) => r.motifs))];
  return { ...summary(rows), calls: calls.length,
    pending: calls.filter((g) => !final(g)).length,
    ties: calls.filter((g) => final(g) && g.home_score === g.away_score).length,
    unscored: calls.filter((g) => g.status === "final" && !rows.some((r) => r.game === g.game_id) && !(final(g) && g.home_score === g.away_score)).length,
    teams: group(teams, (t) => rows.filter((r) => [r.home, r.away].includes(t))),
    models: group(models, (id) => rows.flatMap((r) => {
      const m = r.models.find((m) => m.id === id);
      return callable(m?.p) ? [{ ...r, probabilityHome: m.p }] : [];
    })),
    motifs: group(motifs, (m) => rows.filter((r) => r.motifs.includes(m))) };
}
const el = (tag, text) => { const n = document.createElement(tag); n.textContent = text; return n; };
const pct = (x) => `${Math.round(x * 100)}%`;
export function renderPerformance(root, options) {
  const mode = root.dataset.mode ?? "recorded";
  const report = performance({ ...options, mode });
  root.replaceChildren();
  root.className = "performance-panel";
  root.append(el("h2", `${options.label} · season performance`));
  const label = el("label", "Scorecard ");
  const select = document.createElement("select");
  select.setAttribute("aria-label", `${options.label} performance scorecard`);
  for (const [value, text] of [["recorded", "Recorded pregame calls"], ["historical", "Historical previews / current projections"]]) {
    const o = el("option", text); o.value = value; select.append(o);
  }
  select.value = mode;
  select.onchange = () => { root.dataset.mode = select.value; renderPerformance(root, options); };
  label.append(select); root.append(label);
  root.append(el("p", mode === "recorded"
    ? "Original calls saved before kickoff in this browser, for this lens and model version. Browsing projections does not record them. Export the journal to keep a backup."
    : "Retrospective exploration using today’s source snapshot, plus current future projections. These were not saved before kickoff and do not establish live prediction accuracy."));
  const cards = el("div", ""); cards.className = "performance-cards";
  for (const [title, value] of [[mode === "recorded" ? "Recorded this season" : "Current calls", report.calls], ["Correct / scored", `${report.correct ?? 0} / ${report.n}`], ["Accuracy", report.n ? pct(report.accuracy) : "No scored calls"], ["Incorrect", report.incorrect ?? 0], ["Awaiting final", report.pending]]) {
    const card = el("div", ""); card.append(el("strong", String(value)), el("span", title)); cards.append(card);
  }
  root.append(cards, el("p", `Whole season · ${report.ties} ties excluded · ${report.unscored} final calls unscored. No-call games are excluded. ${report.n ? `95% accuracy interval ${pct(report.accuracy95[0])}–${pct(report.accuracy95[1])}. Brier score ${report.brier.toFixed(3)} (lower is better; 0.250 is a constant 50% forecast).` : "No settled evidence yet; historical previews are available in the scorecard selector."}`));
  const ranked = report.teams.filter((t) => t.n >= 5).sort((a, b) => b.accuracy - a.accuracy || b.n - a.n || a.name.localeCompare(b.name));
  root.append(el("p", ranked.length > 1
    ? `Highest observed accuracy (5+ scored): ${ranked[0].name} ${ranked[0].correct}/${ranked[0].n}. Lowest: ${ranked.at(-1).name} ${ranked.at(-1).correct}/${ranked.at(-1).n}. Small samples can change quickly; this measures matchup prediction accuracy, not team volatility.`
    : "Team rankings need at least five scored calls per team. A perfect small sample is not proof a team is locked in."));
  function table(title, rows, teamLinks = false) {
    const details = el("details", ""); details.append(el("summary", title));
    const wrap = el("div", ""); wrap.className = "table-scroll"; wrap.tabIndex = 0;
    wrap.setAttribute("role", "region"); wrap.setAttribute("aria-label", title);
    const t = el("table", ""); const head = el("thead", ""); const tr = el("tr", "");
    for (const h of ["Group", "Correct / scored", "Accuracy", "95% interval", "Brier"]) { const th = el("th", h); th.scope = "col"; tr.append(th); }
    head.append(tr); t.append(head); const body = el("tbody", "");
    for (const r of rows) {
      const row = el("tr", ""); const name = el("th", r.name); name.scope = "row";
      if (teamLinks && options.onTeam) { name.replaceChildren(); const b = el("button", r.name); b.type = "button"; b.className = "text-button"; b.onclick = () => options.onTeam(r.name); name.append(b); }
      row.append(name);
      for (const value of [`${r.correct ?? 0} / ${r.n}`, r.n ? pct(r.accuracy) : "—", r.n ? `${pct(r.accuracy95[0])}–${pct(r.accuracy95[1])}` : "—", r.n ? r.brier.toFixed(3) : "—"]) row.append(el("td", value));
      body.append(row);
    }
    t.append(body); wrap.append(t); details.append(wrap); root.append(details);
  }
  table("Team accuracy · each matchup counts for both teams", report.teams, true);
  table("Observer and pattern review", [...report.models, ...report.motifs]);
  root.append(el("p", "Learning review: compare observer errors and probability scores on the same recorded games before changing weights. Pattern groups overlap and are descriptive. Weather, injuries and spreads have no timestamped modeled probabilities here. Weights are not changed automatically; test any proposed change on a later, untouched set of games and version the model."));
}
