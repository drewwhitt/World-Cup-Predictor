import { useMemo, useState } from "react";
import { resolveWhatIfBracket, currentElos, type MatchOverride, type ResolvedSide } from "../../lib/whatIf";
import { toAdvancementProbabilities } from "../../lib/elo";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { KnockoutRound } from "../../lib/bracketTree";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./WhatIfBracket.module.css";

const ROUND_ORDER: KnockoutRound[] = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];
const ROUND_LABELS: Record<KnockoutRound, string> = {
  "Round of 32": "Round of 32",
  "Round of 16": "Round of 16",
  Quarterfinal: "Quarterfinals",
  Semifinal: "Semifinals",
  Final: "Final",
};

function name(code: TeamCode): string {
  return TEAM_BY_CODE[code]?.name ?? code;
}

function winPct(elos: Record<TeamCode, number>, home: TeamCode, away: TeamCode): number {
  return toAdvancementProbabilities(elos[home] ?? 1500, elos[away] ?? 1500, 0).home;
}

type Match = ReturnType<typeof resolveWhatIfBracket>[number];

export function WhatIfBracket({
  stored,
  overrides,
  onSetOverride,
  onClearOverride,
}: {
  stored: StoredResults;
  overrides: MatchOverride[];
  onSetOverride: (matchId: string, winner: TeamCode) => void;
  onClearOverride: (matchId: string) => void;
}) {
  const elos = useMemo(() => currentElos(stored), [stored]);
  const matches = useMemo(() => resolveWhatIfBracket(stored, overrides), [stored, overrides]);

  // Which of the two candidates is currently shown for a still-undecided
  // opponent slot (e.g. Spain vs Portugal — display preference only, not
  // part of the scenario itself, so it lives here rather than upstream).
  const [focused, setFocused] = useState<Record<string, TeamCode>>({});

  const byRound = useMemo(() => {
    const grouped = new Map<KnockoutRound, Match[]>();
    for (const round of ROUND_ORDER) grouped.set(round, []);
    for (const m of matches) grouped.get(m.round)?.push(m);
    return grouped;
  }, [matches]);

  function focusedCandidate(side: ResolvedSide & { kind: "pending" }): TeamCode {
    return focused[side.feederMatchId] ?? side.candidates[0];
  }

  function toggleFocus(side: ResolvedSide & { kind: "pending" }) {
    const current = focusedCandidate(side);
    const other = current === side.candidates[0] ? side.candidates[1] : side.candidates[0];
    setFocused((prev) => ({ ...prev, [side.feederMatchId]: other }));
  }

  /** Resolve a side to a concrete code for DISPLAY (real, override, or the currently-focused candidate). */
  function displayCode(side: ResolvedSide): TeamCode | null {
    if (side.kind === "team") return side.code;
    if (side.kind === "pending") return focusedCandidate(side);
    return null;
  }

  /** Clicking a team declares them the winner — resolving any still-pending side(s) to whichever candidate is currently shown first. */
  function pickWinner(m: Match, side: "home" | "away") {
    const chosen = side === "home" ? m.home : m.away;
    const other = side === "home" ? m.away : m.home;

    let chosenCode: TeamCode | null = null;
    if (chosen.kind === "team") chosenCode = chosen.code;
    else if (chosen.kind === "pending") {
      chosenCode = focusedCandidate(chosen);
      onSetOverride(chosen.feederMatchId, chosenCode);
    }
    if (!chosenCode) return;

    if (other.kind === "pending") {
      onSetOverride(other.feederMatchId, focusedCandidate(other));
    }

    onSetOverride(m.id, chosenCode);
  }

  return (
    <div className={s.wrap}>
      <p className={s.hint}>
        Click a team to make them the winner. If an opponent is still undecided, the most likely
        candidate shows first — use "switch opponent" to see the other one before picking.
      </p>
      <div className={s.columns}>
        {ROUND_ORDER.map((round) => (
          <div key={round} className={s.column}>
            <div className={s.columnHeader}>{ROUND_LABELS[round]}</div>
            {byRound.get(round)?.map((m) => {
              const homeCode = displayCode(m.home);
              const awayCode = displayCode(m.away);
              const bothKnown = !!homeCode && !!awayCode;
              const pct = bothKnown ? winPct(elos, homeCode!, awayCode!) : 0.5;

              return (
                <div key={m.id} className={s.card}>
                  <button
                    type="button"
                    disabled={!homeCode}
                    className={[s.team, m.winner === homeCode ? s.fav : ""].join(" ")}
                    onClick={() => pickWinner(m, "home")}
                  >
                    <span className={s.teamName}>{homeCode ? name(homeCode) : "TBD"}</span>
                    {bothKnown && <span className={s.pct}>{Math.round(pct * 100)}%</span>}
                  </button>
                  <div className={s.divider} />
                  <button
                    type="button"
                    disabled={!awayCode}
                    className={[s.team, m.winner === awayCode ? s.fav : ""].join(" ")}
                    onClick={() => pickWinner(m, "away")}
                  >
                    <span className={s.teamName}>{awayCode ? name(awayCode) : "TBD"}</span>
                    {bothKnown && <span className={s.pct}>{Math.round((1 - pct) * 100)}%</span>}
                  </button>

                  <div className={s.cardFooter}>
                    {m.home.kind === "pending" && (
                      <button type="button" className={s.switchBtn} onClick={() => toggleFocus(m.home as ResolvedSide & { kind: "pending" })}>
                        ⇄ switch opponent
                      </button>
                    )}
                    {m.away.kind === "pending" && (
                      <button type="button" className={s.switchBtn} onClick={() => toggleFocus(m.away as ResolvedSide & { kind: "pending" })}>
                        ⇄ switch opponent
                      </button>
                    )}
                    {m.isOverridden && (
                      <button type="button" className={s.clearBtn} onClick={() => onClearOverride(m.id)}>
                        Reset to real result
                      </button>
                    )}
                    {!m.isOverridden && m.hasRealResult && <span className={s.realTag}>Real result</span>}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}