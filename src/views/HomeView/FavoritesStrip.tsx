import { useEffect, useState } from "react";
import { useFavorites } from "../../lib/favorites";
import { FavoriteStar } from "../../components/favorites/FavoriteStar";
import { getMoversForSport, type Mover } from "../../lib/snapshots";
import type { Team } from "../../data/worldCup";
import type { TeamCode } from "../../lib/types";
import s from "./FavoritesStrip.module.css";

export function FavoritesStrip({ teams, teamNames }: { teams: Team[]; teamNames: Record<string, string> }) {
  const favorites = useFavorites();
  const favoriteTeams = teams.filter((t) => favorites.has(t.code as TeamCode));

  // Reuses the same daily snapshot system that powers the home page's
  // "Today's Movers" panel — just filtered down to favorited teams after
  // the fact, so this adds no new computation or Supabase load beyond
  // what that panel already does.
  const [movers, setMovers] = useState<Mover[] | null>(null);
  useEffect(() => {
    if (favoriteTeams.length === 0) return;
    let active = true;
    getMoversForSport("world_cup", teamNames, "champion_pct", 48)
      .then((all) => { if (active) setMovers(all); })
      .catch(() => { if (active) setMovers([]); });
    return () => { active = false; };
    // Only re-fetch when the set of favorited codes actually changes, not
    // on every teams/probabilities recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Array.from(favorites).sort().join(",")]);

  if (favoriteTeams.length === 0) return null;

  const favoriteCodes = new Set(favoriteTeams.map((t) => t.code));
  const favoriteMovers = (movers ?? []).filter((m) => favoriteCodes.has(m.teamCode));

  return (
    <section className={s.strip}>
      <div className={s.header}>Your Teams</div>
      <div className={s.list}>
        {favoriteTeams.map((t) => {
          const mover = favoriteMovers.find((m) => m.teamCode === t.code);
          const isRisk = t.advancingProb !== null && t.advancingProb < 0.5;
          return (
            <div className={[s.card, t.eliminated ? s.eliminated : ""].join(" ")} key={t.code}>
              <div className={s.cardTop}>
                <FavoriteStar code={t.code as TeamCode} size="sm" />
                <span className={s.name}>{t.name}</span>
                <span className={s.pct}>{t.eliminated ? "0.0%" : `${t.current.toFixed(1)}%`}</span>
              </div>

              {t.isChampion && <div className={s.status}>🏆 Champions</div>}

              {t.eliminated && !t.isChampion && (
                <div className={s.status}>Eliminated</div>
              )}

              {!t.eliminated && !t.isChampion && t.nextOpponentName && t.advancingProb !== null && (
                <div className={[s.status, isRisk ? s.risk : s.favored].join(" ")}>
                  vs {t.nextOpponentName} · {Math.round(t.advancingProb * 100)}% to advance
                </div>
              )}

              {mover && Math.abs(mover.delta) >= 0.5 && (
                <div className={mover.delta >= 0 ? s.moverUp : s.moverDown}>
                  {mover.delta >= 0 ? "↑" : "↓"} {Math.abs(mover.delta).toFixed(1)} pp since last update
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}