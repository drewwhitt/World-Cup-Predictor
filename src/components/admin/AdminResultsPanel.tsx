import { useMemo, useState } from "react";
import { GROUP_MATCHES } from "../../data";
import { saveOfficialResult } from "../../lib/supabase";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./AdminResultsPanel.module.css";

type Props = {
  stored: StoredResults;
  onChange: (next: StoredResults) => void;
};

/**
 * Confirmed Round of 32 matchups for the 2026 World Cup, taken from FIFA's
 * published bracket. Same fixed list used in BracketView.tsx — kept in sync
 * manually since this is the real, locked draw (not something we compute).
 */
const R32_MATCHUPS: Array<{ id: string; home: TeamCode; away: TeamCode }> = [
  { id: "ko-73", home: "GER", away: "PAR" },
  { id: "ko-74", home: "FRA", away: "SWE" },
  { id: "ko-75", home: "RSA", away: "CAN" },
  { id: "ko-76", home: "NED", away: "MAR" },
  { id: "ko-77", home: "POR", away: "CRO" },
  { id: "ko-78", home: "ESP", away: "AUT" },
  { id: "ko-79", home: "USA", away: "BIH" },
  { id: "ko-80", home: "BEL", away: "SEN" },
  { id: "ko-81", home: "BRA", away: "JPN" },
  { id: "ko-82", home: "CIV", away: "NOR" },
  { id: "ko-83", home: "MEX", away: "ECU" },
  { id: "ko-84", home: "ENG", away: "COD" },
  { id: "ko-85", home: "ARG", away: "CPV" },
  { id: "ko-86", home: "AUS", away: "EGY" },
  { id: "ko-87", home: "SUI", away: "ALG" },
  { id: "ko-88", home: "COL", away: "GHA" },
];

export function AdminResultsPanel({ stored, onChange }: Props) {
  const [tab, setTab]               = useState<"group" | "knockout">("group");
  const [selectedGroup, setSelectedGroup] = useState(GROUP_MATCHES[0]?.id ?? "");
  const [selectedKO, setSelectedKO] = useState<string>(R32_MATCHUPS[0].id);
  const [homeGoals, setHomeGoals]   = useState("0");
  const [awayGoals, setAwayGoals]   = useState("0");
  const [penaltyWinner, setPenaltyWinner] = useState<"home" | "away" | "">("");
  const [status, setStatus]         = useState<"idle"|"saving"|"saved"|"error">("idle");

  const groupMatches = useMemo(
    () => [...GROUP_MATCHES].sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday),
    [],
  );

  function selectKO(id: string) {
    setSelectedKO(id);
    const saved = stored.knockoutMatches?.[id];
    setHomeGoals(saved?.homeGoals.toString() ?? "0");
    setAwayGoals(saved?.awayGoals.toString() ?? "0");
    setPenaltyWinner(saved?.penaltyWinner ?? "");
    setStatus("idle");
  }

  function selectGroup(id: string) {
    const saved = stored.matches[id];
    setSelectedGroup(id);
    setHomeGoals(saved?.homeGoals.toString() ?? "0");
    setAwayGoals(saved?.awayGoals.toString() ?? "0");
    setStatus("idle");
  }

  async function saveResult() {
    const home = Number(homeGoals);
    const away = Number(awayGoals);
    if (Number.isNaN(home) || Number.isNaN(away) || home < 0 || away < 0) return;

    if (tab === "group") {
      const match = groupMatches.find((m) => m.id === selectedGroup);
      if (!match) return;
      const next: StoredResults = {
        ...stored,
        matches: { ...stored.matches, [selectedGroup]: { homeGoals: home, awayGoals: away } },
      };
      onChange(next);
      localStorage.setItem("worldcup-predictor-results", JSON.stringify(next));
      setStatus("saving");
      try {
        await saveOfficialResult(selectedGroup, home, away);
        setStatus("saved");
      } catch { setStatus("error"); }
    } else {
      const koMatch = R32_MATCHUPS.find((m) => m.id === selectedKO);
      const next: StoredResults = {
        ...stored,
        knockoutMatches: {
          ...(stored.knockoutMatches ?? {}),
          [selectedKO]: {
            homeGoals: home,
            awayGoals: away,
            ...(home === away && penaltyWinner ? { penaltyWinner } : {}),
          },
        },
      };
      onChange(next);
      localStorage.setItem("worldcup-predictor-results", JSON.stringify(next));
      setStatus("saving");
      try {
        await saveOfficialResult(
          selectedKO,
          home,
          away,
          koMatch ? TEAM_BY_CODE[koMatch.home]?.name : undefined,
          koMatch ? TEAM_BY_CODE[koMatch.away]?.name : undefined,
          undefined,
          home === away && penaltyWinner ? penaltyWinner : undefined,
        );
        setStatus("saved");
      } catch { setStatus("error"); }
    }
  }

  const currentGroupMatch = groupMatches.find((m) => m.id === selectedGroup);
  const currentKOMatch    = R32_MATCHUPS.find((m) => m.id === selectedKO);

  return (
    <section className={s.panel}>
      <div className={s.heading}>
        <div>
          <span>Admin Input</span>
          <h2>Record a match result</h2>
        </div>
        <strong>
          {Object.keys(stored.matches).length} group +{" "}
          {Object.keys(stored.knockoutMatches ?? {}).length} knockout results
        </strong>
      </div>

      <div className={s.tabs}>
        <button
          type="button"
          className={tab === "group" ? s.tabActive : s.tabInactive}
          onClick={() => { setTab("group"); setStatus("idle"); }}
        >
          Group Stage
        </button>
        <button
          type="button"
          className={tab === "knockout" ? s.tabActive : s.tabInactive}
          onClick={() => { setTab("knockout"); setStatus("idle"); }}
        >
          Round of 32
        </button>
      </div>

      {tab === "group" ? (
        <div className={s.form}>
          <label>
            Match
            <select value={selectedGroup} onChange={(e) => selectGroup(e.target.value)}>
              {groupMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {TEAM_BY_CODE[m.home].name} vs {TEAM_BY_CODE[m.away].name}
                  {stored.matches[m.id] ? " ✓" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            {currentGroupMatch ? TEAM_BY_CODE[currentGroupMatch.home].name : "Home"}
            <input min={0} type="number" value={homeGoals} onChange={(e) => setHomeGoals(e.target.value)} />
          </label>
          <label>
            {currentGroupMatch ? TEAM_BY_CODE[currentGroupMatch.away].name : "Away"}
            <input min={0} type="number" value={awayGoals} onChange={(e) => setAwayGoals(e.target.value)} />
          </label>
          <button type="button" onClick={saveResult}>Save result</button>
        </div>
      ) : (
        <div className={s.form}>
          <label>
            Match
            <select value={selectedKO} onChange={(e) => selectKO(e.target.value)}>
              {R32_MATCHUPS.map((m) => {
                const isDone = !!(stored.knockoutMatches?.[m.id]);
                return (
                  <option key={m.id} value={m.id}>
                    {TEAM_BY_CODE[m.home]?.name} vs {TEAM_BY_CODE[m.away]?.name}{isDone ? " ✓" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            {currentKOMatch ? TEAM_BY_CODE[currentKOMatch.home]?.name : "Home"}
            <input min={0} type="number" value={homeGoals} onChange={(e) => setHomeGoals(e.target.value)} />
          </label>
          <label>
            {currentKOMatch ? TEAM_BY_CODE[currentKOMatch.away]?.name : "Away"}
            <input min={0} type="number" value={awayGoals} onChange={(e) => setAwayGoals(e.target.value)} />
          </label>
          {homeGoals === awayGoals && currentKOMatch && (
            <label>
              Won on penalties
              <select value={penaltyWinner} onChange={(e) => setPenaltyWinner(e.target.value as "home" | "away" | "")}>
                <option value="">Select penalty winner</option>
                <option value="home">{TEAM_BY_CODE[currentKOMatch.home]?.name}</option>
                <option value="away">{TEAM_BY_CODE[currentKOMatch.away]?.name}</option>
              </select>
            </label>
          )}
          <button type="button" onClick={saveResult}>Save result</button>
        </div>
      )}

      {status !== "idle" && (
        <p className={s[status]}>
          {status === "error" ? "Save failed. Local result still applied." :
           status === "saving" ? "Saving..." : "Saved ✓"}
        </p>
      )}
    </section>
  );
}