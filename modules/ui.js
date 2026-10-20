import { renderPerformance } from "./performance.js";
import { loadBank, CODES, kickoff, canonical } from "./data.js";
import { adaptivePrecog as precog } from "./learning.js";
import { loadSharedJournal, frozenRecords } from "./forecast-journal.js";
import { renderJournalStatus, renderLearning, renderForecastHistory } from "./journal-ui.js";
let sharedJournal = { events: [] }, journalError = null;
try { sharedJournal = await loadSharedJournal(); } catch(e) { journalError = e.message; }
import { Registry } from "./registry.js";
import { renderPrediction } from "./skin.js";
import { recordPrediction, evaluate, STORAGE } from "./tracking.js";
import { filterGames, renderSchedule } from "./schedule.js";
const $ = (id) => document.getElementById(id),
  registry = new Registry();
registry.addLens(precog);
registry.addSkin("plain", renderPrediction);
// Explicit extension entry point: imported modules can register lenses and skins before refresh.
export { registry };
export function addLens(extension, skinId = "plain") {
  registry.addLens({ ...extension, skin: skinId });
  const b = document.createElement("button");
  b.className = "btn";
  b.dataset.lens = extension.id;
  b.setAttribute("aria-pressed", "false");
  b.textContent = extension.label ?? extension.id;
  b.onclick = () => show(extension.id);
  document.querySelector("nav").append(b);
}
let bank,
  prediction,
  game,
  cutoff,
  lens = "precog",
  authenticated = false,
  viewCutoff,
  predictions = new Map();
function journal() {
  const records = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
  if (!Array.isArray(records)) throw Error("Invalid prediction journal");
  return records;
}
function status(text) {
  $("status").textContent = text;
}
function unlock() {
  authenticated = true;
  $("gate").hidden = true;
  $("appShell").inert = false;
  if (lens === "legacy") ensureLegacy();
  document.querySelector(`[data-lens="${lens}"]`)?.focus();
}
try {
  if (sessionStorage.getItem("oracle_lens_ok") === "1") unlock();
} catch {
  /* Session storage may be disabled; one in-memory login still works. */
}
$("login").onsubmit = (e) => {
  e.preventDefault();
  if ($("pw").value === "oraclefootball") {
    try {
      sessionStorage.setItem("oracle_lens_ok", "1");
    } catch {
      /* Do not prevent access when storage is unavailable. */
    }
    $("pw").value = "";
    unlock();
  } else {
    $("gateErr").hidden = false;
    $("pw").setAttribute("aria-invalid", "true");
    $("pw").focus();
  }
};
$("gate").addEventListener("keydown", (e) => {
  if (e.key !== "Tab") return;
  const first = $("pw"),
    last = $("login").querySelector("button");
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
for (const code of CODES) {
  const option = document.createElement("option");
  option.value = code;
  option.textContent = code;
  $("team").append(option);
}
$("team").value = "ATL";
function show(id) {
  lens = id;
  $("legacy").hidden = id !== "legacy";
  $("current").hidden = id === "legacy" || id === "community";
  $("community").hidden = id !== "community";
  document.querySelectorAll("[data-lens]").forEach((b) => {
    b.classList.toggle("primary", b.dataset.lens === id);
    b.setAttribute("aria-pressed", String(b.dataset.lens === id));
  });
  if (id === "legacy") {
    ensureLegacy();
    sendTeam();
  } else {
    buildPredictions();
    renderTable();
    render();
  }
  document.querySelector(".skip-link").textContent =
    id === "legacy"
      ? "Skip to Legacy Lens"
      : id === "community"
        ? "Skip to community lenses"
        : "Skip to schedule";
  document.querySelector(".skip-link").href =
    id === "legacy"
      ? "#legacy"
      : id === "community"
        ? "#community"
        : "#current";
}
for (const button of document.querySelectorAll("[data-lens]"))
  button.onclick = () => show(button.dataset.lens);
function sendTeam() {
  const team = { WSH: "WAS" }[$("team").value] ?? $("team").value;
  $("legacy").contentWindow.postMessage(
    { type: "team", team },
    location.origin,
  );
}
function ensureLegacy() {
  if (authenticated && !$("legacy").getAttribute("src"))
    $("legacy").src = "legacy.html";
}
$("legacy").onload = sendTeam;
function buildPredictions() {
  if (!bank || !registry.lenses.has(lens)) return;
  viewCutoff = new Date().toISOString();
  predictions = new Map(
    bank.games.map((g) => [
      g.game_id,
      registry.lenses.get(lens).predict({ bank, game: g, cutoff: viewCutoff, journal: sharedJournal.events }),
    ]),
  );
}
function recordsOrEmpty() {
  try {
    return [...frozenRecords(sharedJournal.events), ...journal()];
  } catch (e) {
    status(`${e.message}. Prediction recording is unavailable.`);
    return frozenRecords(sharedJournal.events);
  }
}
function renderTable() {
  if (!bank || !registry.lenses.has(lens)) return;
  const games = filterGames(bank.games, {
    week: $("weekFilter").value,
    state: $("stateFilter").value,
    team: $("teamOnly").checked ? $("team").value : null,
  });
  renderJournalStatus($("recorderStatus"), sharedJournal, journalError);
  renderLearning($("learningReview"), sharedJournal.events, lens, registry.lenses.get(lens).version);
  renderPerformance($("performance"), { games: bank.games, predictions, records: recordsOrEmpty(), lens, version: registry.lenses.get(lens).version, label: registry.lenses.get(lens).label ?? lens, earlyRecords: frozenRecords(sharedJournal.events, {early:true}), onTeam: openTeam });
  renderSchedule($("schedule").querySelector("tbody"), {
    games,
    predictions,
    records: recordsOrEmpty(),
    lens,
    version: registry.lenses.get(lens).version,
    cutoff: viewCutoff,
    onGame: openGame,
    onTeam: openTeam,
  });
  $("scheduleCount").textContent =
    `${games.length} of ${bank.games.length} matchups · projections as of ${new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(viewCutoff))}`;
}
function focusDetail() {
  $("detailTitle").focus();
  $("matchupDetail").scrollIntoView({ block: "start", behavior: "auto" });
}
function openGame(id) {
  const selected = bank?.games.find((g) => g.game_id === id);
  if (!selected) return;
  if (![selected.home_team, selected.away_team].includes($("team").value)) {
    $("team").value = selected.home_team;
    navigate();
  }
  $("matchup").value = id;
  render();
  history.replaceState(null, "", `#game=${encodeURIComponent(id)}`);
  focusDetail();
}
function openTeam(team) {
  $("team").value = team;
  $("teamOnly").checked = true;
  $("weekFilter").value = "all";
  $("stateFilter").value = "all";
  navigate();
  renderTable();
  $("scheduleTitle").textContent = `${team} · 2026 season schedule`;
  $("scheduleTitle").tabIndex = -1;
  $("scheduleTitle").focus();
  $("scheduleTitle").scrollIntoView({ block: "start" });
}
for (const id of ["weekFilter", "stateFilter", "teamOnly"])
  $(id).onchange = () => {
    renderTable();
    $("scheduleTitle").textContent = $("teamOnly").checked
      ? `${$("team").value} · 2026 season schedule`
      : "2026 season schedule";
  };
$("resetFilters").onclick = () => {
  $("weekFilter").value = "all";
  $("stateFilter").value = "all";
  $("teamOnly").checked = false;
  $("scheduleTitle").textContent = "2026 season schedule";
  renderTable();
};
$("backSchedule").onclick = () => {
  $("scheduleTitle").tabIndex = -1;
  $("scheduleTitle").focus();
  $("scheduleTitle").scrollIntoView({ block: "start" });
};
function navigate() {
  sendTeam();
  if (!bank) return;
  const team = $("team").value;
  const games = bank.games.filter((g) =>
    [g.home_team, g.away_team].includes(team),
  );
  $("matchup").replaceChildren();
  for (const g of games) {
    const o = document.createElement("option");
    o.value = g.game_id;
    o.textContent = `W${g.week} · ${g.away_team} at ${g.home_team} · ${g.gameday} · ${g.status}`;
    $("matchup").append(o);
  }
  const next = games.find(
    (g) =>
      g.status !== "final" && kickoff(g) && Date.parse(kickoff(g)) > Date.now(),
  );
  if (next) $("matchup").value = next.game_id;
  $("scheduleTitle").textContent = $("teamOnly").checked
    ? `${team} · 2026 season schedule`
    : "2026 season schedule";
  renderTable();
  render();
}
function render() {
  if (!bank || lens === "community" || lens === "legacy") return;
  game = bank.games.find((g) => g.game_id === $("matchup").value);
  if (!game) return;
  cutoff = viewCutoff;
  prediction = predictions.get(game.game_id);
  const frozen = frozenRecords(sharedJournal.events).find(r=>r.game===game.game_id && r.lens===lens && r.version===prediction.version);
  if (frozen?.predictionSnapshot) { prediction = frozen.predictionSnapshot; cutoff = frozen.createdAt; }

  registry.skins.get(registry.lenses.get(lens).skin ?? "plain")(
    $("prediction"),
    {
      prediction,
      game,
      bank,
      cutoff,
      onGame: openGame,
      onTeam: openTeam,
      record: recordsOrEmpty().find(
        (r) =>
          r.game === game.game_id &&
          r.lens === lens &&
          r.version === prediction.version,
      ),
    },
  );
  renderForecastHistory($("prediction"), sharedJournal.events, game, lens, prediction.version);
  $("save").disabled =
    prediction.p === null ||
    game.status === "final" ||
    !kickoff(game) ||
    Date.parse(kickoff(game)) <= Date.now();
  try {
    $("evaluation").textContent = JSON.stringify(
      evaluate(journal(), bank.games),
      null,
      2,
    );
  } catch (e) {
    status(e.message);
  }
}
$("team").onchange = navigate;
$("matchup").onchange = () => {
  render();
  focusDetail();
};
$("save").onclick = () => {
  try {
    cutoff = new Date().toISOString();
    prediction = registry.lenses.get(lens).predict({ bank, game, cutoff, journal: sharedJournal.events });
    const existing = journal();
    const records = recordPrediction(existing, prediction, game, bank, cutoff);
    localStorage.setItem(STORAGE, JSON.stringify(records));
    status(
      records.length === existing.length
        ? "Existing immutable prediction retained."
        : "Pregame prediction recorded locally.",
    );
    renderTable();
    render();
  } catch (e) {
    status(`Prediction not saved: ${e.message}`);
  }
};
$("export").onclick = () => {
  try {
    const blob = new Blob(
      [JSON.stringify({ schema: 2, personalRecords: journal(), sharedJournal }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "oracle-predictions.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    status(e.message);
  }
};
try {
  bank = await loadBank();
  status(
    `2026 DataBank loaded · ${bank.games.length} games · ${bank.manifest.statistics_status} statistics · ${bank.source.includes("raw.githubusercontent") ? "GitHub committed-output fallback" : "published Pages"}`,
  );
  for (const week of [...new Set(bank.games.map((g) => g.week))].sort(
    (a, b) => a - b,
  )) {
    const o = document.createElement("option");
    o.value = String(week);
    o.textContent = `Week ${week}`;
    $("weekFilter").append(o);
  }
  for (const option of $("team").options) {
    const t = bank.teams.find((t) => t.team === option.value);
    if (t) option.textContent = `${t.team} · ${t.name}`;
  }
  buildPredictions();
  navigate();
  if (location.hash.startsWith("#game="))
    openGame(decodeURIComponent(location.hash.slice(6)));
} catch (e) {
  status(
    `2026 DataBank unavailable (${e.message}). Legacy remains available with bundled 2025 data. Retry after connectivity is restored.`,
  );
  $("save").disabled = true;
  $("scheduleCount").textContent =
    "Schedule unavailable. Refresh data to retry, or switch to Legacy for bundled 2025 data.";
}

if (new URLSearchParams(location.search).get("lens") === "legacy")
  show("legacy");
window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#game="))
    openGame(decodeURIComponent(location.hash.slice(6)));
});

window.addEventListener("message", (e) => {
  if (
    e.origin !== location.origin ||
    e.source !== $("legacy").contentWindow ||
    e.data?.type !== "legacy-team"
  )
    return;
  const team = canonical(e.data.team);
  if (team && team !== $("team").value) {
    $("team").value = team;
    navigate();
  }
});

$("refreshData").onclick = () => location.reload();

$("nextGames").onclick = () => {
  if (!bank) return;
  $("resetFilters").click();
  const next = filterGames(bank.games).find(
    (g) =>
      g.status !== "final" && kickoff(g) && Date.parse(kickoff(g)) > Date.now(),
  );
  if (!next) {
    status("No confirmed future kickoffs are available in this snapshot.");
    return;
  }
  const row = [...$("schedule").querySelectorAll("tr[data-game]")].find(
    (r) => r.dataset.game === next.game_id,
  );
  const link = row?.querySelector("td:nth-child(3) button");
  link?.focus();
  row?.scrollIntoView({ block: "start" });
};

// Refresh shared history and live evidence while the page is open. Background collection runs in Actions.
let refreshing = false;
setInterval(async () => {
  if (refreshing) return;
  refreshing = true;
  try {
    const [newBank, newJournal] = await Promise.all([loadBank(), loadSharedJournal()]);
    bank = newBank; sharedJournal = newJournal; journalError = null;
    buildPredictions(); renderTable(); render();
  } catch (e) { journalError = e.message; renderJournalStatus($("recorderStatus"), sharedJournal, journalError); }
  finally { refreshing = false; }
}, 300000);
