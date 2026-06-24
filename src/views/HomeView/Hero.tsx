import { hero } from "../../data/worldCup";
import s from "./Hero.module.css";

const metrics = [
  { label: "Championship Odds", value: "24.5%", delta: "+1.3 pp" },
  { label: "Power Ranking", value: "#1", delta: "+1" },
  { label: "Power Rating", value: "92.4", delta: "+0.8" },
  { label: "Confidence", value: "88", suffix: "/100", delta: "+4" },
];

export function Hero() {
  return (
    <section className={s.hero}>
      <div className={s.overlay} />
      <div className={s.photoLabel}>[ Editorial photo - Brazil celebrate vs Serbia ]</div>
      <div className={s.content}>
        <div className={s.kicker}>World Cup · Championship Forecast</div>
        <h1>{hero.title}</h1>
        <p>{hero.sub}</p>
        <div className={s.byline}>
          <span />
          {hero.byline}
        </div>
        <div className={s.metrics}>
          {metrics.map((metric) => (
            <div className={s.metricCard} key={metric.label}>
              <div className={s.metricLabel}>{metric.label}</div>
              <div className={s.metricValue}>
                {metric.value}
                {metric.suffix && <span>{metric.suffix}</span>}
              </div>
              <div className={s.metricDelta}>↗ {metric.delta}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
