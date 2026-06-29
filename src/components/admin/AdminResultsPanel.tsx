import { useMemo, useState } from "react";
import { GROUP_MATCHES } from "../../data";
import { saveOfficialResult } from "../../lib/supabase";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { StoredResults } from "../../lib/types";
import s from "./AdminResultsPanel.module.css";

type Props = {
  stored: StoredResults;
  onChange: (next: StoredResults) => void;
};

export function AdminResultsPanel({ stored, onChange }: Props) {
  const matches = useMemo(
    () => [...GROUP_MATCHES].sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday),
    [],
  );
  const [selectedMatch, setSelectedMatch] = useState(matches[0]?.id ?? "");
  const saved = stored.matches[selectedMatch];
  const [homeGoals, setHomeGoals] = useState(saved?.homeGoals.toString() ?? "0");
  const [awayGoals, setAwayGoals] = useState(saved?.awayGoals.toString() ?? "0");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const match = matches.find((item) => item.id === selectedMatch);

  function selectMatch(matchId: string) {
    const result = stored.matches[matchId];
    setSelectedMatch(matchId);
    setHomeGoals(result?.homeGoals.toString() ?? "0");
    setAwayGoals(result?.awayGoals.toString() ?? "0");
    setStatus("idle");
  }

  async function saveResult() {
    const home = Number(homeGoals);
    const away = Number(awayGoals);

    if (!match || Number.isNaN(home) || Number.isNaN(away) || home < 0 || away < 0) return;

    const next: StoredResults = {
      matches: {
        ...stored.matches,
        [selectedMatch]: { homeGoals: home, awayGoals: away },
      },
    };

    onChange(next);
    localStorage.setItem("worldcup-predictor-results", JSON.stringify(next));
    setStatus("saving");

    try {
      await saveOfficialResult(selectedMatch, home, away);
      setStatus("saved");
    } catch (error) {
      console.error("Failed to save official result", error);
      setStatus("error");
    }
  }

  return (
    <section className={s.panel}>
      <div className={s.heading}>
        <div>
          <span>Admin Input</span>
          <h2>Record a match result</h2>
        </div>
        <strong>{Object.keys(stored.matches).length} results entered</strong>
      </div>
      <div className={s.form}>
        <label>
          Match
          <select value={selectedMatch} onChange={(event) => selectMatch(event.target.value)}>
            {matches.map((item) => (
              <option key={item.id} value={item.id}>
                {TEAM_BY_CODE[item.home].name} vs {TEAM_BY_CODE[item.away].name}
                {stored.matches[item.id] ? " ✓" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          {match ? TEAM_BY_CODE[match.home].name : "Home"}
          <input min={0} type="number" value={homeGoals} onChange={(event) => setHomeGoals(event.target.value)} />
        </label>
        <label>
          {match ? TEAM_BY_CODE[match.away].name : "Away"}
          <input min={0} type="number" value={awayGoals} onChange={(event) => setAwayGoals(event.target.value)} />
        </label>
        <button type="button" onClick={saveResult}>
          Save result
        </button>
      </div>
      {status !== "idle" && <p className={s[status]}>{status === "error" ? "Save failed. Local result is still applied." : status === "saving" ? "Saving..." : "Saved."}</p>}
    </section>
  );
}
