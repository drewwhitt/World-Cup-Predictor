import type { TabId } from "../../data/worldCup";
import s from "./NflSubNav.module.css";

type NflTab = "nflHome" | "nflSchedule" | "nflRankings" | "nflForecasts";

type Props = {
  active: NflTab;
  onNavigate: (tab: TabId) => void;
};

const ITEMS: Array<{ id: NflTab; label: string }> = [
  { id: "nflHome", label: "Home" },
  { id: "nflSchedule", label: "Schedule" },
  { id: "nflRankings", label: "Rankings" },
  { id: "nflForecasts", label: "Forecasts" },
];

export function NflSubNav({ active, onNavigate }: Props) {
  return (
    <nav className={s.subNav} aria-label="NFL sections">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={active === item.id ? s.active : undefined}
          onClick={() => onNavigate(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}