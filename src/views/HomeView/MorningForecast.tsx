import type { MorningForecast as MorningForecastData } from "../../data/worldCup";
import s from "./MorningForecast.module.css";

type Props = {
  forecast: MorningForecastData;
};

export function MorningForecast({ forecast: mf }: Props) {
  return (
    <section className={s.panel}>
      <header className={s.header}>
        <div>
          <span>The Morning Forecast</span>
          <em>Daily Briefing</em>
        </div>
        <time>June 24 · 6:45 AM</time>
      </header>
      <div className={s.grid}>
        <div className={s.cell}>
          <div className={s.pos}>▲ Biggest Riser</div>
          <strong>{mf.riser}</strong>
          <p className={s.pos}>{mf.riserVal} <span>{mf.riserNote}</span></p>
        </div>
        <div className={s.cell}>
          <div className={s.neg}>▼ Biggest Faller</div>
          <strong>{mf.faller}</strong>
          <p className={s.neg}>{mf.fallerVal} <span>{mf.fallerNote}</span></p>
        </div>
        <div className={s.cell}>
          <div>◆ Most Important Match</div>
          <strong>{mf.matchName}</strong>
          <p>{mf.matchNote}</p>
        </div>
        <div className={s.cell}>
          <div>★ Most Likely Champion</div>
          <strong>{mf.champ} <span className={s.inlinePos}>{mf.champVal}</span></strong>
          <p>{mf.champNote}</p>
        </div>
        <div className={s.cell}>
          <div>⚠ Biggest Upset Risk</div>
          <strong>{mf.upset} <span className={s.inlineNeg}>{mf.upsetVal}</span></strong>
          <p>{mf.upsetNote}</p>
        </div>
        <div className={s.cell}>
          <div>◉ Key Model Insight</div>
          <p className={s.insight}>{mf.insight}</p>
        </div>
      </div>
    </section>
  );
}
