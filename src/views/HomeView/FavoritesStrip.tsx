import { useFavorites } from "../../lib/favorites";
import { FavoriteStar } from "../../components/favorites/FavoriteStar";
import type { Team } from "../../data/worldCup";
import type { TeamCode } from "../../lib/types";
import s from "./FavoritesStrip.module.css";

export function FavoritesStrip({ teams }: { teams: Team[] }) {
  const favorites = useFavorites();
  const favoriteTeams = teams.filter((t) => favorites.has(t.code as TeamCode));

  if (favoriteTeams.length === 0) return null;

  return (
    <section className={s.strip}>
      <div className={s.header}>Your Teams</div>
      <div className={s.list}>
        {favoriteTeams.map((t) => (
          <div className={s.card} key={t.code}>
            <FavoriteStar code={t.code as TeamCode} size="sm" />
            <span className={s.name}>{t.name}</span>
            <span className={s.pct}>{t.current.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}