import { sports, type TabId } from "../../data/worldCup";
import s from "./SportSelector.module.css";

type Props = {
  activeTab: TabId;
  onSelect?: (tab: TabId) => void;
};

// Only these two sports have real routes so far — everything else in
// `sports` stays a "coming soon" label until it has actual data behind it.
const SPORT_TABS: Record<string, TabId> = {
  "World Cup": "home",
  NFL: "nflHome",
};

export function SportSelector({ activeTab, onSelect }: Props) {
  const activeSport = activeTab.startsWith("nfl") ? "NFL" : "World Cup";

  return (
    <div className={s.sports} aria-label="Sports">
      {sports.map((sport) => {
        const targetTab = SPORT_TABS[sport];
        const isActive = sport === activeSport;

        if (!targetTab) {
          return (
            <span key={sport} className={s.inactive} title={`${sport} — coming soon`}>
              {sport}
            </span>
          );
        }

        return (
          <button
            key={sport}
            type="button"
            className={isActive ? s.active : s.selectable}
            onClick={() => onSelect?.(targetTab)}
          >
            {sport}
          </button>
        );
      })}
    </div>
  );
}