import type { InsightPage } from "../types";
import { loadResultsForBuild } from "../buildTimeData";
import { GROUP_MATCHES, KNOCKOUT_MATCHES, DEFAULT_SETTINGS } from "../../data";
import { buildInitialElos } from "../../lib/simulate";
import { matchOutcomeProbabilities, updateElo } from "../../lib/elo";
import { resolveKnockoutMatch, KNOCKOUT_STRUCTURE } from "../../lib/bracketTree";
import { TEAM_BY_CODE } from "../../lib/teams";
import type { TeamCode } from "../../lib/types";

const ROUND_LABEL: Record<string, string> = {
  "Round of 32": "Round of 32",
  "Round of 16": "Round of 16",
  Quarterfinal: "Quarterfinals",
  Semifinal: "Semifinal",
  Final: "Final",
};

/**
 * Walks the real tournament chronologically (same approach as
 * scripts/diagnose-accuracy.ts) looking for the actual France-Spain
 * knockout match, capturing the model's real pre-match prediction (using
 * the CORRECTED Elo model, post the Spain seed-value fix) and the real
 * result. This replaces a hand-written, frozen-since-July-3rd article
 * that predicted a hypothetical Semifinal and was never updated again.
 */
async function loadData() {
  const stored = await loadResultsForBuild();
  if (!stored) return { available: false };

  const elos = buildInitialElos();

  const playedGroup = [...GROUP_MATCHES]
    .filter((m) => stored.matches[m.id])
    .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday);

  for (const match of playedGroup) {
    const result = stored.matches[match.id];
    const ha = match.isHostMatch ? DEFAULT_SETTINGS.homeAdvantage : 0;
    const updated = updateElo(elos[match.home], elos[match.away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, ha);
    elos[match.home] = updated.home;
    elos[match.away] = updated.away;
  }

  const playedKnockout = [...KNOCKOUT_MATCHES]
    .filter((m) => stored.knockoutMatches?.[m.id] && m.id in KNOCKOUT_STRUCTURE)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const match of playedKnockout) {
    const result = stored.knockoutMatches![match.id];
    const { home, away } = resolveKnockoutMatch(match.id, stored);
    if (!home || !away) continue;

    const pair = new Set([home, away]);
    if (pair.has("ESP" as TeamCode) && pair.has("FRA" as TeamCode)) {
      const probs = matchOutcomeProbabilities(elos[home], elos[away], 0);
      const spainIsHome = home === "ESP";
      const spainWinPct = spainIsHome ? probs.homeWin + probs.draw / 2 : probs.awayWin + probs.draw / 2;
      const franceWinPct = 1 - spainWinPct;
      const spainWon = spainIsHome
        ? result.homeGoals > result.awayGoals || result.penaltyWinner === "home"
        : result.awayGoals > result.homeGoals || result.penaltyWinner === "away";
      const round = KNOCKOUT_STRUCTURE[match.id].round;

      return {
        available: true,
        found: true,
        round: ROUND_LABEL[round] ?? round,
        spainWinPct: Math.round(spainWinPct * 100),
        franceWinPct: Math.round(franceWinPct * 100),
        modelFavored: spainWinPct >= franceWinPct ? "Spain" : "France",
        spainScore: spainIsHome ? result.homeGoals : result.awayGoals,
        franceScore: spainIsHome ? result.awayGoals : result.homeGoals,
        spainWon,
        spainEloAtMatch: Math.round(spainIsHome ? elos[home] : elos[away]),
        franceEloAtMatch: Math.round(spainIsHome ? elos[away] : elos[home]),
      };
    }

    const updated = updateElo(elos[home], elos[away], result.homeGoals, result.awayGoals, DEFAULT_SETTINGS.kFactor, 0);
    elos[home] = updated.home;
    elos[away] = updated.away;
  }

  return { available: true, found: false };
}

function Content({ data }: { data?: Record<string, unknown> }) {
  const available = data?.available as boolean | undefined;
  const found = data?.found as boolean | undefined;

  return (
    <>
      <div className="eyebrow">Match Analysis · Retrospective</div>
      <h1>Why Did Veridex Favor France Over Spain — And Why Was It Wrong?</h1>
      <p className="dek">
        Before the tournament, Veridex's model gave France the edge over Spain in a projected
        knockout meeting. Spain went on to win the World Cup. Here's what the model got wrong,
        and why.
      </p>
      <p className="meta-line">Originally published July 3, 2026 · Rewritten as a retrospective after the tournament</p>

      {!available && (
        <p>
          Live results aren't available for this build. Check back after the next update — this
          page regenerates automatically as new results come in.
        </p>
      )}

      {available && (
        <>
          <p>
            Early in the tournament, Veridex projected a potential knockout-stage meeting between
            France and Spain — two of the pre-tournament favorites — and gave France a 57% edge in
            that matchup, based on France's Elo trajectory looking stronger than Spain's at the time.
          </p>

          {found && (
            <>
              <h2>What actually happened</h2>
              <p>
                {TEAM_BY_CODE.ESP?.name ?? "Spain"} and {TEAM_BY_CODE.FRA?.name ?? "France"} did
                meet, in the {data!.round as string}. The model's real-time pre-match prediction —
                recomputed here with the corrected Elo model — had{" "}
                <strong>{data!.modelFavored as string}</strong> favored at{" "}
                {data!.modelFavored === "Spain" ? (data!.spainWinPct as number) : (data!.franceWinPct as number)}%.
                The actual result: Spain {data!.spainScore as number}–{data!.franceScore as number} France.
              </p>

              <h2>Why the model was wrong</h2>
              <p>
                The honest answer isn't a subtle modeling nuance — it's a data error. Spain's
                pre-tournament Elo seed value was roughly 200 points too low relative to the real,
                dated eloratings.net snapshot the model is supposed to be built from. Real-world Elo
                had Spain as the single highest-rated team in the field heading into the tournament,
                42 points clear of Argentina. Veridex's own seed table had Spain rated below France,
                England, Brazil, and Argentina — a data entry problem, not a genuine disagreement
                about either team's strength.
              </p>
              <p>
                Because Elo updates are bounded per match and mostly small when a favorite wins as
                expected, an incorrect seed doesn't fully self-correct over the course of a single
                tournament — it persists as a live bias for every match up to and including this one,
                not just at kickoff. By the time this match was actually played,{" "}
                {data!.modelFavored === "France"
                  ? "Spain's Elo was still artificially depressed relative to France's, even though Spain's real underlying strength was higher throughout."
                  : "the correction had already started to show — this rebuilt version of the page reflects the fixed model, not what was live on the site at the time."}
              </p>
              <p>
                The fix (a full re-sync of the pre-tournament Elo table against a dated real-world
                snapshot) is documented on the{" "}
                <a href="/insights/how-accurate-is-veridex">accuracy tracking page</a>, along with
                the model's complete record for the tournament, misses included.
              </p>
            </>
          )}

          {!found && (
            <>
              <h2>What actually happened</h2>
              <p>
                France and Spain never actually met this tournament — the projected matchup didn't
                materialize. The reasoning below is preserved as a record of what the model said and
                why, even though the specific game it was about never happened.
              </p>
              <h2>Why the underlying number was still off</h2>
              <p>
                Independent of whether this specific match occurred, Spain's pre-tournament Elo seed
                value was roughly 200 points too low relative to a real, dated eloratings.net
                snapshot — real-world Elo had Spain as the single highest-rated team in the field,
                not France. That error affected every Spain prediction across the tournament, not
                just this one projected matchup. Details on the{" "}
                <a href="/insights/how-accurate-is-veridex">accuracy tracking page</a>.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}

export const page: InsightPage = {
  slug: "france-vs-spain-semifinal-odds",
  title: "Why Did Veridex Favor France Over Spain — And Why Was It Wrong?",
  description:
    "Veridex's model favored France over Spain heading into the World Cup. Spain won the tournament. Here's the real result and the data error behind the miss.",
  category: "Match Analysis",
  publishedAt: "2026-07-03",
  loadData,
  Content,
};