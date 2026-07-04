# Veridex Model History
## 2026 FIFA World Cup Prediction Engine

This document captures the full development history of the Veridex prediction model — the architecture decisions, backtesting results, calibration methodology, and version changelog. It is intended as a reference for future development sessions and model versioning for NFL, MLS, NBA, and other sports.

---

## What Veridex Is

Veridex is a "Bloomberg Terminal for sports" — a predictive analytics platform that runs Monte Carlo simulations against real match results and surfaces championship probabilities, driver attribution, bracket projections, and model transparency features. The 2026 FIFA World Cup is the MVP launch sport.

**Stack:** React / TypeScript / Vite / Supabase / Vercel  
**Repo:** `drewwhitt/World-Cup-Predictor`  
**Live:** `world-cup-predictor-inky-two.vercel.app`

---

## Core Engine Architecture

### Simulation Loop
- 10,000 Monte Carlo simulations per update
- Each simulation runs the full 48-team group stage (simulating unplayed matches), then the entire knockout bracket
- Results are entered manually via the admin panel (`/?admin=true`) and stored in Supabase
- Confirmed match results are seeded into `confirmedWinners` so eliminated teams never appear in forward projections

### Elo Engine (`src/lib/elo.ts`)
- **K-Factor:** 40 (validated via backtesting)
- **Host Advantage:** 100 Elo pts (applied only to USA/Canada/Mexico in genuine home-city fixtures via `isHostMatch` flag)
- **Goal margin:** Log-scale multiplier — `log(margin + 1) × 1.5 / correction_factor`
- **Draw probability:** `DRAW_SCALE = 0.28`, compressed toward 50% when teams are evenly matched
- **Advancement probability:** `toAdvancementProbabilities()` — converts 3-outcome (win/draw/loss) to knockout advancement using `P(advance) = P(win in 90) + P(draw) × 0.5`, treating penalty shootouts as 50/50

### Bracket Routing (`src/lib/simulate.ts`, `src/lib/bracket.ts`)
The 2026 fixture file uses generic group slot strings (e.g. `"1A"`, `"3C/E/F/H/I"`) that do NOT match the real bracket draw. The simulation bypasses these entirely:

- `REAL_R32` map hardcodes all 16 confirmed R32 matchups
- `confirmedWinners` is seeded through R32 → R16 → QF → SF using real bracket pairing chains
- `simulateKnockout` accepts `realR32Participants` to override slot resolution for all 16 R32 matches

### Bracket Tree (`src/lib/bracketTree.ts`)
Encodes the official 2026 bracket zone structure derived from the fixture file's W-key assignments:

**R16 pairs** (winner of first faces winner of second):
- ko-73 vs ko-74 · ko-75 vs ko-76 · ko-77 vs ko-78 · ko-79 vs ko-80
- ko-81 vs ko-82 · ko-83 vs ko-84 · ko-85 vs ko-86 · ko-87 vs ko-88

**QF pairs** (R16 winners feed these):
- R97: W89 vs W90 · R98: W93 vs W94 · R99: W91 vs W92 · R100: W95 vs W96

**SF:** R101 = W97 vs W98 · R102 = W99 vs W100  
**Final:** W101 vs W102

Used by `ForecastsView` to show only bracket-valid projected opponents at each round.

---

## Confederation Offsets

Applied to all teams' base Elo before simulation. Accounts for the systematic bias where teams from weaker confederations accumulate Elo points against weak regional opponents, then get exposed at the World Cup.

### Current Live Values (v1.09 — conservative)
| Confederation | Offset |
|---------------|--------|
| UEFA | 0 |
| CONMEBOL | +10 |
| CAF | −15 |
| AFC | −45 |
| CONCACAF | −45 |
| OFC | 0 |

### Backtesting-Derived Optimal Values
Run via `scipy.optimize.differential_evolution` across 2010/2014/2018/2022 World Cups (256 matches total):

**Equal-weight optimization** (Brier 0.1870):
- CONMEBOL: +12, CAF: −55, AFC: −55, CONCACAF: −65

**Recency-weighted** (2022 ×2, 2018 ×1.5):
- CONMEBOL: +10, CAF: −15, AFC: −40, CONCACAF: −70

The equal-weight optimum has stronger historical accuracy but overly penalizes 2022 (Morocco, Japan, South Korea all massively outperformed their adjusted Elos). The conservative live values reflect a deliberate choice to not over-fit to pre-2022 data, given that CAF and AFC appear to be genuinely improving.

**CONCACAF note:** The data says −65 optimal, but 2026 R32 results (Mexico, Canada, USA all won; Japan lost in AFC) suggest the real-time evidence favors a less aggressive penalty. Current setting is −45, down from −50.

---

## Pre-Tournament Elo Values (v1.09)

26 of 48 teams use calibrated values from eloratings.net 2022 data. The remaining 22 (new 2026 qualifiers) use: `base_elo = FIFA_ranking_points + 75`, calibrated so Spain (1879 FIFA pts → 1954 Elo) matches the eloratings.net baseline.

**Confederation offsets are applied on top of these values. Do NOT bake offsets into the base Elo.**

| # | Team | Base Elo | Conf | Offset | **Final Elo** |
|---|------|----------|------|--------|---------------|
| 1 | Brazil | 2169 | CONMEBOL | +10 | **2179** |
| 2 | Argentina | 2141 | CONMEBOL | +10 | **2151** |
| 3 | France | 2005 | UEFA | +0 | **2005** |
| 4 | England | 1975 | UEFA | +0 | **1975** |
| 5 | Spain | 1954 | UEFA | +0 | **1954** |
| 6 | Portugal | 1942 | UEFA | +0 | **1942** |
| 7 | Netherlands | 1940 | UEFA | +0 | **1940** |
| 8 | Belgium | 1931 | UEFA | +0 | **1931** |
| 9 | Germany | 1922 | UEFA | +0 | **1922** |
| 10 | Uruguay | 1887 | CONMEBOL | +10 | **1897** |
| 11 | Switzerland | 1879 | UEFA | +0 | **1879** |
| 12 | Croatia | 1877 | UEFA | +0 | **1877** |
| 13 | Colombia | 1834 | CONMEBOL | +10 | **1844** |
| 14 | Senegal | 1845 | CAF | −15 | **1830** |
| 15 | USA | 1856 | CONCACAF | −45 | **1811** |
| 16 | Mexico | 1853 | CONCACAF | −45 | **1808** |
| 17 | Ecuador | 1764 | CONMEBOL | +10 | **1774** |
| 18 | Morocco | 1768 | CAF | −15 | **1753** |
| 19 | South Korea | 1779 | AFC | −45 | **1734** |
| 20 | Canada | 1773 | CONCACAF | −45 | **1728** |
| 21 | Japan | 1762 | AFC | −45 | **1717** |
| 22 | Tunisia | 1726 | CAF | −15 | **1711** |
| 23 | Australia | 1753 | AFC | −45 | **1708** |
| 24 | Ghana | 1718 | CAF | −15 | **1703** |
| 25 | Iran | 1739 | AFC | −45 | **1694** |
| 26 | Austria | 1674 | UEFA | +0 | **1674** |
| 27 | Sweden | 1659 | UEFA | +0 | **1659** |
| 28 | Norway | 1611 | UEFA | +0 | **1611** |
| 29 | Saudi Arabia | 1650 | AFC | −45 | **1605** |
| 30 | Scotland | 1567 | UEFA | +0 | **1567** |
| 31 | Czech Republic | 1563 | UEFA | +0 | **1563** |
| 32 | Egypt | 1525 | CAF | −15 | **1510** |
| 33 | Ivory Coast | 1450 | CAF | −15 | **1435** |
| 34 | Algeria | 1439 | CAF | −15 | **1424** |
| 35 | Turkey | 1378 | UEFA | +0 | **1378** |
| 36 | South Africa | 1367 | CAF | −15 | **1352** |
| 37 | Iraq | 1355 | AFC | −45 | **1310** |
| 38 | Paraguay | 1293 | CONMEBOL | +10 | **1303** |
| 39 | DR Congo | 1305 | CAF | −15 | **1290** |
| 40 | Cape Verde | 1275 | CAF | −15 | **1260** |
| 41 | Bosnia & Herz. | 1225 | UEFA | +0 | **1225** |
| 42 | Panama | 1245 | CONCACAF | −45 | **1200** |
| 43 | Uzbekistan | 1210 | AFC | −45 | **1165** |
| 44 | Qatar | 1175 | AFC | −45 | **1130** |
| 45 | Jordan | 1140 | AFC | −45 | **1095** |
| 46 | New Zealand | 925 | OFC | +0 | **925** |
| 47 | Haiti | 775 | CONCACAF | −45 | **730** |
| 48 | Curaçao | 775 | CONCACAF | −45 | **730** |

---

## Version Changelog

### v1.11 candidate — Draw probability under-prediction (found post-group-stage, not yet actioned)
**Status:** Diagnosed, not fixed. Flagged for a proper recalibration pass after the tournament, not a mid-tournament hotfix.

**What was found:** once all 72 group-stage matches were played and scored, the live 2026 group-stage Brier score came in at ~0.554 — nearly 3x worse than the 0.1877 backtest baseline and worse than even picking every match as a coin flip (0.1667). A per-match diagnostic (`scripts/diagnose-accuracy.ts`) showed this wasn't a scoring bug or a structural error: 13 of the 15 worst-scoring matches were draws, in every case with the model assigning only 8-16% draw probability beforehand. Matches with decisive results scored close to the historical norm. The `/insights/how-accurate-is-veridex` page was updated to break this out explicitly (decisive vs draw Brier, observed draw rate vs historical ~25%) rather than showing one misleading aggregate number.

**What's still unknown:** whether 2026's group stage was genuinely, unusually draw-heavy (real tournament variance) or whether `matchOutcomeProbabilities()`'s draw formula (`elo.ts`: `DRAW_PROB_SCALE=0.28`, `DRAW_MIN=0.08`, `DRAW_MAX=0.32`, scaled down as the Elo gap widens via `* 1.6`) is systematically too aggressive at reducing draw likelihood for lopsided matchups. The formula performed acceptably across the 2010-2022 backtest, so this may be specific to 2026 — but it's exactly the kind of pattern that should be checked against this tournament's full data once it's complete, the same way v3-v9 were calibrated against 2010-2022.

**Deliberately not fixed now:** `matchOutcomeProbabilities()` is used live by Home/Forecasts/BracketView for every remaining match. Changing draw-probability weighting mid-tournament, based on one tournament's partial data, risks destabilizing already-working predictions on a hunch. This belongs in a real backtesting pass (same methodology as `## Backtesting Methodology` below) once 2026's full results are available to calibrate against, alongside 2010-2022.

**If revisited:** consider whether the `* 1.6` sensitivity multiplier is too aggressive, whether `DRAW_MAX=0.32` needs raising, or whether draw likelihood should account for factors beyond Elo gap (e.g. group-stage dead-rubber incentives, which already get partial treatment via the matchday-3 pressure flattening mentioned below).

---

### v1.10 — R16 bracket structure fix (post-R32)
**Status:** Deployed. Fixes a structural bug affecting R16-onward projections for the entire tournament, not just a display panel.

**What was wrong:**
The v1.09 changelog entry below describes correcting `bracketTree.ts`'s zones "from consecutive pairing assumption to actual fixture file W-key structure" — but the fixture file itself had the bug for R16 matches 89-91 (`worldcup-fixtures.json`: `W74 vs W77` instead of the real `W73 vs W74`, etc.), so that earlier fix just moved the error from one wrong source to another. It happened to get R16 matches 92-96 right (fixture file was correct there) while being wrong for 89-91 — which is why the bug wasn't obvious end-to-end, only on specific teams (e.g. Portugal, whose real R16 opponent is Spain, was projected to face the France/Sweden winner instead).

A second, independent bug was also found in the same pass: the SF wiring (`ko-101`/`ko-102`) cross-wired QFs from opposite halves of the bracket into the same semifinal, instead of keeping each half of the draw intact until the Final.

**Root cause was in three places, not one:**
1. `worldcup-fixtures.json` — the raw data feeding the actual Monte Carlo simulation via `resolveSlot()`. R16 matches 89-91 had swapped W-keys; SF matches 101-102 cross-wired the two bracket halves.
2. `simulate.ts`'s `R16_FROM_R32`/`QF_FROM_R16`/`SF_FROM_QF` hardcoded override maps (used to resolve confirmed results into `confirmedWinners`) — same two bugs, and additionally didn't even agree with the raw fixture file's own QF numbering (`QF_FROM_R16` had 98/99 swapped relative to the JSON).
3. `bracketTree.ts`'s `ZONES` table (drives ForecastsView's "Projected Opponents" panel) — same wrong R16/SF grouping.

Because (1) and (2) feed the actual simulation, this wasn't just a display bug — BracketView's R16-onward win probabilities and the Home/Forecasts championship odds were computed against a bracket structure that never existed in the real tournament, for every team, for the entire second half of the competition.

**Fix verified against live 2026 tournament reporting**, not just re-derived logically: Portugal v Spain, Paraguay v France, Canada v Morocco, Brazil v Norway, Mexico v England, and USA v Belgium were all confirmed as real, already-scheduled R16 fixtures at the time of the fix, and the corrected zone structure was checked to reproduce every one of them exactly, plus the correct QF/SF/Final zones downstream.

**Corrected structure:**
- R16: (73,74), (75,76), (77,78), (79,80), (81,82), (83,84), (86,88), (85,87)
- QF: ko-97=W89vW90, ko-98=W93vW94, ko-99=W91vW92, ko-100=W95vW96 (unchanged — already correct)
- SF: ko-101=W97vW99 (73-80 side), ko-102=W98vW100 (81-88 side) — previously W97vW98 and W99vW100, wrongly merging the two halves

**Practical implication:** any accuracy scoring or Brier analysis done on R16+ predictions before this fix (including anything already logged toward the "Scoring v1.09" effort below) was scored against the wrong opponent structure and should be treated as unreliable for R16 onward. R32 scoring is unaffected. `baseline.json` was regenerated after this fix.

---

### v1.09 — Live, 2026 World Cup Round of 32
**Status:** Deployed. Used to predict all 72 group stage matches and all 16 R32 matches.

**Key parameters:**
- K=40, HOST_ADVANTAGE=100, DRAW_SCALE=0.28, simulations=10,000
- Confederation offsets: UEFA:0, CONMEBOL:+10, CAF:−15, AFC:−45, CONCACAF:−45, OFC:0
- `toAdvancementProbabilities()` for knockout advancement (penalty = 50/50)
- `REAL_R32` bracket bypass in `simulate.ts` and `bracket.ts`
- FIFA-calibrated pre-tournament Elos for all 48 teams

**Notable fixes in this version:**
- Bypassed fixture file's wrong group slot strings for R32 using `realR32Participants`
- Full `confirmedWinners` chain seeded through R32/R16/QF/SF
- Austria Elo corrected from 2002 (broken rank formula) to 1674 (FIFA pts calibration)
- All 22 new 2026 qualifiers given calibrated Elos (previously null → rank formula)
- `bracketTree.ts` zones corrected from consecutive pairing assumption to actual fixture file W-key structure
- Projected opponents in ForecastsView now bracket-aware (impossible opponents filtered)
- CONCACAF offset adjusted from −50 to −45 based on 2026 R32 results

**Backtesting:** Brier score 0.1877 (v9 equivalent with current conservative offsets). Best achievable with optimized offsets: 0.1870.

---

### v1.08 — Group Stage
Initial live version tracking the 2026 group stage. Used fixed pre-tournament Elos (null teams used broken rank formula `2200 − rank × 9`). Austria incorrectly rated 2002, higher than Spain and England. CONCACAF offset was −50.

---

### v9 (Backtesting) → v1.07 (Pre-deployment)
Final backtested version before live deployment. Validated across 2010/2014/2018/2022 World Cups.

**Parameters locked in at v9:**
- K=40 (swept from 20–60, 40 optimal)
- HOST_ADVANTAGE=100 (only for genuine host-nation home fixtures)
- Log-scale MoV multiplier (vs linear — log validated better)
- `toAdvancementProbabilities()` function introduced
- Confederation offsets introduced (equal-weight scipy optimized values)

**Brier score progression:**
| Version | Change | Brier |
|---------|--------|-------|
| v3 | Baseline pure Elo | 0.1910 |
| v4 | + form weighting (exponential decay) | 0.1883 |
| v5 | + confederation offsets + matchday 3 pressure | 0.1878 |
| v6 | + log-scale MoV (vs linear) | ~0.1877 |
| v7 | + host-only advantage (vs all home matches) | 0.1877 |
| v8 | K tuning sweep | 0.1877 |
| **v9** | **Final calibration, confederations rounded** | **0.1877** |

---

### v1–v2 (Early Prototypes)
- K=32, HOST_ADVANTAGE=65 (applied to all home matches)
- Linear MoV multiplier
- No confederation offsets
- Simulations=1,000 (later increased to 10,000)

---

## Backtesting Methodology

All versions validated on 256 World Cup matches across 2010, 2014, 2018, 2022 using **Brier score** (lower = better, random baseline = 0.2222, pure coin flip = 0.1667).

**Brier score formula:** `(p_win − actual_win)² + (p_draw − actual_draw)² + (p_loss − actual_loss)²` / 3

Key backtesting findings:
- CONCACAF was the most overrated confederation in historical data (−0.216 error as home team)
- CAF has been improving — recency-weighted optimization produces a much softer penalty (−15) vs equal-weight (−55)
- AFC showed massive improvement in 2022 but returned to historical underperformance patterns in 2026
- Confederation offsets improve Brier by ~1.2 mB overall across 256 matches
- Matchday 3 pressure flattening (10% Elo gap compression for dead rubber group matches) helps by ~0.5 mB

---

## Scoring v1.09 (Planned Post-R32)

After all 16 R32 matches are complete, score v1.09's predictions:
- Record pre-match advancement probabilities for all 16 R32 matchups (stored in `probability_snapshots` table)
- Compute Brier score on R32 advancement outcomes
- Track upset detection accuracy (did the model flag the right games as closest to 50/50?)
- Compare to naive baseline (50/50 for every match)

If accuracy warrants, calibrate **v1.10** before R16 with:
- Host nation modifier (USA/Canada/Mexico further adjustment for being tournament hosts)
- Potential CONCACAF offset adjustment if R32 results continue to support −45 over −65

---

## Architecture Notes for Future Sports

The Veridex engine is sport-agnostic. For NFL/NBA/NHL expansion:

**`bracketTree.ts`** — currently hardcoded for 2026 WC. For NFL: build dynamically after Wild Card weekend. The zone concept (which teams can only face at which round) is universal.

**Confederation offsets** → **League strength tiers** for club sports. EPL vs MLS vs Liga MX would use the same offset mechanism.

**`toAdvancementProbabilities()`** → for best-of-7 series (NBA/NHL), replace with `P(win series | P(win game))` using binomial distribution.

**`confirmedWinners`** seeding → works identically for NFL playoff bracket; just different match IDs and pairing structure.

**Automated data pipeline** needed before NFL September 2026 — manual entry is feasible for 64 World Cup matches but not 272 NFL regular season games.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/lib/elo.ts` | Core Elo engine, K=40, HOST_ADVANTAGE=100, `toAdvancementProbabilities()` |
| `src/lib/simulate.ts` | Monte Carlo simulation, REAL_R32 bypass, confirmedWinners chain |
| `src/lib/bracket.ts` | `simulateKnockout` with `realR32Participants` override |
| `src/lib/bracketTree.ts` | Official 2026 bracket zone structure |
| `src/lib/teams.ts` | 48 teams, confederation offsets, calibrated Elos |
| `src/lib/fixtures.ts` | `isHostMatch` detection via venue city strings |
| `src/lib/drivers.ts` | Driver attribution — counterfactual simulation for "why this number" |
| `src/lib/snapshots.ts` | Daily probability snapshots to Supabase |
| `src/data/veridexLive.ts` | `buildLiveTeams`, `buildLiveMorningForecast` |
| `src/data/baseline.json` | Pre-tournament baseline — regenerate with `npx tsx scripts/generate-baseline.ts` |
| `src/views/ForecastsView/` | Team Intelligence tab — driver attribution, path to title, projected opponents |
| `src/views/BracketView/` | Left-to-right SVG bracket with pre-match odds and upset badges |
| `src/views/HomeView/` | Morning Forecast, Daily Movers, Upset Feed, Leaderboard |
| `src/components/admin/AdminResultsPanel.tsx` | Manual result entry + snapshot button |
| `scripts/generate-baseline.ts` | Regenerates `baseline.json` — imports K_FACTOR/HOST_ADVANTAGE from `elo.ts` |

---

*Last updated: July 4, 2026 — draw probability under-prediction diagnosed post-group-stage (v1.11 candidate, not yet actioned)*