import { useMemo, useState } from "react";
import { buildByLastName, matchName, type MatchStatus } from "../../lib/fantasy/nameMatching";
import { KNOWN_ALIASES } from "../../lib/fantasy/nameMatching";
import { saveFantasyRankingsSnapshot } from "../../lib/fantasy/rankings";
import { FANTASY_SEASON, type FantasyRankingEntry, type Position } from "../../lib/fantasy/types";
import historicalData from "../../data/fantasy/historical-player-seasons.json";
import s from "./AdminFantasyRankingsPanel.module.css";

const FANTASY_POSITIONS = new Set<Position>(["QB", "RB", "WR", "TE"]);

interface HistoricalPlayer { name: string; position: Position }
const historical = historicalData as { seasons: Record<string, Array<{ name: string; position: Position }>> };

// Canonical name pool built from every player who's appeared in any of
// the historical seasons — this is what pasted names get matched
// against, so a rankings entry ends up spelled the same way nflverse
// spells it (needed for generate-fantasy-forecast.ts's games-missed
// lookup to actually find the player later; a mismatched spelling would
// silently fall through to "no historical record" for a real veteran).
const CANONICAL_POOL: HistoricalPlayer[] = (() => {
  const byName = new Map<string, HistoricalPlayer>();
  for (const season of Object.keys(historical.seasons).sort()) {
    for (const p of historical.seasons[season]) byName.set(p.name, p); // later seasons overwrite earlier ones
  }
  return Array.from(byName.values());
})();

interface ParsedRow {
  rawName: string;
  position: Position;
  team: string;
  adp: number;
  matchStatus: MatchStatus;
  /** Suggested candidate(s), if any — for "ambiguous" this is genuinely multiple real players; for the weak tiers (initial_only, lastname_unique) it's a single low-confidence suggestion, not a confirmed match (see handleParse's comment on why those tiers can't be trusted here). */
  candidates: string[];
  /** The name that will actually be saved. */
  resolvedName: string;
  /** True once this row needs no further input — confident auto-matches and unmatched/new rows start true; weak-tier and ambiguous rows start false until the admin explicitly picks (including explicitly choosing "keep as typed"). */
  resolved: boolean;
  positionMismatch: boolean;
  rowError?: string;
}

function parseLine(line: string): { name: string; position: string; team: string; adp: number } | null {
  const delim = line.includes("\t") ? "\t" : ",";
  const parts = line.split(delim).map((p) => p.trim());
  if (parts.length < 4) return null;
  const [name, position, team, adpStr] = parts;
  const adp = Number(adpStr);
  if (!name || Number.isNaN(adp)) return null;
  return { name, position: position.toUpperCase(), team: team.toUpperCase(), adp };
}

export function AdminFantasyRankingsPanel() {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [invalidLines, setInvalidLines] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const byLastName = useMemo(() => buildByLastName(CANONICAL_POOL, (p) => p.name), []);

  function handleParse() {
    const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsedRows: ParsedRow[] = [];
    const bad: string[] = [];

    for (const line of lines) {
      const parsed = parseLine(line);
      if (!parsed) { bad.push(line); continue; }
      if (!FANTASY_POSITIONS.has(parsed.position as Position)) {
        parsedRows.push({
          rawName: parsed.name, position: parsed.position as Position, team: parsed.team, adp: parsed.adp,
          matchStatus: "unmatched", candidates: [], resolvedName: parsed.name, resolved: true, positionMismatch: false,
          rowError: `Unrecognized position "${parsed.position}" — expected QB/RB/WR/TE.`,
        });
        continue;
      }

      const result = matchName(parsed.name, byLastName, (p) => p.name, KNOWN_ALIASES);
      const matchedPlayer = result.matched;

      // Only the two strongest tiers get auto-accepted. "initial_only" and
      // "lastname_unique" both mean "there happened to be only one
      // candidate with this last name in the historical pool" — that's
      // solid evidence in a same-season backtest (the true player is
      // guaranteed to be in that season's own pool), but proves nothing
      // here: the canonical pool spans 2021-2024 only, and a real rookie
      // (or anyone who's simply never appeared in it) will have zero
      // true matches, making "only one Love in four years" pure surname
      // coincidence, not identity. Real bug caught on Jeremiyah Love
      // (auto-matched to Jordan Love) and Tetairoa McMillan (auto-matched
      // to Jalen McMillan) before this fix — both are actual rookies with
      // no relation to the player they were silently resolved to.
      const isConfidentTier = result.status === "exact" || result.status === "exact_first_token" || result.status === "fuzzy_first_token";
      const isWeakSuggestion = result.status === "initial_only" || result.status === "lastname_unique";

      const candidates = isWeakSuggestion && matchedPlayer
        ? [matchedPlayer.name]
        : result.candidates?.map((c) => c.name) ?? [];

      const positionMismatch = isConfidentTier && !!matchedPlayer && matchedPlayer.position !== parsed.position;

      parsedRows.push({
        rawName: parsed.name,
        position: parsed.position as Position,
        team: parsed.team,
        adp: parsed.adp,
        matchStatus: result.status,
        candidates,
        resolvedName: isConfidentTier && matchedPlayer ? matchedPlayer.name : parsed.name,
        resolved: isConfidentTier || result.status === "unmatched",
        positionMismatch,
      });
    }

    setRows(parsedRows);
    setInvalidLines(bad);
    setStatus("idle");
  }

  function updateResolvedName(index: number, name: string) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[index] = { ...next[index], resolvedName: name, resolved: true };
      return next;
    });
  }

  const summary = useMemo(() => {
    if (!rows) return null;
    const exact = rows.filter((r) => r.matchStatus === "exact" || r.matchStatus === "exact_first_token").length;
    const renamed = rows.filter((r) => r.matchStatus === "fuzzy_first_token" && r.resolvedName !== r.rawName).length;
    const unmatched = rows.filter((r) => r.matchStatus === "unmatched" && !r.rowError).length;
    const needsConfirmation = rows.filter((r) => !r.resolved).length;
    const rowErrors = rows.filter((r) => r.rowError).length;
    return { exact, renamed, unmatched, needsConfirmation, rowErrors };
  }, [rows]);

  const canSave = !!rows && rows.length > 0 && summary!.needsConfirmation === 0 && summary!.rowErrors === 0;

  async function handleSave() {
    if (!rows || !canSave) return;
    setStatus("saving");
    try {
      const entries: FantasyRankingEntry[] = rows.map((r) => ({
        name: r.resolvedName,
        position: r.position,
        team: r.team,
        adp: r.adp,
      }));
      await saveFantasyRankingsSnapshot(FANTASY_SEASON, { entries, scoringFormat: "PPR" });
      setStatus("saved");
    } catch (err) {
      console.error("Fantasy rankings save failed", err);
      setStatus("error");
    }
  }

  return (
    <section className={s.panel}>
      <div className={s.heading}>
        <div>
          <span>Admin Input</span>
          <h2>Import Fantasy Rankings — {FANTASY_SEASON}</h2>
        </div>
        {summary && (
          <strong className={s.summary}>
            {summary.exact} exact · {summary.renamed} renamed to canonical spelling · {summary.unmatched} new (likely rookies)
            {summary.needsConfirmation > 0 && ` · ${summary.needsConfirmation} need your confirmation`}
            {summary.rowErrors > 0 && ` · ${summary.rowErrors} row error(s)`}
          </strong>
        )}
      </div>

      <div className={s.body}>
        <label className={s.textareaLabel}>
          Paste rows as <code>Name, Position, Team, ADP</code> (comma or tab separated), one player per line.
          <textarea
            className={s.textarea}
            rows={8}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={"Christian McCaffrey, RB, SF, 1\nJa'Marr Chase, WR, CIN, 2.67\n..."}
          />
        </label>
        <button type="button" onClick={handleParse}>Parse</button>

        {invalidLines.length > 0 && (
          <p className={s.error}>
            {invalidLines.length} line(s) couldn't be parsed (need 4 fields: name, position, team, ADP): {invalidLines.slice(0, 3).join(" | ")}
            {invalidLines.length > 3 ? "…" : ""}
          </p>
        )}

        {rows && rows.length > 0 && (
          <>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Input Name</th>
                  <th>Resolved Name</th>
                  <th>Pos</th>
                  <th>Team</th>
                  <th>ADP</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={r.rowError ? s.rowInvalid : !r.resolved ? s.rowAmbiguous : undefined}>
                    <td>{r.rawName}</td>
                    <td>
                      {!r.resolved ? (
                        <select value="" onChange={(e) => updateResolvedName(i, e.target.value)}>
                          <option value="" disabled>
                            {r.candidates.length > 1 ? "Choose the correct player…" : "Confirm or reject this suggestion…"}
                          </option>
                          {r.candidates.map((c) => <option key={c} value={c}>{c}</option>)}
                          <option value={r.rawName}>Keep as typed: "{r.rawName}"</option>
                        </select>
                      ) : (
                        <span>
                          {r.resolvedName}
                          {r.resolvedName !== r.rawName && <span className={s.renamedTag}> (was "{r.rawName}")</span>}
                        </span>
                      )}
                    </td>
                    <td>{r.position}{r.positionMismatch && <span className={s.warnTag} title="Historical record shows a different position — could be a real position change, or a typo.">⚠</span>}</td>
                    <td>{r.team}</td>
                    <td>{r.adp}</td>
                    <td className={s.statusCell}>
                      {r.rowError ? <span className={s.badgeError}>{r.rowError}</span>
                        : !r.resolved ? (
                            r.matchStatus === "ambiguous"
                              ? <span className={s.badgeAmbiguous}>Needs pick</span>
                              : <span className={s.badgeAmbiguous}>Low-confidence — confirm</span>
                          )
                        : r.matchStatus === "unmatched" ? <span className={s.badgeNew}>New / no history</span>
                        : (r.matchStatus === "ambiguous" || r.matchStatus === "initial_only" || r.matchStatus === "lastname_unique")
                          ? <span className={s.badgeMatched}>Confirmed ✓</span>
                        : r.matchStatus === "exact" ? <span className={s.badgeExact}>Exact</span>
                        : <span className={s.badgeMatched}>Matched</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <button type="button" onClick={handleSave} disabled={!canSave || status === "saving"} className={s.saveBtn}>
              {status === "saving" ? "Saving snapshot…" : `Save as new snapshot (${new Date().toISOString().slice(0, 10)})`}
            </button>
            {status === "saved" && <span className={s.saved}>Snapshot saved ✓ — re-run generate-fantasy-forecast.ts to update the precomputed presets.</span>}
            {status === "error" && <span className={s.error}>Save failed.</span>}
          </>
        )}
      </div>
    </section>
  );
}