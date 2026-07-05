import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { resolveWhatIfBracket, currentElos, type MatchOverride, type ResolvedSide } from "../../lib/whatIf";
import { toAdvancementProbabilities } from "../../lib/elo";
import { TEAM_BY_CODE } from "../../lib/teams";
import { useIsMobile } from "../../lib/hooks/useIsMobile";
import { RoundCarousel, type RoundCarouselHandle } from "../../components/bracket/RoundCarousel";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./WhatIfBracket.module.css";

const R32_IDS = ["ko-73","ko-74","ko-75","ko-76","ko-77","ko-78","ko-79","ko-80","ko-81","ko-82","ko-83","ko-84","ko-85","ko-86","ko-87","ko-88"];
const R16_IDS = ["ko-89","ko-90","ko-91","ko-92","ko-93","ko-94","ko-95","ko-96"];
const QF_IDS  = ["ko-97","ko-99","ko-98","ko-100"];
const SF_IDS  = ["ko-101","ko-102"];
const FIN_ID  = "ko-104";

/** Round groupings in order — used both for layout and for figuring out which round a match belongs to, for auto-advance. */
const ROUND_ID_GROUPS = [R32_IDS, R16_IDS, QF_IDS, SF_IDS, [FIN_ID]];
const ROUND_LABELS = ["R32", "R16", "QF", "SF", "F"];

function name(code: TeamCode): string {
  return TEAM_BY_CODE[code]?.name ?? code;
}

function winPct(elos: Record<TeamCode, number>, home: TeamCode, away: TeamCode): number {
  return toAdvancementProbabilities(elos[home] ?? 1500, elos[away] ?? 1500, 0).home;
}

function roundIndexOf(matchId: string): number {
  return ROUND_ID_GROUPS.findIndex((group) => group.includes(matchId));
}

type Match = ReturnType<typeof resolveWhatIfBracket>[number];
type PendingSide = ResolvedSide & { kind: "pending" };

function isRoundComplete(roundIndex: number, byId: Map<string, Match>): boolean {
  const ids = ROUND_ID_GROUPS[roundIndex];
  return ids.every((id) => byId.get(id)?.winner !== null);
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
  const isMobile = useIsMobile();
  const carouselRef = useRef<RoundCarouselHandle>(null);
  const lastPickedRoundRef = useRef<number | null>(null);

  const elos = useMemo(() => currentElos(stored), [stored]);
  const matches = useMemo(() => resolveWhatIfBracket(stored, overrides), [stored, overrides]);
  const byId = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);

  // Which of the two candidates is currently shown for a still-undecided
  // opponent slot — display preference only, not part of the scenario.
  const [focused, setFocused] = useState<Record<string, TeamCode>>({});

  function focusedCandidate(side: PendingSide): TeamCode {
    return focused[side.feederMatchId] ?? side.candidates[0];
  }

  function toggleFocus(side: PendingSide) {
    const current = focusedCandidate(side);
    const other = current === side.candidates[0] ? side.candidates[1] : side.candidates[0];
    setFocused((prev) => ({ ...prev, [side.feederMatchId]: other }));
  }

  function displayCode(side: ResolvedSide): TeamCode | null {
    if (side.kind === "team") return side.code;
    if (side.kind === "pending") return focusedCandidate(side);
    return null;
  }

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

    // Recorded here, checked in the effect below once `byId` has actually
    // been recomputed with this pick applied — state updates aren't
    // synchronous, so checking "is this round done" against the current
    // (pre-pick) byId would always be one pick behind.
    lastPickedRoundRef.current = roundIndexOf(m.id);
  }

  // Auto-advance to the next round, but ONLY when the round just picked in
  // has no undecided matches left — picking one match in a round that still
  // has another undecided match (e.g. USA v Belgium decided, Portugal v
  // Spain still open) should NOT jump ahead, since the other match is
  // right there on the same page with no scrolling needed to reach it.
  useEffect(() => {
    const roundIndex = lastPickedRoundRef.current;
    if (roundIndex === null) return;
    lastPickedRoundRef.current = null;
    if (roundIndex < ROUND_ID_GROUPS.length - 1 && isRoundComplete(roundIndex, byId)) {
      carouselRef.current?.scrollToRound(roundIndex + 1);
    }
  }, [byId]);

  // ── Layout geometry — same algorithm as BracketView, sized a bit taller
  // to fit the "switch team" links this bracket needs that the real one doesn't.
  const CARD_W = 190;
  const CARD_H = 100;
  const ROW_GAP = 14;
  const COL_GAP = 40;

  function layoutRound(prevYs: number[], count: number): number[] {
    if (prevYs.length === 0) {
      return Array.from({ length: count }, (_, i) => i * (CARD_H + ROW_GAP));
    }
    const ys: number[] = [];
    for (let i = 0; i < count; i++) ys.push((prevYs[i * 2] + prevYs[i * 2 + 1]) / 2);
    return ys;
  }

  const r32Ys = layoutRound([], 16);
  const r16Ys = layoutRound(r32Ys, 8);
  const qfYs = layoutRound(r16Ys, 4);
  const sfYs = layoutRound(qfYs, 2);
  const finY = (sfYs[0] + sfYs[1]) / 2;
  const totalHeight = r32Ys[r32Ys.length - 1] + CARD_H + 24;

  const colX = {
    r32: 0,
    r16: CARD_W + COL_GAP,
    qf: (CARD_W + COL_GAP) * 2,
    sf: (CARD_W + COL_GAP) * 3,
    fin: (CARD_W + COL_GAP) * 4,
  };
  const totalWidth = colX.fin + CARD_W;

  function renderConnectors(srcX: number, srcYs: number[], dstX: number, dstYs: number[]): ReactElement[] {
    const midX = srcX + CARD_W + COL_GAP / 2;
    const lines: ReactElement[] = [];
    for (let i = 0; i < dstYs.length; i++) {
      const y1 = srcYs[i * 2] + CARD_H / 2;
      const y2 = srcYs[i * 2 + 1] + CARD_H / 2;
      const yMid = dstYs[i] + CARD_H / 2;
      lines.push(
        <path key={`${srcX}-${i}-a`} d={`M ${srcX + CARD_W} ${y1} H ${midX} V ${yMid}`} className={s.connector} />,
        <path key={`${srcX}-${i}-b`} d={`M ${srcX + CARD_W} ${y2} H ${midX} V ${yMid}`} className={s.connector} />,
        <path key={`${srcX}-${i}-c`} d={`M ${midX} ${yMid} H ${dstX}`} className={s.connector} />,
      );
    }
    return lines;
  }

  /** Card content — no positioning, reused by both the desktop absolute canvas and the plain-flow mobile list. */
  function CardContent({ id }: { id: string }) {
    const m = byId.get(id);
    if (!m) return null;
    const homeCode = displayCode(m.home);
    const awayCode = displayCode(m.away);
    const bothKnown = !!homeCode && !!awayCode;
    const pct = bothKnown ? winPct(elos, homeCode!, awayCode!) : 0.5;

    return (
      <div className={s.card}>
        <button
          type="button"
          disabled={!homeCode}
          className={[s.team, m.winner === homeCode ? s.fav : ""].join(" ")}
          onClick={() => pickWinner(m, "home")}
        >
          <span className={s.teamName}>{homeCode ? name(homeCode) : "TBD"}</span>
          {bothKnown && <span className={s.pct}>{Math.round(pct * 100)}%</span>}
        </button>
        {m.home.kind === "pending" && (
          <button type="button" className={s.switchBtn} onClick={() => toggleFocus(m.home as PendingSide)}>
            ⇄ switch team
          </button>
        )}

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
        {m.away.kind === "pending" && (
          <button type="button" className={s.switchBtn} onClick={() => toggleFocus(m.away as PendingSide)}>
            ⇄ switch team
          </button>
        )}

        <div className={s.cardFooter}>
          {m.isOverridden && (
            <button type="button" className={s.clearBtn} onClick={() => onClearOverride(m.id)}>
              Reset to real result
            </button>
          )}
          {!m.isOverridden && m.hasRealResult && <span className={s.realTag}>Real result</span>}
        </div>
      </div>
    );
  }

  function PositionedCard({ id, x, y }: { id: string; x: number; y: number }) {
    return (
      <div style={{ position: "absolute", left: x, top: y, width: CARD_W, height: CARD_H }}>
        <CardContent id={id} />
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <p className={s.hint}>
        Click a team to make them the winner. If an opponent is still undecided, the most likely
        candidate shows first — use "switch team" to see the other one before picking.
      </p>

      {isMobile ? (
        <RoundCarousel ref={carouselRef} roundLabels={ROUND_LABELS}>
          {ROUND_ID_GROUPS.map((ids, i) => (
            <div className={s.mobileList} key={ROUND_LABELS[i]}>
              {ids.map((id) => <CardContent key={id} id={id} />)}
            </div>
          ))}
        </RoundCarousel>
      ) : (
        <div className={s.scrollWrap}>
          <div className={s.canvas} style={{ width: totalWidth, height: totalHeight }}>
            <div className={s.colLabel} style={{ left: colX.r32, width: CARD_W }}>Round of 32</div>
            <div className={s.colLabel} style={{ left: colX.r16, width: CARD_W }}>Round of 16</div>
            <div className={s.colLabel} style={{ left: colX.qf, width: CARD_W }}>Quarterfinals</div>
            <div className={s.colLabel} style={{ left: colX.sf, width: CARD_W }}>Semifinals</div>
            <div className={s.colLabel} style={{ left: colX.fin, width: CARD_W }}>Final</div>

            <svg className={s.connectorLayer} width={totalWidth} height={totalHeight}>
              {renderConnectors(colX.r32, r32Ys, colX.r16, r16Ys)}
              {renderConnectors(colX.r16, r16Ys, colX.qf, qfYs)}
              {renderConnectors(colX.qf, qfYs, colX.sf, sfYs)}
              {renderConnectors(colX.sf, sfYs, colX.fin, [finY])}
            </svg>

            {R32_IDS.map((id, i) => <PositionedCard key={id} id={id} x={colX.r32} y={r32Ys[i]} />)}
            {R16_IDS.map((id, i) => <PositionedCard key={id} id={id} x={colX.r16} y={r16Ys[i]} />)}
            {QF_IDS.map((id, i) => <PositionedCard key={id} id={id} x={colX.qf} y={qfYs[i]} />)}
            {SF_IDS.map((id, i) => <PositionedCard key={id} id={id} x={colX.sf} y={sfYs[i]} />)}
            <PositionedCard id={FIN_ID} x={colX.fin} y={finY} />
          </div>
        </div>
      )}
    </div>
  );
}