import type { MorningForecast as MorningForecastData } from "../../data/worldCup";
import s from "./TournamentMovers.module.css";

type Props = { forecast: MorningForecastData };

/**
 * Sits next to the Confidence Alert on Home. Deliberately reuses the same
 * baseline-vs-current riser/faller numbers already computed for Today's
 * Briefing rather than the day-over-day DailyMovers snapshot system —
 * once the tournament is over, daily snapshots stop moving entirely, so
 * that widget would show "not enough history yet" forever. A
 * baseline-to-final comparison stays meaningful before, during, and
 * after the tournament.
 */
export function TournamentMovers({ forecast: mf }: Props) {
  return (
    <section className={s.panel}>
      <div className={s.header}>
        <h2>Biggest Movers</h2>
        <span>Since pre-tournament baseline</span>
      </div>
      <div className={s.list}>
        <div className={s.row}>
          <span className={s.arrow}>▲</span>
          <span className={s.teamName}>{mf.riser}</span>
          <span className={`${s.delta} ${s.up}`}>{mf.riserVal}</span>
          <span className={s.reason}>{mf.riserNote}</span>
        </div>
        <div className={s.row}>
          <span className={s.arrow}>▼</span>
          <span className={s.teamName}>{mf.faller}</span>
          <span className={`${s.delta} ${s.down}`}>{mf.fallerVal}</span>
          <span className={s.reason}>{mf.fallerNote}</span>
        </div>
      </div>
    </section>
  );
}