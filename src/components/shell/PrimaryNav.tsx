import { navItems, nflNavItems, type TabId } from "../../data/worldCup";
import s from "./PrimaryNav.module.css";

type Props = {
  activeTab: TabId;
  onTabChange?: (tab: TabId) => void;
};

export function PrimaryNav({ activeTab, onTabChange }: Props) {
  const items = activeTab.startsWith("nfl") ? nflNavItems : navItems;

  return (
    <nav className={s.nav} aria-label="Primary">
      {items.map((item) =>
        item.href ? (
          <a key={item.id} href={item.href}>
            {item.label}
          </a>
        ) : (
          <button
            key={item.id}
            type="button"
            className={item.id === activeTab ? s.active : undefined}
            onClick={() => onTabChange?.(item.id)}
          >
            {item.label}
          </button>
        ),
      )}
    </nav>
  );
}