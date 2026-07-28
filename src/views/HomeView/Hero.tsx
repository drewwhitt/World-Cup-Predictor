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

  // Pre-tournament rank by baseline title odds — separate from powerRank
  // below (which is post-tournament Elo rank). This is what lets the
  // completed-tournament headline say something meaningful about whether
  // the model's preseason pick actually came through.
  const baselineRank = useMemo(() => {
    const ranked = [...teams].sort((a, b) => b.baseline - a.baseline);
    return ranked.findIndex((t) => t.code === favorite.code) + 1;
  }, [teams, favorite.code]);

  let heroTitle: string;
  let heroSub: string;
  if (favorite.isChampion) {
    heroTitle = `${favorite.name} Wins the World Cup`;
    heroSub = baselineRank === 1
      ? `Veridex had ${favorite.name} at ${favorite.baseline.toFixed(1)}% to win it all before a ball was kicked — the model's preseason favorite came through.`
      : `Veridex had ${favorite.name} at ${favorite.baseline.toFixed(1)}% to win it all before a ball was kicked, the ${ordinal(baselineRank)} favorite in the field — not the pick, but well within reach.`;
  } else {
    heroTitle = `${favorite.name} Leads World Cup Forecast After Latest Results`;
    heroSub = `The Veridex model ran ${playedCount > 0 ? "10,000" : "pre-tournament"} simulations using every real result recorded so far and now rates ${favorite.name} the tournament's most likely champion.`;
  }

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

  const statLine = [
    `${favorite.current.toFixed(1)}% championship odds (${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)} pp)`,
    `${ordinal(powerRank)} by Elo power ranking`,
    `${favorite.rating.toFixed(1)} power rating`,
    `${confidence}/100 model confidence`,
  ];

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <section className={s.hero}>
      <div className={s.kicker}>{today}</div>
      <h1>{heroTitle}</h1>
      <p>{heroSub}</p>
      <div className={s.byline}>
        <span>VERIDEX Analytics Desk</span>
        <em />
        {favorite.isChampion ? "Final" : "Live model"}
      </div>
      <div className={s.statLine}>
        {statLine.map((stat, i) => (
          <span key={stat}>
            {i > 0 && <span className={s.dot} />}
            {stat}
          </span>
        ))}
      </div>
    </section>
  );
}