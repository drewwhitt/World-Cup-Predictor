import { useMemo } from "react";
import { resolveWhatIfBracket, currentElos, type MatchOverride } from "../../lib/whatIf";
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

/** One clickable row: a specific pairing (real or hypothetical) with real win%. */
function MatchupRow({
  home,
  away,
  homePct,
  isHomeWinner,
  isAwayWinner,
  onPickHome,
  onPickAway,
  note,
}: {
  home: TeamCode;
  away: TeamCode;
  homePct: number;
  isHomeWinner: boolean;
  isAwayWinner: boolean;
  onPickHome?: () => void;
  onPickAway?: () => void;
  note?: string;
}) {
  return (
    <div className={s.matchup}>
      {note && <div className={s.matchupNote}>{note}</div>}
      <button
        type="button"
        disabled={!onPickHome}
        className={[s.teamBtn, isHomeWinner ? s.winner : ""].join(" ")}
        onClick={onPickHome}
      >
        <span>{name(home)}</span>
        <span className={s.pct}>{Math.round(homePct * 100)}%</span>
      </button>
      <button
        type="button"
        disabled={!onPickAway}
        className={[s.teamBtn, isAwayWinner ? s.winner : ""].join(" ")}
        onClick={onPickAway}
      >
        <span>{name(away)}</span>
        <span className={s.pct}>{Math.round((1 - homePct) * 100)}%</span>
      </button>
    </div>
  );
}

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
  const byRound = useMemo(() => {
    const grouped = new Map<KnockoutRound, typeof matches>();
    for (const round of ROUND_ORDER) grouped.set(round, []);
    for (const m of matches) grouped.get(m.round)?.push(m);
    return grouped;
  }, [matches]);

  return (
    <div className={s.wrap}>
      <p className={s.hint}>
        Click a team to make them the winner — every later match that depends on this one updates to
        match, with real odds for the matchup. If an opponent is still undecided (say, whoever wins
        Spain v Portugal), both hypothetical matchups show up so you can see either one.
      </p>
      <div className={s.columns}>
        {ROUND_ORDER.map((round) => (
          <div key={round} className={s.column}>
            <div className={s.columnHeader}>{ROUND_LABELS[round]}</div>
            {byRound.get(round)?.map((m) => (
              <div key={m.id} className={s.card}>
                {renderCard(m, elos, onSetOverride)}
                {m.isOverridden && (
                  <button type="button" className={s.clearBtn} onClick={() => onClearOverride(m.id)}>
                    Reset to real result
                  </button>
                )}
                {!m.isOverridden && m.hasRealResult && <span className={s.realTag}>Real result</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function renderCard(
  m: ReturnType<typeof resolveWhatIfBracket>[number],
  elos: Record<TeamCode, number>,
  onSetOverride: (matchId: string, winner: TeamCode) => void,
) {
  const { home, away } = m;

  // Both sides fully decided — one real (or forced) matchup.
  if (home.kind === "team" && away.kind === "team") {
    const pct = winPct(elos, home.code, away.code);
    return (
      <MatchupRow
        home={home.code}
        away={away.code}
        homePct={pct}
        isHomeWinner={m.winner === home.code}
        isAwayWinner={m.winner === away.code}
        onPickHome={() => onSetOverride(m.id, home.code)}
        onPickAway={() => onSetOverride(m.id, away.code)}
      />
    );
  }

  // One side decided, the other still branching between two possible teams —
  // show both hypothetical matchups, each with its own real win%. Only the
  // candidate side is clickable — the other side is already fixed, so
  // there's no override action that makes sense for it here.
  if (home.kind === "team" && away.kind === "pending") {
    return away.candidates.map((candidate) => (
      <MatchupRow
        key={candidate}
        home={home.code}
        away={candidate}
        homePct={winPct(elos, home.code, candidate)}
        isHomeWinner={false}
        isAwayWinner={false}
        note={`if ${name(candidate)} wins`}
        onPickAway={() => onSetOverride(away.feederMatchId, candidate)}
      />
    ));
  }
  if (home.kind === "pending" && away.kind === "team") {
    return home.candidates.map((candidate) => (
      <MatchupRow
        key={candidate}
        home={candidate}
        away={away.code}
        homePct={winPct(elos, candidate, away.code)}
        isHomeWinner={false}
        isAwayWinner={false}
        note={`if ${name(candidate)} wins`}
        onPickHome={() => onSetOverride(home.feederMatchId, candidate)}
      />
    ));
  }

  // Both sides still depend on undecided matches further upstream — too many
  // branches to show meaningfully here, so this stays a plain placeholder.
  return <div className={s.tbdCard}>TBD vs TBD</div>;
}