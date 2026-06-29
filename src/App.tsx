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

const activeTab: TabId = "home";
const edition: Edition = "wire";
const STORAGE_KEY = "worldcup-predictor-results";

function loadLocalResults(): StoredResults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredResults;
  } catch {
    /* use seed */
  }
  return seedResults as StoredResults;
}

export default function App() {
  const [stored, setStored] = useState<StoredResults>(loadLocalResults);

  useEffect(() => {
    let active = true;
    loadOfficialResults()
      .then((results) => {
        if (!active) return;
        setStored(results);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
      })
      .catch((error) => {
        console.error("Failed to load official results", error);
      });
    return () => { active = false; };
  }, []);

  const liveTeams    = useMemo(() => buildLiveTeams(stored), [stored]);
  const liveMorning  = useMemo(() => buildLiveMorningForecast(liveTeams), [liveTeams]);
  const liveHeadlines = useMemo(() => buildLiveHeadlines(liveTeams, stored), [liveTeams, stored]);
  const liveBreaking = useMemo(() => buildLiveBreakingText(liveTeams, stored), [liveTeams, stored]);
  const playedCount  = Object.keys(stored.matches).length;
  const isAdmin      = new URLSearchParams(window.location.search).get("admin") === "true";

  return (
    <>
      <AppShell activeTab={activeTab} edition={edition} breakingText={liveBreaking}>
        <HomeView
          teams={liveTeams}
          morning={liveMorning}
          headlines={liveHeadlines}
          playedCount={playedCount}
        />
      </AppShell>
      {isAdmin && <AdminResultsPanel stored={stored} onChange={setStored} />}
    </>
  );
}
