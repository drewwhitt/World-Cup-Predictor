import { useMemo, useState } from "react";
import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../../data";
import { computeElosIncludingKnockouts } from "../../lib/simulate";
import { TEAMS, TEAM_CONFEDERATION, CONFEDERATION_OFFSETS, type Confederation } from "../../lib/teams";
import { getTeamKnockoutStatus } from "../../lib/bracketTree";
import { computeAccuracy, RANDOM_BASELINE_BRIER, COIN_FLIP_BRIER, BACKTESTED_BRIER, HISTORICAL_DRAW_RATE } from "../../lib/accuracy";
import { FavoriteStar } from "../../components/favorites/FavoriteStar";
import { useFavorites } from "../../lib/favorites";
import type { StoredResults, TeamCode } from "../../lib/types";
import type { Team } from "../../data/worldCup";
import s from "./RankingsView.module.css";

type SortKey = "elo" | "delta" | "offset" | "name";
type CompareSortKey = "current" | "baseline" | "oddsDelta" | "name";
type ViewMode = "current" | "comparison";

interface RankingRow {
  code: TeamCode;
  name: string;
  group: string;
  confederation: Confederation;
  confederationOffset: number;
  currentElo: number;
  initialElo: number;
  delta: number;
  eliminated: boolean;
  eliminatedRound: string | null;
  isChampion: boolean;
  baselineOdds: number;
  currentOdds: number;
}

/**
 * Compact accuracy summary for the Comparison view — deliberately just
 * the headline numbers, not the full methodology writeup that already
 * lives on the /insights/how-accurate-is-veridex page. This is a single
 * cheap forward pass over already-played matches (not a re-simulation),
 * so it's fine to compute on every render of this view per the "quick
 * insights, actionable widgets" product philosophy.
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
        Brier score: 0 is a perfect prediction, {RANDOM_BASELINE_BRIER} is an equal three-way guess,{" "}
        {COIN_FLIP_BRIER} is a coin flip scored against decisive results only. Full breakdown on the{" "}
        <a href="/insights/how-accurate-is-veridex">accuracy methodology page</a>.
      </p>
    </div>
  );
}

export function RankingsView({ stored, teams }: { stored: StoredResults; teams: Team[] }) {
  const [mode, setMode] = useState<ViewMode>("current");
  const [sortKey, setSortKey] = useState<SortKey>("elo");
  const [compareSortKey, setCompareSortKey] = useState<CompareSortKey>("oddsDelta");
  const [confFilter, setConfFilter] = useState<Confederation | "all">("all");
  const [hideEliminated, setHideEliminated] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const favorites = useFavorites();

  const rows = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    const elos = computeElosIncludingKnockouts(playedMatches, stored, DEFAULT_SETTINGS);
    const teamByCode = new Map(teams.map((t) => [t.code, t]));

    const result: RankingRow[] = TEAMS.map((t) => {
      const confederation = TEAM_CONFEDERATION[t.code] ?? "UEFA";
      const status = getTeamKnockoutStatus(t.code, stored);
      const currentElo = elos[t.code] ?? t.initialElo;
      const liveTeam = teamByCode.get(t.code);
      return {
        code: t.code,
        name: t.name,
        group: t.group,
        confederation,
        confederationOffset: CONFEDERATION_OFFSETS[confederation],
        currentElo,
        initialElo: t.initialElo,
        delta: Math.round(currentElo - t.initialElo),
        eliminated: status.eliminated || !status.isRealParticipant,
        eliminatedRound: status.eliminatedRound,
        isChampion: status.isChampion,
        baselineOdds: liveTeam?.baseline ?? 0,
        currentOdds: liveTeam?.current ?? 0,
      };
    });

    return result;
  }, [stored, teams]);

  const filtered = rows
    .filter((r) => confFilter === "all" || r.confederation === confFilter)
    .filter((r) => !hideEliminated || !r.eliminated)
    .filter((r) => !favoritesOnly || favorites.has(r.code));

  const sorted = useMemo(() => {
    const copy = [...filtered];
    switch (sortKey) {
      case "elo":
        return copy.sort((a, b) => b.currentElo - a.currentElo);
      case "delta":
        return copy.sort((a, b) => b.delta - a.delta);
      case "offset":
        return copy.sort((a, b) => b.confederationOffset - a.confederationOffset);
      case "name":
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return copy;
    }
  }, [filtered, sortKey]);

  const compareSorted = useMemo(() => {
    const copy = [...filtered];
    switch (compareSortKey) {
      case "current":
        return copy.sort((a, b) => b.currentOdds - a.currentOdds);
      case "baseline":
        return copy.sort((a, b) => b.baselineOdds - a.baselineOdds);
      case "oddsDelta":
        return copy.sort((a, b) => (b.currentOdds - b.baselineOdds) - (a.currentOdds - a.baselineOdds));
      case "name":
        return copy.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return copy;
    }
  }, [filtered, compareSortKey]);

  const confederations: Array<Confederation | "all"> = ["all", "UEFA", "CONMEBOL", "CAF", "AFC", "CONCACAF", "OFC"];

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

  function CompareSortHeader({ label, k }: { label: string; k: CompareSortKey }) {
    return (
      <button
        type="button"
        className={compareSortKey === k ? s.sortActive : s.sortBtn}
        onClick={() => setCompareSortKey(k)}
      >
        {label} {compareSortKey === k && "▾"}
      </button>
    );
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · Power Rankings</div>
        <h1>Rankings</h1>
        <p className={s.dek}>
          {mode === "current" ? (
            <>
              All 48 teams ranked by real Elo rating, not FIFA's official ranking — this reflects
              current form and results, including how the model weighs each confederation's real
              strength differently from a simple points table.
            </>
          ) : (
            <>
              Every team's pre-tournament title odds against where they stand now (or, once the
              tournament's over, where they finished) — the same comparison behind the Home page's
              "biggest mover" callouts, laid out for all 48 teams at once.
            </>
          )}
        </p>
      </div>

      <div className={s.filters}>
        <button
          type="button"
          className={mode === "current" ? s.filterActive : s.filterBtn}
          onClick={() => setMode("current")}
        >
          Current
        </button>
        <button
          type="button"
          className={mode === "comparison" ? s.filterActive : s.filterBtn}
          onClick={() => setMode("comparison")}
        >
          Pre → Post
        </button>
      </div>

      <div className={s.filters}>
        {confederations.map((c) => (
          <button
            key={c}
            type="button"
            className={confFilter === c ? s.filterActive : s.filterBtn}
            onClick={() => setConfFilter(c)}
          >
            {c === "all" ? "All" : c}
          </button>
        ))}
      </div>

      <div className={s.filters}>
        <button
          type="button"
          className={hideEliminated ? s.filterActive : s.filterBtn}
          onClick={() => setHideEliminated((v) => !v)}
        >
          {hideEliminated ? "✓ Hiding eliminated teams" : "Hide eliminated teams"}
        </button>
        <button
          type="button"
          className={favoritesOnly ? s.filterActive : s.filterBtn}
          onClick={() => setFavoritesOnly((v) => !v)}
        >
          {favoritesOnly ? "★ Favorites only" : "☆ Favorites only"}
        </button>
      </div>

      {mode === "comparison" && <AccuracySummary stored={stored} />}

      {mode === "current" ? (
        <div className={s.tableWrap}>
          <div className={s.tableHeader}>
            <span className={s.colRank}>#</span>
            <span className={s.colTeam}><span className={s.headerLabel}>Team</span></span>
            <span className={s.colElo}><SortHeader label="Elo" k="elo" /></span>
            <span className={s.colDelta}><SortHeader label="Since Start" k="delta" /></span>
            <span className={s.colOffset}><SortHeader label="Confederation" k="offset" /></span>
            <span className={s.colStatus}><span className={s.headerLabel}>Status</span></span>
          </div>

          {sorted.map((row, i) => (
            <div key={row.code} className={[s.row, row.eliminated ? s.rowEliminated : ""].join(" ")}>
              <span className={s.colRank}>{i + 1}</span>
              <span className={s.colTeam}>
                <span className={s.teamNameRow}>
                  <FavoriteStar code={row.code} size="sm" />
                  <span className={s.teamName}>{row.name}</span>
                </span>
                <span className={s.groupTag}>Group {row.group}</span>
              </span>
              <span className={s.colElo}>{Math.round(row.currentElo)}</span>
              <span className={s.colDelta}>
                <span className={row.delta > 0 ? s.deltaUp : row.delta < 0 ? s.deltaDown : s.deltaFlat}>
                  {row.delta > 0 ? "+" : ""}{row.delta}
                </span>
              </span>
              <span className={s.colOffset}>
                <span className={s.confBadge}>{row.confederation}</span>
                <span className={row.confederationOffset > 0 ? s.deltaUp : row.confederationOffset < 0 ? s.deltaDown : s.deltaFlat}>
                  {row.confederationOffset > 0 ? "+" : ""}{row.confederationOffset}
                </span>
              </span>
              <span className={s.colStatus}>
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
      ) : (
        <div className={s.tableWrap}>
          <div className={s.compareHeader}>
            <span className={s.colRank}>#</span>
            <span className={s.colTeam}><span className={s.headerLabel}>Team</span></span>
            <span className={s.colOdds}><CompareSortHeader label="Baseline Odds" k="baseline" /></span>
            <span className={s.colOdds}><CompareSortHeader label="Current Odds" k="current" /></span>
            <span className={s.colOddsDelta}><CompareSortHeader label="Odds Shift" k="oddsDelta" /></span>
            <span className={s.colFinalRound}><span className={s.headerLabel}>Final Round</span></span>
          </div>

          {compareSorted.map((row, i) => {
            const oddsDelta = Number((row.currentOdds - row.baselineOdds).toFixed(1));
            return (
              <div key={row.code} className={[s.compareRow, row.eliminated ? s.rowEliminated : ""].join(" ")}>
                <span className={s.colRank}>{i + 1}</span>
                <span className={s.colTeam}>
                  <span className={s.teamNameRow}>
                    <FavoriteStar code={row.code} size="sm" />
                    <span className={s.teamName}>{row.name}</span>
                  </span>
                  <span className={s.groupTag}>Group {row.group}</span>
                </span>
                <span className={s.colOdds}>{row.baselineOdds.toFixed(1)}%</span>
                <span className={s.colOdds}>{row.currentOdds.toFixed(1)}%</span>
                <span className={s.colOddsDelta}>
                  <span className={oddsDelta > 0 ? s.deltaUp : oddsDelta < 0 ? s.deltaDown : s.deltaFlat}>
                    {oddsDelta > 0 ? "+" : ""}{oddsDelta}pp
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
            );
          })}
        </div>
      )}
    </div>
  );
}