import { useMemo, type ReactElement } from "react";
import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from "../../data";
import { computeElosFromResults, runSimulation } from "../../lib/simulate";
import { TEAM_BY_CODE, TEAMS_BY_GROUP } from "../../lib/teams";
import type {
  StoredResults,
  TeamCode,
  TeamProbabilities,
} from "../../lib/types";
import s from "./BracketView.module.css";

type Props = { stored: StoredResults };

// R32 match definitions — ordered so pairs [0,1] feed R16[0], [2,3] feed R16[1], etc.
// Left half: indices 0–7 (feeds SF1), Right half: indices 8–15 (feeds SF2)
const R32_DEFS = [
  // Left half
  { id: "ko-74", homeSlot: "1E", awaySlot: "3A/B/C/D/F" },
  { id: "ko-77", homeSlot: "1I", awaySlot: "3C/D/F/G/H" },
  { id: "ko-73", homeSlot: "2A", awaySlot: "2B" },
  { id: "ko-75", homeSlot: "1F", awaySlot: "2C" },
  { id: "ko-83", homeSlot: "2K", awaySlot: "2L" },
  { id: "ko-84", homeSlot: "1H", awaySlot: "2J" },
  { id: "ko-81", homeSlot: "1D", awaySlot: "3B/E/F/I/J" },
  { id: "ko-82", homeSlot: "1G", awaySlot: "3A/E/H/I/J" },
  // Right half
  { id: "ko-76", homeSlot: "1C", awaySlot: "2F" },
  { id: "ko-78", homeSlot: "2E", awaySlot: "2I" },
  { id: "ko-79", homeSlot: "1A", awaySlot: "3C/E/F/H/I" },
  { id: "ko-80", homeSlot: "1L", awaySlot: "3E/H/I/J/K" },
  { id: "ko-86", homeSlot: "1J", awaySlot: "2H" },
  { id: "ko-88", homeSlot: "2D", awaySlot: "2G" },
  { id: "ko-85", homeSlot: "1B", awaySlot: "3E/F/G/I/J" },
  { id: "ko-87", homeSlot: "1K", awaySlot: "3D/E/I/J/L" },
] as const;

// R16 match IDs in order matching R32 pairs above
const R16_IDS = ["ko-90","ko-89","ko-94","ko-93","ko-91","ko-92","ko-96","ko-95"];
// QF IDs
const QF_IDS  = ["ko-97","ko-98","ko-99","ko-100"];
// SF IDs
const SF_IDS  = ["ko-101","ko-102"];
// Final
const FIN_ID  = "ko-final";

type SlotTeam = {
  code: TeamCode;
  name: string;
  confirmed: boolean; // true = real result, false = model prediction
} | null;

type MatchNode = {
  id: string;
  top: SlotTeam;
  bot: SlotTeam;
  topWinPct: number;
  confirmed: boolean; // match result is confirmed
};

function resolveGroupSlot(
  slot: string,
  probs: TeamProbabilities[],
): TeamCode | null {
  const winnerMatch = slot.match(/^1([A-L])$/);
  const runnerMatch = slot.match(/^2([A-L])$/);
  const thirdMatch  = slot.match(/^3(.+)$/);

  if (winnerMatch) {
    const g = winnerMatch[1] as keyof typeof TEAMS_BY_GROUP;
    const candidates = TEAMS_BY_GROUP[g] ?? [];
    const best = candidates
      .map((c) => probs.find((p) => p.code === c))
      .filter(Boolean)
      .sort((a, b) => (b!.groupWin + b!.advanceFromGroup) - (a!.groupWin + a!.advanceFromGroup));
    return best[0]?.code ?? null;
  }

  if (runnerMatch) {
    const g = runnerMatch[1] as keyof typeof TEAMS_BY_GROUP;
    const candidates = TEAMS_BY_GROUP[g] ?? [];
    const best = candidates
      .map((c) => probs.find((p) => p.code === c))
      .filter(Boolean)
      .sort((a, b) => (b!.groupSecond + b!.advanceFromGroup) - (a!.groupSecond + a!.advanceFromGroup));
    return best[0]?.code ?? null;
  }

  if (thirdMatch) {
    const groups = thirdMatch[1].split("/") as Array<keyof typeof TEAMS_BY_GROUP>;
    const eligible = groups.flatMap((g) => TEAMS_BY_GROUP[g] ?? []);
    const best = eligible
      .map((c) => probs.find((p) => p.code === c))
      .filter(Boolean)
      .sort((a, b) => b!.advanceAsThird - a!.advanceAsThird);
    return best[0]?.code ?? null;
  }

  return null;
}

function toSlotTeam(code: TeamCode | null, confirmed: boolean): SlotTeam {
  if (!code) return null;
  return { code, name: TEAM_BY_CODE[code]?.name ?? code, confirmed };
}

function winPct(top: SlotTeam, bot: SlotTeam, elos: Record<TeamCode, number>): number {
  if (!top || !bot) return 0.5;
  const diff = (elos[top.code] ?? 1500) - (elos[bot.code] ?? 1500);
  return 1 / (1 + Math.pow(10, -diff / 400));
}

function confirmedWinner(
  id: string,
  top: SlotTeam,
  bot: SlotTeam,
  stored: StoredResults,
): TeamCode | null {
  const result = stored.knockoutMatches?.[id];
  if (!result || !top || !bot) return null;
  if (result.homeGoals > result.awayGoals) return top.code;
  if (result.awayGoals > result.homeGoals) return bot.code;
  // Draw in knockout = go to penalties — use Elo to pick winner
  return null; // treat as unconfirmed if draw (shouldn't happen)
}

export function BracketView({ stored }: Props) {
  const { r32, r16, qf, sf, fin, champ } = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });

    const sim  = runSimulation(playedMatches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS);
    const elos = computeElosFromResults(playedMatches, DEFAULT_SETTINGS);
    const probs = sim.probabilities;

    // ── R32 ───────────────────────────────────────────────────────────────────
    const r32: MatchNode[] = R32_DEFS.map((def) => {
      const result = stored.knockoutMatches?.[def.id];
      const isConfirmed = !!result;

      // Always resolve teams from group outcome probs (group stage is done)
      const homeCode = resolveGroupSlot(def.homeSlot, probs);
      const awayCode = resolveGroupSlot(def.awaySlot, probs);
      const top = toSlotTeam(homeCode, true); // group stage teams are always confirmed
      const bot = toSlotTeam(awayCode, true);
      const topWinPct = winPct(top, bot, elos);

      return { id: def.id, top, bot, topWinPct, confirmed: isConfirmed };
    });

    // Helper: get the winner of an R32/R16/QF/SF match
    // Uses confirmed result if available, otherwise predicted winner
    function getWinner(node: MatchNode): SlotTeam {
      if (!node.top && !node.bot) return null;
      if (!node.top) return node.bot;
      if (!node.bot) return node.top;

      const confWin = confirmedWinner(node.id, node.top, node.bot, stored);
      if (confWin) {
        return toSlotTeam(confWin, true);
      }
      // Predicted winner
      const predCode = node.topWinPct >= 0.5 ? node.top.code : node.bot.code;
      return toSlotTeam(predCode, false);
    }

    // ── R16 ───────────────────────────────────────────────────────────────────
    // Each R16 match is the winner of two adjacent R32 matches
    const r16: MatchNode[] = R16_IDS.map((id, i) => {
      const topSrc = r32[i * 2];
      const botSrc = r32[i * 2 + 1];
      const top = getWinner(topSrc);
      const bot = getWinner(botSrc);
      const topWinPct = winPct(top, bot, elos);
      const isConfirmed = !!stored.knockoutMatches?.[id];
      return { id, top, bot, topWinPct, confirmed: isConfirmed };
    });

    // ── QF ────────────────────────────────────────────────────────────────────
    const qf: MatchNode[] = QF_IDS.map((id, i) => {
      const topSrc = r16[i * 2];
      const botSrc = r16[i * 2 + 1];
      const top = getWinner(topSrc);
      const bot = getWinner(botSrc);
      const topWinPct = winPct(top, bot, elos);
      const isConfirmed = !!stored.knockoutMatches?.[id];
      return { id, top, bot, topWinPct, confirmed: isConfirmed };
    });

    // ── SF ────────────────────────────────────────────────────────────────────
    const sf: MatchNode[] = SF_IDS.map((id, i) => {
      const topSrc = qf[i * 2];
      const botSrc = qf[i * 2 + 1];
      const top = getWinner(topSrc);
      const bot = getWinner(botSrc);
      const topWinPct = winPct(top, bot, elos);
      const isConfirmed = !!stored.knockoutMatches?.[id];
      return { id, top, bot, topWinPct, confirmed: isConfirmed };
    });

    // ── Final ─────────────────────────────────────────────────────────────────
    const finTop = getWinner(sf[0]);
    const finBot = getWinner(sf[1]);
    const finWinPct = winPct(finTop, finBot, elos);
    const isConfirmed = !!stored.knockoutMatches?.[FIN_ID];
    const fin: MatchNode = { id: FIN_ID, top: finTop, bot: finBot, topWinPct: finWinPct, confirmed: isConfirmed };

    // Champion
    const confWin = confirmedWinner(FIN_ID, finTop, finBot, stored);
    const champ = confWin
      ? toSlotTeam(confWin, true)
      : toSlotTeam(finWinPct >= 0.5 ? finTop?.code ?? null : finBot?.code ?? null, false);

    return { r32, r16, qf, sf, fin, champ };
  }, [stored]);

  // ── Layout geometry ──────────────────────────────────────────────────────────
  // Card height + gap define the vertical rhythm. Each round's matches are
  // centered exactly between the midpoints of the two matches that feed them.
  const CARD_H   = 44;   // height of one match card
  const CARD_W   = 168;  // width of one match card
  const ROW_GAP  = 10;   // vertical gap between adjacent R32 cards
  const COL_GAP  = 36;   // horizontal gap between round columns

  function layoutRound(matches: MatchNode[], prevYs: number[]): number[] {
    // Each match's y = midpoint between the two source y's it descends from
    if (prevYs.length === 0) {
      return matches.map((_, i) => i * (CARD_H + ROW_GAP));
    }
    const ys: number[] = [];
    for (let i = 0; i < matches.length; i++) {
      const a = prevYs[i * 2];
      const b = prevYs[i * 2 + 1];
      ys.push((a + b) / 2);
    }
    return ys;
  }

  const r32Ys = layoutRound(r32, []);
  const r16Ys = layoutRound(r16, r32Ys);
  const qfYs  = layoutRound(qf,  r16Ys);
  const sfYs  = layoutRound(sf,  qfYs);
  const finY  = (sfYs[0] + sfYs[1]) / 2;

  const totalHeight = Math.max(...r32Ys) + CARD_H + 20;

  // X positions for left-half columns (R32 → R16 → QF → SF), final in center,
  // then mirrored right-half columns (SF → QF → R16 → R32)
  const colX = {
    r32L: 0,
    r16L: CARD_W + COL_GAP,
    qfL:  (CARD_W + COL_GAP) * 2,
    sfL:  (CARD_W + COL_GAP) * 3,
    fin:  (CARD_W + COL_GAP) * 4,
    sfR:  (CARD_W + COL_GAP) * 5,
    qfR:  (CARD_W + COL_GAP) * 6,
    r16R: (CARD_W + COL_GAP) * 7,
    r32R: (CARD_W + COL_GAP) * 8,
  };
  const totalWidth = colX.r32R + CARD_W;

  // Split each round into left half (feeds SF1) and right half (feeds SF2)
  const half = (arr: MatchNode[]) => [arr.slice(0, arr.length / 2), arr.slice(arr.length / 2)];
  const halfY = (arr: number[]) => [arr.slice(0, arr.length / 2), arr.slice(arr.length / 2)];

  const [r32L, r32R] = half(r32);
  const [r32YL, r32YR] = halfY(r32Ys);
  const [r16L, r16R] = half(r16);
  const [r16YL, r16YR] = halfY(r16Ys);
  const [qfL, qfR] = half(qf);
  const [qfYL, qfYR] = halfY(qfYs);

  // Connector lines are drawn inline inside renderConnectors / renderConnectorsMirror below.

  function renderConnectors(
    srcX: number, srcYs: number[], dstX: number, dstYs: number[],
  ): ReactElement[] {
    const midX = srcX + CARD_W + COL_GAP / 2;
    const lines: ReactElement[] = [];
    for (let i = 0; i < dstYs.length; i++) {
      const y1 = srcYs[i * 2] + CARD_H / 2;
      const y2 = srcYs[i * 2 + 1] + CARD_H / 2;
      const yMid = dstYs[i] + CARD_H / 2;
      lines.push(
        <path key={`c-${srcX}-${i}-a`} d={`M ${srcX + CARD_W} ${y1} H ${midX} V ${yMid}`} className={s.connector} />,
        <path key={`c-${srcX}-${i}-b`} d={`M ${srcX + CARD_W} ${y2} H ${midX} V ${yMid}`} className={s.connector} />,
        <path key={`c-${srcX}-${i}-c`} d={`M ${midX} ${yMid} H ${dstX}`} className={s.connector} />,
      );
    }
    return lines;
  }

  // Mirror version: target is to the LEFT of source (right half of bracket)
  function renderConnectorsMirror(
    srcX: number, srcYs: number[], dstX: number, dstYs: number[],
  ): ReactElement[] {
    const midX = dstX + CARD_W + COL_GAP / 2;
    const lines: ReactElement[] = [];
    for (let i = 0; i < dstYs.length; i++) {
      const y1 = srcYs[i * 2] + CARD_H / 2;
      const y2 = srcYs[i * 2 + 1] + CARD_H / 2;
      const yMid = dstYs[i] + CARD_H / 2;
      lines.push(
        <path key={`m-${srcX}-${i}-a`} d={`M ${srcX} ${y1} H ${midX} V ${yMid}`} className={s.connector} />,
        <path key={`m-${srcX}-${i}-b`} d={`M ${srcX} ${y2} H ${midX} V ${yMid}`} className={s.connector} />,
        <path key={`m-${srcX}-${i}-c`} d={`M ${midX} ${yMid} H ${dstX + CARD_W}`} className={s.connector} />,
      );
    }
    return lines;
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · 10,000 Simulations</div>
        <h1 className={s.title}>Tournament Bracket</h1>
        {champ && (
          <div className={s.champBanner}>
            <span className={s.champLabel}>
              {champ.confirmed ? "Champion" : "Most likely champion"}
            </span>
            <span className={s.champName}>{champ.name}</span>
          </div>
        )}
      </div>

      <div className={s.scrollWrap}>
        <div className={s.canvas} style={{ width: totalWidth, height: totalHeight }}>

          {/* Round labels */}
          <div className={s.colLabel} style={{ left: colX.r32L, width: CARD_W }}>Round of 32</div>
          <div className={s.colLabel} style={{ left: colX.r16L, width: CARD_W }}>Round of 16</div>
          <div className={s.colLabel} style={{ left: colX.qfL,  width: CARD_W }}>Quarterfinals</div>
          <div className={s.colLabel} style={{ left: colX.sfL,  width: CARD_W }}>Semifinals</div>
          <div className={s.colLabel} style={{ left: colX.fin,  width: CARD_W }}>Final</div>
          <div className={s.colLabel} style={{ left: colX.sfR,  width: CARD_W }}>Semifinals</div>
          <div className={s.colLabel} style={{ left: colX.qfR,  width: CARD_W }}>Quarterfinals</div>
          <div className={s.colLabel} style={{ left: colX.r16R, width: CARD_W }}>Round of 16</div>
          <div className={s.colLabel} style={{ left: colX.r32R, width: CARD_W }}>Round of 32</div>

          {/* Connector lines — SVG overlay */}
          <svg className={s.connectorLayer} width={totalWidth} height={totalHeight}>
            {renderConnectors(colX.r32L, r32YL, colX.r16L, r16YL)}
            {renderConnectors(colX.r16L, r16YL, colX.qfL,  qfYL)}
            {renderConnectors(colX.qfL,  qfYL,  colX.sfL,  sfYs.slice(0,1))}
            {renderConnectors(colX.sfL,  sfYs.slice(0,1), colX.fin, [finY])}

            {renderConnectorsMirror(colX.r32R, r32YR, colX.r16R, r16YR)}
            {renderConnectorsMirror(colX.r16R, r16YR, colX.qfR,  qfYR)}
            {renderConnectorsMirror(colX.qfR,  qfYR,  colX.sfR,  sfYs.slice(1,2))}
            {renderConnectorsMirror(colX.sfR,  sfYs.slice(1,2), colX.fin, [finY])}
          </svg>

          {/* Match cards */}
          {r32L.map((m, i)  => <PositionedCard key={m.id} match={m} x={colX.r32L} y={r32YL[i]} />)}
          {r16L.map((m, i)  => <PositionedCard key={m.id} match={m} x={colX.r16L} y={r16YL[i]} />)}
          {qfL.map((m, i)   => <PositionedCard key={m.id} match={m} x={colX.qfL}  y={qfYL[i]} />)}
          <PositionedCard match={sf[0]} x={colX.sfL} y={sfYs[0]} />
          <PositionedCard match={fin}   x={colX.fin} y={finY} highlight />
          <PositionedCard match={sf[1]} x={colX.sfR} y={sfYs[1]} />
          {qfR.map((m, i)   => <PositionedCard key={m.id} match={m} x={colX.qfR}  y={qfYR[i]} />)}
          {r16R.map((m, i)  => <PositionedCard key={m.id} match={m} x={colX.r16R} y={r16YR[i]} />)}
          {r32R.map((m, i)  => <PositionedCard key={m.id} match={m} x={colX.r32R} y={r32YR[i]} />)}

        </div>
      </div>
    </div>
  );
}

function PositionedCard({
  match, x, y, highlight,
}: { match: MatchNode; x: number; y: number; highlight?: boolean }) {
  const { top, bot, topWinPct, confirmed } = match;
  const topPct = Math.round(topWinPct * 100);
  const botPct = 100 - topPct;
  const topFav = topWinPct >= 0.5;

  return (
    <div
      className={`${s.matchCard} ${confirmed ? s.matchConfirmed : ""} ${highlight ? s.matchFinal : ""}`}
      style={{ left: x, top: y }}
    >
      <div className={`${s.team} ${topFav ? s.fav : ""}`}>
        <span className={s.teamName}>{top?.name ?? "TBD"}</span>
        <span className={s.pct}>{top && !confirmed ? `${topPct}%` : ""}</span>
      </div>
      <div className={`${s.team} ${!topFav ? s.fav : ""}`}>
        <span className={s.teamName}>{bot?.name ?? "TBD"}</span>
        <span className={s.pct}>{bot && !confirmed ? `${botPct}%` : ""}</span>
      </div>
    </div>
  );
}