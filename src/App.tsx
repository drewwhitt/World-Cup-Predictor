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

const edition: Edition = "wire";
const STORAGE_KEY = "worldcup-predictor-results";

function loadLocalResults(): StoredResults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredResults;
  } catch { /* use seed */ }
  return seedResults as StoredResults;
}

export default function App() {
  const [stored, setStored] = useState<StoredResults>(loadLocalResults);
  const [activeTab, setActiveTab] = useState<TabId>("home");

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
      case "bracket":
        return <BracketView stored={stored} />;
      case "home":
      default:
        return (
          <HomeView
            teams={liveTeams}
            morning={liveMorning}
            headlines={liveHeadlines}
            playedCount={playedCount}
            stored={stored}
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
        onTabChange={setActiveTab}
      >
        {renderContent()}
      </AppShell>
      {isAdmin && <AdminResultsPanel stored={stored} onChange={setStored} />}
    </>
  );
}