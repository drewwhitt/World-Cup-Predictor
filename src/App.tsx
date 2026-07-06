import { useEffect, useMemo, useState } from "react";
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
import { BracketView } from "./views/BracketView/BracketView";
import { ForecastsView } from "./views/ForecastsView/ForecastsView";
import { ComingSoonView } from "./views/ComingSoonView/ComingSoonView";
import { WhatIfView } from "./views/WhatIfView/WhatIfView";
import { RankingsView } from "./views/RankingsView/RankingsView";

const edition: Edition = "wire";
const STORAGE_KEY = "worldcup-predictor-results";
const VALID_TABS: TabId[] = ["home", "forecasts", "rankings", "bracket", "match", "sim", "lab"];

function getTabFromHash(): TabId {
  const hash = window.location.hash.slice(1) as TabId;
  return VALID_TABS.includes(hash) ? hash : "home";
}

function loadLocalResults(): StoredResults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredResults;
  } catch { /* use seed */ }
  return seedResults as StoredResults;
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
        setStored(results);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
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
        {renderContent()}
      </AppShell>
      {isAdmin && <AdminResultsPanel stored={stored} onChange={setStored} />}
    </>
  );
}