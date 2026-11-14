# Oracle Football — Season 2

Current production: Pre-Cog 1.2.0 active adaptive trial with an automatic baseline
fallback. The 1.1.0 baseline continues recording in parallel; frozen calls never
change. See the final section for influence, comparison and recovery policy.

Static HTML/CSS/ES modules, compatible with GitHub Pages. No build, package
installation, API key, server database, or acquisition-repository changes.

```sh
npm test
python3 -m http.server 8000 --bind 127.0.0.1
```

Open the served index page in a browser. Preview password: `oraclefootball`.
This remains a client-side preview gate, not access control. Select **Legacy**
for the original 2025 panels and calculations; select **Pre-Cog** for the 2026
schedule, team navigation and prospective predictions. NE and LV are now in
navigation. LAR/LA and WSH/WAS map to the appropriate season identifiers.

## Source contract

`https://jcoolzer0.github.io/packers-oracle-v0/seasons/2026/` is authoritative.
The fallback is the same acquisition repository's `main/docs/seasons/2026/`
outputs through `raw.githubusercontent.com`. The status names the source used;
a committed output is not proof that GitHub Pages has published it. Required
schedule and team payloads are checked against manifest SHA-256 hashes. A
changed snapshot or failed load does not silently become historical data.
Optional unavailable statistics cause efficiency abstention. No season totals
are used for predictions. Manifest availability/quality metadata is displayed.

Legacy uses `history/2025/<team>.json`, falling back to the original bundled
2025 files. Its original `oracle` logic and interface are retained. These archive
predictions have no trustworthy pregame publication timestamps and are excluded
from prospective cross-lens evaluation. Historical baselines are currently
within-season prior games; the unvalidated 2025 archive is deliberately not
used to train 2026 predictions. This avoids importing its documented defects.

## Three observers (experimental v1.0.0)

- **Baseline margin:** all eligible prior team scoring margins.
- **Unit efficiency:** offensive passing+rushing EPA per attempt/carry minus
  opponent EPA per attempt/carry, from joined weekly records only.
- **Recent trajectory:** scoring margins over the last three eligible games.

Each observer compares all home/away sample pairs, counts favorable comparisons
(ties as half), and applies a symmetric Beta(1,1) smoothing prior:
`p_home = (favorable_pairs + 1) / (pair_count + 2)`.
At least three games per team are required for an observer. Two of three must
favor the same side. Available observer probabilities are pooled equally; pooling that reaches
50% or contradicts the majority yields no winner. There are no fitted context weights. These are
empirical **uncalibrated** matchup estimates, not validated NFL win probabilities.
Pair comparisons are dependent; sample size reports games, not pair count.
Observers use different summaries but share games and are correlated. They are
not three independent votes in a statistical sense.

Only final games with finite scores, earlier weeks, and dates before both the
prediction cutoff and target date contribute. Same-day finals are excluded
conservatively because final availability times are not supplied. Weekly stats
must join those eligible games; target/future stats and aggregate season totals
are excluded. Retrospective views are labeled exploration and cannot be saved.
Dates/times are interpreted in America/New_York with daylight-saving handling.

Offensive/defensive scoring form is displayed separately from injury health.
There is no trustworthy injury feed or timestamped weather forecast, so those
signals remain unknown. Venue and feed rest days are contextual descriptions;
they do not adjust probability. Delayed statistics, small samples, disagreement
and correlation remain visible. A future calibration study may replace these
models with fitted models using frozen training/validation periods.

## Shared journal and fair evaluation

The shared record contains lens/model version, creation/cutoff timestamp,
matchup, source hashes and collection time, evidence game IDs, each observer
probability, motifs, and the aggregate prediction. Recording is explicit and
only permitted before a known kickoff with a source collected before cutoff.
The first record per lens/version/game is retained; refreshes cannot replace it.
Export JSON backups using the interface. Browser storage is local and editable:
this is an append-only application journal, not a tamper-proof or multi-user
ledger. Closing a browser retains records; clearing site storage removes them.
No backend or public prediction feed is implied.

Final non-tied games with recorded pregame predictions receive accuracy, Wilson
95% accuracy intervals, Brier score, five probability calibration bins, and
breakdowns by lens/version, team, division/non-division matchup, motif and
observer. Ties are explicitly excluded from binary evaluation. Contextual
signals without model probabilities are not attributed predictive performance.
`evaluate(records, games, cohortIds)` intersects identical game IDs, exact
cutoffs and source snapshots for fair comparisons. Empty cohorts stay empty;
there is no claim of superiority at any sample size. For an actual comparative
study, generate all lens predictions in one batch at a common cutoff/snapshot,
predeclare cohort selection, and use paired uncertainty analysis. Legacy's
archived calls do not qualify.

## Add a lens or skin

`modules/data.js` owns canonicalization, snapshot loading and cutoff filtering.
`modules/precog.js` is a pure analytical module. `modules/tracking.js` is shared
across observers. `modules/skin.js` renders without HTML interpolation.
The original app is isolated in `legacy.html` and `app.js`.

Create a module that exports `{id, label, version, predict({bank, game, cutoff})}`.
Return the Pre-Cog result contract: `lens`, `version`, `p` (home probability or
null), `winner`, `models` (`id`, `p`, `n`), `motifs`, `evidence`, plus the fields
your selected skin needs. Use `priorGames`/`teamRows`, or explicitly import a
utility/model from another lens. Never use unfiltered source totals. Give model
changes a new version and describe evidence/uncertainty in the skin.

A skin is `render(root, {prediction, game, bank})`. Register it and the lens from
an extension entry script loaded after `modules/ui.js`:

```js
import { registry, addLens } from "./modules/ui.js";
import { myLens, renderMyLens } from "./community/my-lens.js";
registry.addSkin("my-skin", renderMyLens);
addLens(myLens, "my-skin");
```

`addLens` adds the navigation button and reuses team/matchup navigation. Duplicate
IDs are rejected. Each lens supplies its own analytical logic and skin; all use
the same journal/evaluation contract. Escape untrusted source text with
`textContent`, as the default skin does.

## Validation and publication

`npm test` covers cutoff leakage, aliases, kickoff timezone conversion,
abstention, append-only records, probability evaluation, equivalent cohorts,
schedule filtering and prediction labels.
Browser smoke checks exercise gate unlocking, all 32 teams, matchup navigation,
record deduplication, Legacy season rows, and the community placeholder.

The current acquisition snapshot inspected on 2026-10-11 contains 272 games,
66 finals, 130 weekly team-stat rows, and partial coverage (JAX/PHI missing
statistics for their fifth game). These are source observations, not assertions
about completeness of all upstream metrics. Pages access may require allowing
`jcoolzer0.github.io`; raw fallback requires `raw.githubusercontent.com`.
Review and merge the dedicated Lens branch through your normal workflow, then
publish through the existing GitHub Pages configuration. Nothing is deployed
by setup or tests.

Browser smoke tests require Playwright and Chromium in the test environment:

```sh
node tests/browser.cjs
```

For this cloud environment, Chromium lacks the environment proxy CA. The tested
alternative is `ORACLE_CURL_TRANSPORT=1 node tests/browser.cjs` with Playwright
available on `NODE_PATH`. This uses TLS-verified curl HTTPS responses through
browser interception and retains manifest checksum verification. It validates
live payloads and rendering, **not direct Chromium HTTPS connectivity**. No TLS
verification bypass or persistent trust-store change is required.

## Schedule navigation and one login

The main `oraclefootball` login now covers all lenses. Legacy has no password
form and is loaded only when selected after login. Direct visits to
`legacy.html` route to `index.html?lens=legacy`, reusing the session. If session
storage is disabled, the current page still supports one in-memory login.

Pre-Cog shows all 272 season matchups by default. Filter by week, outcome or the
selected team; **Show full season** clears the filters and **Jump to next game**
moves directly to a confirmed future matchup. Team buttons open a
17-game team season; prediction buttons move keyboard focus to matchup details.
Details expose the observer explanation, eligible prior-game results and weekly
statistics, source schedule and manifest metadata. Evidence game buttons open
that game’s observations. `#game=<game_id>` links can reopen a matchup.

Upcoming schedule estimates share a common observation cutoff. Completed games
are labeled **Historical preview**, not archived pregame calls. Saved predictions
are labeled **Recorded pregame call** and retain their original probabilities.
Merely browsing the schedule never records predictions. Recording remains an
explicit action for a future matchup; **Refresh data** reloads the source without
removing the prediction journal or requiring another login when session storage
is available. Weather/injury gaps and experimental probability limitations remain.

Accessibility improvements include an inert background and focus containment for
the login, visible focus outlines, semantic schedule headers, labeled filters,
keyboard-operated team/prediction links, focus placement after drill-down, a skip
link, responsive horizontal table scrolling, and reduced-motion support. Legacy
now has keyboard-accessible season rows, labeled signal controls and charts,
and a corrected calibration-panel background for readable contrast.

Optional automated WCAG checks can be included in the browser smoke test by
setting `ORACLE_AXE_PATH` to a separately installed `axe-core/axe.min.js`. The
browser test checks both Pre-Cog and Legacy, keyboard navigation, 390px mobile
layout, repeated lens switches, direct Legacy links, and unavailable-source /
disabled-session-storage fallback. These checks supplement manual assistive
technology testing; they are not a claim of complete WCAG conformance.

## Legacy: two seasons with limited historical learning

Legacy defaults to **Season 2 · 2026/27**, with a 17-game regular-season team
schedule, a next-matchup summary, clickable observations and explicit pregame
recording. **Season 1 · 2025** preserves the original panels, oracle calculations
and archive. The current DataBank contains regular-season schedules, not a
postseason bracket. The 2026 season includes regular-season games in early 2027.
Pre-Cog remains unchanged and independently versioned.

Season 2 is a separate Legacy bridge (`legacy-season2@1.0.0`), not fabricated
2026 oracle fields or a replay of 2025 motifs. Only internally consistent archived
score/results are used: canonical teams, regular-season weeks, unique team/week,
and matching W/L/T labels. Invalid rows are excluded. The archive is partial and
not independently verified; the UI reports accepted/rejected counts, provenance
and SHA-256 hashes. Missing or insufficient history yields a neutral baseline.

For each team, the historical win rate is `(2025 wins + ties/2 + 1)/(2025 games + 2)`.
With at least three accepted historical games, it contributes **one equivalent
game** at most. Add it to a symmetric Beta(1,1) baseline and eligible 2026 wins:
`team rate = (2026 wins + ties/2 + 1 + history_strength * old_rate) /
(2026 games + 2 + history_strength)`, where history_strength is 0 or 1.
The historical evidence share is therefore at most `1/(2026 games + 3)`,
shrinking as this year's actual evidence grows. It is a conservative design
choice, not a fitted or proven optimal weight. Relative home and away team rates
use the log5 formula: `p_home = h*(1-a)/(h*(1-a) + a*(1-h))`.

At least three prior 2026 games per team are required before making a call.
Last year's data alone cannot predict this year. Future/same-day results and
season aggregates are excluded through the shared pregame filtering utilities.
Roster/coaching changes, opponent strength and contextual effects are not
modeled; probabilities are experimental and uncalibrated. Historical oracle
predictions never enter training or current-season performance claims.

Current-season pregame calls use the shared journal and record the historical
baseline inputs/hashes alongside current evidence and model version. Historical
previews cannot be recorded as pregame calls. Switching seasons preserves the
shared login and team navigation; network failure leaves Season 1 available.

## Season performance dashboard

Pre-Cog and Legacy Season 2 include whole-season scorecards above their schedules.
The default scores original pregame calls saved in this browser for the selected
lens/version; merely viewing a projection does not save it. Use the scorecard
selector for separately labeled retrospective previews and current projections.
Neither view imports the unvalidated Season 1 archive predictions.

Cards show calls, correct/scored, accuracy, incorrect and awaiting finals. Team
tables count each matchup for both participating teams (not twice in the season
total). Ties, missing scores and no-calls do not count as correct or incorrect.
Rankings require five scored calls, with Wilson 95% intervals and Brier scores
shown to expose small-sample uncertainty. Observer and overlapping pattern
breakdowns support review, not causal attribution or automatic weight changes.
A model change should use frozen pregame evidence, common comparison cohorts,
chronological held-out evaluation and a new version. Weather, injury and spread
weights need trustworthy timestamped inputs before evaluation.

## Automatic pregame journal (2026 onward)

The shared `data/forecast-journal.json` is an append-only event history. The
scheduled **Record pregame forecasts and publish** GitHub Actions workflow runs
at minutes 7 and 37 each hour, on pushes to main, and on manual dispatch. It
requires Actions enabled, repository Contents write permission, and Pages using
**GitHub Actions** as its deployment source. It collects both lenses without
any browser being open. Schedules are best effort, not an exact-time service.
Run `node scripts/record-forecasts.mjs` from the checkout root to reproduce a
collection; Node 24 and TLS-verified curl suffice. No third-party API keys.

Fixed policy `seven-day-three-hour-v1`: begin observing seven days before known
kickoff. Preserve forecast changes, abstentions, model versions, individual
observer probabilities, diagnostic scoring form, hashes, and source snapshots.
The **earliest** supported call is never replaced. The **frozen** call is the
latest available snapshot made at least three hours before kickoff, including
an explicit no-call if that is what the latest snapshot said. At the deadline,
a later scheduler run can seal an already-existing eligible snapshot, but cannot
invent or backdate one. If the recorder never captured an eligible snapshot,
there is no official call for that game. Unknown kickoffs and already-started
or finished games cannot acquire new forecasts. Before freezing, rescheduled
kickoffs require new snapshots for the new kickoff; a frozen call never changes.

The dashboard defaults to automatic frozen calls. Earliest calls, personal
browser records, and retrospective previews have separate scorecards. Frozen
probabilities, observers and evidence are shown when inspecting a recorded game;
current recomputations cannot overwrite them. The timeline shows every saved
revision. Public history and the current source are refreshed every five minutes
while viewing. Check **Last recorder check**: an old timestamp indicates collection
has stopped. A running web page is not evidence that the scheduled recorder ran.
The export includes both personal records and the shared journal. Original Git
commits and content-addressed raw source snapshots permit auditing; repository
administrators can still edit history, so this is not an external trusted ledger.

Final results produce a timestamped settlement event. Accuracy excludes ties and
no-calls; earliest and frozen results score each game once. Early lead-time bins,
confidence increases/decreases, direction changes and diagnostic points MAE are
reported. Offensive/defensive signal hits mean the team with better prior scoring
form won; they are not causal explanations or validated unit-level predictions.
There are no bookmaker-spread, timestamped injury or weather forecasts to score.
The input snapshots preserve the actual source bodies; do not remove them while
retaining dependent journal entries. Historical games are never backfilled.

Pre-Cog **1.1.0** retains the three-observer majority/abstention rule and introduces
prequential learning. Only previously settled frozen 1.1.0 calls can train weights;
the target game and future settlements are excluded. At least 20 non-tied games
with all three non-neutral observer forecasts are required. Observer mean Brier
losses shrink toward 20 pseudo-games at 0.25, then weights use half uniform and
half exponential loss weighting. Each observer retains at least 1/6 weight;
weights are never inverted. Every forecast stores its weights, training count,
and training-through time. Historical previews never update this learner.
Learning may improve or worsen accuracy; confidence is not forced to grow.
Legacy 1.0.0 keeps its existing analytical model and gains automatic recording.

Activation: after this change lands, check the workflow in repository Actions.
If Pages deployment reports that the source is not configured, set repository
Settings → Pages → Build and deployment → Source to **GitHub Actions**, then run
**Record pregame forecasts and publish**. The workflow commits new events and
explicitly deploys a static artifact because token-authored commits alone may not
trigger branch-based Pages builds. Failed writes/deployments must be resolved;
this configuration file alone does not establish the scheduler is running.

## Independent market reference and team reliability shadow

The display-only `modules/market.js` reads schema-v1 `market/2026/latest.json`
and `status.json` through the same Pages / raw fallback as DataBank. Quotes must
match canonical game ID, season, week, home/away teams and kickoff, with a valid
probability pair and observation time strictly before kickoff. Comparison uses
home orientation; positive Oracle-minus-market percentage points favor home.
Exact/near ties (0.5 percentage points) have no clear favorite. Default label
precedence is toss-up (both within 5 pp of 50%), opposing favorites (contrarian
if Oracle conviction reaches 65%), same-side conviction gap (10 pp), shared
strong conviction (65%), then moderate agreement. One neutral source is labeled
explicitly. Thresholds live in `MARKET_CONFIG`. Upcoming observations older than
24 hours are stale; started/completed games show retained pregame references,
never guaranteed closing lines. Single books are named. The schedule can filter
10+ pp gaps; details disclose source, quote and collection status. Missing market
data cannot block or change forecasts.

The recorder independently appends genuine observed quotes to
`data/market-reference.json`, preserving timestamps for future movement review.
Only unchanged nonempty bookmaker sets permit movement comparisons. Changed
composition is flagged. Initial history is empty; historical upstream snapshots
are not enumerated or backfilled, and one quote cannot establish movement.
Market requests and bodies never enter prediction inputs, forecast hashes,
training, observer promotion, or performance. The existing forecast journal and
three-hour freeze policy are unchanged.

Pre-Cog **1.2.0** is the active, user-authorized adaptive trial. The original
**1.1.0** baseline runs and records in parallel. Current and preserved versions
can be selected in each performance scorecard. Previously frozen calls remain
visible and authoritative for their games; new versions never rewrite them.
No claim of demonstrated superiority is made at activation.

Global reliability shrinks observer Brier loss toward 20 pseudo-games at .25.
Each team's reliability shrinks toward global with 20 pseudo-games. Each
observer gets one score: 37.5% global loss, 37.5% average of both team losses,
and 25% recent-10 loss (also shrunk with 20 pseudo-games toward global).
Half-uniform / half-exponential weighting limits domination. These observers
share evidence; alignment and convergence never become extra votes. Coverage
describes availability and never increases influence. Only genuine probabilities
are scored. Missing/neutral observers do not enter the candidate pool.

The active candidate combines 50% existing baseline with 50% team-weighted pool.
Both sides use one home probability and its complement; separate team estimates
cannot conflict. This version can change favorites. Original eligibility and
baseline no-call restrictions remain, and exact ties produce no winner.
Only previously settled frozen 1.1 observer snapshots available before cutoff
train reliability. New 1.1 records continue supplying comparable evidence, so
learning does not stop after the version change. Market prices never participate.

New 1.2 records preserve baseline, candidate, official probabilities, differences,
direction changes, actual effective observer weights, training counts, team/global
reliability, policy/config version, decision, and source/cutoff provenance. The
original 25% shadow candidate remains separately auditable in the 1.1 records;
its version and evaluation are distinct from active 1.2 candidate comparisons.
The existing three-hour freeze applies to both parallel model versions.

The prospective safety guard uses only frozen 1.2 candidate/baseline pairs with
outcomes observed strictly before the next forecast cutoff. After at least 20
pairs, it selects baseline if overall Brier is worse by more than .005, recent-20
Brier is worse by more than .010, or recent accuracy is worse by more than 5 pp.
Candidate forecasts continue recording during fallback. Resuming requires at
least ten new settlements since suspension, recent-20 Brier at least .005 better
than baseline, and recent accuracy at least baseline. This hysteresis avoids
reacting to every game. Configuration can also disable promotion entirely while
preserving 1.1 recording. Thresholds are conservative design choices, not a
statistical guarantee. Changes affect future forecasts only, never frozen calls.

Review shows matched-cohort accuracy, Wilson intervals, Brier, calibration,
coverage/sample counts, approximate paired Brier-difference intervals, recent
performance, and suspension/resumption transitions. Small, overlapping samples
limit inference. No historical adaptive forecasts are reconstructed and no
in-sample accuracy is presented as activation evidence.

Upstream inspection on 2026-11-13 ET found the collector and schema implementation
on main, but raw `status.json` reported `unavailable`, zero observations, and an
ESPN scoreboard HTTP 400. Pages and raw `latest.json` returned 404. No real market
quote was available to integrate or display at verification time. The UI handles
that state and will consume authentic quotes when upstream publishes them;
the upstream repository was not changed. The committed Lens journal contained
43 settled Pre-Cog games: alignment 24/30 (80%, Wilson 62.7–90.5%), and three-
observer convergence 21/27 (77.8%, Wilson 59.2–89.4%). These do not validate the
new team-specific algorithm: zero recorded active candidate pairs existed.

Deploy by merging/publishing this Lens checkout through the existing workflow.
The workflow now retains the independent market-reference history alongside
forecast records. No new service, key, paid account or manual setup is needed.
