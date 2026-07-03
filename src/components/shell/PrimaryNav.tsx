import { navItems, type TabId } from "../../data/worldCup";
import s from "./PrimaryNav.module.css";

type Props = {
  activeTab: TabId;
  onTabChange?: (tab: TabId) => void;
};

export function PrimaryNav({ activeTab, onTabChange }: Props) {
  return (
    <nav className={s.nav} aria-label="Primary">
      {navItems.map((item) =>
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