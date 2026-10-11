import { loadBank, CODES, kickoff } from "./data.js";
import { precog } from "./precog.js";
import { Registry } from "./registry.js";
import { renderPrediction } from "./skin.js";
import { recordPrediction, evaluate, STORAGE } from "./tracking.js";
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
  b.textContent = extension.label ?? extension.id;
  b.onclick = () => show(extension.id);
  document.querySelector("nav").append(b);
}
let bank,
  prediction,
  game,
  cutoff,
  lens = "precog";
function journal() {
  const records = JSON.parse(localStorage.getItem(STORAGE) ?? "[]");
  if (!Array.isArray(records)) throw Error("Invalid prediction journal");
  return records;
}
function status(text) {
  $("status").textContent = text;
}
if (sessionStorage.getItem("oracle_lens_ok") === "1") $("gate").hidden = true;
$("login").onsubmit = (e) => {
  e.preventDefault();
  if ($("pw").value === "oraclefootball") {
    sessionStorage.setItem("oracle_lens_ok", "1");
    $("gate").hidden = true;
    $("legacy").contentWindow.postMessage({ type: "unlock" }, location.origin);
  } else $("gateErr").hidden = false;
};
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
  document
    .querySelectorAll("[data-lens]")
    .forEach((b) => b.classList.toggle("primary", b.dataset.lens === id));
  if (id === "legacy") sendTeam();
  else render();
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
$("legacy").onload = () => {
  sendTeam();
  if (sessionStorage.getItem("oracle_lens_ok") === "1")
    $("legacy").contentWindow.postMessage({ type: "unlock" }, location.origin);
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
  render();
}
function render() {
  if (!bank || lens === "community" || lens === "legacy") return;
  game = bank.games.find((g) => g.game_id === $("matchup").value);
  if (!game) return;
  cutoff = new Date().toISOString();
  prediction = registry.lenses.get(lens).predict({ bank, game, cutoff });
  registry.skins.get(registry.lenses.get(lens).skin ?? "plain")(
    $("prediction"),
    { prediction, game, bank },
  );
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
$("matchup").onchange = render;
$("save").onclick = () => {
  try {
    render();
    const existing = journal();
    const records = recordPrediction(existing, prediction, game, bank, cutoff);
    localStorage.setItem(STORAGE, JSON.stringify(records));
    status(
      records.length === existing.length
        ? "Existing immutable prediction retained."
        : "Pregame prediction recorded locally.",
    );
    render();
  } catch (e) {
    status(`Prediction not saved: ${e.message}`);
  }
};
$("export").onclick = () => {
  try {
    const blob = new Blob(
      [JSON.stringify({ schema: 1, records: journal() }, null, 2)],
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
  navigate();
} catch (e) {
  status(
    `2026 DataBank unavailable (${e.message}). Legacy remains available with bundled 2025 data. Retry after connectivity is restored.`,
  );
  $("save").disabled = true;
}
