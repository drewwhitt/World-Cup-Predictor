import { useMemo, useState } from "react";
import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../../data";
import { computeElosIncludingKnockouts } from "../../lib/simulate";
import { TEAMS, TEAM_CONFEDERATION, CONFEDERATION_OFFSETS, type Confederation } from "../../lib/teams";
import { getTeamKnockoutStatus } from "../../lib/bracketTree";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./RankingsView.module.css";

type SortKey = "elo" | "delta" | "offset" | "name";

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
}

export function RankingsView({ stored }: { stored: StoredResults }) {
  const [sortKey, setSortKey] = useState<SortKey>("elo");
  const [confFilter, setConfFilter] = useState<Confederation | "all">("all");
  const [hideEliminated, setHideEliminated] = useState(false);

  const rows = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    const elos = computeElosIncludingKnockouts(playedMatches, stored, DEFAULT_SETTINGS);

    const result: RankingRow[] = TEAMS.map((t) => {
      const confederation = TEAM_CONFEDERATION[t.code] ?? "UEFA";
      const status = getTeamKnockoutStatus(t.code, stored);
      const currentElo = elos[t.code] ?? t.initialElo;
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
      };
    });

    return result;
  }, [stored]);

  const filtered = rows
    .filter((r) => confFilter === "all" || r.confederation === confFilter)
    .filter((r) => !hideEliminated || !r.eliminated);

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

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · Power Rankings</div>
        <h1>Rankings</h1>
        <p className={s.dek}>
          All 48 teams ranked by real Elo rating, not FIFA's official ranking — this reflects
          current form and results, including how the model weighs each confederation's real
          strength differently from a simple points table.
        </p>
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
      </div>

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
              <span className={s.teamName}>{row.name}</span>
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
    </div>
  );
}