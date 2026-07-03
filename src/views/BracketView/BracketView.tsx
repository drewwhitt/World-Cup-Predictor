import { useMemo, type ReactElement } from "react";
import { computeElosFromResults } from "../../lib/simulate";
import { GROUP_MATCHES } from "../../data";
import { toAdvancementProbabilities } from "../../lib/elo";
import { TEAM_BY_CODE } from "../../lib/teams";
import { DEFAULT_SETTINGS } from "../../data";
import { buildLiveKnockoutMatchups, buildLiveTeams } from "../../data/veridexLive";
import type { KnockoutMatchupProbability, StoredResults, TeamCode } from "../../lib/types";
import s from "./BracketView.module.css";

type Props = { stored: StoredResults };

/**
 * Confirmed Round of 32 matchups for the 2026 World Cup, taken directly
 * from FIFA's published bracket (Annex C combination already applied).
 * These are fixed — no slot-guessing needed since the actual draw is known.
 * Ordered left half (0-7, feeds SF1) then right half (8-15, feeds SF2),
 * matching the official bracket's top-to-bottom layout.
 */
const R32_MATCHUPS: Array<{ id: string; home: TeamCode; away: TeamCode }> = [
  // Left half
  { id: "ko-73", home: "GER", away: "PAR" },
  { id: "ko-74", home: "FRA", away: "SWE" },
  { id: "ko-75", home: "RSA", away: "CAN" },
  { id: "ko-76", home: "NED", away: "MAR" },
  { id: "ko-77", home: "POR", away: "CRO" },
  { id: "ko-78", home: "ESP", away: "AUT" },
  { id: "ko-79", home: "USA", away: "BIH" },
  { id: "ko-80", home: "BEL", away: "SEN" },
  // Right half
  { id: "ko-81", home: "BRA", away: "JPN" },
  { id: "ko-82", home: "CIV", away: "NOR" },
  { id: "ko-83", home: "MEX", away: "ECU" },
  { id: "ko-84", home: "ENG", away: "COD" },
  { id: "ko-85", home: "ARG", away: "CPV" },
  { id: "ko-86", home: "AUS", away: "EGY" },
  { id: "ko-87", home: "SUI", away: "ALG" },
  { id: "ko-88", home: "COL", away: "GHA" },
];

const R16_IDS = ["ko-89","ko-90","ko-91","ko-92","ko-93","ko-94","ko-95","ko-96"];
const QF_IDS  = ["ko-97","ko-98","ko-99","ko-100"];
const SF_IDS  = ["ko-101","ko-102"];
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
  topWinPct: number;       // current prediction (for future rounds)
  preMatchTopPct: number;  // what the model said before this match was played
  confirmed: boolean;
  winnerCode: TeamCode | null;
};

function toSlotTeam(code: TeamCode | null, confirmed: boolean): SlotTeam {
  if (!code) return null;
  return { code, name: TEAM_BY_CODE[code]?.name ?? code, confirmed };
}

function winPct(top: SlotTeam, bot: SlotTeam, elos: Record<TeamCode, number>): number {
  if (!top || !bot) return 0.5;
  const { home } = toAdvancementProbabilities(elos[top.code] ?? 1500, elos[bot.code] ?? 1500, 0);
  return home;
}

/**
 * Win% for the "top" slot in this specific bracket match, sourced from the
 * real 10,000-sim Monte Carlo run (matchupById), not a raw two-team Elo
 * comparison. This is what makes the bracket's projections agree with the
 * championship odds shown on Home/Forecasts — both now come from the same
 * simulation. Falls back to a raw Elo comparison only if this exact pairing
 * never occurred in any of the 10,000 simulated tournaments (rare, but
 * possible for very deep long-shot combinations).
 */
function liveWinPct(
  id: string,
  top: SlotTeam,
  bot: SlotTeam,
  matchupById: Map<string, KnockoutMatchupProbability>,
  elos: Record<TeamCode, number>,
): number {
  if (!top || !bot) return 0.5;
  const entry = matchupById.get(id);
  if (!entry) return winPct(top, bot, elos);
  if (entry.projectedWinner === top.code) return entry.winnerProbability;
  if (entry.projectedWinner === bot.code) return 1 - entry.winnerProbability;
  return winPct(top, bot, elos);
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
  // Level after 90/ET — check penalty shootout winner
  if (result.penaltyWinner === "home") return top.code;
  if (result.penaltyWinner === "away") return bot.code;
  return null; // draw with no penalty winner recorded yet
}

export function BracketView({ stored }: Props) {
  const { r32, r16, qf, sf, fin, champ, overallChampion } = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    const elos = computeElosFromResults(playedMatches, DEFAULT_SETTINGS);

    // Real per-slot projections from the same 10,000-sim Monte Carlo run
    // that powers the Home/Forecasts championship odds. This is what makes
    // "most likely champion" here agree with those tabs instead of being a
    // separate, naive pairwise-Elo greedy walk.
    const liveMatchups = buildLiveKnockoutMatchups(stored);
    const matchupById = new Map(liveMatchups.map((m) => [m.id, m]));

    // ── R32 — fixed matchups from the real bracket, no guessing ─────────────
    const r32: MatchNode[] = R32_MATCHUPS.map((m) => {
      const top = toSlotTeam(m.home, true);
      const bot = toSlotTeam(m.away, true);
      const topWinPct = liveWinPct(m.id, top, bot, matchupById, elos);
      const preMatchTopPct = winPct(top, bot, elos);
      const isConfirmed = !!stored.knockoutMatches?.[m.id];
      const winnerCode = isConfirmed ? confirmedWinner(m.id, top, bot, stored) : null;
      // preMatchTopPct = odds at kickoff, from Elo alone — must never reflect
      // this match's own result, even after it's confirmed, or "upset"
      // detection and the pre-match % shown on played cards both break.
      return { id: m.id, top, bot, topWinPct, preMatchTopPct, confirmed: isConfirmed, winnerCode };
    });

    function getWinner(node: MatchNode): SlotTeam {
      if (!node.top && !node.bot) return null;
      if (!node.top) return node.bot;
      if (!node.bot) return node.top;
      const confWin = confirmedWinner(node.id, node.top, node.bot, stored);
      if (confWin) return toSlotTeam(confWin, true);
      // Use the simulation's projected winner for this exact slot, rather
      // than a standalone pairwise Elo comparison of node.top vs node.bot.
      const predCode = node.topWinPct >= 0.5 ? node.top.code : node.bot.code;
      return toSlotTeam(predCode, false);
    }

    const r16: MatchNode[] = R16_IDS.map((id, i) => {
      const top = getWinner(r32[i * 2]);
      const bot = getWinner(r32[i * 2 + 1]);
      const topWinPct = liveWinPct(id, top, bot, matchupById, elos);
      const preMatchTopPct = winPct(top, bot, elos);
      const isConfirmed = !!stored.knockoutMatches?.[id];
      const winnerCode = isConfirmed ? confirmedWinner(id, top, bot, stored) : null;
      return { id, top, bot, topWinPct, preMatchTopPct, confirmed: isConfirmed, winnerCode };
    });

    const qf: MatchNode[] = QF_IDS.map((id, i) => {
      const top = getWinner(r16[i * 2]);
      const bot = getWinner(r16[i * 2 + 1]);
      const topWinPct = liveWinPct(id, top, bot, matchupById, elos);
      const preMatchTopPct = winPct(top, bot, elos);
      const isConfirmed = !!stored.knockoutMatches?.[id];
      const winnerCode = isConfirmed ? confirmedWinner(id, top, bot, stored) : null;
      return { id, top, bot, topWinPct, preMatchTopPct, confirmed: isConfirmed, winnerCode };
    });

    const sf: MatchNode[] = SF_IDS.map((id, i) => {
      const top = getWinner(qf[i * 2]);
      const bot = getWinner(qf[i * 2 + 1]);
      const topWinPct = liveWinPct(id, top, bot, matchupById, elos);
      const preMatchTopPct = winPct(top, bot, elos);
      const isConfirmed = !!stored.knockoutMatches?.[id];
      const winnerCode = isConfirmed ? confirmedWinner(id, top, bot, stored) : null;
      return { id, top, bot, topWinPct, preMatchTopPct, confirmed: isConfirmed, winnerCode };
    });

    const finTop = getWinner(sf[0]);
    const finBot = getWinner(sf[1]);
    const finWinPct = liveWinPct(FIN_ID, finTop, finBot, matchupById, elos);
    const finPreMatchTopPct = winPct(finTop, finBot, elos);
    const finIsConfirmed = !!stored.knockoutMatches?.[FIN_ID];
    const confWin = confirmedWinner(FIN_ID, finTop, finBot, stored);
    const fin: MatchNode = {
      id: FIN_ID, top: finTop, bot: finBot, topWinPct: finWinPct,
      preMatchTopPct: finPreMatchTopPct,
      confirmed: finIsConfirmed, winnerCode: finIsConfirmed ? confWin : null,
    };

    const champ = confWin
      ? toSlotTeam(confWin, true)
      : toSlotTeam(finWinPct >= 0.5 ? finTop?.code ?? null : finBot?.code ?? null, false);

    // The model's actual highest title-probability team (same number shown
    // on Home/Forecasts), which can legitimately differ from `champ` above.
    // `champ` traces a single most-likely PATH through the bracket step by
    // step; `overallChampion` is whoever wins the tournament most often
    // across all 10,000 simulated outcomes, correlated branches and all.
    // A team can be favored to win *if* they reach the final while still
    // being less likely than a rival to reach — and win — the title overall.
    let overallChampion: { code: TeamCode; name: string; pct: number } | null = null;
    if (!confWin) {
      const liveTeams = buildLiveTeams(stored);
      const top = [...liveTeams].sort((a, b) => b.current - a.current)[0];
      if (top) overallChampion = { code: top.code as TeamCode, name: top.name, pct: top.current };
    }

    return { r32, r16, qf, sf, fin, champ, overallChampion };
  }, [stored]);

  // ── Layout geometry — clean vertical tree, reads left to right ──────────────
  const CARD_H  = 46;
  const CARD_W  = 172;
  const ROW_GAP = 14;
  const COL_GAP = 40;

  function layoutRound(prevYs: number[], count: number): number[] {
    if (prevYs.length === 0) {
      return Array.from({ length: count }, (_, i) => i * (CARD_H + ROW_GAP));
    }
    const ys: number[] = [];
    for (let i = 0; i < count; i++) {
      ys.push((prevYs[i * 2] + prevYs[i * 2 + 1]) / 2);
    }
    return ys;
  }

  const r32Ys = layoutRound([], 16);
  const r16Ys = layoutRound(r32Ys, 8);
  const qfYs  = layoutRound(r16Ys, 4);
  const sfYs  = layoutRound(qfYs, 2);
  const finY  = (sfYs[0] + sfYs[1]) / 2;

  const totalHeight = r32Ys[r32Ys.length - 1] + CARD_H + 24;

  const colX = {
    r32: 0,
    r16: CARD_W + COL_GAP,
    qf:  (CARD_W + COL_GAP) * 2,
    sf:  (CARD_W + COL_GAP) * 3,
    fin: (CARD_W + COL_GAP) * 4,
  };
  const totalWidth = colX.fin + CARD_W;

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
        <path key={`${srcX}-${i}-a`} d={`M ${srcX + CARD_W} ${y1} H ${midX} V ${yMid}`} className={s.connector} />,
        <path key={`${srcX}-${i}-b`} d={`M ${srcX + CARD_W} ${y2} H ${midX} V ${yMid}`} className={s.connector} />,
        <path key={`${srcX}-${i}-c`} d={`M ${midX} ${yMid} H ${dstX}`} className={s.connector} />,
      );
    }
    return lines;
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · Round of 32 confirmed</div>
        <h1 className={s.title}>Tournament Bracket</h1>
        {champ && (
          <div className={s.champBanner}>
            <span className={s.champLabel}>
              {champ.confirmed ? "Champion" : "Most likely Final winner"}
            </span>
            <span className={s.champName}>{champ.name}</span>
            {!champ.confirmed && overallChampion && overallChampion.code !== champ.code && (
              <span className={s.champNote}>
                {overallChampion.name} leads the model's overall title odds at {overallChampion.pct}%
                — {champ.name} is favored specifically if these two meet in the Final.
              </span>
            )}
          </div>
        )}
      </div>

      <div className={s.scrollWrap}>
        <div className={s.canvas} style={{ width: totalWidth, height: totalHeight }}>
          <div className={s.colLabel} style={{ left: colX.r32, width: CARD_W }}>Round of 32</div>
          <div className={s.colLabel} style={{ left: colX.r16, width: CARD_W }}>Round of 16</div>
          <div className={s.colLabel} style={{ left: colX.qf,  width: CARD_W }}>Quarterfinals</div>
          <div className={s.colLabel} style={{ left: colX.sf,  width: CARD_W }}>Semifinals</div>
          <div className={s.colLabel} style={{ left: colX.fin, width: CARD_W }}>Final</div>

          <svg className={s.connectorLayer} width={totalWidth} height={totalHeight}>
            {renderConnectors(colX.r32, r32Ys, colX.r16, r16Ys)}
            {renderConnectors(colX.r16, r16Ys, colX.qf,  qfYs)}
            {renderConnectors(colX.qf,  qfYs,  colX.sf,  sfYs)}
            {renderConnectors(colX.sf,  sfYs,  colX.fin, [finY])}
          </svg>

          {r32.map((m, i) => <PositionedCard key={m.id} match={m} x={colX.r32} y={r32Ys[i]} />)}
          {r16.map((m, i) => <PositionedCard key={m.id} match={m} x={colX.r16} y={r16Ys[i]} />)}
          {qf.map((m, i)  => <PositionedCard key={m.id} match={m} x={colX.qf}  y={qfYs[i]} />)}
          {sf.map((m, i)  => <PositionedCard key={m.id} match={m} x={colX.sf}  y={sfYs[i]} />)}
          <PositionedCard match={fin} x={colX.fin} y={finY} highlight />
        </div>
      </div>
    </div>
  );
}

function PositionedCard({
  match, x, y, highlight,
}: { match: MatchNode; x: number; y: number; highlight?: boolean }) {
  const { top, bot, topWinPct, preMatchTopPct, confirmed, winnerCode } = match;
  const topPct = Math.round(topWinPct * 100);
  const botPct = 100 - topPct;

  const topIsWinner = confirmed ? top?.code === winnerCode : topWinPct >= 0.5;
  const botIsWinner = confirmed ? bot?.code === winnerCode : topWinPct < 0.5;

  // Upset: the pre-match underdog won (< 50% chance)
  const topWasUnderdog = preMatchTopPct < 0.5;
  const isUpset = confirmed && winnerCode && (
    (top?.code === winnerCode && topWasUnderdog) ||
    (bot?.code === winnerCode && !topWasUnderdog)
  );

  // Pre-match odds to display on confirmed cards
  const preMatchTopPct100 = Math.round(preMatchTopPct * 100);
  const preMatchBotPct100 = 100 - preMatchTopPct100;

  return (
    <div
      className={`${s.matchCard} ${confirmed ? s.matchConfirmed : ""} ${highlight ? s.matchFinal : ""} ${isUpset ? s.matchUpset : ""}`}
      style={{ left: x, top: y }}
    >
      <div className={`${s.team} ${topIsWinner ? s.fav : ""}`}>
        <span className={s.teamName}>{top?.name ?? "TBD"}</span>
        <span className={`${s.pct} ${isUpset && topIsWinner ? s.upsetPct : ""}`}>
          {top
            ? confirmed
              ? isUpset && topIsWinner ? "UPSET" : `${preMatchTopPct100}%`
              : `${topPct}%`
            : ""}
        </span>
      </div>
      <div className={`${s.team} ${botIsWinner ? s.fav : ""}`}>
        <span className={s.teamName}>{bot?.name ?? "TBD"}</span>
        <span className={`${s.pct} ${isUpset && botIsWinner ? s.upsetPct : ""}`}>
          {bot
            ? confirmed
              ? isUpset && botIsWinner ? "UPSET" : `${preMatchBotPct100}%`
              : `${botPct}%`
            : ""}
        </span>
      </div>
    </div>
  );
}