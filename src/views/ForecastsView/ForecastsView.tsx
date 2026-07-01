import { useMemo, useState } from "react";
import { computeDrivers, getUpcomingKnockoutOdds } from "../../lib/drivers";
import { runSimulation, computeElosFromResults } from "../../lib/simulate";
import { GROUP_MATCHES, KNOCKOUT_MATCHES, DEFAULT_SETTINGS } from "../../data";
import { TEAM_BY_CODE, TEAM_CONFEDERATION } from "../../lib/teams";
import type { StoredResults, TeamCode } from "../../lib/types";
import type { Team } from "../../data/worldCup";
import s from "./ForecastsView.module.css";

type Props = {
  stored: StoredResults;
  teams: Team[];
};

// Round labels in order
const ROUND_KEYS = [
  { key: "roundOf32",    label: "Round of 32" },
  { key: "roundOf16",    label: "Round of 16" },
  { key: "quarterFinal", label: "Quarterfinal" },
  { key: "semiFinal",    label: "Semifinal" },
  { key: "final",        label: "Final" },
  { key: "champion",     label: "Champion" },
] as const;

type RoundKey = typeof ROUND_KEYS[number]["key"];

function pct(v: number) { return Number((v * 100).toFixed(1)); }

export function ForecastsView({ stored, teams }: Props) {
  // Default to the current most likely champion
  const sortedTeams = [...teams].sort((a, b) => b.current - a.current);
  const [selectedCode, setSelectedCode] = useState<TeamCode>(
    sortedTeams[0]?.code as TeamCode ?? "BRA"
  );

  const { teamProbs, matchups, elos, drivers } = useMemo(() => {
    const playedMatches = GROUP_MATCHES.map((m) => {
      const r = stored.matches[m.id];
      return r ? { ...m, played: true, homeGoals: r.homeGoals, awayGoals: r.awayGoals } : m;
    });
    const result = runSimulation(playedMatches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS, 42, stored.knockoutMatches);
    const elos = computeElosFromResults(playedMatches, DEFAULT_SETTINGS);
    const drivers = computeDrivers(stored);
    return {
      teamProbs: new Map(result.probabilities.map((r) => [r.code as TeamCode, r])),
      matchups: result.knockoutMatchups,
      elos,
      drivers,
    };
  }, [stored]);

  const selected = teamProbs.get(selectedCode);
  const selectedTeam = teams.find((t) => t.code === selectedCode);
  const selectedDriver = drivers.find((d) => d.code === selectedCode);
  const selectedElo = elos[selectedCode] ?? 1500;

  // Most likely opponents at each knockout round for the selected team
  const likelyOpponents = useMemo(() => {
    const result: Array<{ round: string; opponent: TeamCode; opponentName: string; prob: number }> = [];
    const roundOrder = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"];
    const myMatchups = matchups
      .filter((m) => m.teamA === selectedCode || m.teamB === selectedCode)
      .sort((a, b) => roundOrder.indexOf(a.round) - roundOrder.indexOf(b.round));

    for (const m of myMatchups) {
      const opponent = m.teamA === selectedCode ? m.teamB : m.teamA;
      result.push({
        round: m.round, // use the actual string directly — no remapping needed
        opponent,
        opponentName: TEAM_BY_CODE[opponent]?.name ?? opponent,
        prob: m.probability,
      });
    }

    // Group by round, keep top 3 opponents per round
    const byRound = new Map<string, typeof result>();
    for (const item of result) {
      const existing = byRound.get(item.round) ?? [];
      existing.push(item);
      byRound.set(item.round, existing);
    }

    return Array.from(byRound.entries()).map(([round, items]) => ({
      round,
      opponents: items
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 3)
        .map((item) => ({
          ...item,
          advancePct: pct(item.prob),
        })),
    }));
  }, [selectedCode, matchups]);

  // Build form from stored results
  const recentResults = useMemo(() => {
    const groupPlayed = GROUP_MATCHES
      .filter((m) => stored.matches[m.id] && (m.home === selectedCode || m.away === selectedCode))
      .sort((a, b) => b.date.localeCompare(a.date));

    const koPlayed = [
      { id: "ko-73", home: "GER" as TeamCode, away: "PAR" as TeamCode },
      { id: "ko-74", home: "FRA" as TeamCode, away: "SWE" as TeamCode },
      { id: "ko-75", home: "RSA" as TeamCode, away: "CAN" as TeamCode },
      { id: "ko-76", home: "NED" as TeamCode, away: "MAR" as TeamCode },
      { id: "ko-77", home: "POR" as TeamCode, away: "CRO" as TeamCode },
      { id: "ko-78", home: "ESP" as TeamCode, away: "AUT" as TeamCode },
      { id: "ko-79", home: "USA" as TeamCode, away: "BIH" as TeamCode },
      { id: "ko-80", home: "BEL" as TeamCode, away: "SEN" as TeamCode },
      { id: "ko-81", home: "BRA" as TeamCode, away: "JPN" as TeamCode },
      { id: "ko-82", home: "CIV" as TeamCode, away: "NOR" as TeamCode },
      { id: "ko-83", home: "MEX" as TeamCode, away: "ECU" as TeamCode },
      { id: "ko-84", home: "ENG" as TeamCode, away: "COD" as TeamCode },
      { id: "ko-85", home: "ARG" as TeamCode, away: "CPV" as TeamCode },
      { id: "ko-86", home: "AUS" as TeamCode, away: "EGY" as TeamCode },
      { id: "ko-87", home: "SUI" as TeamCode, away: "ALG" as TeamCode },
      { id: "ko-88", home: "COL" as TeamCode, away: "GHA" as TeamCode },
    ].filter((m) =>
      stored.knockoutMatches?.[m.id] && (m.home === selectedCode || m.away === selectedCode)
    );

    const allPlayed = [
      ...koPlayed.map((m) => {
        const r = stored.knockoutMatches![m.id];
        const isHome = m.home === selectedCode;
        const gf = isHome ? r.homeGoals : r.awayGoals;
        const ga = isHome ? r.awayGoals : r.homeGoals;
        const opponent = isHome ? m.away : m.home;
        let outcome: "W" | "D" | "L";
        if (gf > ga || r.penaltyWinner === (isHome ? "home" : "away")) outcome = "W";
        else if (ga > gf || r.penaltyWinner === (isHome ? "away" : "home")) outcome = "L";
        else outcome = "D";
        return {
          opponent: TEAM_BY_CODE[opponent]?.name ?? opponent,
          gf, ga, outcome, round: "KO",
          isPens: !!r.penaltyWinner,
        };
      }),
      ...groupPlayed.map((m) => {
        const r = stored.matches[m.id];
        const isHome = m.home === selectedCode;
        const gf = isHome ? r.homeGoals : r.awayGoals;
        const ga = isHome ? r.awayGoals : r.homeGoals;
        const opponent = isHome ? m.away : m.home;
        const outcome: "W" | "D" | "L" = gf > ga ? "W" : ga > gf ? "L" : "D";
        return {
          opponent: TEAM_BY_CODE[opponent]?.name ?? opponent,
          gf, ga, outcome, round: `MD${m.matchday}`,
          isPens: false,
        };
      }),
    ].slice(0, 6);

    return allPlayed;
  }, [selectedCode, stored]);

  if (!selected || !selectedTeam) return null;

  const champPct = pct(selected.champion);
  const deltaFromBaseline = Number((selectedTeam.current - selectedTeam.baseline).toFixed(1));
  const eloRating = Math.round(selectedElo);

  return (
    <div className={s.page}>
      {/* Team picker */}
      <div className={s.pickerRow}>
        <div className={s.eyebrow}>Team Intelligence</div>
        <select
          className={s.picker}
          value={selectedCode}
          onChange={(e) => setSelectedCode(e.target.value as TeamCode)}
        >
          {sortedTeams.map((t) => (
            <option key={t.code} value={t.code}>
              {t.name} — {t.current.toFixed(1)}%
            </option>
          ))}
        </select>
      </div>

      <div className={s.teamHeader}>
        <div>
          <h1>{TEAM_BY_CODE[selectedCode]?.name}</h1>
          <span className={s.group}>{selectedTeam.group}</span>
        </div>
        <div className={s.champOdds}>
          <div className={s.champVal}>{champPct}%</div>
          <div className={s.champLabel}>championship probability</div>
          <div className={deltaFromBaseline >= 0 ? s.deltaPos : s.deltaNeg}>
            {deltaFromBaseline >= 0 ? "+" : ""}{deltaFromBaseline} pp from baseline
          </div>
        </div>
      </div>

      <div className={s.grid}>

        {/* Section 1 — Driver Attribution */}
        <section className={s.card}>
          <h2>Why This Number</h2>
          {selectedDriver ? (
            <>
              <div className={`${s.driverBadge} ${s[selectedDriver.driverType]}`}>
                {selectedDriver.driverType === "result" ? "Direct result" :
                 selectedDriver.driverType === "path" ? "Path change" : "No change"}
              </div>
              <p className={s.driverText}>{selectedDriver.primaryDriver}</p>
              {Math.abs(selectedDriver.delta) > 0 && (
                <div className={s.driverDelta}>
                  <span className={selectedDriver.delta >= 0 ? s.pos : s.neg}>
                    {selectedDriver.delta >= 0 ? "+" : ""}{selectedDriver.delta} pp
                  </span>
                  {" "}since last result
                  <span className={s.dimmed}> · was {selectedDriver.previousPct.toFixed(1)}%, now {selectedDriver.currentPct.toFixed(1)}%</span>
                </div>
              )}
            </>
          ) : (
            <p className={s.dimmed}>No results entered yet.</p>
          )}
        </section>

        {/* Section 2 — Round-by-round path */}
        <section className={s.card}>
          <h2>Path to the Title</h2>
          <div className={s.roundPath}>
            {ROUND_KEYS.map(({ key, label }) => {
              const prob = pct(selected[key as RoundKey]);
              if (prob < 0.1) return null;
              const width = Math.max(4, prob);
              return (
                <div key={key} className={s.roundRow}>
                  <span className={s.roundLabel}>{label}</span>
                  <div className={s.roundBar}>
                    <div className={s.roundFill} style={{ width: `${width}%` }} />
                  </div>
                  <span className={s.roundPct}>{prob.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 3 — Elo Rating */}
        <section className={s.card}>
          <h2>Model Rating</h2>
          <div className={s.eloDisplay}>
            <span className={s.eloVal}>{eloRating}</span>
            <span className={s.eloLabel}>Elo points</span>
          </div>
          <div className={s.eloContext}>
            <div className={s.eloRow}>
              <span>Power rating</span>
              <strong>{selectedTeam.rating}</strong>
            </div>
            <div className={s.eloRow}>
              <span>Pre-tournament</span>
              <strong>{eloRating} pts</strong>
            </div>
            <div className={s.eloRow}>
              <span>Confederation</span>
              <strong>{TEAM_CONFEDERATION[selectedCode] ?? "—"}</strong>
            </div>
          </div>
          <p className={s.eloNote}>
            Elo updates after each match result based on outcome and goal margin.
            Higher ratings → stronger win probabilities in all future matchups.
          </p>
        </section>

        {/* Section 4 — Recent form */}
        <section className={s.card}>
          <h2>Recent Results</h2>
          {recentResults.length === 0 ? (
            <p className={s.dimmed}>No results recorded yet.</p>
          ) : (
            <div className={s.formList}>
              {recentResults.map((r, i) => (
                <div key={i} className={s.formRow}>
                  <span className={`${s.outcome} ${s[r.outcome.toLowerCase()]}`}>{r.outcome}</span>
                  <span className={s.formOpponent}>vs {r.opponent}</span>
                  <span className={s.formScore}>
                    {r.gf}–{r.ga}{r.isPens ? " (pens)" : ""}
                  </span>
                  <span className={s.formRound}>{r.round}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 5 — Likely opponents */}
        {likelyOpponents.length > 0 && (
          <section className={`${s.card} ${s.cardWide}`}>
            <h2>Projected Opponents</h2>
            <p className={s.cardSub}>Most likely opponents at each remaining round, by simulation frequency</p>
            <div className={s.opponentGrid}>
              {likelyOpponents.map(({ round, opponents }) => (
                <div key={round}>
                  <div className={s.opponentRoundLabel}>{round}</div>
                  {opponents.map((opp) => (
                    <div key={opp.opponent} className={s.opponentRow}>
                      <span className={s.opponentName}>{opp.opponentName}</span>
                      <div className={s.opponentBar}>
                        <div className={s.opponentFill} style={{ width: `${Math.min(100, opp.advancePct * 2)}%` }} />
                      </div>
                      <span className={s.opponentPct}>{opp.advancePct}%</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}