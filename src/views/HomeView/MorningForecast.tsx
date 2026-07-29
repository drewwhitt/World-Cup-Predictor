import type { MorningForecast as MorningForecastData } from "../../data/worldCup";
import s from "./MorningForecast.module.css";

type Props = {
  forecast: MorningForecastData;
  /** YYYY-MM-DD this briefing was actually published for — shown as-is
   *  (not "today") so a stale/not-yet-published day reads honestly
   *  rather than implying it's current when it isn't. */
  date: string;
};

export function MorningForecast({ forecast: mf, date }: Props) {
  // Parse as local calendar date, not UTC midnight — `new Date(dateString)`
  // for a bare YYYY-MM-DD parses as UTC, which can display as the
  // previous day in any timezone behind UTC.
  const [year, month, day] = date.split("-").map(Number);
  const formattedDate = new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric" });

  return (
    <section className={s.panel}>
      <header className={s.header}>
        <div>
          <span>Today's Briefing</span>
          <em>Updated daily</em>
        </div>
        <time>{formattedDate}</time>
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
          <div>★ {mf.isComplete ? "Champion" : "Most Likely Champion"}</div>
          <strong>{mf.champ} <span className={s.inlinePos}>{mf.champVal}</span></strong>
          <p>{mf.champNote}</p>
        </div>
        <div className={s.cell}>
          <div>⚠ {mf.isComplete ? "Biggest Upset" : "Biggest Upset Risk"}</div>
          <strong>{mf.upset} <span className={s.inlineNeg}>{mf.upsetVal}</span></strong>
          <p>{mf.upsetNote}</p>
        </div>
        <div className={s.cell}>
          <div>◉ {mf.isComplete ? "Final Accuracy" : "Key Model Insight"}</div>
          <p className={s.insight}>{mf.insight}</p>
        </div>
      </div>
    </section>
  );
}