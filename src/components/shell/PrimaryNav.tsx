import { navItems, type TabId } from "../../data/worldCup";
import s from "./PrimaryNav.module.css";

type Props = {
  activeTab: TabId;
};

export function PrimaryNav({ activeTab }: Props) {
  return (
    <nav className={s.nav} aria-label="Primary">
      {navItems.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.id === activeTab ? s.active : undefined}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
