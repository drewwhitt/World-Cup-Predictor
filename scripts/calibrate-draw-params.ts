/**
 * Grid-search calibration for the draw-probability formula in elo.ts,
 * against the complete real 2026 dataset (group + knockout, 103 matches).
 *
 * matchOutcomeProbabilities() computes:
 *   drawBase = DRAW_PROB_SCALE * (1 - |homeExpected - 0.5| * SENSITIVITY)
 *   draw = clamp(drawBase, DRAW_MIN, DRAW_MAX)
 *
 * Current live values: DRAW_PROB_SCALE=0.28, DRAW_MIN=0.08, DRAW_MAX=0.32,
 * SENSITIVITY=1.6. diagnose-accuracy.ts showed decisive-match predictions
 * are excellent (0.0957 Brier, well below the 0.1877 backtest) but draws
 * are badly mispriced (0.3835 Brier, worse than a random 3-way guess) —
 * several of the worst misses were heavy favorites (Spain, England,
 * Ecuador) held to a draw by a big underdog, where the Elo gap pushed
 * drawBase below DRAW_MIN and the prediction got floored at 8%.
 *
 * This script re-uses the EXACT same chronological Elo trajectory
 * diagnose-accuracy.ts computes (Elo updates don't depend on the draw
 * params, only on K_FACTOR/HOST_ADVANTAGE), then tries every combination
 * of the four draw parameters and reports whichever minimizes:
 *   1. Draw-only Brier (the specific thing that's broken)
 *   2. Overall Brier (draws + decisive combined), as a sanity check that
 *      the fix doesn't trade decisive accuracy away to fix draws
 *
 * Requires .env.local with VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY.
 * Usage: npx tsx scripts/calibrate-draw-params.ts
 */
import { GROUP_MATCHES, KNOCKOUT_MATCHES, DEFAULT_SETTINGS } from "../src/data";
import { buildInitialElos } from "../src/lib/simulate";
import { expectedScore, updateElo } from "../src/lib/elo";
import { resolveKnockoutMatch, KNOCKOUT_STRUCTURE } from "../src/lib/bracketTree";
import { loadResultsForBuild } from "../src/insights/buildTimeData";

type MatchSnapshot = {
  homeElo: number;
  awayElo: number;
  ha: number;
  actual: "home" | "draw" | "away";
};

async function main() {
  const stored = await loadResultsForBuild();
  if (!stored) {
    console.error("Could not load live results — check .env.local has VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY");
    process.exit(1);
  }

  const elos = buildInitialElos();
  const snapshots: MatchSnapshot[] = [];

  const playedGroup = [...GROUP_MATCHES]
    .filter((m) => stored.matches[m.id])
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);

  for (const match of playedGroup) {
    const result = stored.matches[match.id];
    const ha = match.isHostMatch ? DEFAULT_SETTINGS.homeAdvantage : 0;
    const actual = result.homeGoals > result.awayGoals ? "home" : result.homeGoals < result.awayGoals ? "away" : "draw";
    snapshots.push({ homeElo: elos[match.home], awayElo: elos[match.away], ha, actual });

    const updated = updateElo(elos[match.home], elos[match.away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, ha);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  const playedKnockout = [...KNOCKOUT_MATCHES]
    .filter((m) => stored.knockoutMatches?.[m.id] && m.id in KNOCKOUT_STRUCTURE)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const match of playedKnockout) {
    const result = stored.knockoutMatches![match.id];
    const { home, away } = resolveKnockoutMatch(match.id, stored);
    if (!home || !away) continue;
    const actual = result.homeGoals > result.awayGoals ? "home" : result.homeGoals < result.awayGoals ? "away" : "draw";
    snapshots.push({ homeElo: elos[home], awayElo: elos[away], ha: 0, actual });

    const updated = updateElo(elos[home], elos[away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, 0);
    elos[home] = updated.home;
    elos[away] = updated.away;
  }

  console.log(`Calibrating against ${snapshots.length} real matches (${snapshots.filter((s) => s.actual === "draw").length} draws)\n`);

  function evaluate(scale: number, min: number, max: number, sensitivity: number) {
    let totalBrier = 0;
    let drawBrier = 0;
    let drawCount = 0;
    let decisiveBrier = 0;
    let decisiveCount = 0;

    for (const snap of snapshots) {
      const homeExpected = expectedScore(snap.homeElo, snap.awayElo, snap.ha);
      const drawBase = scale * (1 - Math.abs(homeExpected - 0.5) * sensitivity);
      const draw = Math.max(min, Math.min(max, drawBase));
      const remaining = 1 - draw;
      const homeWin = remaining * homeExpected;
      const awayWin = remaining * (1 - homeExpected);

      const outcome = {
        home: snap.actual === "home" ? 1 : 0,
        draw: snap.actual === "draw" ? 1 : 0,
        away: snap.actual === "away" ? 1 : 0,
      };
      const brier = ((homeWin - outcome.home) ** 2 + (draw - outcome.draw) ** 2 + (awayWin - outcome.away) ** 2) / 3;
      totalBrier += brier;

      if (snap.actual === "draw") {
        drawBrier += brier;
        drawCount += 1;
      } else {
        decisiveBrier += brier;
        decisiveCount += 1;
      }
    }

    return {
      overall: totalBrier / snapshots.length,
      draw: drawCount > 0 ? drawBrier / drawCount : NaN,
      decisive: decisiveCount > 0 ? decisiveBrier / decisiveCount : NaN,
    };
  }

  // Baseline: current live parameters
  const baseline = evaluate(0.28, 0.08, 0.32, 1.6);
  console.log("Current live parameters (scale=0.28, min=0.08, max=0.32, sensitivity=1.6):");
  console.log(`  Overall ${baseline.overall.toFixed(4)}  |  Decisive ${baseline.decisive.toFixed(4)}  |  Draw ${baseline.draw.toFixed(4)}\n`);

  // Grid search
  let bestByOverall = { scale: 0.28, min: 0.08, max: 0.32, sensitivity: 1.6, overall: baseline.overall, draw: baseline.draw, decisive: baseline.decisive };
  let bestByDraw = { ...bestByOverall };

  for (let scale = 0.24; scale <= 0.42; scale += 0.01) {
    for (let min = 0.08; min <= 0.22; min += 0.01) {
      for (let max = 0.28; max <= 0.42; max += 0.02) {
        if (max < min) continue;
        for (let sensitivity = 1.0; sensitivity <= 1.7; sensitivity += 0.1) {
          const result = evaluate(scale, min, max, sensitivity);
          if (result.overall < bestByOverall.overall) {
            bestByOverall = { scale, min, max, sensitivity, ...result };
          }
          if (result.draw < bestByDraw.draw) {
            bestByDraw = { scale, min, max, sensitivity, ...result };
          }
        }
      }
    }
  }

  console.log("Best by OVERALL Brier (draws + decisive combined):");
  console.log(`  scale=${bestByOverall.scale.toFixed(2)} min=${bestByOverall.min.toFixed(2)} max=${bestByOverall.max.toFixed(2)} sensitivity=${bestByOverall.sensitivity.toFixed(1)}`);
  console.log(`  Overall ${bestByOverall.overall.toFixed(4)}  |  Decisive ${bestByOverall.decisive.toFixed(4)}  |  Draw ${bestByOverall.draw.toFixed(4)}\n`);

  console.log("Best by DRAW-ONLY Brier (may sacrifice some decisive accuracy):");
  console.log(`  scale=${bestByDraw.scale.toFixed(2)} min=${bestByDraw.min.toFixed(2)} max=${bestByDraw.max.toFixed(2)} sensitivity=${bestByDraw.sensitivity.toFixed(1)}`);
  console.log(`  Overall ${bestByDraw.overall.toFixed(4)}  |  Decisive ${bestByDraw.decisive.toFixed(4)}  |  Draw ${bestByDraw.draw.toFixed(4)}\n`);

  // ── Conservative, single-parameter candidates ──────────────────────────
  // With only 24 draws in the whole dataset, a 4-parameter grid search risks
  // fitting this tournament's specific quirks rather than a real pattern —
  // the v9 baseline was validated against 256 matches across FOUR
  // tournaments, a much thicker sample. These candidates isolate ONE change
  // at a time (holding the rest at the live v9 values) so a smaller, more
  // defensible adjustment can be compared against the full grid-search jump.
  console.log("── Conservative single-parameter candidates (holding the rest at live values) ──");
  const candidates: Array<{ label: string; scale: number; min: number; max: number; sensitivity: number }> = [
    { label: "DRAW_MIN 0.08 -> 0.12 only", scale: 0.28, min: 0.12, max: 0.32, sensitivity: 1.6 },
    { label: "DRAW_MIN 0.08 -> 0.15 only", scale: 0.28, min: 0.15, max: 0.32, sensitivity: 1.6 },
    { label: "sensitivity 1.6 -> 1.3 only", scale: 0.28, min: 0.08, max: 0.32, sensitivity: 1.3 },
    { label: "sensitivity 1.6 -> 1.0 only", scale: 0.28, min: 0.08, max: 0.32, sensitivity: 1.0 },
    { label: "DRAW_PROB_SCALE 0.28 -> 0.32 only", scale: 0.32, min: 0.08, max: 0.32, sensitivity: 1.6 },
  ];
  for (const c of candidates) {
    const r = evaluate(c.scale, c.min, c.max, c.sensitivity);
    console.log(`  ${c.label.padEnd(34)} Overall ${r.overall.toFixed(4)}  |  Decisive ${r.decisive.toFixed(4)}  |  Draw ${r.draw.toFixed(4)}`);
  }
  console.log();

  console.log("With only 24 draws in the whole dataset, treat the full 4-parameter grid-search optimum with caution — check whether one of the single-parameter candidates above captures most of the draw-Brier improvement without the decisive-accuracy cost before adopting the full grid-search combination.");
}

main().catch((err) => {
  console.error("calibrate-draw-params failed:", err);
  process.exit(1);
});