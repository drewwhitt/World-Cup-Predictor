# World Cup 2026 Predictor

Minimal web app that simulates the 2026 FIFA World Cup using **Elo ratings** and **Monte Carlo simulation**. Compare **pre-tournament baseline** predictions against **current** forecasts as you record match results.

## Features

- Pre-tournament baseline snapshot (original odds before any results)
- Live-updating predictions after each recorded result
- Elo-based next-match win/draw/loss probabilities
- Manual result entry (JSON + browser localStorage)
- Side-by-side baseline vs current title odds with change column

## Quick start

```bash
cd Projects/worldcup-predictor
npm install
npm run generate-baseline   # one-time: compute pre-tournament predictions
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Recording results

Use the **Record a result** panel in the app, or edit `src/data/results.json` directly:

```json
{
  "matches": {
    "g-E-0": { "homeGoals": 7, "awayGoals": 1 }
  }
}
```

Match IDs follow the pattern `g-{GROUP}-{index}` (e.g. `g-F-0` = first Group F fixture).

## How it works

1. **Baseline** — 5,000 simulations using FIFA-style pre-tournament Elo ratings (no results).
2. **After each result** — Elo ratings update, then the remaining group + knockout stage is simulated repeatedly.
3. **Output** — Win group, advance, reach round X, and lift the trophy probabilities.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run generate-baseline` | Regenerate `src/data/baseline.json` |
| `npm run build` | Production build |

## Data

- `src/data/worldcup-fixtures.json` — Full 2026 schedule (group + knockout)
- `src/data/baseline.json` — Frozen pre-tournament simulation output
- `src/data/results.json` — Seed results (browser localStorage overrides at runtime)
