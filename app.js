/***** CONFIG *****/
const LENS_PASSWORD = "OMA";

// ✅ DataBank GitHub Pages root (parent that serves bal.json, teams.json, etc.)
const DATABANK_BASE = "https://jcoolzer0.github.io/packers-oracle-v0/";

// Data location (per-team JSON files)
function dataUrl(team, season) {
  // Keep an alias map if you ever need special cases.
  // NOTE: only use aliases if your databank filenames truly differ from team.toLowerCase()
  const ALIAS = {
    // Example: LAR: "la", // only if your databank file is actually la.json (not lar.json)
  };
  const key = (ALIAS[team] ?? team).toLowerCase();

  // Cache-buster on every load
  return `${DATABANK_BASE}${key}.json?v=${Date.now()}`;
}

const TEAMS = [
  "PHI","GB","DAL","KC","SF","BUF","BAL","NYG","NYJ","MIA","DET","MIN","LAR","LAC",
  "DEN","TB","WAS","CHI","SEA","ARI","CLE","CIN","PIT","TEN","IND","JAX","ATL","CAR","NO","HOU"
];

const SEASON = 2025;

/***** STATE *****/
let DATA = null;
let currentTeam = "ATL";
let currentGameKey = null;
let currentView = "con"; // "con" | "exp"

let signalGain = 1; // 0=Quiet | 1=Balanced | 2=Amplified
const SIGNAL_GAIN_KEY = "oracle_signal_gain";

/***** HELPERS *****/
function safe(x){ return (x===null || x===undefined || x==="") ? "—" : String(x); }

function gainLabel(g){
  return g === 0 ? "Quiet" : (g === 2 ? "Amplified" : "Balanced");
}

function gainPulseText(g){
  if (g === 0) return "Quiet: Lens will wait for stronger agreement.";
  if (g === 2) return "Amplified: Lens will surface early convergence (confidence capped).";
  return "Balanced: Lens will surface stable convergence.";
}

function clampGain(v){
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(2, Math.round(n)));
}

function syncGainUi(){
  const tag = document.getElementById("gainTag");
  const hint = document.getElementById("gainHint");
  const pulse = document.getElementById("gainPulse");
  if (tag) tag.textContent = gainLabel(signalGain);
  if (hint) hint.textContent = "Controls how readily subtle patterns speak up.";
  if (pulse) pulse.textContent = gainPulseText(signalGain);
}

function pct(x){
  if (x===null || x===undefined || isNaN(x)) return "—";
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

// Schema helpers (your JSON)
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
function getPick(g){
  const p = g?.oracle?.pregame_pick;
  return (p === "W" || p === "L" || p === "T") ? p : null;
}
function getLock(g){
  const lock = g?.oracle?.reality_lock;
  return (lock === "MATCH" || lock === "DIVERGE") ? lock : null;
}

function evidenceString(g){
  const n = getN(g);
  const exp = getExp(g);
  if (!n || exp === null) return `n=0 : D`;
  const cd = (exp >= 0.5) ? "C" : "D";
  return `n=${n} : ${cd}`;
}

function coherenceLockLabel(g){
  const lock = getLock(g);
  return lock ? lock : "—";
}

function gameKey(g){
  const wk = safe(g.week);
  const opp = safe(g.opponent);
  return `${wk}_${opp}`;
}

/***** PATENT-SAFE EXPLAIN SANITIZER *****/
function sanitizeExplain(s){
  if (!s) return "—";
  let t = String(s);

  // Keep it high-level.
  t = t.replace(/league-wide/gi, "historically");
  t = t.replace(/historically similar situations/gi, "similar situations");
  t = t.replace(/\(n=\d+\)/g, ""); // removes "(n=1)" style parentheticals

  t = t.replace(/\s+/g, " ").trim();

  // Signal Gain controls how readily we "speak up" (without exposing mechanics).
  if (signalGain === 0){
    const idx = t.search(/[.!?]\s/);
    if (idx > 0) t = t.slice(0, idx + 1);
    if (t.length > 140) t = t.slice(0, 140).trim() + "…";
  } else if (signalGain === 2){
    if (t.length > 360) t = t.slice(0, 360).trim() + "…";
  } else {
    if (t.length > 240) t = t.slice(0, 240).trim() + "…";
  }

  return t;
}

/***** PASSWORD GATE *****/
function gateInit(){
  const gate = document.getElementById("gate");
  const pw = document.getElementById("pw");
  const btn = document.getElementById("enter");
  const err = document.getElementById("gateErr");

  const ok = sessionStorage.getItem("oracle_lens_ok") === "1";
  if (ok && gate) gate.style.display = "none";

  function attempt(){
    if (pw && pw.value === LENS_PASSWORD){
      sessionStorage.setItem("oracle_lens_ok","1");
      if (gate) gate.style.display = "none";
    } else {
      if (err) err.hidden = false;
    }
  }

  if (btn) btn.addEventListener("click", attempt);
  if (pw) pw.addEventListener("keydown", (e)=>{ if (e.key==="Enter") attempt(); });
}

/***** UI INIT *****/
function uiInit(){
  const teamSel = document.getElementById("teamSel");
  const gameSel = document.getElementById("gameSel");
  const refresh = document.getElementById("refresh");

  const viewCon = document.getElementById("viewCon");
  const viewExp = document.getElementById("viewExp");

  const toggleExplain = document.getElementById("toggleExplain");
  const explainBox = document.getElementById("explainBox");

  const gainRange = document.getElementById("gainRange");

  // Signal Gain
  signalGain = clampGain(localStorage.getItem(SIGNAL_GAIN_KEY) ?? 1);
  if (gainRange) gainRange.value = String(signalGain);
  syncGainUi();

  if (gainRange){
    gainRange.addEventListener("input", ()=>{
      signalGain = clampGain(gainRange.value);
      localStorage.setItem(SIGNAL_GAIN_KEY, String(signalGain));
      syncGainUi();
      renderLens(); // re-render narration
      if (currentView === "exp") renderExperimental();
    });
  }

  // Populate teams dropdown
  if (teamSel){
    teamSel.innerHTML = TEAMS.map(t => `<option value="${t}">${t}</option>`).join("");
    teamSel.value = currentTeam;

    teamSel.addEventListener("change", async ()=>{
      currentTeam = teamSel.value;
      await loadTeam(true);
    });
  }

  // ✅ Inject Prev/Next Team buttons next to Refresh (no HTML edits needed)
  if (refresh && refresh.parentElement && !document.getElementById("prevTeam")){
    const mkBtn = (id, label) => {
      const b = document.createElement("button");
      b.id = id;
      b.textContent = label;
      // mirror Refresh styling lightly
      b.style.padding = "8px 10px";
      b.style.borderRadius = "10px";
      b.style.border = "1px solid #ccc";
      b.style.cursor = "pointer";
      b.style.marginLeft = "8px";
      return b;
    };

    const prevBtn = mkBtn("prevTeam", "◀ Prev Team");
    const nextBtn = mkBtn("nextTeam", "Next Team ▶");

    refresh.insertAdjacentElement("afterend", nextBtn);
    refresh.insertAdjacentElement("afterend", prevBtn);

    const stepTeam = async (dir) => {
      const i = TEAMS.indexOf(currentTeam);
      const n = TEAMS.length;
      const next = TEAMS[(i + dir + n) % n];
      currentTeam = next;
      if (teamSel) teamSel.value = currentTeam;
      await loadTeam(true); // bust cache on hop
    };

    prevBtn.addEventListener("click", ()=> stepTeam(-1));
    nextBtn.addEventListener("click", ()=> stepTeam(+1));
  }

  if (refresh){
    refresh.addEventListener("click", async ()=>{
      await loadTeam(true);
    });
  }

  if (gameSel){
    gameSel.addEventListener("change", ()=>{
      currentGameKey = gameSel.value;
      renderLens();
      if (currentView === "exp") renderExperimental();
    });
  }

  if (viewCon){
    viewCon.addEventListener("click", ()=>{
      currentView = "con";
      syncViewButtons();
      syncPanels();
    });
  }

  if (viewExp){
    viewExp.addEventListener("click", ()=>{
      currentView = "exp";
      syncViewButtons();
      syncPanels();
      renderExperimental();
    });
  }

  if (toggleExplain){
    toggleExplain.addEventListener("click", ()=>{
      if (explainBox) explainBox.hidden = !explainBox.hidden;
    });
  }

  syncViewButtons();
  syncPanels();
}

function syncViewButtons(){
  const viewCon = document.getElementById("viewCon");
  const viewExp = document.getElementById("viewExp");
  if (!viewCon || !viewExp) return;

  if (currentView === "con"){
    viewCon.classList.add("primary");
    viewExp.classList.remove("primary");
  } else {
    viewExp.classList.add("primary");
    viewCon.classList.remove("primary");
  }
}

function syncPanels(){
  const expPanel = document.getElementById("expPanel");
  if (!expPanel) return;
  expPanel.hidden = (currentView !== "exp");
}

/***** LOAD DATA *****/
async function loadTeam(forceBust=false){
  const loadedTag = document.getElementById("loadedTag");

  let url = dataUrl(currentTeam, SEASON);
  // (dataUrl already includes v=Date.now(); forceBust here is redundant but harmless)
  if (forceBust) url += `&t=${Date.now()}`;

  try{
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    DATA = await res.json();

    const team = DATA?.summary?.team ?? currentTeam;
    const season = DATA?.summary?.season ?? SEASON;
    if (loadedTag) loadedTag.textContent = `Loaded: ${team} ${season}`;
  } catch(e){
    console.error(e);
    DATA = null;
    if (loadedTag) loadedTag.textContent = `Loaded: —`;
    alert(`Could not load data for ${currentTeam}.\nExpected: ${url}\n\nTip: Ensure JSON exists at:\n${DATABANK_BASE}${currentTeam.toLowerCase()}.json`);
    renderAll();
    return;
  }

  if (DATA?.games?.length){
    currentGameKey = gameKey(DATA.games[0]);
  } else {
    currentGameKey = null;
  }

  renderAll();
  if (currentView === "exp") renderExperimental();
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
  if (!gameSel) return;

  if (!DATA?.games?.length){
    gameSel.innerHTML = `<option value="">—</option>`;
    return;
  }

  gameSel.innerHTML = DATA.games.map(g=>{
    const wk = safe(g.week);
    const opp = safe(g.opponent);
    const r = g.result ? g.result : "TBD";
    const lbl = `Week ${wk} vs ${opp} — ${r}`;
    const key = gameKey(g);
    return `<option value="${key}">${lbl}</option>`;
  }).join("");

  gameSel.value = currentGameKey ?? gameKey(DATA.games[0]);
}

/***** RENDER TABLE *****/
function renderSeasonTable(){
  const tbody = document.querySelector("#tbl tbody");
  if (!tbody) return;

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
      safe(getPick(g)),
      pct(getExp(g)),
      safe(getConf(g) === null ? "—" : Math.round(getConf(g))),
      evidenceString(g),
      coherenceLockLabel(g),
      (() => {
        const n = getN(g);
        return n ? `SNAP n=${n}` : "—";
      })()
    ];

    row.forEach((cell, idx)=>{
      const td = document.createElement("td");
      td.textContent = cell;
      if (idx === 8) td.className = tagClass(cell);
      tr.appendChild(td);
    });

    tr.addEventListener("click", ()=>{
      currentGameKey = gameKey(g);
      const gameSel = document.getElementById("gameSel");
      if (gameSel) gameSel.value = currentGameKey;
      renderLens();
      if (currentView === "exp") renderExperimental();
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

  const explainPregame = document.getElementById("explainPregame");
  const explainPostgame = document.getElementById("explainPostgame");

  if (!DATA?.games?.length || !currentGameKey){
    if (evidenceEl) evidenceEl.textContent = "—";
    if (expEl) expEl.textContent = "—";
    if (confEl) confEl.textContent = "—";
    if (confBarsEl) confBarsEl.textContent = "—";
    if (realityEl) realityEl.textContent = "—";
    if (cohEl) cohEl.textContent = "—";
    if (cohSubEl) cohSubEl.textContent = "—";
    if (snapEl) snapEl.textContent = "—";
    if (explainPregame) explainPregame.textContent = "—";
    if (explainPostgame) explainPostgame.textContent = "—";
    return;
  }

  const g = DATA.games.find(x => gameKey(x) === currentGameKey) || DATA.games[0];

  const evidence = evidenceString(g);
  const exp = pct(getExp(g));
  const confNum = getConf(g);
  const conf = (confNum === null ? "—" : String(Math.round(confNum)));
  const result = g.result;
  const lockLabel = coherenceLockLabel(g);
  const postCoh = g?.oracle?.coherence;
  const n = getN(g);

  if (evidenceEl) evidenceEl.textContent = evidence;
  if (expEl) expEl.textContent = exp;
  if (confEl) confEl.textContent = conf;
  if (confBarsEl) confBarsEl.textContent = confBars(confNum);

  if (realityEl) realityEl.textContent = outcomeLabel(result);

  if (cohEl){
    cohEl.textContent = lockLabel;
    cohEl.className = `v big mono ${tagClass(lockLabel)}`;
  }

  if (cohSubEl){
    if (lockLabel === "MATCH"){
      cohSubEl.textContent = `Story held. Postgame coherence: ${safe(postCoh)}`;
    } else if (lockLabel === "DIVERGE"){
      cohSubEl.textContent = `Story broke. Postgame coherence: ${safe(postCoh)}`;
    } else {
      cohSubEl.textContent = `No reality lock (insufficient similar-history). Postgame coherence: ${safe(postCoh)}`;
    }
  }

  if (snapEl) snapEl.textContent = n ? `SNAP n=${n}` : "—";

  if (explainPregame) explainPregame.textContent = sanitizeExplain(g?.oracle?.explain_pregame);
  if (explainPostgame) explainPostgame.textContent = sanitizeExplain(g?.oracle?.explain);
}

/***** SUMMARY COUNTS *****/
function renderSummaryCounts(){
  const scoreTag = document.getElementById("scoreTag");
  if (!scoreTag) return;

  if (!DATA?.games?.length){
    scoreTag.textContent = "Matches: — | Diverges: —";
    return;
  }

  let m = 0, d = 0;
  for (const g of DATA.games){
    const c = getLock(g);
    if (c === "MATCH") m++;
    if (c === "DIVERGE") d++;
  }
  scoreTag.textContent = `Matches: ${m} | Diverges: ${d}`;
}

/***** EXPERIMENTAL METRICS + GRAPHS *****/
function renderExperimental(){
  if (!DATA?.games?.length) return;

  let calls = 0, correct = 0;
  const byOpp = new Map();

  const runX = [];
  const runY = [];
  let callIndex = 0;

  for (const g of DATA.games){
    const pick = getPick(g);
    const res = g.result;

    const callable = (pick !== null) && (res === "W" || res === "L" || res === "T");
    if (!callable) continue;

    calls++;
    const isCorrect = (pick === res);
    if (isCorrect) correct++;

    const opp = safe(g.opponent);
    if (!byOpp.has(opp)) byOpp.set(opp, { calls: 0, correct: 0 });
    const agg = byOpp.get(opp);
    agg.calls++;
    if (isCorrect) agg.correct++;

    callIndex++;
    runX.push(callIndex);
    runY.push(calls ? (correct / calls) : 0);
  }

  const rate = calls ? (correct / calls) : null;

  const elCalls = document.getElementById("m_calls");
  const elCorrect = document.getElementById("m_correct");
  const elRate = document.getElementById("m_rate");
  const elRateBars = document.getElementById("m_rateBars");

  if (elCalls) elCalls.textContent = safe(calls);
  if (elCorrect) elCorrect.textContent = safe(correct);
  if (elRate) elRate.textContent = rate === null ? "—" : `${Math.round(rate * 100)}%`;
  if (elRateBars) elRateBars.textContent = rate === null ? "—" : confBars(rate * 100);

  const oppBody = document.querySelector("#oppTbl tbody");
  if (oppBody){
    oppBody.innerHTML = "";

    const rows = Array.from(byOpp.entries())
      .map(([opp, v]) => ({ opp, ...v, rate: v.calls ? v.correct / v.calls : 0 }))
      .sort((a,b) => (b.calls - a.calls) || (b.rate - a.rate));

    for (const r of rows){
      const tr = document.createElement("tr");
      const hit = r.calls ? `${Math.round(r.rate * 100)}%` : "—";
      [r.opp, r.calls, r.correct, hit].forEach((cell) => {
        const td = document.createElement("td");
        td.textContent = String(cell);
        tr.appendChild(td);
      });
      oppBody.appendChild(tr);
    }
  }

  const weeks = [];
  const expSeries = [];
  const cohSeries = [];

  for (const g of DATA.games){
    weeks.push(Number(g.week));
    const exp = getExp(g);
    expSeries.push(exp === null ? null : exp);
    const coh = g?.oracle?.coherence;
    cohSeries.push((coh === null || coh === undefined) ? null : Number(coh) / 100);
  }

  drawDualSeries("chart1", weeks, expSeries, cohSeries, "ExpWin", "Coherence");

  drawSingleSeries("chart2", runX, runY, "HitRate");
}

function drawDualSeries(canvasId, x, y1, y2, name1, name2){
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext("2d");

  ctx.clearRect(0,0,c.width,c.height);

  const padL = 44, padR = 14, padT = 12, padB = 28;
  const W = c.width - padL - padR;
  const H = c.height - padT - padB;

  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + H);
  ctx.lineTo(padL + W, padT + H);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.globalAlpha = 0.18;
  for (let i=0;i<=4;i++){
    const yy = padT + H - (i/4)*H;
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(padL + W, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const xmin = Math.min(...x);
  const xmax = Math.max(...x);
  const xSpan = (xmax - xmin) || 1;

  const X = (xi) => padL + ((xi - xmin) / xSpan) * W;
  const Y = (yi) => padT + H - (yi * H);

  ctx.lineWidth = 2;
  ctx.beginPath();
  let started = false;
  for (let i=0;i<x.length;i++){
    const yi = y1[i];
    if (yi === null || yi === undefined) { started = false; continue; }
    const px = X(x[i]);
    const py = Y(yi);
    if (!started){ ctx.moveTo(px,py); started = true; }
    else ctx.lineTo(px,py);
  }
  ctx.stroke();

  ctx.setLineDash([6,4]);
  ctx.beginPath();
  started = false;
  for (let i=0;i<x.length;i++){
    const yi = y2[i];
    if (yi === null || yi === undefined) { started = false; continue; }
    const px = X(x[i]);
    const py = Y(yi);
    if (!started){ ctx.moveTo(px,py); started = true; }
    else ctx.lineTo(px,py);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
  ctx.globalAlpha = 0.7;
  ctx.fillText(`${name1} (solid)`, padL, padT + H + 20);
  ctx.fillText(`${name2} (dashed)`, padL + 160, padT + H + 20);
  ctx.globalAlpha = 1;
}

function drawSingleSeries(canvasId, x, y, name){
  const c = document.getElementById(canvasId);
  if (!c) return;
  const ctx = c.getContext("2d");

  ctx.clearRect(0,0,c.width,c.height);

  const padL = 44, padR = 14, padT = 12, padB = 28;
  const W = c.width - padL - padR;
  const H = c.height - padT - padB;

  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + H);
  ctx.lineTo(padL + W, padT + H);
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (!x.length){
    ctx.globalAlpha = 0.6;
    ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
    ctx.fillText("No calls yet (no pregame picks).", padL, padT + 18);
    ctx.globalAlpha = 1;
    return;
  }

  ctx.globalAlpha = 0.18;
  for (let i=0;i<=4;i++){
    const yy = padT + H - (i/4)*H;
    ctx.beginPath();
    ctx.moveTo(padL, yy);
    ctx.lineTo(padL + W, yy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const xmin = Math.min(...x);
  const xmax = Math.max(...x);
  const xSpan = (xmax - xmin) || 1;

  const X = (xi) => padL + ((xi - xmin) / xSpan) * W;
  const Y = (yi) => padT + H - (yi * H);

  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i=0;i<x.length;i++){
    const px = X(x[i]);
    const py = Y(y[i]);
    if (i===0) ctx.moveTo(px,py);
    else ctx.lineTo(px,py);
  }
  ctx.stroke();

  ctx.font = "12px ui-monospace, Menlo, Consolas, monospace";
  ctx.globalAlpha = 0.7;
  ctx.fillText(`${name} (solid)`, padL, padT + H + 20);
  ctx.globalAlpha = 1;
}

/***** BOOT *****/
(async function boot(){
  gateInit();
  uiInit();
  await loadTeam(true);
})();
