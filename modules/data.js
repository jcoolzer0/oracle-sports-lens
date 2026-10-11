export const BASE = "https://jcoolzer0.github.io/packers-oracle-v0/";
export const CODES =
  "ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WSH".split(
    " ",
  );
export function canonical(value, teams = []) {
  const s = String(value ?? "")
    .trim()
    .toUpperCase();
  const alias = {
    LA: "LAR",
    STL: "LAR",
    WAS: "WSH",
    SD: "LAC",
    OAK: "LV",
    JAC: "JAX",
  };
  return CODES.includes(alias[s] ?? s)
    ? (alias[s] ?? s)
    : (teams.find((t) => t.name.toUpperCase() === s)?.team ?? null);
}
export function normalize(schedule, teams, manifest, stats) {
  if (
    manifest.schema_version !== 2 ||
    schedule.season !== manifest.season ||
    teams.teams?.length !== 32
  )
    throw Error("Unsupported or inconsistent DataBank schema");
  if (
    new Set(teams.teams.map((t) => canonical(t.team))).size !== 32 ||
    teams.teams.some((t) => !canonical(t.team))
  )
    throw Error("Invalid canonical team directory");
  const ids = new Set();
  const games = schedule.games.map((g) => {
    const home_team = canonical(g.home_team, teams.teams),
      away_team = canonical(g.away_team, teams.teams);
    if (
      !home_team ||
      !away_team ||
      home_team === away_team ||
      ids.has(g.game_id) ||
      g.season !== manifest.season
    )
      throw Error("Invalid schedule join");
    ids.add(g.game_id);
    return { ...g, home_team, away_team };
  });
  if (
    manifest.schedule_games !== undefined &&
    games.length !== manifest.schedule_games
  )
    throw Error("Schedule coverage mismatch");
  return {
    games,
    teams: teams.teams,
    manifest,
    stats: stats ?? { weekly: [] },
  };
}
export async function loadBank(season = 2026, fetcher = fetch) {
  const roots = [
    `${BASE}seasons/${season}/`,
    `https://raw.githubusercontent.com/jcoolzer0/packers-oracle-v0/main/docs/seasons/${season}/`,
  ];
  let last;
  for (const root of roots)
    try {
      async function read(name, manifest) {
        const r = await fetcher(root + name + ".json", { cache: "no-store" });
        if (!r.ok) throw Error(`${name}: HTTP ${r.status}`);
        const text = await r.text();
        if (manifest) {
          const expected = manifest.files_sha256?.[name + ".json"];
          if (!expected) throw Error(`Missing checksum: ${name}`);
          const hash = Array.from(
            new Uint8Array(
              await crypto.subtle.digest(
                "SHA-256",
                new TextEncoder().encode(text),
              ),
            ),
            (b) => b.toString(16).padStart(2, "0"),
          ).join("");
          if (hash !== expected)
            throw Error(`Snapshot changed or invalid checksum: ${name}`);
        }
        return JSON.parse(text);
      }
      const manifest = await read("manifest");
      const [schedule, teams, stats] = await Promise.all([
        read("schedule", manifest),
        read("teams", manifest),
        read("team_stats", manifest).catch(() => null),
      ]);
      return { ...normalize(schedule, teams, manifest, stats), source: root };
    } catch (e) {
      last = e;
    }
  throw last;
}
// Date-only cutoff is deliberately conservative: same-day finals are excluded.
export function priorGames(bank, target, cutoff) {
  const day = new Date(cutoff).toISOString().slice(0, 10);
  return bank.games.filter(
    (g) =>
      g.game_id !== target.game_id &&
      g.status === "final" &&
      g.gameday < day &&
      g.gameday < target.gameday &&
      g.week < target.week &&
      Number.isFinite(g.home_score) &&
      Number.isFinite(g.away_score),
  );
}
export function teamRows(games, team) {
  return games
    .filter((g) => g.home_team === team || g.away_team === team)
    .sort((a, b) => a.gameday.localeCompare(b.gameday))
    .map((g) => ({
      id: g.game_id,
      for: g.home_team === team ? g.home_score : g.away_score,
      against: g.home_team === team ? g.away_score : g.home_score,
    }));
}
export function kickoff(g) {
  if (!g.gameday || !g.gametime) return null;
  // NFL feed times are America/New_York; derive UTC via Intl rather than host timezone.
  const wall = Date.parse(`${g.gameday}T${g.gametime}:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(wall));
  const offset =
    (Number(parts.find((p) => p.type === "hour").value) -
      new Date(wall).getUTCHours() +
      24) %
    24;
  return new Date(wall + ((24 - offset) % 24) * 3600000).toISOString();
}
