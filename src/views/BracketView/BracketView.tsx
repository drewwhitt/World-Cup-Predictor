import { useMemo } from "react";
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
            {!champ.confirmed && (
              <span className={s.champOdds}>
                {Math.round(fin.topWinPct * (fin.top?.code === champ.code ? 100 : 0) +
                  (1 - fin.topWinPct) * (fin.bot?.code === champ.code ? 100 : 0))}%
              </span>
            )}
          </div>
        )}
      </div>

      <div className={s.bracketGrid}>
        {/* Left half — top section */}
        <RoundSection label="Round of 32"   matches={r32.slice(0, 8)}  size="sm" />
        <RoundSection label="Round of 16"   matches={r16.slice(0, 4)}  size="sm" indent={1} />
        <RoundSection label="Quarterfinals" matches={qf.slice(0, 2)}   size="md" indent={2} />
        <RoundSection label="Semifinals"    matches={sf.slice(0, 1)}   size="md" indent={3} />

        {/* Final */}
        <div className={s.finalRow}>
          <div className={s.finalLabel}>Final</div>
          <MatchCard match={fin} size="lg" />
          {champ && (
            <div className={`${s.champResult} ${champ.confirmed ? s.confirmed : ""}`}>
              {champ.confirmed ? "🏆" : "🎯"} {champ.name}
            </div>
          )}
        </div>

        {/* Right half — mirror */}
        <RoundSection label="Semifinals"    matches={sf.slice(1, 2)}   size="md" indent={3} flip />
        <RoundSection label="Quarterfinals" matches={qf.slice(2, 4)}   size="md" indent={2} flip />
        <RoundSection label="Round of 16"   matches={r16.slice(4, 8)}  size="sm" indent={1} flip />
        <RoundSection label="Round of 32"   matches={r32.slice(8, 16)} size="sm" flip />
      </div>
    </div>
  );
}

function RoundSection({
  label, matches, size, indent = 0, flip = false,
}: {
  label: string;
  matches: MatchNode[];
  size: "sm" | "md" | "lg";
  indent?: number;
  flip?: boolean;
}) {
  const gap = [8, 20, 44, 100][indent] ?? 8;
  return (
    <div className={s.roundRow} style={{ justifyContent: flip ? "flex-end" : "flex-start" }}>
      {!flip && <div className={s.roundLabel}>{label}</div>}
      <div className={s.matchRow} style={{ gap }}>
        {matches.map((m) => <MatchCard key={m.id} match={m} size={size} />)}
      </div>
      {flip && <div className={`${s.roundLabel} ${s.roundLabelRight}`}>{label}</div>}
    </div>
  );
}

function MatchCard({ match, size }: { match: MatchNode; size: "sm" | "md" | "lg" }) {
  const { top, bot, topWinPct, confirmed } = match;
  const topPct = Math.round(topWinPct * 100);
  const botPct = 100 - topPct;
  const topFav = topWinPct >= 0.5;

  return (
    <div className={`${s.matchCard} ${s[size]} ${confirmed ? s.matchConfirmed : ""}`}>
      {confirmed && <div className={s.confirmedBadge}>✓</div>}
      <div className={`${s.team} ${topFav ? s.fav : ""} ${top?.confirmed ? "" : s.predicted}`}>
        <span className={s.teamName}>{top?.name ?? "TBD"}</span>
        <span className={s.pct}>{top && !confirmed ? `${topPct}%` : ""}</span>
      </div>
      <div className={s.divider} />
      <div className={`${s.team} ${!topFav ? s.fav : ""} ${bot?.confirmed ? "" : s.predicted}`}>
        <span className={s.teamName}>{bot?.name ?? "TBD"}</span>
        <span className={s.pct}>{bot && !confirmed ? `${botPct}%` : ""}</span>
      </div>
      {!confirmed && top && bot && (
        <div className={s.bar}>
          <div className={s.barFill} style={{ width: `${topPct}%` }} />
        </div>
      )}
    </div>
  );
}