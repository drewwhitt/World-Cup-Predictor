import { useMemo, useState } from "react";
import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from "../../data";
import { computeElosFromResults, runSimulation } from "../../lib/simulate";
import { saveOfficialResult } from "../../lib/supabase";
import { TEAM_BY_CODE, TEAMS_BY_GROUP } from "../../lib/teams";
import type { StoredResults, TeamCode, TeamProbabilities } from "../../lib/types";
import s from "./AdminResultsPanel.module.css";

type Props = {
  stored: StoredResults;
  onChange: (next: StoredResults) => void;
};

// R32 match IDs and slot definitions (same order as BracketView)
const R32_DEFS = [
  { id: "ko-74", homeSlot: "1E", awaySlot: "3A/B/C/D/F", label: "R32 Match 1" },
  { id: "ko-77", homeSlot: "1I", awaySlot: "3C/D/F/G/H", label: "R32 Match 2" },
  { id: "ko-73", homeSlot: "2A", awaySlot: "2B",          label: "R32 Match 3" },
  { id: "ko-75", homeSlot: "1F", awaySlot: "2C",          label: "R32 Match 4" },
  { id: "ko-83", homeSlot: "2K", awaySlot: "2L",          label: "R32 Match 5" },
  { id: "ko-84", homeSlot: "1H", awaySlot: "2J",          label: "R32 Match 6" },
  { id: "ko-81", homeSlot: "1D", awaySlot: "3B/E/F/I/J",  label: "R32 Match 7" },
  { id: "ko-82", homeSlot: "1G", awaySlot: "3A/E/H/I/J",  label: "R32 Match 8" },
  { id: "ko-76", homeSlot: "1C", awaySlot: "2F",          label: "R32 Match 9" },
  { id: "ko-78", homeSlot: "2E", awaySlot: "2I",          label: "R32 Match 10" },
  { id: "ko-79", homeSlot: "1A", awaySlot: "3C/E/F/H/I",  label: "R32 Match 11" },
  { id: "ko-80", homeSlot: "1L", awaySlot: "3E/H/I/J/K",  label: "R32 Match 12" },
  { id: "ko-86", homeSlot: "1J", awaySlot: "2H",          label: "R32 Match 13" },
  { id: "ko-88", homeSlot: "2D", awaySlot: "2G",          label: "R32 Match 14" },
  { id: "ko-85", homeSlot: "1B", awaySlot: "3E/F/G/I/J",  label: "R32 Match 15" },
  { id: "ko-87", homeSlot: "1K", awaySlot: "3D/E/I/J/L",  label: "R32 Match 16" },
] as const;

const R16_IDS = ["ko-90","ko-89","ko-94","ko-93","ko-91","ko-92","ko-96","ko-95"];
const QF_IDS  = ["ko-97","ko-98","ko-99","ko-100"];
const SF_IDS  = ["ko-101","ko-102"];
const FIN_ID  = "ko-final";

function resolveGroupSlot(slot: string, probs: TeamProbabilities[]): TeamCode | null {
  const w = slot.match(/^1([A-L])$/);
  const r = slot.match(/^2([A-L])$/);
  const t = slot.match(/^3(.+)$/);
  if (w) {
    const g = w[1] as keyof typeof TEAMS_BY_GROUP;
    return [...(TEAMS_BY_GROUP[g] ?? [])]
      .map((c) => probs.find((p) => p.code === c))
      .filter(Boolean)
      .sort((a, b) => (b!.groupWin + b!.advanceFromGroup) - (a!.groupWin + a!.advanceFromGroup))[0]?.code ?? null;
  }
  if (r) {
    const g = r[1] as keyof typeof TEAMS_BY_GROUP;
    return [...(TEAMS_BY_GROUP[g] ?? [])]
      .map((c) => probs.find((p) => p.code === c))
      .filter(Boolean)
      .sort((a, b) => (b!.groupSecond + b!.advanceFromGroup) - (a!.groupSecond + a!.advanceFromGroup))[0]?.code ?? null;
  }
  if (t) {
    const groups = t[1].split("/") as Array<keyof typeof TEAMS_BY_GROUP>;
    return groups.flatMap((g) => TEAMS_BY_GROUP[g] ?? [])
      .map((c) => probs.find((p) => p.code === c))
      .filter(Boolean)
      .sort((a, b) => b!.advanceAsThird - a!.advanceAsThird)[0]?.code ?? null;
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

  // Compute probs to resolve knockout team names
  const probs = useMemo(() => {
    const played = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    return runSimulation(played, KNOCKOUT_MATCHES, DEFAULT_SETTINGS).probabilities;
  }, [stored]);

  const elos = useMemo(() => {
    const played = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    return computeElosFromResults(played, DEFAULT_SETTINGS);
  }, [stored]);

  // Resolve the two teams for any knockout match ID
  function resolveKOTeams(id: string): [TeamCode | null, TeamCode | null] {
    // R32
    const r32def = R32_DEFS.find((d) => d.id === id);
    if (r32def) {
      return [
        resolveGroupSlot(r32def.homeSlot, probs),
        resolveGroupSlot(r32def.awaySlot, probs),
      ];
    }
    // R16: winner of two R32 matches
    const r16idx = R16_IDS.indexOf(id);
    if (r16idx >= 0) {
      const topR32 = R32_DEFS[r16idx * 2];
      const botR32 = R32_DEFS[r16idx * 2 + 1];
      return [getKOWinner(topR32.id), getKOWinner(botR32.id)];
    }
    // QF
    const qfIdx = QF_IDS.indexOf(id);
    if (qfIdx >= 0) {
      const topR16 = R16_IDS[qfIdx * 2];
      const botR16 = R16_IDS[qfIdx * 2 + 1];
      return [getKOWinner(topR16), getKOWinner(botR16)];
    }
    // SF
    const sfIdx = SF_IDS.indexOf(id);
    if (sfIdx >= 0) {
      const topQF = QF_IDS[sfIdx * 2];
      const botQF = QF_IDS[sfIdx * 2 + 1];
      return [getKOWinner(topQF), getKOWinner(botQF)];
    }
    // Final
    if (id === FIN_ID) {
      return [getKOWinner(SF_IDS[0]), getKOWinner(SF_IDS[1])];
    }
    return [null, null];
  }

  function getKOWinner(id: string): TeamCode | null {
    const result = stored.knockoutMatches?.[id];
    const [top, bot] = resolveKOTeams(id);
    if (result && top && bot) {
      return result.homeGoals > result.awayGoals ? top : bot;
    }
    // Predicted winner by Elo
    if (top && bot) {
      const diff = (elos[top] ?? 1500) - (elos[bot] ?? 1500);
      return 1 / (1 + Math.pow(10, -diff / 400)) >= 0.5 ? top : bot;
    }
    return top ?? bot;
  }

  // All knockout matches for the dropdown
  const koMatches = useMemo(() => {
    const all: Array<{ id: string; round: string; home: TeamCode | null; away: TeamCode | null }> = [];
    for (const d of R32_DEFS) {
      const [h, a] = resolveKOTeams(d.id);
      all.push({ id: d.id, round: "Round of 32", home: h, away: a });
    }
    R16_IDS.forEach((id) => {
      const [h, a] = resolveKOTeams(id);
      all.push({ id, round: "Round of 16", home: h, away: a });
    });
    QF_IDS.forEach((id) => {
      const [h, a] = resolveKOTeams(id);
      all.push({ id, round: "Quarterfinal", home: h, away: a });
    });
    SF_IDS.forEach((id) => {
      const [h, a] = resolveKOTeams(id);
      all.push({ id, round: "Semifinal", home: h, away: a });
    });
    const [fh, fa] = resolveKOTeams(FIN_ID);
    all.push({ id: FIN_ID, round: "Final", home: fh, away: fa });
    return all;
  }, [probs, stored.knockoutMatches]);

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
      const koMatch = koMatches.find((m) => m.id === selectedKO);
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
  const currentKOMatch    = koMatches.find((m) => m.id === selectedKO);

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
          Knockout Round
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
              {koMatches.map((m) => {
                const homeName = m.home ? TEAM_BY_CODE[m.home]?.name : "TBD";
                const awayName = m.away ? TEAM_BY_CODE[m.away]?.name : "TBD";
                const isDone = !!(stored.knockoutMatches?.[m.id]);
                return (
                  <option key={m.id} value={m.id}>
                    [{m.round}] {homeName} vs {awayName}{isDone ? " ✓" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            {currentKOMatch?.home ? TEAM_BY_CODE[currentKOMatch.home]?.name : "Home"}
            <input min={0} type="number" value={homeGoals} onChange={(e) => setHomeGoals(e.target.value)} />
          </label>
          <label>
            {currentKOMatch?.away ? TEAM_BY_CODE[currentKOMatch.away]?.name : "Away"}
            <input min={0} type="number" value={awayGoals} onChange={(e) => setAwayGoals(e.target.value)} />
          </label>
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