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

  // Closes the open dropdown on any click outside the nav.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpenSport(null);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Deliberately simple: clicking a sport's label ALWAYS just opens its
  // dropdown (never navigates, never closes it back down) — the only
  // ways it closes are picking an actual item inside it, or tapping
  // outside. This used to ALSO open on mouseenter/mouseleave as a desktop
  // hover convenience, but real Safari/iOS touch devices fire mouse
  // events before a tap's click in an order that's genuinely different
  // from Chrome's (which is all I can test against in this sandbox) —
  // in practice that meant the dropdown could open and close again
  // within the same tap, before it was ever visible. Click/tap is now
  // the ONLY thing that opens or closes it, on every device, so there's
  // no hover-timing race left to get wrong. Costs desktop users one
  // extra click versus hovering; that's a fine trade for "actually works
  // on a phone."
  function openSportMenu(label: string) {
    setOpenSport(label);
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
          <div key={sport.label} className={s.item}>
            <button
              type="button"
              className={active ? s.active : undefined}
              onClick={(e) => {
                e.stopPropagation();
                openSportMenu(sport.label);
              }}
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