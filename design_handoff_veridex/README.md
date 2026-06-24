# Handoff: VERIDEX — Predictive Sports Intelligence

## Overview
VERIDEX is a premium digital sports publication powered by a predictive analytics engine —
think *The Athletic × Financial Times × Bloomberg × FiveThirtyEight*. It presents championship
forecasts, power rankings, match predictions, an interactive what-if simulation engine, and a
methodology/transparency section. The tone is **editorial, authoritative, data-driven** — a sports
intelligence *publication*, not a betting site.

This package documents a working front-end design for the **World Cup 2026** experience across six
views. It is **desktop-first**.

---

## About the Design Files
The file in this bundle — **`VERIDEX.dc.html`** — is a **design reference created in HTML**. It is a
fully working prototype (all six views, live interactions, charts) that shows the intended look and
behavior. It is **not production code to copy directly**: styling is inline, components are not split
into files, and all data is hardcoded in one logic class.

**Your task in Cursor:** recreate these designs in your real codebase using its established patterns
(framework, component conventions, styling system, data layer). If no codebase exists yet, scaffold a
new app in your framework of choice and build the views there. Use the HTML file as the visual + behavioral
ground truth — open it in a browser side-by-side while you build.

> **Recommended Cursor starting prompt:**
> *"Read README.md and VERIDEX.dc.html in this folder. This is a **React + CSS Modules** project. Follow
> the 'React + CSS Modules Implementation Guide' section exactly: set up the global tokens stylesheet
> first, then build the shared shell (Masthead, Nav, SportSelector, BreakingTicker) and the Home view in
> the **Wire** edition. Put all forecast/team data in `src/data/worldCup.ts` as typed mocks so views are
> pure functions of data + state. Match the design tokens and component specs precisely."*

**Target stack:** React + CSS Modules (`.module.css`). See the dedicated implementation guide below.

---

---

## React + CSS Modules Implementation Guide

### Suggested file structure
```
src/
  data/
    worldCup.ts            // all mock data (teams, headlines, morningForecast,
                           // match, simMatches+deltas, lab content) + types
    sim.ts                 // applySimulation(base, selections) -> projected odds
  styles/
    tokens.css             // :root CSS custom properties (global, imported once)
    global.css             // body reset, font @imports, @keyframes marquee, ::selection
  components/
    shell/
      AppShell.tsx + .module.css      // ticker + utility row + masthead + nav + sport selector + footer
      BreakingTicker.tsx + .module.css
      Masthead.tsx + .module.css
      PrimaryNav.tsx + .module.css
      SportSelector.tsx + .module.css
      EditionToggle.tsx + .module.css
    common/
      Eyebrow.tsx + .module.css       // the Plex-Mono uppercase label, reused everywhere
      DeltaPill.tsx + .module.css     // green/red/flat pp pill
      FormChips.tsx + .module.css     // W/D/L squares
      StatCard.tsx + .module.css
    charts/
      TrendChart.tsx                  // inline SVG, props: series[]
      Sparkline.tsx                   // inline SVG, props: points[]
      CalibrationChart.tsx            // inline SVG
    views/
      HomeView/ (Hero.tsx, QuickStrip.tsx, HeadlineCard.tsx, MorningForecast.tsx,
                 Leaderboard.tsx) each with a .module.css
      ForecastsView/ ...
      RankingsView/ ...
      MatchCenterView/ ...
      SimulationsView/ ...
      ModelLabView/ ...
  App.tsx                  // holds {tab, edition, sim} state; renders AppShell + active view
```

### Tokens → CSS custom properties (do this first)
Put the **Design Tokens** color/spacing values from this README into `styles/tokens.css` as `:root`
variables, import it once at the app root, and reference them from every `.module.css` via `var(--…)`.
CSS Modules scopes class names, **not** custom properties, so global `var()` tokens are the clean way to
share the palette. Example:
```css
/* styles/tokens.css */
:root{
  --paper:#F4EFE3; --surface:#FCF9F2; --ink:#1A1714; --ink-2:#5E564B; --ink-3:#8A8073;
  --hairline:rgba(26,23,20,.12); --positive:#2E7D4F; --negative:#B0412A;
  --navy:#0E1A2C; --gold:#D7B254; --on-dark:#F7F4ED;
  --font-display:"Libre Caslon Display",Georgia,serif;
  --font-sans:"IBM Plex Sans",system-ui,sans-serif;
  --font-mono:"IBM Plex Mono",monospace;
}
```
```css
/* e.g. Hero.module.css */
.kicker{ background:var(--gold); color:var(--navy); font:600 11px var(--font-mono);
  letter-spacing:.12em; text-transform:uppercase; padding:7px 12px; }
.title{ font:400 58px/1.02 var(--font-display); color:var(--on-dark); }
```

### Translating the prototype's inline styles
Every element in `VERIDEX.dc.html` has an inline `style="…"`. Mechanically move each into a named class in
that component's `.module.css`, substituting raw hex/font values for the `var(--…)` tokens. Keep class
names semantic (`.row`, `.metricCard`, `.deltaPos`) — don't mirror utility soup. Conditional styles
(active nav, selected sim option, up/down delta) become conditional `className` (e.g.
`clsx(s.option, selected && s.optionActive)`).

### Editions in React
Thread `edition` via context or a top-level prop. Only the **Home `Hero`** branches on it
(`edition === 'wire' ? <WireHero/> : <DeskHero/>`), plus the masthead accent and whether `BreakingTicker`
renders. Default `edition = 'wire'`. Persist with `localStorage` if you expose a toggle; otherwise hardcode
`'wire'` and drop `EditionToggle` + `DeskHero` entirely.

### State & routing
Lift `{ tab, edition, sim }` into `App.tsx` (or a small context). For real navigation, replace `tab` with
**React Router** routes (`/`, `/forecasts`, `/rankings`, `/match`, `/simulations`, `/model-lab`) and read
the active route for the nav underline. `sim` stays local to `SimulationsView` (or context if other views
should react to it).

### Simulation logic (pure function)
Keep it framework-free in `data/sim.ts`:
```ts
export function applySimulation(base: Record<string,number>, sel: SimSelections, matches: SimMatch[]){
  const odds = { ...base };
  for (const m of matches){
    const pick = sel[m.id]; if(!pick) continue;
    for (const [team, d] of Object.entries(m.eff[pick])) odds[team] = Math.max(0.1, odds[team] + d);
  }
  return Object.entries(odds).map(([name,val])=>({name,val})).sort((a,b)=>b.val-a.val);
}
```
`SimulationsView` calls it with the current selections and renders the top 6 with `val − base` deltas.

### Charts
Recreate `TrendChart` / `Sparkline` / `CalibrationChart` as small inline-SVG components (props in, `<svg>`
out) — no chart library required. The exact point arrays, scales, and colors are in the HTML file's logic
class; copy them verbatim. If you'd rather use a library (e.g. visx/recharts), the README's chart specs
give you everything to configure it.

### Fonts
Add the Google Fonts `<link>` (or `@import` in `global.css`) for the four families listed in Assets, then
reference them only through the `--font-*` tokens.

---

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, and interactions are all specified below.
Recreate the UI pixel-faithfully using your codebase's libraries and patterns.

---

## ⭐ Editions — IMPORTANT
The design ships with two visual "editions" controlled by one variable. **The client has chosen the
`wire` edition as the default and primary direction. Build `wire` first.** `desk` is an optional
light/editorial alternative and can be skipped unless you want a theme toggle.

| Edition | Mood | Key differences |
|---|---|---|
| **`wire` ✅ (primary)** | Authoritative newsroom | Full-bleed **dark navy hero** with gradient, **gold** kicker badge + accent, overlaid metric cards. Breaking-news ticker on top. |
| `desk` (optional) | Warm editorial | Light cream hero (text on paper), ink accents, hairline-separated metric row. No dark hero. |

Everything **below the hero** (forecast strip, headlines, Morning Forecast, tables, all other views) is
**identical across editions** — it sits on the warm cream canvas in both. The edition only changes the
**masthead accent, the breaking ticker presence, and the Home hero treatment**. So: implement one shared
app, and let `edition` swap only the Home hero block + accent color.

---

## Design Tokens

### Color
```
/* Canvas & ink (shared by both editions, used everywhere below the hero) */
--paper:        #F4EFE3   /* page background (warm cream) */
--surface:      #FCF9F2   /* cards / panels */
--ink:          #1A1714   /* primary text, dark bars, dark panels */
--ink-2:        #5E564B   /* body / secondary text */
--ink-3:        #8A8073   /* muted labels, eyebrows */
--ink-4:        #A39A8B   /* faint meta (rank numbers, timestamps) */
--hairline:     rgba(26,23,20,0.12)   /* borders / dividers */
--hairline-2:   rgba(26,23,20,0.08)   /* lighter row dividers */

/* Semantic (probability movement) */
--positive:     #2E7D4F   /* risers, up deltas; pill bg rgba(46,125,79,0.12) */
--negative:     #B0412A   /* fallers, down deltas; pill bg rgba(176,65,42,0.12) */

/* Wire edition */
--navy:         #0E1A2C   /* hero bg base, breaking ticker, dark panels */
--gold:         #D7B254   /* kicker badge, accent rule, AI-preview dot (tweakable) */
--on-dark:      #F7F4ED   /* text on navy */
--on-dark-soft: rgba(247,244,237,0.82)  /* body text on navy */
--pos-on-dark:  #7FC79A   /* positive deltas on navy */

/* Match Center outcome bar */
--home-win:     #3B6CA8   /* blue */
--draw:         #B8AE9C   /* warm grey */
--away-win:     #2E7D4F   /* green */
```
The hero's photo area is a **placeholder** (diagonal-stripe pattern) — swap in a real editorial
photograph with a `linear-gradient` dark overlay on top (see Hero spec).

### Typography
Three families (Google Fonts):
```
Headlines / display:  "Libre Caslon Display", Georgia, serif   (weight 400 only)
Editorial sub/serif:  "Libre Caslon Text", Georgia, serif      (400 / 700 / 400 italic)
Body & UI:            "IBM Plex Sans", system-ui, sans-serif    (400/500/600/700)
Data, labels, numbers:"IBM Plex Mono", monospace               (400/500/600)
```
Rules of thumb:
- **Headlines & big numbers** → Libre Caslon Display, weight 400. Hero H1 = 58–60px / line-height ~1.02.
- **Eyebrows, labels, metrics, timestamps, deltas** → IBM Plex Mono, 10–12px, `letter-spacing` .10–.20em, `text-transform: uppercase`, color `--ink-3`.
- **Body copy & nav** → IBM Plex Sans. Body 14–17px / line-height 1.5–1.65.
- All probability values, ratings, and deltas render in **IBM Plex Mono** (the "terminal" data feel).

Type scale used: 10, 11, 12, 13, 14, 15, 17, 19, 21, 24, 26, 27, 28, 34, 46, 58/60 px.

### Spacing & shape
```
Container:     max-width 1200px, side padding 40px, centered
Section gaps:  ~46–50px between major home sections
Card padding:  20–28px
Border radius:  2px (pills, chips, buttons) · 3px (cards/panels)
Borders:       1px solid var(--hairline); feature blocks use 1.5px solid var(--ink)
Grid gutters:  1px "rule" grids (cards separated by hairline bg showing through 1px gaps)
```
No drop shadows in the editorial style — separation is done with **hairline borders** and the
cream-vs-surface contrast.

---

## Shared Shell (every view)
Top-to-bottom, inside the 1200px container:

1. **Breaking ticker** (`wire` only, toggleable via `showBreaking`) — full-width bar, `--navy` bg,
   34px tall. Left: a `--gold` "BREAKING" tag (Plex Mono, 11px, uppercase). Right: a horizontally
   **marquee-scrolling** line of headline snippets (`@keyframes` translateX 0 → -50%, ~38s linear infinite,
   content duplicated for a seamless loop). Text `--on-dark`, Plex Sans 12.5px.
2. **Utility row** — dateline left ("TUESDAY, JUNE 24, 2026", Plex Mono uppercase `--ink-3`); right:
   "VOL. III · NO. 176" + a gold "✦ SUBSCRIBE TO PREMIUM". Bottom border hairline.
3. **Masthead** — wordmark **VERIDEX** (Libre Caslon Display, 46px, `letter-spacing: .04em`) with tagline
   "PREDICTIVE SPORTS INTELLIGENCE" below (Plex Mono 11px, `letter-spacing: .34em`, uppercase, `--ink-3`).
   Right: an **Edition** segmented toggle (Desk / Wire) — two Plex-Mono buttons in a 1px-bordered group;
   active = `--ink` bg / `--paper` text, inactive = transparent / `--ink-2`. *(The toggle is optional in
   production — only needed if you keep both editions.)*
4. **Primary nav** — 6 text buttons, Plex Sans 14px/600, gap 34px, on a `2px solid var(--ink)` bottom
   border. Active item shows a **3px `--ink` underline** flush to that border. Items: **Home, Forecasts,
   Rankings, Match Center, Simulations, Model Lab** → switch the active view.
5. **Sport selector** — pill row. Active ("World Cup") = `--ink` bg / `--paper` text. Others = transparent
   with hairline border, `--ink-3` text. Sports: World Cup, NFL, NBA, NHL, MLB, MLS, Premier League,
   Champions League. *(Only World Cup is wired up; others are visual.)*

6. **Footer** — `2px solid var(--ink)` top border; "VERIDEX" wordmark left; right meta line
   "Predictive Sports Intelligence · © 2026 · Forecasts are probabilistic, not guarantees".

---

## Screens / Views

### 1. Home (`tab: 'home'`)
The publication front page. Top-to-bottom:

- **Hero (edition-dependent):**
  - **Wire (primary):** a `min-height:460px` block, `border-radius:3px`, content bottom-aligned. Background =
    editorial photo (placeholder = `repeating-linear-gradient(135deg, #1c2a3d 0 14px, #1a2738 14px 28px)`)
    with an overlay `linear-gradient(180deg, rgba(10,18,30,.25), rgba(10,18,30,.55) 50%, rgba(10,18,30,.94))`.
    Inside (padding 40px): a `--gold` kicker badge "WORLD CUP · CHAMPIONSHIP FORECAST" (Plex Mono 11px,
    navy text); H1 in Libre Caslon Display 58px `--on-dark`; a Plex-Sans 18px sub in `--on-dark-soft`; a
    byline row with a 3px gold tick; then **4 metric cards** in a row (`rgba(247,244,237,.08)` fill, hairline
    border): *Championship Odds 24.5% (↗ +1.3 pp), Power Ranking #1 (↗ +1), Power Rating 92.4 (↗ +0.8),
    Confidence 88/100 (↗ +4)*. Metric value = Libre Caslon Display 28px; up-delta = `--pos-on-dark` Plex Mono.
  - **Desk (optional):** no dark block. Kicker "TOURNAMENT OUTLOOK · WORLD CUP 2026"; H1 Libre Caslon Display
    60px on cream; serif sub (Libre Caslon Text 20px); byline. Then a 4-column metric row separated by
    hairlines (top+bottom 1px border): *Updated / Favorite / Biggest Mover / Model Confidence*.
  - Hero **copy** (both): H1 "Brazil Reclaims World Cup Favorite Status After Matchday 2"; sub "The Veridex
    model ran 50,000 fresh simulations after Tuesday's results and now rates Brazil the tournament's most
    likely champion — its first time atop the table since the group-stage draw."; byline "VERIDEX Analytics
    Desk · June 24, 2026 · 6:45 AM".

- **Quick Forecast Strip:** a single horizontal bar (`--surface`, hairline border). Left cap = `--ink`
  panel "Top Championship Probabilities". Then 5 equal cells (hairline-divided): team name (Plex Sans
  12px/600) over value (Plex Mono 22px/600). Data = top 5 by current odds.

- **Latest from the model (secondary headlines):** section header (Libre Caslon Display 26px) +
  "UPDATED CONTINUOUSLY" eyebrow over a bottom hairline. Below: a **3-column** card grid (1px hairline-rule
  grid). Each card (min-height 200px, `--surface`): a metric label (Plex Mono) + an up/down metric (↗ green /
  ↘ red), an H3 (Libre Caslon Display 21px), a summary (Plex Sans 14px `--ink-2`), and a timestamp eyebrow.
  6 cards (see Data).

- **The Morning Forecast** (signature daily feature): a block bordered `1.5px solid var(--ink)`. Dark
  header bar (`--ink` bg): "The Morning Forecast" (Libre Caslon Display 24px) + "DAILY BRIEFING" eyebrow,
  right "JUNE 24 · 6:45 AM". Body = **3×2 grid** of 6 cells (1px rule grid, `--surface`): **Biggest Riser**
  (green ▲), **Biggest Faller** (red ▼), **Most Important Match** (◆), **Most Likely Champion** (★),
  **Biggest Upset Risk** (⚠), **Key Model Insight** (◉, a paragraph). Each cell: colored Plex-Mono eyebrow,
  Libre Caslon Display 27px value, Plex Mono sub-note.

- **Championship leaderboard ("All 16 contenders"):** a `--surface` card. Header: "CHAMPIONSHIP PROBABILITY"
  eyebrow, "All 16 contenders" (Libre Caslon Display 27px), "SORTED BY CURRENT PROBABILITY" eyebrow right.
  Table columns (CSS grid `54px 1fr 96px 96px 130px 92px`): **Rank** (Plex Mono, zero-padded "01"),
  **Team** (Plex Sans 15px/700), **Group**, **Baseline** %, **Current** (a thin `--ink` fill bar capped at
  78px + Plex Mono 14px value, right-aligned), **Δ** (a pill: green/red bg with signed "pp" value, or "—"
  if flat). Rows divided by `--hairline-2`. 16 rows, sorted by current desc.

### 2. Forecasts (`tab: 'forecasts'`)
Eyebrow "FORECASTS · WORLD CUP 2026"; H1 "Championship odds over time" (46px); intro paragraph. A pill
tab row: **Championship** (active) / Qualification / Group Advance / Knockout. Then a 2-column grid
(`1.6fr 1fr`): **left** = a `--surface` card holding a **multi-line trend chart** (top-5 teams' title %
across 4 points labeled PRE / MD 1 / MD 2 / NOW; y-axis 0–26% with gridlines at 0/10/20; each line ends in
a dot + team label; colors `#2E7D4F, #3B6CA8, #7E6CC4, #B0412A, #B98C2A`). **Right** = a compact current
standings list (rank · name · current % · signed delta).

### 3. Rankings (`tab: 'rankings'`)
Eyebrow "VERIDEX POWER RANKINGS"; H1 "Who's strongest, right now"; intro. A `--surface` table, columns
(`54px 1fr 110px 96px 150px 92px`): **Rank**, **Team** (name + group sub), **Power rating** (Plex Mono 16px),
**Trend** (a 66×22 **sparkline** of the team's 4-point history; green if rising, red if falling), **Form**
(5 chips W/D/L — green/grey/red 20×20 rounded squares), **Title odds**. 16 rows, sorted by current odds.

### 4. Match Center (`tab: 'match'`)
Eyebrow "MATCH CENTER · FEATURED PREDICTION"; H1 "France vs Brazil"; meta "Today · 3:00 PM ET ·
MetLife Stadium…". 2-column grid (`1.4fr 1fr`):
- **Left card:** "MATCH OUTCOME PROBABILITY" → a 54px **stacked bar** split 32% / 27% / 41% (home blue
  `#3B6CA8` / draw `#B8AE9C` / away green `#2E7D4F`), each segment labeled with its %; a legend row below.
  Then a 2-cell grid: **Expected score** "1.4 – 1.6" and **Upset risk** "Moderate" (Libre Caslon Display
  26px). Then "KEY FACTORS INFLUENCING PREDICTION" — a list; each factor: title + "favors {team}", a
  short explanation, and a right-aligned Plex-Mono metric (e.g. "+0.4 xG").
- **Right card (dark, `--ink` bg):** an **AI-generated preview** — a gold dot + "AI-GENERATED PREVIEW"
  eyebrow (`--gold`), an H3 (Libre Caslon Display 23px, `--on-dark`), a ~80-word paragraph
  (`--on-dark-soft`), and a footer "Written by the Veridex model · updated 6:45 AM".

### 5. Simulations (`tab: 'sim'`) — INTERACTIVE
Eyebrow "SIMULATIONS · WHAT-IF ENGINE"; H1 "Rewrite the results. Watch the model react."; intro.
2-column grid (`1fr 1fr`):
- **Left "Set match outcomes" card:** a Reset button (top-right). For each of **4 upcoming matches**
  (France vs Brazil, Spain vs USA, England vs Germany, Argentina vs Netherlands): a label + a **3-button
  segmented control** ("{home} win" / "Draw" / "{away} win"). Selected button = `--ink` bg / `--paper`
  text; unselected = white, hairline border. Clicking a selected option **toggles it off**. Below: a
  **Storyline** box that summarizes the active scenarios in prose.
- **Right "Projected championship odds" card:** a "● LIVE" badge appears when any scenario is active.
  Top 6 teams as **labeled progress bars** (name + current % + signed delta vs baseline), re-sorted live.

**Behavior:** selecting outcomes applies per-team probability deltas to the base odds, re-sorts, and
recomputes deltas + storyline instantly. See *State Management* and *Interactions* for the exact model.

### 6. Model Lab (`tab: 'lab'`)
Eyebrow "MODEL LAB · METHODOLOGY & TRANSPARENCY"; H1 "How the forecasts are built"; intro. Then a row of
**4 stat cards**: *Brier score 0.187, Calibration 96%, Tournaments tested 8, Favorite hit rate 71%*
(Libre Caslon Display 34px). Then a 2-col grid (`1.3fr 1fr`): **left** = "THE SIMULATION PROCESS" — a
numbered 4-step list (01–04, each a Libre Caslon numeral + title + description) followed by "MODEL INPUTS"
chips. **Right** = a "CALIBRATION — BACKTESTED" card with a **calibration chart** (predicted vs observed:
a dashed 45° reference line + the model's near-diagonal line with dots). Below: a "FREQUENTLY ASKED"
3-item Q&A list.

---

## Interactions & Behavior
- **View switching:** primary-nav buttons set the active tab; only that view renders. Active tab shows the
  3px underline. No route change in the prototype — in production, map each view to a route
  (`/`, `/forecasts`, `/rankings`, `/match`, `/simulations`, `/model-lab`).
- **Edition toggle:** swaps the Home hero block + masthead accent + breaking ticker. Persist the choice
  (the client prefers **wire**; default to it). In production this can be a setting rather than visible UI.
- **Breaking ticker:** CSS marquee, infinite. Pure presentation.
- **Simulations (core interaction):**
  - State = a map `{ matchId: 'home' | 'draw' | 'away' }`. Clicking an option sets it; clicking the
    already-selected option clears that match.
  - Each `(matchId, outcome)` carries a small table of **per-team probability deltas** (in pp). Apply every
    selected match's deltas to a copy of the base current odds, clamp to ≥ 0.1, then **re-sort** and show
    the top 6, with each team's delta = new − base.
  - "● LIVE" shows whenever ≥ 1 match is set. The Storyline lists one sentence per active scenario plus a
    summary naming the new projected champion.
  - Example effect — *Spain vs USA → USA win:* `USA +1.9, Spain −1.4`. (Full table in Data.)
- **Hover/focus:** add subtle hover affordances on nav, pills, sim option buttons, and headline cards
  (e.g. slight bg tint or border darkening) — the prototype is mouse-driven; keep states understated and
  editorial, never flashy.

## State Management
Minimal, all client-side:
```
tab:      'home' | 'forecasts' | 'rankings' | 'match' | 'sim' | 'lab'   (default 'home')
edition:  'wire' | 'desk'                                               (default 'wire')
sim:      Record<matchId, 'home'|'draw'|'away' | undefined>             (default {})
```
All forecast/team data is **static mock data** in the prototype. In production, model it as typed data
(see shapes below) fed from your API or a mock module; every view is a pure function of that data + state.

## Data Shapes (mock — recreate as typed models)
```ts
type Team = {
  name: string; code: string; group: string;   // "Brazil","BRA","Group A"
  baseline: number; current: number;            // championship % (e.g. 23.2, 24.5)
  rating: number;                               // power rating (e.g. 92.4)
  formStr: string;                              // "WWWDW"
  trend: number[];                              // 4-point title-% history for chart/sparkline
};
type SimMatch = {
  id: string; home: string; away: string;
  eff: { home: Record<string,number>; draw: Record<string,number>; away: Record<string,number> };
};
```
The 16 contenders, the 6 secondary headlines, the Morning Forecast values, the Match Center factors +
preview, the 4 sim matches with their delta tables, and the Model Lab steps/inputs/FAQ/calibration points
are all defined in the logic class of `VERIDEX.dc.html` — **copy the exact values from there.**

## Charts
Three lightweight inline-SVG charts (no chart library needed, but you may use one):
1. **Forecast trend** — multi-line, 5 series × 4 points, y 0–26%, end-labeled.
2. **Rankings sparkline** — 66×22 per row, colored by direction, end dot.
3. **Calibration** — dashed 45° reference + model line with 9 dots, axis labels PREDICTED / OBSERVED.
All use the semantic colors above. Recreate with your charting approach of choice; exact point arrays are
in the HTML file.

## Assets
- **Fonts:** Libre Caslon Display, Libre Caslon Text, IBM Plex Sans, IBM Plex Mono (Google Fonts).
- **Imagery:** none shipped. The Wire hero uses a **striped placeholder** — replace with a real editorial
  photo (wide, dark/dramatic) and keep the dark bottom-gradient overlay so the white headline stays legible.
- **Icons:** the small glyphs (▲ ▼ ◆ ★ ⚠ ◉ ↗ ↘ ✦) are Unicode characters; swap for your icon set if preferred.
- No logos are used (avoid copyrighted team/league marks unless you have rights).

## Files
- `VERIDEX.dc.html` — the complete working design (all six views, both editions, live simulation, charts).
  Open it in a browser as the visual + behavioral source of truth. Note: it's a single-file prototype
  (inline styles, one logic class) — **reference it, don't ship it.**
- `README.md` — this document (self-sufficient; implement from it alone).
