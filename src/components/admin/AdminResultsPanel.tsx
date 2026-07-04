import { useMemo, useState } from "react";
import { GROUP_MATCHES } from "../../data";
import { saveOfficialResult } from "../../lib/supabase";
import { recordSnapshot } from "../../lib/snapshots";
import { buildLiveTeams } from "../../data/veridexLive";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./AdminResultsPanel.module.css";

type Props = {
  stored: StoredResults;
  onChange: (next: StoredResults) => void;
};

type Round = "Round of 32" | "Round of 16" | "Quarterfinal" | "Semifinal" | "Final";

/** Either a fixed R32 team, or "whoever wins another match" (resolved recursively below). */
type Source = { type: "team"; code: TeamCode } | { type: "winner"; matchId: string };

/**
 * The full knockout bracket, R32 through Final. R16/QF/SF/Final entries
 * reference the match(es) that feed them rather than fixed teams, since
 * those teams aren't known until earlier rounds are actually played.
 *
 * Pairing verified against FIFA's official bracket and live 2026
 * reporting (see MODEL_HISTORY.md v1.10 and src/lib/bracketTree.ts for
 * the full verification) — this must stay in sync with bracketTree.ts
 * and simulate.ts's R16_FROM_R32/QF_FROM_R16/SF_FROM_QF if the bracket
 * structure ever needs correcting again.
 */
const KNOCKOUT_STRUCTURE: Record<string, { round: Round; home: Source; away: Source }> = {
  "ko-73": { round: "Round of 32", home: { type: "team", code: "GER" }, away: { type: "team", code: "PAR" } },
  "ko-74": { round: "Round of 32", home: { type: "team", code: "FRA" }, away: { type: "team", code: "SWE" } },
  "ko-75": { round: "Round of 32", home: { type: "team", code: "RSA" }, away: { type: "team", code: "CAN" } },
  "ko-76": { round: "Round of 32", home: { type: "team", code: "NED" }, away: { type: "team", code: "MAR" } },
  "ko-77": { round: "Round of 32", home: { type: "team", code: "POR" }, away: { type: "team", code: "CRO" } },
  "ko-78": { round: "Round of 32", home: { type: "team", code: "ESP" }, away: { type: "team", code: "AUT" } },
  "ko-79": { round: "Round of 32", home: { type: "team", code: "USA" }, away: { type: "team", code: "BIH" } },
  "ko-80": { round: "Round of 32", home: { type: "team", code: "BEL" }, away: { type: "team", code: "SEN" } },
  "ko-81": { round: "Round of 32", home: { type: "team", code: "BRA" }, away: { type: "team", code: "JPN" } },
  "ko-82": { round: "Round of 32", home: { type: "team", code: "CIV" }, away: { type: "team", code: "NOR" } },
  "ko-83": { round: "Round of 32", home: { type: "team", code: "MEX" }, away: { type: "team", code: "ECU" } },
  "ko-84": { round: "Round of 32", home: { type: "team", code: "ENG" }, away: { type: "team", code: "COD" } },
  "ko-85": { round: "Round of 32", home: { type: "team", code: "ARG" }, away: { type: "team", code: "CPV" } },
  "ko-86": { round: "Round of 32", home: { type: "team", code: "AUS" }, away: { type: "team", code: "EGY" } },
  "ko-87": { round: "Round of 32", home: { type: "team", code: "SUI" }, away: { type: "team", code: "ALG" } },
  "ko-88": { round: "Round of 32", home: { type: "team", code: "COL" }, away: { type: "team", code: "GHA" } },

  "ko-89": { round: "Round of 16", home: { type: "winner", matchId: "ko-73" }, away: { type: "winner", matchId: "ko-74" } },
  "ko-90": { round: "Round of 16", home: { type: "winner", matchId: "ko-75" }, away: { type: "winner", matchId: "ko-76" } },
  "ko-91": { round: "Round of 16", home: { type: "winner", matchId: "ko-77" }, away: { type: "winner", matchId: "ko-78" } },
  "ko-92": { round: "Round of 16", home: { type: "winner", matchId: "ko-79" }, away: { type: "winner", matchId: "ko-80" } },
  "ko-93": { round: "Round of 16", home: { type: "winner", matchId: "ko-83" }, away: { type: "winner", matchId: "ko-84" } },
  "ko-94": { round: "Round of 16", home: { type: "winner", matchId: "ko-81" }, away: { type: "winner", matchId: "ko-82" } },
  "ko-95": { round: "Round of 16", home: { type: "winner", matchId: "ko-86" }, away: { type: "winner", matchId: "ko-88" } },
  "ko-96": { round: "Round of 16", home: { type: "winner", matchId: "ko-85" }, away: { type: "winner", matchId: "ko-87" } },

  "ko-97":  { round: "Quarterfinal", home: { type: "winner", matchId: "ko-89" }, away: { type: "winner", matchId: "ko-90" } },
  "ko-98":  { round: "Quarterfinal", home: { type: "winner", matchId: "ko-93" }, away: { type: "winner", matchId: "ko-94" } },
  "ko-99":  { round: "Quarterfinal", home: { type: "winner", matchId: "ko-91" }, away: { type: "winner", matchId: "ko-92" } },
  "ko-100": { round: "Quarterfinal", home: { type: "winner", matchId: "ko-95" }, away: { type: "winner", matchId: "ko-96" } },

  "ko-101": { round: "Semifinal", home: { type: "winner", matchId: "ko-97" }, away: { type: "winner", matchId: "ko-99" } },
  "ko-102": { round: "Semifinal", home: { type: "winner", matchId: "ko-98" }, away: { type: "winner", matchId: "ko-100" } },

  "ko-104": { round: "Final", home: { type: "winner", matchId: "ko-101" }, away: { type: "winner", matchId: "ko-102" } },
};

const ROUND_ORDER: Round[] = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];

/** Recursively resolves a source to an actual team code, or null if that round hasn't been played yet. */
function resolveTeam(source: Source, stored: StoredResults): TeamCode | null {
  if (source.type === "team") return source.code;
  const result = stored.knockoutMatches?.[source.matchId];
  const structure = KNOCKOUT_STRUCTURE[source.matchId];
  if (!result || !structure) return null;

  const homeCode = resolveTeam(structure.home, stored);
  const awayCode = resolveTeam(structure.away, stored);
  if (!homeCode || !awayCode) return null;

  if (result.homeGoals > result.awayGoals) return homeCode;
  if (result.awayGoals > result.homeGoals) return awayCode;
  if (result.penaltyWinner === "home") return homeCode;
  if (result.penaltyWinner === "away") return awayCode;
  return null; // drawn, no penalty result recorded yet
}

function resolveMatch(id: string, stored: StoredResults): { home: TeamCode | null; away: TeamCode | null } {
  const structure = KNOCKOUT_STRUCTURE[id];
  if (!structure) return { home: null, away: null };
  return {
    home: resolveTeam(structure.home, stored),
    away: resolveTeam(structure.away, stored),
  };
}

function teamLabel(code: TeamCode | null): string {
  return code ? TEAM_BY_CODE[code]?.name ?? code : "TBD";
}

export function AdminResultsPanel({ stored, onChange }: Props) {
  const [tab, setTab] = useState<"group" | "knockout">("group");
  const [round, setRound] = useState<Round>("Round of 32");
  const [selectedGroup, setSelectedGroup] = useState(GROUP_MATCHES[0]?.id ?? "");
  const [selectedKO, setSelectedKO] = useState<string>("ko-73");
  const [homeGoals, setHomeGoals] = useState("0");
  const [awayGoals, setAwayGoals] = useState("0");
  const [penaltyWinner, setPenaltyWinner] = useState<"home" | "away" | "">("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [snapStatus, setSnapStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const groupMatches = useMemo(
    () => [...GROUP_MATCHES].sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday),
    [],
  );

  const matchesInRound = useMemo(
    () => Object.keys(KNOCKOUT_STRUCTURE).filter((id) => KNOCKOUT_STRUCTURE[id].round === round),
    [round],
  );

  function selectRound(next: Round) {
    setRound(next);
    const firstId = Object.keys(KNOCKOUT_STRUCTURE).find((id) => KNOCKOUT_STRUCTURE[id].round === next);
    if (firstId) selectKO(firstId);
  }

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
      const { home: homeCode, away: awayCode } = resolveMatch(selectedKO, stored);
      if (!homeCode || !awayCode) return; // shouldn't happen — UI disables this case
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
          TEAM_BY_CODE[homeCode]?.name,
          TEAM_BY_CODE[awayCode]?.name,
          undefined,
          home === away && penaltyWinner ? penaltyWinner : undefined,
        );
        setStatus("saved");
      } catch { setStatus("error"); }
    }
  }

  /**
   * Records today's championship probability for every team to
   * probability_snapshots. Call this once after entering results for
   * the day — it's what powers the "movers" feed across the site.
   */
  async function takeSnapshot() {
    setSnapStatus("saving");
    try {
      const liveTeams = buildLiveTeams(stored);
      const teamValues = liveTeams.map((t) => ({ code: t.code, value: t.current }));
      await recordSnapshot("world_cup", teamValues, "champion_pct");
      setSnapStatus("saved");
    } catch (err) {
      console.error("Snapshot failed", err);
      setSnapStatus("error");
    }
  }

  const currentGroupMatch = groupMatches.find((m) => m.id === selectedGroup);
  const { home: currentHome, away: currentAway } = resolveMatch(selectedKO, stored);
  const bothTeamsKnown = !!currentHome && !!currentAway;

  return (
    <section className={s.panel}>
      <div className={s.heading}>
        <div>
          <span>Admin Input</span>
          <h2>Record a match result</h2>
        </div>
        <div className={s.headingRight}>
          <strong>
            {Object.keys(stored.matches).length} group +{" "}
            {Object.keys(stored.knockoutMatches ?? {}).length} knockout results
          </strong>
          <button type="button" className={s.snapshotBtn} onClick={takeSnapshot}>
            {snapStatus === "saving" ? "Saving snapshot..." : "Snapshot today's odds"}
          </button>
          {snapStatus === "saved" && <span className={s.saved}>Snapshot saved ✓</span>}
          {snapStatus === "error" && <span className={s.error}>Snapshot failed</span>}
        </div>
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
          Knockout
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
            Round
            <select value={round} onChange={(e) => selectRound(e.target.value as Round)}>
              {ROUND_ORDER.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Match
            <select value={selectedKO} onChange={(e) => selectKO(e.target.value)}>
              {matchesInRound.map((id) => {
                const isDone = !!(stored.knockoutMatches?.[id]);
                const { home, away } = resolveMatch(id, stored);
                return (
                  <option key={id} value={id} disabled={!home || !away}>
                    {teamLabel(home)} vs {teamLabel(away)}{isDone ? " ✓" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          {!bothTeamsKnown && (
            <p className={s.pending}>
              Both teams for this match aren't determined yet — enter the earlier round's result first.
            </p>
          )}
          <label>
            {teamLabel(currentHome)}
            <input min={0} type="number" value={homeGoals} onChange={(e) => setHomeGoals(e.target.value)} disabled={!bothTeamsKnown} />
          </label>
          <label>
            {teamLabel(currentAway)}
            <input min={0} type="number" value={awayGoals} onChange={(e) => setAwayGoals(e.target.value)} disabled={!bothTeamsKnown} />
          </label>
          {homeGoals === awayGoals && bothTeamsKnown && (
            <label>
              Won on penalties
              <select value={penaltyWinner} onChange={(e) => setPenaltyWinner(e.target.value as "home" | "away" | "")}>
                <option value="">Select penalty winner</option>
                <option value="home">{teamLabel(currentHome)}</option>
                <option value="away">{teamLabel(currentAway)}</option>
              </select>
            </label>
          )}
          <button type="button" onClick={saveResult} disabled={!bothTeamsKnown}>Save result</button>
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