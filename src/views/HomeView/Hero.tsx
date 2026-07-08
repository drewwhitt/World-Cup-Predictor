import { useMemo } from "react";
import type { Team } from "../../data/worldCup";
import { computeElosIncludingKnockouts } from "../../lib/simulate";
import { GROUP_MATCHES, DEFAULT_SETTINGS } from "../../data";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./Hero.module.css";

type Props = {
  teams: Team[];
  playedCount: number;
  stored?: StoredResults;
};

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]);
}

export function Hero({ teams, playedCount, stored }: Props) {
  const favorite = [...teams].sort((a, b) => b.current - a.current)[0];
  const delta = Number((favorite.current - favorite.baseline).toFixed(1));
  const confidence = Math.round(Math.min(96, Math.max(62, 76 + favorite.current / 2)));
  const heroTitle = `${favorite.name} Leads World Cup Forecast After Latest Results`;
  const heroSub = `The Veridex model ran ${playedCount > 0 ? "10,000" : "pre-tournament"} simulations using every real result recorded so far and now rates ${favorite.name} the tournament's most likely champion.`;

  // Real Elo-based rank, not the team with the highest championship % — those
  // aren't the same thing (bracket path difficulty differs from raw strength).
  const powerRank = useMemo(() => {
    if (!stored) return 1;
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    const elos = computeElosIncludingKnockouts(playedMatches, stored, DEFAULT_SETTINGS);
    const ranked = [...teams].sort((a, b) => (elos[b.code as TeamCode] ?? 1500) - (elos[a.code as TeamCode] ?? 1500));
    return ranked.findIndex((t) => t.code === favorite.code) + 1;
  }, [teams, stored, favorite.code]);

  const metrics = [
    { label: "Championship Odds", value: `${favorite.current.toFixed(1)}%`, delta: `${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)} pp` },
    { label: "Power Ranking", value: ordinal(powerRank), delta: "by Elo" },
    { label: "Power Rating", value: favorite.rating.toFixed(1), delta: "Elo blended" },
    { label: "Confidence", value: String(confidence), suffix: "/100", delta: `${playedCount} results` },
  ];

  return (
    <section className={s.hero}>
      <div className={s.overlay} />
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