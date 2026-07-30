/**
 * precomputed.ts
 * Loads whichever precomputed standard-roster forecasts exist under
 * src/data/fantasy/forecast-*.json. Uses import.meta.glob rather than
 * static per-file imports specifically so this works before any of
 * those files exist yet — scripts/generate-fantasy-forecast.ts only
 * writes them once a real rankings snapshot exists to compute from, so
 * there's nothing to commit ahead of time, and a static import of a
 * file that doesn't exist would fail the build outright.
 *
 * Only standard rosters (the 8/10/12/14-team presets) are ever
 * precomputed — a custom roster always computes live, since there are
 * infinitely many possible custom configs and no sensible way to
 * precompute all of them.
 */
import type { RosterConfig } from "./types";
import type { SimulationResult } from "./simulate";
import { STANDARD_ROSTER } from "./types";

export interface PrecomputedForecastFile {
  generatedAt: string;
  season: number;
  snapshotDate: string;
  teams: number;
  roster: RosterConfig;
  results: SimulationResult[];
}

const modules = import.meta.glob<{ default: PrecomputedForecastFile }>(
  "../../data/fantasy/forecast-*.json",
  { eager: true },
);

function rosterMatches(a: RosterConfig, b: RosterConfig): boolean {
  return (
    a.QB === b.QB &&
    a.RB === b.RB &&
    a.WR === b.WR &&
    a.TE === b.TE &&
    a.FLEX === b.FLEX &&
    a.flexEligible.length === b.flexEligible.length &&
    a.flexEligible.every((p) => b.flexEligible.includes(p))
  );
}

/**
 * Returns a precomputed forecast only if it matches this exact (teams,
 * season) with a standard roster AND was generated from the ranking
 * snapshot currently dated `currentSnapshotDate` — a cached forecast
 * from before the admin pushed a newer ranking snapshot is treated as a
 * miss (falls back to live compute) rather than silently served stale.
 */
export function getPrecomputedForecast(
  teams: number,
  roster: RosterConfig,
  season: number,
  currentSnapshotDate: string,
): PrecomputedForecastFile | null {
  if (!rosterMatches(roster, STANDARD_ROSTER)) return null;

  for (const mod of Object.values(modules)) {
    const file = mod.default;
    if (
      file.teams === teams &&
      file.season === season &&
      file.snapshotDate === currentSnapshotDate &&
      rosterMatches(file.roster, STANDARD_ROSTER)
    ) {
      return file;
    }
  }
  return null;
}