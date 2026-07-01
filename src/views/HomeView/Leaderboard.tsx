import { useState } from "react";
import { DeltaPill } from "../../components/common/DeltaPill";
import { contenderRows, type Team } from "../../data/worldCup";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./Leaderboard.module.css";

// R32 matchups — same source of truth as BracketView.tsx
const R32_MATCHUPS: Array<{ id: string; home: TeamCode; away: TeamCode }> = [
  { id: "ko-73", home: "GER", away: "PAR" },
  { id: "ko-74", home: "FRA", away: "SWE" },
  { id: "ko-75", home: "RSA", away: "CAN" },
  { id: "ko-76", home: "NED", away: "MAR" },
  { id: "ko-77", home: "POR", away: "CRO" },
  { id: "ko-78", home: "ESP", away: "AUT" },
  { id: "ko-79", home: "USA", away: "BIH" },
  { id: "ko-80", home: "BEL", away: "SEN" },
  { id: "ko-81", home: "BRA", away: "JPN" },
  { id: "ko-82", home: "CIV", away: "NOR" },
  { id: "ko-83", home: "MEX", away: "ECU" },
  { id: "ko-84", home: "ENG", away: "COD" },
  { id: "ko-85", home: "ARG", away: "CPV" },
  { id: "ko-86", home: "AUS", away: "EGY" },
  { id: "ko-87", home: "SUI", away: "ALG" },
  { id: "ko-88", home: "COL", away: "GHA" },
];

function getEliminatedTeams(stored: StoredResults): Set<TeamCode> {
  const eliminated = new Set<TeamCode>();
  for (const m of R32_MATCHUPS) {
    const result = stored.knockoutMatches?.[m.id];
    if (!result) continue;
    if (result.homeGoals > result.awayGoals) {
      eliminated.add(m.away);
    } else if (result.awayGoals > result.homeGoals) {
      eliminated.add(m.home);
    } else if (result.penaltyWinner === "home") {
      eliminated.add(m.away);
    } else if (result.penaltyWinner === "away") {
      eliminated.add(m.home);
    }
  }
  return eliminated;
}

type Props = {
  teams: Team[];
  stored?: StoredResults;
};

export function Leaderboard({ teams, stored }: Props) {
  const [expanded, setExpanded] = useState(false);

  const eliminated = stored ? getEliminatedTeams(stored) : new Set<TeamCode>();
  const rows = contenderRows(teams);

  // Active = still in tournament, eliminated = knocked out
  const activeRows = rows.filter((t) => !eliminated.has(t.code as TeamCode));
  const eliminatedRows = rows.filter((t) => eliminated.has(t.code as TeamCode));

  const topRows = activeRows.slice(0, 8);
  const total = rows.length;
  const activeCount = activeRows.length;

  return (
    <section className={s.card}>
      <header className={s.header}>
        <div className={s.eyebrow}>Championship Probability</div>
        <div className={s.titleRow}>
          <h2>
            {expanded ? `All ${total} teams` : `Top ${Math.min(8, activeCount)} contenders`}
          </h2>
          <span>Sorted by current probability</span>
        </div>
      </header>
      <div className={s.table}>
        <div className={s.tableHead}>
          <span>Rank</span>
          <span>Team</span>
          <span>Group</span>
          <span>Baseline</span>
          <span>Current</span>
          <span>Δ</span>
        </div>

        {/* Active teams — always show top 8, all if expanded */}
        {(expanded ? activeRows : topRows).map((team) => (
          <div className={s.row} key={team.code}>
            <span className={s.rank}>{team.rank}</span>
            <strong>{team.name}</strong>
            <span>{team.group}</span>
            <span>{team.baselineStr}</span>
            <span className={s.current}>
              <i style={{ width: team.barPct }} />
              <b>{team.currentStr}</b>
            </span>
            <DeltaPill value={team.delta} />
          </div>
        ))}

        {/* Eliminated teams — only shown when expanded */}
        {expanded && eliminatedRows.length > 0 && (
          <>
            <div className={s.eliminatedDivider}>Eliminated</div>
            {eliminatedRows.map((team) => (
              <div className={`${s.row} ${s.eliminatedRow}`} key={team.code}>
                <span className={s.rank}>{team.rank}</span>
                <strong>{team.name}</strong>
                <span>{team.group}</span>
                <span>{team.baselineStr}</span>
                <span className={s.current}>
                  <b>{team.currentStr}</b>
                </span>
                <DeltaPill value={team.delta} />
              </div>
            ))}
          </>
        )}
      </div>
      <div className={s.expandRow}>
        <button
          type="button"
          className={s.expandBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? "Show top 8 only ↑"
            : `Show all ${total} teams ↓`}
        </button>
      </div>
    </section>
  );
}