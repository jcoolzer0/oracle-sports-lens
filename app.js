/***** CONFIG *****/
// Fast-gate password (deterrent). Change this.
const LENS_PASSWORD = "OMA";

// Where your data lives.
// If your current site is like: https://jcoolzer0.github.io/packers-oracle-v0/
// and it loads JSON internally, point to that same JSON URL pattern here.
//
// You have 2 easy options:
//
// Option A (recommended): host per-team JSON files like:
//   data/PHI_2025.json
//
// Option B: call an existing endpoint you already have.
//
// For now we’ll assume Option A:
function dataUrl(team, season) {
  return `data/${team}_${season}.json`;
}

// Teams list for dropdown (edit as needed)
const TEAMS = ["PHI","GB","DAL","KC","SF","BUF","BAL","NYG","NYJ","MIA","DET","MIN","LAR","LAC","DEN","TB","WAS","CHI","SEA","ARI","CLE","CIN","PIT","TEN","IND","JAX","ATL","CAR","NO","HOU"];

// Season (edit)
const SEASON = 2025;

/***** STATE *****/
let DATA = null;
let currentTeam = "PHI";
let currentGameKey = null;

/***** HELPERS *****/
function safe(x){ return (x===null || x===undefined || x==="") ? "—" : String(x); }

function pct(x){
  if (x===null || x===undefined || isNaN(x)) return "—";
  // allow either 0-1 or 0-100
  const v = (x <= 1) ? Math.round(x*100) : Math.round(x);
  return `${v}%`;
}

function confBars(conf){
  if (conf===null || conf===undefined || isNaN(conf)) return "—";
  const v = Number(conf);
  const n = Math.max(0, Math.min(5, Math.round(v/20)));
  return "▮".repeat(n) + "▯".repeat(5-n);
}

function tagClass(x){
  if (x === "MATCH") return "tag-good";
  if (x === "DIVERGE") return "tag-bad";
  if (x === "SNAP" || x === "TBD") return "tag-warn";
  return "";
}

// A robust game key
function gameKey(g){
  // prefer a stable id if you have one
  if (g.id) return String(g.id);
  const wk = safe(g.week);
  const opp = safe(g.opp);
  return `${wk}_${opp}`;
}

function outcomeLabel(r){
  if (r === "W") return "Win";
  if (r === "L") return "Loss";
  if (r === "T") return "Tie";
  if (r === "TBD") return "TBD";
  return safe(r);
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
  pw.addEventListener("keydown", (e)=>{ if (e.key==="Enter") attempt(); });
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
  loadedTag.textContent = `Loaded: ${currentTeam} ${SEASON}`;

  let url = dataUrl(currentTeam, SEASON);
  if (forceBust) url += `?t=${Date.now()}`;

  try{
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();
  } catch(e){
    console.error(e);
    DATA = null;
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
    const opp = safe(g.opp);
    const r = safe(g.result);
    const lbl = `Week ${wk} vs ${opp} — ${r}`;
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

    const reality = safe(g.reality);
    const coherence = safe(g.reality); // if you store MATCH/DIVERGE in "reality" column
    // If your JSON has a dedicated field for match/diverge, set it here:
    // const coherence = safe(g.coherence);

    const row = [
      safe(g.week),
      safe(g.opp),
      safe(g.result),
      safe(g.score),
      safe(g.pick),
      pct(g.exp_w ?? g.expW ?? g.exp),
      safe(g.conf),
      safe(g.evidence),
      coherence,
      safe(g.snapshot)
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

  const evidence = safe(g.evidence);
  const exp = pct(g.exp_w ?? g.expW ?? g.exp);
  const conf = safe(g.conf);
  const result = safe(g.result);
  const coherence = safe(g.reality); // if MATCH/DIVERGE stored here
  const snapshot = safe(g.snapshot);

  evidenceEl.textContent = evidence;
  expEl.textContent = exp;
  confEl.textContent = conf;
  confBarsEl.textContent = confBars(Number(conf));

  realityEl.textContent = outcomeLabel(result);

  cohEl.textContent = safe(coherence);
  cohEl.className = `v big ${tagClass(coherence)}`;

  if (coherence === "MATCH"){
    cohSubEl.textContent = "Signals aligned, and reality agreed. Coherence held.";
  } else if (coherence === "DIVERGE"){
    cohSubEl.textContent = "Signals aligned, but reality broke the story. Learn here.";
  } else {
    cohSubEl.textContent = "Coherence pending / not evaluated.";
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

  let m=0, d=0;
  for (const g of DATA.games){
    const c = safe(g.reality); // or g.coherence
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

