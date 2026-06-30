import { useMemo, useState } from "react";
import { GROUP_MATCHES } from "../../data";
import { computeStandings, rankThirdPlaceTeams, summarizeGroups } from "../../lib/groups";
import { saveOfficialResult } from "../../lib/supabase";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { GroupLetter, StoredResults, TeamCode } from "../../lib/types";
import s from "./AdminResultsPanel.module.css";

type Props = {
  stored: StoredResults;
  onChange: (next: StoredResults) => void;
};

// R32 match definitions. The 16 group-winner/runner-up slots are unambiguous
// once group play is done. The 8 third-place slots depend on FIFA's official
// Annex C combination table (495 possible mappings) — we do NOT guess these.
// They show "Best 3rd place — TBD" until you confirm the actual matchup
// from FIFA's published bracket and enter it manually below.
const R32_DEFS = [
  { id: "ko-74", homeSlot: "1E", awaySlot: "3RD", label: "R32 Match 1" },
  { id: "ko-77", homeSlot: "1I", awaySlot: "3RD", label: "R32 Match 2" },
  { id: "ko-73", homeSlot: "2A", awaySlot: "2B",  label: "R32 Match 3" },
  { id: "ko-75", homeSlot: "1F", awaySlot: "2C",  label: "R32 Match 4" },
  { id: "ko-83", homeSlot: "2K", awaySlot: "2L",  label: "R32 Match 5" },
  { id: "ko-84", homeSlot: "1H", awaySlot: "2J",  label: "R32 Match 6" },
  { id: "ko-81", homeSlot: "1D", awaySlot: "3RD", label: "R32 Match 7" },
  { id: "ko-82", homeSlot: "1G", awaySlot: "3RD", label: "R32 Match 8" },
  { id: "ko-76", homeSlot: "1C", awaySlot: "2F",  label: "R32 Match 9" },
  { id: "ko-78", homeSlot: "2E", awaySlot: "2I",  label: "R32 Match 10" },
  { id: "ko-79", homeSlot: "1A", awaySlot: "3RD", label: "R32 Match 11" },
  { id: "ko-80", homeSlot: "1L", awaySlot: "3RD", label: "R32 Match 12" },
  { id: "ko-86", homeSlot: "1J", awaySlot: "2H",  label: "R32 Match 13" },
  { id: "ko-88", homeSlot: "2D", awaySlot: "2G",  label: "R32 Match 14" },
  { id: "ko-85", homeSlot: "1B", awaySlot: "3RD", label: "R32 Match 15" },
  { id: "ko-87", homeSlot: "1K", awaySlot: "3RD", label: "R32 Match 16" },
] as const;

function resolveWinnerOrRunnerUp(
  slot: string,
  groupStandings: ReturnType<typeof computeStandings>,
): TeamCode | null {
  const winnerMatch = slot.match(/^1([A-L])$/);
  const runnerMatch = slot.match(/^2([A-L])$/);
  if (winnerMatch) {
    const g = winnerMatch[1] as GroupLetter;
    return groupStandings[g]?.[0]?.team ?? null;
  }
  if (runnerMatch) {
    const g = runnerMatch[1] as GroupLetter;
    return groupStandings[g]?.[1]?.team ?? null;
  }
  return null;
}

export function AdminResultsPanel({ stored, onChange }: Props) {
  const [tab, setTab]               = useState<"group" | "knockout">("group");
  const [selectedGroup, setSelectedGroup] = useState(GROUP_MATCHES[0]?.id ?? "");
  const [selectedKO, setSelectedKO] = useState<string>(R32_DEFS[0].id);
  const [homeGoals, setHomeGoals]   = useState("0");
  const [awayGoals, setAwayGoals]   = useState("0");
  const [status, setStatus]         = useState<"idle"|"saving"|"saved"|"error">("idle");

  const groupMatches = useMemo(
    () => [...GROUP_MATCHES].sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday),
    [],
  );

  // Compute REAL standings from confirmed results — no probability/simulation needed
  // since group stage is fully played. This is deterministic and exact.
  const groupStandings = useMemo(() => {
    const played = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    return computeStandings(played);
  }, [stored]);

  // Rank the 12 third-place teams using FIFA's tiebreak order (points, GD, GF).
  // This tells us WHICH 8 groups qualify, but NOT which bracket slot each
  // lands in — that depends on FIFA's official Annex C table (495 combos)
  // which we don't reproduce here to avoid showing a wrong matchup.
  const thirdPlaceRanked = useMemo(() => {
    const groups = summarizeGroups(groupStandings);
    return rankThirdPlaceTeams(groups);
  }, [groupStandings]);

  // All R32 matches with resolved teams. Group winner/runner-up slots are
  // exact. Third-place slots show null (TBD) — enter the actual opponent
  // once you've confirmed it from FIFA's published bracket.
  const r32Matches = useMemo(() => {
    return R32_DEFS.map((def) => {
      const home = resolveWinnerOrRunnerUp(def.homeSlot, groupStandings);
      const away = def.awaySlot === "3RD"
        ? null // TBD — see note above
        : resolveWinnerOrRunnerUp(def.awaySlot, groupStandings);
      return { ...def, home, away };
    });
  }, [groupStandings]);

  function selectKO(id: string) {
    setSelectedKO(id);
    const saved = stored.knockoutMatches?.[id];
    setHomeGoals(saved?.homeGoals.toString() ?? "0");
    setAwayGoals(saved?.awayGoals.toString() ?? "0");
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
      const koMatch = r32Matches.find((m) => m.id === selectedKO);
      const next: StoredResults = {
        ...stored,
        knockoutMatches: {
          ...(stored.knockoutMatches ?? {}),
          [selectedKO]: { homeGoals: home, awayGoals: away },
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
          koMatch?.home ? TEAM_BY_CODE[koMatch.home]?.name : undefined,
          koMatch?.away ? TEAM_BY_CODE[koMatch.away]?.name : undefined,
        );
        setStatus("saved");
      } catch { setStatus("error"); }
    }
  }

  const currentGroupMatch = groupMatches.find((m) => m.id === selectedGroup);
  const currentKOMatch    = r32Matches.find((m) => m.id === selectedKO);
  const homeTeamLabel = currentKOMatch?.home ? TEAM_BY_CODE[currentKOMatch.home]?.name : "Home";
  const awayTeamLabel = currentKOMatch?.away
    ? TEAM_BY_CODE[currentKOMatch.away]?.name
    : "Best 3rd place — confirm before entering";

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
              {r32Matches.map((m) => {
                const homeName = m.home ? TEAM_BY_CODE[m.home]?.name : "TBD";
                const awayName = m.away ? TEAM_BY_CODE[m.away]?.name : "Best 3rd place (TBD)";
                const isDone = !!(stored.knockoutMatches?.[m.id]);
                return (
                  <option key={m.id} value={m.id}>
                    {homeName} vs {awayName}{isDone ? " ✓" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          {!currentKOMatch?.away && (
            <p className={s.notice}>
              This match includes a best-third-place qualifier. FIFA assigns the exact
              opponent using its official Annex C combination table — confirm the matchup
              from the published bracket before entering a result.
            </p>
          )}
          <label>
            {homeTeamLabel}
            <input min={0} type="number" value={homeGoals} onChange={(e) => setHomeGoals(e.target.value)} />
          </label>
          <label>
            {awayTeamLabel}
            <input min={0} type="number" value={awayGoals} onChange={(e) => setAwayGoals(e.target.value)} />
          </label>
          <button type="button" onClick={saveResult}>Save result</button>
        </div>
      )}

      <div className={s.thirdsBox}>
        <div className={s.thirdsTitle}>Best third-place ranking (live)</div>
        <ol className={s.thirdsList}>
          {thirdPlaceRanked.map((t, i) => (
            <li key={t.group} className={i < 8 ? s.qualified : s.eliminated}>
              {i + 1}. Group {t.group} — {TEAM_BY_CODE[t.team]?.name} ({t.points} pts, {t.gd >= 0 ? "+" : ""}{t.gd} GD)
            </li>
          ))}
        </ol>
      </div>

      {status !== "idle" && (
        <p className={s[status]}>
          {status === "error" ? "Save failed. Local result still applied." :
           status === "saving" ? "Saving..." : "Saved ✓"}
        </p>
      )}
    </section>
  );
}