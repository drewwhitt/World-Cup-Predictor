import type { Team } from "../../data/worldCup";
import s from "./Hero.module.css";

type Props = {
  teams: Team[];
  playedCount: number;
};

export function Hero({ teams, playedCount }: Props) {
  const favorite = [...teams].sort((a, b) => b.current - a.current)[0];
  const delta = Number((favorite.current - favorite.baseline).toFixed(1));
  const confidence = Math.round(Math.min(96, Math.max(62, 76 + favorite.current / 2)));
  const heroTitle = `${favorite.name} Leads World Cup Forecast After Latest Results`;
  const heroSub = `The Veridex model ran ${playedCount > 0 ? "10,000" : "pre-tournament"} simulations using your manually entered results and now rates ${favorite.name} the tournament's most likely champion.`;
  const metrics = [
    { label: "Championship Odds", value: `${favorite.current.toFixed(1)}%`, delta: `${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)} pp` },
    { label: "Power Ranking", value: "#1", delta: "current leader" },
    { label: "Power Rating", value: favorite.rating.toFixed(1), delta: "Elo blended" },
    { label: "Confidence", value: String(confidence), suffix: "/100", delta: `${playedCount} results` },
  ];

  return (
    <section className={s.hero}>
      <div className={s.overlay} />
      <div className={s.photoLabel}>[ Editorial photo - Brazil celebrate vs Serbia ]</div>
      <div className={s.content}>
        <div className={s.kicker}>World Cup · Championship Forecast</div>
        <h1>{heroTitle}</h1>
        <p>{heroSub}</p>
        <div className={s.byline}>
          <span />
          VERIDEX Analytics Desk · {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · Live model
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