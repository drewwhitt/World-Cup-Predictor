import { contenderRows, type Team } from "../../data/worldCup";
import s from "./QuickStrip.module.css";

type Props = {
  teams: Team[];
  onNavigate?: () => void;
};

export function QuickStrip({ teams, onNavigate }: Props) {
  const rows = contenderRows(teams);
  const champion = rows.find((t) => t.isChampion);
  // Once a champion exists, every other team's current title odds are
  // genuinely 0% (real, not a bug) — padding out to 5 cells just surfaces
  // an arbitrary tie-break order among 0%s instead of anything meaningful.
  const displayRows = champion ? [champion] : rows.slice(0, 5);

  return (
    <section className={s.wrap}>
      <div className={s.strip}>
        <div className={s.cap}>
          <div>{champion ? "Tournament" : "Top Championship"}</div>
          <strong>{champion ? "Complete" : "Probabilities"}</strong>
        </div>
        {displayRows.map((team) => (
          <div className={s.cell} key={team.code}>
            <div>{team.name}</div>
            <strong>{team.currentStr}</strong>
          </div>
        ))}
      </div>
      {onNavigate && (
        <button type="button" className={s.rankingsLink} onClick={onNavigate}>
          See full rankings →
        </button>
      )}
    </section>
  );
}