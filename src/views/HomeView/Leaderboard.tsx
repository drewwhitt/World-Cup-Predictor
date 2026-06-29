import { DeltaPill } from "../../components/common/DeltaPill";
import { contenderRows, type Team } from "../../data/worldCup";
import s from "./Leaderboard.module.css";

type Props = {
  teams: Team[];
};

export function Leaderboard({ teams }: Props) {
  const rows = contenderRows(teams);

  return (
    <section className={s.card}>
      <header className={s.header}>
        <div className={s.eyebrow}>Championship Probability</div>
        <div className={s.titleRow}>
          <h2>All 16 contenders</h2>
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
        {rows.map((team) => (
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
      </div>
    </section>
  );
}
