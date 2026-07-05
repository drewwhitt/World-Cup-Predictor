import { contenderRows, type Team } from "../../data/worldCup";
import s from "./QuickStrip.module.css";

type Props = {
  teams: Team[];
  onNavigate?: () => void;
};

export function QuickStrip({ teams, onNavigate }: Props) {
  const topFive = contenderRows(teams).slice(0, 5);

  return (
    <section className={s.wrap}>
      <div className={s.strip}>
        <div className={s.cap}>
          <div>Top Championship</div>
          <strong>Probabilities</strong>
        </div>
        {topFive.map((team) => (
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