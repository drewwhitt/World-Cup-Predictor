import { useEffect, useRef, useState } from "react";
import { SPORTS_NAV, type SportNavConfig, type TabId } from "../../data/worldCup";
import s from "./MegaNav.module.css";

type Props = {
  activeTab: TabId;
  onNavigate?: (tab: TabId) => void;
};

export function MegaNav({ activeTab, onNavigate }: Props) {
  const [openSport, setOpenSport] = useState<string | null>(null);
  const rootRef = useRef<HTMLElement>(null);

  // Closes the open dropdown on any click outside the nav — needed
  // because the dropdown can be opened by a tap (see handleSportClick),
  // not just hover, so it needs an explicit close path on touch devices
  // where there's no "mouse leave" to fall back on.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenSport(null);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  function handleSportClick(e: React.MouseEvent, label: string, landingTab?: TabId) {
    // First activation (no prior hover — i.e. touch) opens the dropdown
    // instead of navigating immediately, so a tap can reveal the
    // sub-items rather than jumping straight to a landing tab blind. On
    // desktop, onMouseEnter already set openSport before the click
    // lands, so this branch is skipped and it navigates right away.
    if (openSport !== label) {
      e.preventDefault();
      setOpenSport(label);
      return;
    }
    if (landingTab) {
      onNavigate?.(landingTab);
      setOpenSport(null);
    } else {
      // Pure category (e.g. Soccer) with no landing page of its own —
      // second click just closes what the first click opened.
      setOpenSport(null);
    }
  }

  function isSportActive(config: SportNavConfig): boolean {
    if (config.items?.some((item) => item.id === activeTab)) return true;
    return Boolean(config.leagues?.some((league) => league.items?.some((item) => item.id === activeTab)));
  }

  return (
    <nav className={s.nav} aria-label="Primary" ref={rootRef}>
      <button
        type="button"
        className={activeTab === "home" ? s.active : undefined}
        onClick={() => onNavigate?.("home")}
      >
        Home
      </button>

      {SPORTS_NAV.map((sport) => {
        const hasDropdown = Boolean(sport.items?.length || sport.leagues?.length);
        const active = isSportActive(sport);
        const isOpen = openSport === sport.label;

        if (!hasDropdown) {
          return (
            <span key={sport.label} className={s.disabled} title={`${sport.label} — coming soon`}>
              {sport.label}
            </span>
          );
        }

        return (
          <div
            key={sport.label}
            className={s.item}
            onMouseEnter={() => setOpenSport(sport.label)}
            onMouseLeave={() => setOpenSport((cur) => (cur === sport.label ? null : cur))}
          >
            <button
              type="button"
              className={active ? s.active : undefined}
              onClick={(e) => handleSportClick(e, sport.label, sport.landingTab)}
              aria-expanded={isOpen}
            >
              {sport.label}
            </button>
            {isOpen && (
              <div className={s.dropdown} role="menu">
                <div className={s.dropdownInner}>
                {sport.items?.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={item.id === activeTab ? s.dropdownActive : undefined}
                    onClick={() => {
                      onNavigate?.(item.id);
                      setOpenSport(null);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
                {sport.leagues?.map((league) => (
                  <div className={s.leagueGroup} key={league.label}>
                    <div className={league.items?.some((i) => i.id === activeTab) ? s.leagueHeaderActive : s.leagueHeader}>
                      {league.label}
                    </div>
                    {league.items ? (
                      league.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="menuitem"
                          className={item.id === activeTab ? `${s.leagueItem} ${s.dropdownActive}` : s.leagueItem}
                          onClick={() => {
                            onNavigate?.(item.id);
                            setOpenSport(null);
                          }}
                        >
                          {item.label}
                        </button>
                      ))
                    ) : (
                      <div className={s.leagueSoon}>Coming soon</div>
                    )}
                  </div>
                ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <a href="/insights/" className={s.insights}>
        Insights
      </a>
    </nav>
  );
}