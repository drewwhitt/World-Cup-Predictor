import { useMemo, useState } from "react";
import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../../data";
import { computeElosIncludingKnockouts } from "../../lib/simulate";
import { TEAMS, TEAM_CONFEDERATION, type Confederation } from "../../lib/teams";
import { getTeamKnockoutStatus } from "../../lib/bracketTree";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./RankingsView.module.css";

interface RankingRow {
  code: TeamCode;
  name: string;
  confederation: Confederation;
  currentElo: number;
  eliminated: boolean;
  eliminatedRound: string | null;
  isChampion: boolean;
}

export function RankingsView({ stored }: { stored: StoredResults }) {
  const [hideEliminated, setHideEliminated] = useState(false);

  const rows = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    const elos = computeElosIncludingKnockouts(playedMatches, stored, DEFAULT_SETTINGS);

    const result: RankingRow[] = TEAMS.map((t) => {
      const status = getTeamKnockoutStatus(t.code, stored);
      return {
        code: t.code,
        name: t.name,
        confederation: TEAM_CONFEDERATION[t.code] ?? "UEFA",
        currentElo: elos[t.code] ?? t.initialElo,
        eliminated: status.eliminated || !status.isRealParticipant,
        eliminatedRound: status.eliminatedRound,
        isChampion: status.isChampion,
      };
    });

    return result.sort((a, b) => b.currentElo - a.currentElo);
  }, [stored]);

  const isComplete = rows.some((r) => r.isChampion);
  const filtered = rows.filter((r) => !hideEliminated || !r.eliminated);

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
        <button
          type="button"
          className={hideEliminated ? s.filterActive : s.filterBtn}
          onClick={() => setHideEliminated((v) => !v)}
        >
          {hideEliminated ? "✓ Hiding eliminated teams" : "Hide eliminated teams"}
        </button>
      </div>

      <ol className={s.list}>
        {filtered.map((row, i) => (
          <li key={row.code} className={row.eliminated ? s.rowEliminated : undefined}>
            <span className={s.rank}>{i + 1}</span>
            <span className={s.team}>{row.name}</span>
            <span className={s.confederation}>{row.confederation}</span>
            <span className={s.rating}>{Math.round(row.currentElo)}</span>
            <span className={s.status}>
              {row.isChampion ? (
                <span className={s.champTag}>Champion</span>
              ) : row.eliminated ? (
                <span className={s.outTag}>Out · {row.eliminatedRound ?? "Group Stage"}</span>
              ) : (
                <span className={s.aliveTag}>{isComplete ? "—" : "Alive"}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}