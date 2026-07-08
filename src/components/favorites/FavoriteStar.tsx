import { useFavorites, toggleFavorite } from "../../lib/favorites";
import type { TeamCode } from "../../lib/types";
import s from "./FavoriteStar.module.css";

export function FavoriteStar({ code, size = "md" }: { code: TeamCode; size?: "sm" | "md" }) {
  const favorites = useFavorites();
  const active = favorites.has(code);

  return (
    <button
      type="button"
      className={[s.star, active ? s.active : "", size === "sm" ? s.sm : ""].join(" ")}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(code);
      }}
      aria-label={active ? `Remove ${code} from favorites` : `Add ${code} to favorites`}
      aria-pressed={active}
      title={active ? "Remove from favorites" : "Add to favorites"}
    >
      {active ? "★" : "☆"}
    </button>
  );
}