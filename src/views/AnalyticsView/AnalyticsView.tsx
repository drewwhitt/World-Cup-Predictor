import { useMemo, useState } from "react";
import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../../data";
import { computeElosIncludingKnockouts } from "../../lib/simulate";
import { TEAMS } from "../../lib/teams";
import { getTeamKnockoutStatus } from "../../lib/bracketTree";
import { computeAccuracy, BACKTESTED_BRIER, HISTORICAL_DRAW_RATE } from "../../lib/accuracy";
import type { StoredResults, TeamCode } from "../../lib/types";
import type { Team } from "../../data/worldCup";
import s from "./AnalyticsView.module.css";

type SortKey = "oddsShift" | "eloChange" | "baselineOdds" | "currentOdds" | "name";

interface AnalyticsRow {
  code: TeamCode;
  name: string;
  initialElo: number;
  currentElo: number;
  eloChange: number;
  baselineOdds: number;
  currentOdds: number;
  oddsShift: number;
  eliminated: boolean;
  eliminatedRound: string | null;
  isChampion: boolean;
}

/**
 * Compact accuracy summary — deliberately just the headline numbers, not
 * the full methodology writeup that already lives on the static
 * /insights/how-accurate-is-veridex page. This is a single cheap forward
 * pass over already-played matches (not a re-simulation), so it's fine
 * to compute on every render per the "quick insights" product philosophy.
 */
function AccuracySummary({ stored }: { stored: StoredResults }) {
  const accuracy = useMemo(() => computeAccuracy(stored), [stored]);
  if (!accuracy.group.brierScore && !accuracy.knockout.brierScore) return null;

  return (
    <div className={s.accuracyPanel}>
      <div className={s.accuracyHeader}>Model Accuracy This Tournament</div>
      <div className={s.accuracyGrid}>
        {accuracy.group.brierScore !== null && (
          <div className={s.accuracyStat}>
            <span className={s.accuracyValue}>{accuracy.group.brierScore.toFixed(4)}</span>
            <span className={s.accuracyLabel}>Group stage Brier ({accuracy.group.matchesScored} matches)</span>
          </div>
        )}
        {accuracy.knockout.accuracyPct !== null && (
          <div className={s.accuracyStat}>
            <span className={s.accuracyValue}>{accuracy.knockout.accuracyPct}%</span>
            <span className={s.accuracyLabel}>Knockout favorite hit rate ({accuracy.knockout.matchesScored} matches, {accuracy.knockout.upsets} upsets)</span>
          </div>
        )}
        {accuracy.group.draws.observedRate !== null && (
          <div className={s.accuracyStat}>
            <span className={s.accuracyValue}>{(accuracy.group.draws.observedRate * 100).toFixed(0)}%</span>
            <span className={s.accuracyLabel}>Observed draw rate (historical ~{(HISTORICAL_DRAW_RATE * 100).toFixed(0)}%)</span>
          </div>
        )}
        <div className={s.accuracyStat}>
          <span className={s.accuracyValue}>{BACKTESTED_BRIER}</span>
          <span className={s.accuracyLabel}>2010–2022 backtest reference</span>
        </div>
      </div>
      <p className={s.accuracyNote}>
        Brier score: 0 is a perfect prediction. Full breakdown on the{" "}
        <a href="/insights/how-accurate-is-veridex">accuracy methodology page</a>.
      </p>
    </div>
  );
}

export function AnalyticsView({ stored, teams }: { stored: StoredResults; teams: Team[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("oddsShift");

  const rows = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    const elos = computeElosIncludingKnockouts(playedMatches, stored, DEFAULT_SETTINGS);
    const teamByCode = new Map(teams.map((t) => [t.code, t]));

    const result: AnalyticsRow[] = TEAMS.map((t) => {
      const status = getTeamKnockoutStatus(t.code, stored);
      const currentElo = elos[t.code] ?? t.initialElo;
      const liveTeam = teamByCode.get(t.code);
      const baselineOdds = liveTeam?.baseline ?? 0;
      const currentOdds = liveTeam?.current ?? 0;
      return {
        code: t.code,
        name: t.name,
        initialElo: t.initialElo,
        currentElo,
        eloChange: Math.round(currentElo - t.initialElo),
        baselineOdds,
        currentOdds,
        oddsShift: Number((currentOdds - baselineOdds).toFixed(1)),
        eliminated: status.eliminated || !status.isRealParticipant,
        eliminatedRound: status.eliminatedRound,
        isChampion: status.isChampion,
      };
    });

    return result;
  }, [stored, teams]);

  const isComplete = rows.some((r) => r.isChampion);

  const sorted = useMemo(() => {
    const copy = [...rows];
    switch (sortKey) {
      case "oddsShift":
        return copy.sort((a, b) => b.oddsShift - a.oddsShift);
      case "eloChange":
        return copy.sort((a, b) => b.eloChange - a.eloChange);
      case "baselineOdds":
        return copy.sort((a, b) => b.baselineOdds - a.baselineOdds);
      case "currentOdds":
        return copy.sort((a, b) => b.currentOdds - a.currentOdds);
      case "name":
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return copy;
    }
  }, [rows, sortKey]);

  function SortHeader({ label, k }: { label: string; k: SortKey }) {
    return (
      <button
        type="button"
        className={sortKey === k ? s.sortActive : s.sortBtn}
        onClick={() => setSortKey(k)}
      >
        {label} {sortKey === k && "▾"}
      </button>
    );
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · Analytics</div>
        <h1>Analytics</h1>
        <p className={s.dek}>
          Every team's pre-tournament odds and Elo rating against where they stand now (or, once
          the tournament's over, where they finished) — the deeper numbers behind Rankings' at-a-
          glance view, plus the model's accuracy record for this tournament.
        </p>
      </div>

      <AccuracySummary stored={stored} />

      <div className={s.tableWrap}>
        <div className={s.tableHeader}>
          <span className={s.colTeam}><span className={s.headerLabel}>Team</span></span>
          <span className={s.colOdds}><SortHeader label="Baseline Odds" k="baselineOdds" /></span>
          <span className={s.colOdds}><SortHeader label={isComplete ? "Final Odds" : "Current Odds"} k="currentOdds" /></span>
          <span className={s.colShift}><SortHeader label="Odds Shift" k="oddsShift" /></span>
          <span className={s.colElo}><span className={s.headerLabel}>Start Elo</span></span>
          <span className={s.colElo}><span className={s.headerLabel}>{isComplete ? "Final Elo" : "Current Elo"}</span></span>
          <span className={s.colEloChange}><SortHeader label="Elo Δ" k="eloChange" /></span>
          <span className={s.colFinalRound}><span className={s.headerLabel}>Final Round</span></span>
        </div>

        {sorted.map((row) => (
          <div key={row.code} className={[s.row, row.eliminated ? s.rowEliminated : ""].join(" ")}>
            <span className={s.colTeam}>{row.name}</span>
            <span className={s.colOdds}>{row.baselineOdds.toFixed(1)}%</span>
            <span className={s.colOdds}>{row.currentOdds.toFixed(1)}%</span>
            <span className={s.colShift}>
              <span className={row.oddsShift > 0 ? s.deltaUp : row.oddsShift < 0 ? s.deltaDown : s.deltaFlat}>
                {row.oddsShift > 0 ? "+" : ""}{row.oddsShift}pp
              </span>
            </span>
            <span className={s.colElo}>{Math.round(row.initialElo)}</span>
            <span className={s.colElo}>{Math.round(row.currentElo)}</span>
            <span className={s.colEloChange}>
              <span className={row.eloChange > 0 ? s.deltaUp : row.eloChange < 0 ? s.deltaDown : s.deltaFlat}>
                {row.eloChange > 0 ? "+" : ""}{row.eloChange}
              </span>
            </span>
            <span className={s.colFinalRound}>
              {row.isChampion ? (
                <span className={s.champTag}>Champion</span>
              ) : row.eliminated ? (
                <span className={s.outTag}>Out · {row.eliminatedRound ?? "Group Stage"}</span>
              ) : (
                <span className={s.aliveTag}>Alive</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}