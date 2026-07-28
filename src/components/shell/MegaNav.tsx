import { useEffect, useRef, useState } from "react";
import { SPORTS_NAV, type SportNavConfig, type TabId } from "../../data/worldCup";
import s from "./MegaNav.module.css";

type Props = {
  activeTab: TabId;
  onNavigate?: (tab: TabId) => void;
};

export function MegaNav({ activeTab, onNavigate }: Props) {
  const [openSport, setOpenSport] = useState<string | null>(null);
  const [dropdownLeft, setDropdownLeft] = useState<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Closes the open dropdown on any click outside the whole nav+dropdown wrapper.
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
  // outside. This used to also open on mouseenter/mouseleave as a
  // desktop hover convenience, but that raced against real touch
  // devices' own mouse-event synthesis and could open-then-close a
  // dropdown within a single tap before it was ever visible. Click/tap
  // is now the only thing that opens or closes it, on every device.
  function openSportMenu(label: string, buttonEl: HTMLButtonElement) {
    const wrapEl = rootRef.current;
    if (wrapEl) {
      const wrapRect = wrapEl.getBoundingClientRect();
      const buttonRect = buttonEl.getBoundingClientRect();
      const rawLeft = buttonRect.left - wrapRect.left;
      // Clamp so the ~220px-wide panel never runs past the right edge of
      // the viewport, however far right the clicked sport happens to sit
      // (e.g. Soccer/Formula 1 at the end of a scrolled mobile nav row).
      const maxLeft = wrapEl.clientWidth - 220;
      setDropdownLeft(Math.max(0, Math.min(rawLeft, Math.max(0, maxLeft))));
    }
    setOpenSport(label);
  }

  function isSportActive(config: SportNavConfig): boolean {
    if (config.items?.some((item) => item.id === activeTab)) return true;
    return Boolean(config.leagues?.some((league) => league.items?.some((item) => item.id === activeTab)));
  }

  // The dropdown is rendered once, as a sibling of the scrollable button
  // row rather than nested inside each button — nesting it inside the
  // scrolling row meant it inherited that row's overflow clipping (so it
  // got cut off) and its position depended on wherever the triggering
  // button happened to be scrolled to (so it could run off past the
  // right edge). A single panel below the whole bar sidesteps both.
  const openConfig = SPORTS_NAV.find((sport) => sport.label === openSport);

  return (
    <div className={s.wrap} ref={rootRef}>
      <nav className={s.nav} aria-label="Primary">
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

          if (!hasDropdown) {
            return (
              <span key={sport.label} className={s.disabled} title={`${sport.label} — coming soon`}>
                {sport.label}
              </span>
            );
          }

          return (
            <button
              key={sport.label}
              type="button"
              className={active ? s.active : undefined}
              onClick={(e) => {
                e.stopPropagation();
                openSportMenu(sport.label, e.currentTarget);
              }}
              aria-expanded={openSport === sport.label}
            >
              {sport.label}
            </button>
          );
        })}

        <a href="/insights/" className={s.insights}>
          Insights
        </a>
      </nav>

      {openConfig && (
        <div className={s.dropdown} role="menu" style={{ left: dropdownLeft }}>
          <div className={s.dropdownInner}>
            {openConfig.items?.map((item) => (
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
            {openConfig.leagues?.map((league) => (
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
}