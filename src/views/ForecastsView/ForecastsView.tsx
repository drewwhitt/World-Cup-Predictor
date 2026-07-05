import { useMemo, useState } from "react";
import { computeDrivers } from "../../lib/drivers";
import { toAdvancementProbabilities } from "../../lib/elo";
import { runSimulation, computeElosFromResults } from "../../lib/simulate";
import { GROUP_MATCHES, KNOCKOUT_MATCHES, DEFAULT_SETTINGS } from "../../data";
import { TEAM_BY_CODE, TEAM_CONFEDERATION } from "../../lib/teams";
import { getReachableZoneByRound, teamsInZone, getTeamKnockoutStatus, resolveKnockoutMatch, KNOCKOUT_STRUCTURE, type KnockoutRound } from "../../lib/bracketTree";
import type { StoredResults, TeamCode } from "../../lib/types";
import type { Team } from "../../data/worldCup";
import s from "./ForecastsView.module.css";

type Props = {
  stored: StoredResults;
  teams: Team[];
};

// Round labels in order
const ROUND_KEYS = [
  { key: "roundOf32",    label: "Round of 32",    koRound: "Round of 32"  },
  { key: "roundOf16",    label: "Round of 16",    koRound: "Round of 16"  },
  { key: "quarterFinal", label: "Quarterfinal",   koRound: "Quarter-final" },
  { key: "semiFinal",    label: "Semifinal",      koRound: "Semi-final"   },
  { key: "final",        label: "Final",          koRound: "Final"        },
  { key: "champion",     label: "Champion",       koRound: null           },
] as const;

type RoundKey = typeof ROUND_KEYS[number]["key"];

// This file's existing convention uses hyphenated round names ("Quarter-final")
// in several places below; the shared bracketTree.ts helper returns
// unhyphenated ones ("Quarterfinal") — this maps between them so the fix
// doesn't require touching every downstream reference.
const ROUND_LABEL_MAP: Record<KnockoutRound, string> = {
  "Round of 32": "Round of 32",
  "Round of 16": "Round of 16",
  Quarterfinal: "Quarter-final",
  Semifinal: "Semi-final",
  Final: "Final",
};

function pct(v: number) { return Number((v * 100).toFixed(1)); }

export function ForecastsView({ stored, teams }: Props) {
  // Default to the current most likely champion
  const sortedTeams = [...teams].sort((a, b) => b.current - a.current);

  // Eliminated teams — walks EVERY round for each team (not just R32), so a
  // team knocked out in the R16 or later is correctly marked eliminated
  // instead of silently still showing as active.
  const eliminatedTeams = useMemo(() => {
    const eliminated = new Set<TeamCode>();
    for (const t of sortedTeams) {
      const status = getTeamKnockoutStatus(t.code as TeamCode, stored);
      if (!status.isRealParticipant || status.eliminated) eliminated.add(t.code as TeamCode);
    }
    return eliminated;
  }, [sortedTeams, stored]);

  const activeTeams = sortedTeams.filter((t) => !eliminatedTeams.has(t.code as TeamCode));
  const eliminatedTeamsList = sortedTeams.filter((t) => eliminatedTeams.has(t.code as TeamCode));
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

  const ROUND_ORDER = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"];

  // Which round is the selected team CURRENTLY sitting in — walks the whole
  // bracket via the shared helper, so a team who's advanced past the R16
  // (or further) correctly shows their real current round, not always
  // "Round of 16" the moment their R32 match is decided.
  const teamStatus = useMemo(() => getTeamKnockoutStatus(selectedCode, stored), [selectedCode, stored]);
  const firstRound = useMemo(() => {
    if (!teamStatus.isRealParticipant || teamStatus.eliminated) return "eliminated";
    if (teamStatus.isChampion) return "Final";
    return teamStatus.currentRound ? ROUND_LABEL_MAP[teamStatus.currentRound] : "Round of 32";
  }, [teamStatus]);

  // Most likely opponents at each knockout round for the selected team
  const likelyOpponents = useMemo(() => {
    if (firstRound === "eliminated") return [];

    // Get the valid opponent zones for this team using the bracket tree
    const zones = getReachableZoneByRound(selectedCode);

    // For each round, build an allowed set of team codes from the bracket structure
    const allowedByRound: Record<string, Set<TeamCode>> = {};
    if (zones.r16)    allowedByRound["Round of 16"]    = teamsInZone([zones.r16]);
    if (zones.qf)     allowedByRound["Quarter-final"]  = teamsInZone(zones.qf);
    if (zones.sf)     allowedByRound["Semi-final"]     = teamsInZone(zones.sf);
    if (zones.final)  allowedByRound["Final"]          = teamsInZone(zones.final);

    // Which rounds are still ahead?
    const firstRoundIdx = ROUND_ORDER.indexOf(firstRound);
    const futureRounds = ["Round of 32", "Round of 16", "Quarter-final", "Semi-final", "Final"]
      .filter((r) => ROUND_ORDER.indexOf(r) >= firstRoundIdx);

    const result: Array<{
      round: string;
      opponents: Array<{ opponent: TeamCode; opponentName: string; prob: number; advancePct: number }>;
    }> = [];

    // The team's CURRENT round gets a precise answer — either a fully
    // confirmed opponent (real result already in), or, if the opponent's
    // own feeder match hasn't been decided yet, the exact head-to-head
    // odds between the two teams who could still become that opponent.
    // This replaces separate R32-only and R16-only special cases that
    // stopped working the moment a team advanced past the R16 — this one
    // works at whatever round the team is actually in.
    let handledCurrentRound: string | null = null;
    if (teamStatus.currentMatchId && teamStatus.currentRound) {
      const { home, away } = resolveKnockoutMatch(teamStatus.currentMatchId, stored);
      const currentRoundLabel = ROUND_LABEL_MAP[teamStatus.currentRound];
      handledCurrentRound = currentRoundLabel;

      if (home === selectedCode && away) {
        result.push({ round: currentRoundLabel, opponents: [{
          opponent: away, opponentName: TEAM_BY_CODE[away]?.name ?? away, prob: 1, advancePct: 100,
        }]});
      } else if (away === selectedCode && home) {
        result.push({ round: currentRoundLabel, opponents: [{
          opponent: home, opponentName: TEAM_BY_CODE[home]?.name ?? home, prob: 1, advancePct: 100,
        }]});
      } else {
        // Opponent slot not resolved yet — find the two teams who could
        // still fill it and use their real head-to-head odds.
        const structure = KNOCKOUT_STRUCTURE[teamStatus.currentMatchId];
        const oppSource = structure.home.type === "team" && structure.home.code === selectedCode
          ? structure.away
          : structure.away.type === "team" && structure.away.code === selectedCode
          ? structure.home
          : (home === selectedCode ? structure.away : structure.home);

        if (oppSource.type === "winner") {
          const feeder = resolveKnockoutMatch(oppSource.matchId, stored);
          if (feeder.home && feeder.away) {
            const { home: h } = toAdvancementProbabilities(elos[feeder.home] ?? 1500, elos[feeder.away] ?? 1500, 0);
            result.push({ round: currentRoundLabel, opponents: [
              { opponent: feeder.home, opponentName: TEAM_BY_CODE[feeder.home]?.name ?? feeder.home, prob: h, advancePct: pct(h) },
              { opponent: feeder.away, opponentName: TEAM_BY_CODE[feeder.away]?.name ?? feeder.away, prob: 1 - h, advancePct: pct(1 - h) },
            ].sort((x, y) => y.prob - x.prob) });
          }
        }
      }
    }

    // Map round name → TeamProbabilities field
    const roundToField: Record<string, "roundOf16" | "quarterFinal" | "semiFinal" | "final"> = {
      "Round of 16":   "roundOf16",
      "Quarter-final": "quarterFinal",
      "Semi-final":    "semiFinal",
      "Final":         "final",
    };

    for (const round of futureRounds) {
      if (round === handledCurrentRound) continue; // already handled precisely above
      const allowed = allowedByRound[round];
      if (!allowed) continue;

      const field = roundToField[round];
      if (!field) continue;

      const raw = Array.from(allowed)
        .filter((code) => code !== selectedCode)
        .map((code) => {
          const tp = teamProbs.get(code);
          const prob = tp ? tp[field] : 0;
          return { code, prob };
        })
        .filter((o) => o.prob > 0.001);

      if (raw.length === 0) continue;

      // Normalize within the zone so percentages reflect relative likelihood
      // of being France's opponent, matching what the bracket shows
      const total = raw.reduce((s, o) => s + o.prob, 0);

      const opponents = raw
        .map(({ code, prob }) => ({
          opponent: code,
          opponentName: TEAM_BY_CODE[code]?.name ?? code,
          prob: prob / total,
          advancePct: pct(prob / total),
        }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 3);

      if (opponents.length > 0) {
        result.push({ round, opponents });
      }
    }

    return result;
  }, [selectedCode, matchups, stored, firstRound, teamStatus, teamProbs, elos]);

  // Build form from stored results
  const recentResults = useMemo(() => {
    const groupPlayed = GROUP_MATCHES
      .filter((m) => stored.matches[m.id] && (m.home === selectedCode || m.away === selectedCode))
      .sort((a, b) => b.date.localeCompare(a.date));

    // Every knockout match the selected team has actually played, at any
    // round — resolved via the shared bracket structure instead of a
    // hardcoded R32-only list, so R16-onward results (like a team that's
    // already won two knockout rounds) actually show up here.
    const koPlayed = Object.keys(KNOCKOUT_STRUCTURE)
      .map((id) => {
        const result = stored.knockoutMatches?.[id];
        if (!result) return null;
        const { home, away } = resolveKnockoutMatch(id, stored);
        if (!home || !away) return null;
        if (home !== selectedCode && away !== selectedCode) return null;
        return { id, home, away };
      })
      .filter((m): m is { id: string; home: TeamCode; away: TeamCode } => m !== null);

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

  const powerRank = useMemo(() => {
    const ranked = [...teams].sort((a, b) => (elos[b.code as TeamCode] ?? 1500) - (elos[a.code as TeamCode] ?? 1500));
    return ranked.findIndex((t) => t.code === selectedCode) + 1;
  }, [teams, elos, selectedCode]);

  if (!selected || !selectedTeam) return null;

  const isEliminated = eliminatedTeams.has(selectedCode);
  const champPct = isEliminated ? 0 : pct(selected.champion);
  const deltaFromBaseline = isEliminated
    ? Number((0 - selectedTeam.baseline).toFixed(1))
    : Number((selectedTeam.current - selectedTeam.baseline).toFixed(1));
  const eloRating = Math.round(selectedElo);

  function ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
  }

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
          <optgroup label="Still in tournament">
            {activeTeams.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name} — {t.current.toFixed(1)}%
              </option>
            ))}
          </optgroup>
          {eliminatedTeamsList.length > 0 && (
            <optgroup label="Eliminated">
              {eliminatedTeamsList.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.name} — 0.0%
                </option>
              ))}
            </optgroup>
          )}
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
          <p className={s.cardSub}>Probability of reaching each round · green = confirmed by a result already played, not just a high probability</p>
          <div className={s.roundPath}>
            {ROUND_KEYS.map(({ key, label, koRound }) => {
              const prob = pct(selected[key as RoundKey]);
              if (prob < 0.1) return null;
              const width = Math.max(4, prob);
              // A round is "completed" if the team has already advanced past it
              const isCompleted = koRound !== null &&
                firstRound !== "Round of 32" &&
                firstRound !== "eliminated" &&
                ROUND_ORDER.indexOf(firstRound) > ROUND_ORDER.indexOf(koRound);
              return (
                <div key={key} className={s.roundRow}>
                  <span className={s.roundLabel}>{label}</span>
                  <div className={s.roundBar}>
                    <div
                      className={`${s.roundFill} ${isCompleted ? s.roundFillDone : ""}`}
                      style={{ width: `${width}%` }}
                    />
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
              <strong>{ordinal(powerRank)} of {teams.length}</strong>
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