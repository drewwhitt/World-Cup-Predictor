import type { TabId } from "../../data/worldCup";
import s from "./NflSubNav.module.css";

type Props = {
  active: "nflHome" | "nflSchedule";
  onNavigate: (tab: TabId) => void;
};

export function NflSubNav({ active, onNavigate }: Props) {
  return (
    <nav className={s.subNav} aria-label="NFL sections">
      <button
        type="button"
        className={active === "nflHome" ? s.active : undefined}
        onClick={() => onNavigate("nflHome")}
      >
        Home
      </button>
      <button
        type="button"
        className={active === "nflSchedule" ? s.active : undefined}
        onClick={() => onNavigate("nflSchedule")}
      >
        Schedule
      </button>
    </nav>
  );
}