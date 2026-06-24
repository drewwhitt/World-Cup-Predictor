import { contenderRows } from "../../data/worldCup";
import s from "./QuickStrip.module.css";

export function QuickStrip() {
  const topFive = contenderRows().slice(0, 5);

  return (
    <section className={s.strip}>
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
    </section>
  );
}
