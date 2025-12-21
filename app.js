/***** CONFIG *****/
// Fast-gate password (deterrent). Change this.
const LENS_PASSWORD = "OMA";

// Data location (per-team JSON files)
function dataUrl(team, season) {
  const url = `data/${team.toLowerCase()}.json`;
  console.log("OracleLens fetch:", url);
  return url;
}




// Teams list for dropdown
const TEAMS = [
  "PHI","GB","DAL","KC","SF","BUF","BAL","NYG","NYJ","MIA","DET","MIN","LAR","LAC",
  "DEN","TB","WAS","CHI","SEA","ARI","CLE","CIN","PIT","TEN","IND","JAX","ATL","CAR","NO","HOU"
];

// Season
const SEASON = 2025;

/***** STATE *****/
let DATA = null;
let currentTeam = "ARI"; // default; change if you want
let currentGameKey = null;

/***** HELPERS *****/
function safe(x){
  return (x === null || x === undefined || x === "") ? "—" : String(x);
}

function pct(x){
  if (x === null || x === undefined || isNaN(x)) return "—";
  // allow either 0-1 or 0-100
  const v = (x <= 1) ? Math.round(x * 100) : Math.round(x);
  return `${v}%`;
}

function confBars(conf){
  if (conf === null || conf === undefined || isNaN(conf)) return "—";
  const v = Number(conf);
  const n = Math.max(0, Math.min(5, Math.round(v / 20)));
  return "▮".repeat(n) + "▯".repeat(5 - n);
}

function tagClass(x){
  if (x === "MATCH") return "tag-good";
  if (x === "DIVERGE") return "tag-bad";
  if (x === "TBD") return "tag-warn";
  return "";
}

function outcomeLabel(r){
  if (r === "W") return "Win";
  if (r === "L") return "Loss";
  if (r === "T") return "Tie";
  if (r === "TBD") return "TBD";
  if (r === null || r === undefined) return "Upcoming";
  return safe(r);
}

// JSON-schema helpers (your repo format)
function getN(g){
  const n = g?.oracle?.pregame_historical_map?.n;
  return (n === null || n === undefined) ? 0 : Number(n);
}

function getExp(g){
  const v = g?.oracle?.pregame_expected_win_rate;
  return (v === null || v === undefined) ? null : Number(v);
}

function getConf(g){
  const v = g?.oracle?.pregame_confidence;
  return (v === null || v === undefined) ? null : Number(v);
}

function evidenceString(g){
  const n = getN(g);
  const exp = getExp(g);

  // Withheld / insufficient history:
  if (!n || exp === null) return `n=0 : D`;

  // Simple ELI5 label: C=leans Win, D=leans Loss
  const cd = (exp >= 0.5) ? "C" : "D";
  return `n=${n} : ${cd}`;
}

function coherenceLock(g){
  const lock = g?.oracle?.reality_lock;
  if (lock === "MATCH" || lock === "DIVERGE") return lock;
  return "—";
}

// Key based on your schema (week + opponent)
function gameKey(g){
  const wk = safe(g.week);
  const opp = safe(g.opponent);
  return `${wk}_${opp}`;
}

/***** PASSWORD GATE *****/
function gateInit(){
  const gate = document.getElementById("gate");
  const pw = document.getElementById("pw");
  const btn = document.getElementById("enter");
  const err = document.getElementById("gateErr");

  const ok = sessionStorage.getItem("oracle_lens_ok") === "1";
  if (ok) gate.style.display = "none";

  function attempt(){
    if (pw.value === LENS_PASSWORD){
      sessionStorage.setItem("oracle_lens_ok","1");
      gate.style.display = "none";
    } else {
      err.hidden = false;
    }
  }

  btn.addEventListener("click", attempt);
  pw.addEventListener("keydown", (e)=>{ if (e.key === "Enter") attempt(); });
}

/***** UI INIT *****/
function uiInit(){
  const teamSel = document.getElementById("teamSel");
  const gameSel = document.getElementById("gameSel");
  const refresh = document.getElementById("refresh");

  // teams
  teamSel.innerHTML = TEAMS.map(t => `<option value="${t}">${t}</option>`).join("");
  teamSel.value = currentTeam;

  teamSel.addEventListener("change", async ()=>{
    currentTeam = teamSel.value;
    await loadTeam();
  });

  refresh.addEventListener("click", async ()=>{
    await loadTeam(true);
  });

  gameSel.addEventListener("change", ()=>{
    currentGameKey = gameSel.value;
    renderLens();
  });
}

/***** LOAD DATA *****/
async function loadTeam(forceBust=false){
  const loadedTag = document.getElementById("loadedTag");

  let url = dataUrl(currentTeam, SEASON);
  if (forceBust) url += `?t=${Date.now()}`;

  try{
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();

    const team = DATA?.summary?.team ?? currentTeam;
    const season = DATA?.summary?.season ?? SEASON;
    loadedTag.textContent = `Loaded: ${team} ${season}`;
  } catch(e){
    console.error(e);
    DATA = null;
    loadedTag.textContent = `Loaded: —`;
    alert(`Could not load data for ${currentTeam}. Expected: ${url}\n\nTip: Put JSON at ${url} or change dataUrl() in app.js`);
    renderAll();
    return;
  }

  // pick default game
  if (DATA?.games?.length){
    currentGameKey = gameKey(DATA.games[0]);
  } else {
    currentGameKey = null;
  }

  renderAll();
}

function renderAll(){
  renderGameSelect();
  renderSeasonTable();
  renderLens();
  renderSummaryCounts();
}

/***** RENDER DROPDOWNS *****/
function renderGameSelect(){
  const gameSel = document.getElementById("gameSel");
  if (!DATA?.games?.length){
    gameSel.innerHTML = `<option value="">—</option>`;
    return;
  }

  gameSel.innerHTML = DATA.games.map(g=>{
    const wk = safe(g.week);
    const opp = safe(g.opponent);
    const r = safe(g.result);
    const lbl = `Week ${wk} vs ${opp} — ${r === "—" ? "Upcoming" : r}`;
    const key = gameKey(g);
    return `<option value="${key}">${lbl}</option>`;
  }).join("");

  gameSel.value = currentGameKey ?? gameKey(DATA.games[0]);
}

/***** RENDER TABLE *****/
function renderSeasonTable(){
  const tbody = document.querySelector("#tbl tbody");
  tbody.innerHTML = "";

  if (!DATA?.games?.length) return;

  for (const g of DATA.games){
    const tr = document.createElement("tr");
    tr.dataset.key = gameKey(g);

    const row = [
      safe(g.week),
      safe(g.opponent),
      safe(g.result),
      safe(g.score),
      safe(g?.oracle?.pregame_pick),
      pct(getExp(g)),
      safe(getConf(g) === null ? "—" : Math.round(getConf(g))),
      evidenceString(g),
      coherenceLock(g),
      (() => {
        const n = getN(g);
        return n ? `SNAP n=${n}` : "—";
      })()
    ];

    row.forEach((cell, idx)=>{
      const td = document.createElement("td");
      td.textContent = cell;

      // style coherence col
      if (idx === 8){
        td.className = tagClass(cell);
      }
      tr.appendChild(td);
    });

    tr.addEventListener("click", ()=>{
      currentGameKey = gameKey(g);
      document.getElementById("gameSel").value = currentGameKey;
      renderLens();
    });

    tbody.appendChild(tr);
  }
}

/***** LENS RENDER *****/
function renderLens(){
  const evidenceEl = document.getElementById("evidence");
  const expEl = document.getElementById("exp");
  const confEl = document.getElementById("conf");
  const confBarsEl = document.getElementById("confBars");
  const realityEl = document.getElementById("reality");
  const cohEl = document.getElementById("coherence");
  const cohSubEl = document.getElementById("coherenceSub");
  const snapEl = document.getElementById("snapshot");

  if (!DATA?.games?.length || !currentGameKey){
    evidenceEl.textContent = "—";
    expEl.textContent = "—";
    confEl.textContent = "—";
    confBarsEl.textContent = "—";
    realityEl.textContent = "—";
    cohEl.textContent = "—";
    cohSubEl.textContent = "—";
    snapEl.textContent = "—";
    return;
  }

  const g = DATA.games.find(x => gameKey(x) === currentGameKey) || DATA.games[0];

  const evidence = evidenceString(g);
  const exp = pct(getExp(g));
  const confNum = getConf(g);
  const conf = (confNum === null ? "—" : String(Math.round(confNum)));
  const result = safe(g.result);
  const lock = coherenceLock(g);
  const postCoh = g?.oracle?.coherence;
  const n = getN(g);

  const snapshot = n ? `SNAP n=${n} (league-wide similar)` : "—";

  evidenceEl.textContent = evidence;
  expEl.textContent = exp;
  confEl.textContent = conf;
  confBarsEl.textContent = confBars(confNum);

  realityEl.textContent = outcomeLabel(result);

  cohEl.textContent = lock;
  cohEl.className = `v big ${tagClass(lock)}`;

  if (lock === "MATCH"){
    cohSubEl.textContent = `Story held. Postgame coherence: ${safe(postCoh)}`;
  } else if (lock === "DIVERGE"){
    cohSubEl.textContent = `Story broke. Postgame coherence: ${safe(postCoh)}`;
  } else {
    cohSubEl.textContent = `No reality lock (insufficient similar-history). Postgame coherence: ${safe(postCoh)}`;
  }

  snapEl.textContent = snapshot;
}

/***** SUMMARY COUNTS *****/
function renderSummaryCounts(){
  const scoreTag = document.getElementById("scoreTag");
  if (!DATA?.games?.length){
    scoreTag.textContent = "Matches: — | Diverges: —";
    return;
  }

  let m = 0, d = 0;
  for (const g of DATA.games){
    const c = g?.oracle?.reality_lock;
    if (c === "MATCH") m++;
    if (c === "DIVERGE") d++;
  }
  scoreTag.textContent = `Matches: ${m} | Diverges: ${d}`;
}

/***** BOOT *****/
(async function boot(){
  gateInit();
  uiInit();
  await loadTeam();
})();
