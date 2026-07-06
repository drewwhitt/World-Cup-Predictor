import { useEffect, useMemo, useState, Suspense, lazy } from "react";
import { AdminResultsPanel } from "./components/admin/AdminResultsPanel";
import { AppShell } from "./components/shell/AppShell";
import type { Edition, TabId } from "./data/worldCup";
import seedResults from "./data/results.json";
import {
  buildLiveBreakingText,
  buildLiveHeadlines,
  buildLiveMorningForecast,
  buildLiveTeams,
} from "./data/veridexLive";
import { loadOfficialResults } from "./lib/supabase";
import type { StoredResults } from "./lib/types";
import { HomeView } from "./views/HomeView/HomeView";
import { ComingSoonView } from "./views/ComingSoonView/ComingSoonView";

// Lazy-loaded — Home is the default landing tab and stays in the main
// bundle so it appears instantly, but nobody needs Bracket's SVG/canvas
// code, Forecasts' driver logic, What-If's whole simulator, or Rankings
// until they actually click that tab. Splits one 539KB bundle into
// pieces fetched on demand instead of all upfront, which matters more on
// a phone on cellular than on wifi during development.
const BracketView = lazy(() => import("./views/BracketView/BracketView").then((m) => ({ default: m.BracketView })));
const ForecastsView = lazy(() => import("./views/ForecastsView/ForecastsView").then((m) => ({ default: m.ForecastsView })));
const WhatIfView = lazy(() => import("./views/WhatIfView/WhatIfView").then((m) => ({ default: m.WhatIfView })));
const RankingsView = lazy(() => import("./views/RankingsView/RankingsView").then((m) => ({ default: m.RankingsView })));

function TabLoading() {
  return <div style={{ padding: "60px 0", textAlign: "center", color: "var(--ink-3)" }}>Loading…</div>;
}

const edition: Edition = "wire";
const STORAGE_KEY = "worldcup-predictor-results";
const VALID_TABS: TabId[] = ["home", "forecasts", "rankings", "bracket", "match", "sim", "lab"];

function getTabFromHash(): TabId {
  const hash = window.location.hash.slice(1) as TabId;
  return VALID_TABS.includes(hash) ? hash : "home";
}

/**
 * Guarantees matches/knockoutMatches are always at least {} — never
 * missing or null. Without this, stale localStorage from before a schema
 * change (or any unexpected shape) crashes immediately on load: several
 * places do `stored.matches[id]` directly, which throws if `matches`
 * itself is undefined or null, before anything can even render. Fixing
 * it once here is far more reliable than trying to defensively guard
 * every individual call site that reads from `stored`.
 */
function normalizeStoredResults(raw: unknown): StoredResults {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Partial<StoredResults>;
  return {
    matches: obj.matches && typeof obj.matches === "object" ? obj.matches : {},
    knockoutMatches: obj.knockoutMatches && typeof obj.knockoutMatches === "object" ? obj.knockoutMatches : {},
  };
}

function loadLocalResults(): StoredResults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalizeStoredResults(JSON.parse(raw));
  } catch { /* use seed */ }
  return normalizeStoredResults(seedResults);
}

export default function App() {
  const [stored, setStored] = useState<StoredResults>(loadLocalResults);
  const [activeTab, setActiveTab] = useState<TabId>(getTabFromHash);

  // Real browser history integration — without this, switching tabs never
  // touches the URL or history stack at all, so the phone's back button has
  // nothing of ours to go back TO and falls through to wherever the user
  // was before opening the app (Google, a text message, etc.) instead of
  // the previous tab. changeTab() pushes a real history entry per tab
  // switch; the popstate listener below syncs state back when the user
  // actually presses back/forward, without pushing another entry itself
  // (that would create an infinite back-forward loop).
  function changeTab(tab: TabId) {
    if (tab === activeTab) return;
    window.history.pushState({ tab }, "", `#${tab}`);
    setActiveTab(tab);
  }

  useEffect(() => {
    function handlePopState() {
      setActiveTab(getTabFromHash());
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // If the app loads with no hash yet (first visit), replace (not push) so
  // there isn't an extra back-stop before "home" — an actual tab switch is
  // what should create the first real history entry, not the initial load.
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState({ tab: "home" }, "", "#home");
    }
  }, []);

  useEffect(() => {
    let active = true;
    loadOfficialResults()
      .then((results) => {
        if (!active) return;
        const normalized = normalizeStoredResults(results);
        setStored(normalized);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      })
      .catch((err) => console.error("Failed to load official results", err));
    return () => { active = false; };
  }, []);

  const liveTeams     = useMemo(() => buildLiveTeams(stored), [stored]);
  const liveMorning   = useMemo(() => buildLiveMorningForecast(liveTeams, stored), [liveTeams, stored]);
  const liveHeadlines = useMemo(() => buildLiveHeadlines(liveTeams, stored), [liveTeams, stored]);
  const liveBreaking  = useMemo(() => buildLiveBreakingText(liveTeams, stored), [liveTeams, stored]);
  const playedCount   = Object.keys(stored.matches).length;
  const isAdmin       = new URLSearchParams(window.location.search).get("admin") === "true";

  function renderContent() {
    switch (activeTab) {
      case "forecasts":
        return <ForecastsView stored={stored} teams={liveTeams} />;
      case "bracket":
        return <BracketView stored={stored} />;
      case "rankings":
        return <RankingsView stored={stored} />;
      case "match":
        return <ComingSoonView title="Match Center" onNavigate={changeTab} />;
      case "sim":
        return <WhatIfView stored={stored} />;
      case "lab":
        return <ComingSoonView title="Model Lab" onNavigate={changeTab} />;
      case "home":
      default:
        return (
          <HomeView
            teams={liveTeams}
            morning={liveMorning}
            headlines={liveHeadlines}
            playedCount={playedCount}
            stored={stored}
            onNavigateToRankings={() => changeTab("rankings")}
          />
        );
    }
  }

  return (
    <>
      <AppShell
        activeTab={activeTab}
        edition={edition}
        breakingText={liveBreaking}
        onTabChange={changeTab}
      >
        <Suspense fallback={<TabLoading />}>{renderContent()}</Suspense>
      </AppShell>
      {isAdmin && <AdminResultsPanel stored={stored} onChange={setStored} />}
    </>
  );
}