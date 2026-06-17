import { useCallback, useMemo, useState } from "react";
import baselineData from "./data/baseline.json";
import seedResults from "./data/results.json";
import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from "./data";
import { TEAM_BY_CODE, TEAMS_BY_GROUP } from "./lib/teams";
import {
  applyStoredResults,
  computeElosFromResults,
  predictUpcoming,
  runSimulation,
} from "./lib/simulate";
import type { StoredResults, TeamCode, TeamProbabilities } from "./lib/types";
import { matchOutcomeProbabilities } from "./lib/elo";
import { computeStandings } from "./lib/groups";

const STORAGE_KEY = "worldcup-predictor-results";

function loadResults(): StoredResults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as StoredResults;
  } catch {
    /* use seed */
  }
  return seedResults as StoredResults;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function delta(current: number, baseline: number): string {
  const d = (current - baseline) * 100;
  if (Math.abs(d) < 0.05) return "—";
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
}

function deltaClass(current: number, baseline: number): string {
  const d = current - baseline;
  if (Math.abs(d) < 0.0005) return "delta flat";
  return d > 0 ? "delta up" : "delta down";
}

export default function App() {
  const [stored, setStored] = useState<StoredResults>(loadResults);
  const [selectedMatch, setSelectedMatch] = useState(GROUP_MATCHES[0]?.id ?? "");
  const [homeGoals, setHomeGoals] = useState("0");
  const [awayGoals, setAwayGoals] = useState("0");
  const [selectedTeam, setSelectedTeam] = useState<TeamCode | null>(null);
  const [showAllTeams, setShowAllTeams] = useState(false);
  const matches = useMemo(() => applyStoredResults(GROUP_MATCHES, stored), [stored]);
  const currentStandings = useMemo(() => computeStandings(matches), [matches]);
  const current = useMemo(
    () => runSimulation(matches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS),
    [matches],
  );
const [groupViews, setGroupViews] = useState<Record<string, "standings" | "predictions">>({});
  const baselineMap = useMemo(() => {
    const map = new Map<string, TeamProbabilities>();
    for (const row of baselineData.probabilities) {
      map.set(row.code, row as TeamProbabilities);
    }
    return map;
  }, []);

  const elos = useMemo(
    () => computeElosFromResults(matches, DEFAULT_SETTINGS),
    [matches],
  );

  const upcoming = useMemo(
    () => predictUpcoming(matches, elos, DEFAULT_SETTINGS),
    [matches, elos],
  );

  const saveResult = useCallback(() => {
    const match = GROUP_MATCHES.find((m) => m.id === selectedMatch);
    if (!match) return;
    const hg = Number(homeGoals);
    const ag = Number(awayGoals);
    if (Number.isNaN(hg) || Number.isNaN(ag) || hg < 0 || ag < 0) return;

    const next: StoredResults = {
      matches: {
        ...stored.matches,
        [selectedMatch]: { homeGoals: hg, awayGoals: ag },
      },
    };
    setStored(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [selectedMatch, homeGoals, awayGoals, stored]);

  const clearResult = useCallback(() => {
    const next = { ...stored, matches: { ...stored.matches } };
    delete next.matches[selectedMatch];
    setStored(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, [selectedMatch, stored]);

  const resetAll = useCallback(() => {
    const empty: StoredResults = { matches: {} };
    setStored(empty);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
  }, []);

  const playedCount = matches.filter((m) => m.played).length;
const hasBaseline = baselineData.probabilities.length > 0;

const selectedTeamRow = selectedTeam
  ? current.probabilities.find((p) => p.code === selectedTeam)
  : null;
const selectedTeamRank = selectedTeam

  ? current.probabilities.findIndex((p) => p.code === selectedTeam) + 1
  : null;
const selectedTeamBaseline = selectedTeam ? baselineMap.get(selectedTeam) : null;
const selectedTeamMatches = selectedTeam
  ? matches
      .filter((m) => !m.played && (m.home === selectedTeam || m.away === selectedTeam))
      .sort((a, b) => a.date.localeCompare(b.date) || a.matchday - b.matchday)
      .map((m) => {
        const probs = matchOutcomeProbabilities(
          elos[m.home],
          elos[m.away],
          DEFAULT_SETTINGS.homeAdvantage,
        );
        const teamIsHome = m.home === selectedTeam;
        return {
          id: m.id,
          label: `${TEAM_BY_CODE[m.home].name} vs ${TEAM_BY_CODE[m.away].name}`,
          win: teamIsHome ? probs.homeWin : probs.awayWin,
          draw: probs.draw,
          loss: teamIsHome ? probs.awayWin : probs.homeWin,
        };
      })
  : [];
const mostLikelyGroupFinish = selectedTeamRow
  ? [
      { label: "1st Place", value: selectedTeamRow.groupWin },
      { label: "2nd Place", value: selectedTeamRow.groupSecond },
      { label: "3rd Place", value: selectedTeamRow.groupThird },
    ].sort((a, b) => b.value - a.value)[0]
  : null;
const mostLikelyTournamentFinish = selectedTeamRow
  ? [
      {
        label: "World Cup Champion",
        value: selectedTeamRow.champion,
      },
      {
        label: "Final",
        value: selectedTeamRow.final - selectedTeamRow.champion,
      },
      {
        label: "Semi-final",
        value: selectedTeamRow.semiFinal - selectedTeamRow.final,
      },
      {
        label: "Quarter-final",
        value: selectedTeamRow.quarterFinal - selectedTeamRow.semiFinal,
      },
      {
        label: "Round of 16",
        value: selectedTeamRow.roundOf16 - selectedTeamRow.quarterFinal,
      },
      {
        label: "Round of 32",
        value: selectedTeamRow.roundOf32 - selectedTeamRow.roundOf16,
      },
      {
        label: "Group Stage",
        value: 1 - selectedTeamRow.roundOf32,
      },
    ].sort((a, b) => b.value - a.value)[0]
  : null;    
const setGroupView = (group: string, view: "standings" | "predictions") => {
  setGroupViews((prev) => ({
    ...prev,
    [group]: view,
  }));
};
return (
  <div className="app">
      <header>
        <h1>World Cup 2026 Predictor</h1>
        <p className="subtitle">
          Elo ratings + Monte Carlo simulation · {playedCount} group matches recorded
        </p>
      </header>

      {!hasBaseline && (
        <div className="banner">
          Pre-tournament baseline not generated yet. Run{" "}
          <code>npm run generate-baseline</code> once to populate original predictions.
        </div>
      )}

      <section className="panel">
        <h2>Tournament outlook</h2>
        <p className="hint">
          <strong>Baseline</strong> = pre-tournament forecast (no results).{" "}
          <strong>Current</strong> = updated after recorded results + simulated remainder.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Grp</th>
                <th title="Pre-tournament">Baseline win</th>
                <th title="After results">Current win</th>
                <th>Change</th>
                <th>Reach SF</th>
                <th>Reach Final</th>
              </tr>
            </thead>
            <tbody>
              {current.probabilities.slice(0, showAllTeams ? 48 : 15).map((row) => {
                const base = baselineMap.get(row.code);
                return (
                  <tr key={row.code}>
                    <td>
  <button type="button" className="team-link" onClick={() => setSelectedTeam(row.code)}>
    {row.name}
  </button>
</td>
                    <td>{TEAM_BY_CODE[row.code].group}</td>
                    <td>{base ? pct(base.champion) : "—"}</td>
                    <td className="current">{pct(row.champion)}</td>
                    <td className={base ? deltaClass(row.champion, base.champion) : "delta flat"}>
                      {base ? delta(row.champion, base.champion) : "—"}
                    </td>
                    <td>{pct(row.semiFinal)}</td>
                    <td>{pct(row.final)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="secondary" onClick={() => setShowAllTeams((v) => !v)}>
  {showAllTeams ? "Show top 15" : "Show all 48 teams"}
</button>
      </section>
      <section className="panel">
  <h2>Group outlook</h2>
  <p className="hint">
    Odds are based on the current recorded results plus simulated remaining matches.
    Top two teams advance automatically. Eight of twelve third-place teams also advance.
  </p>

  <div className="groups-grid">
    {(Object.keys(TEAMS_BY_GROUP) as Array<keyof typeof TEAMS_BY_GROUP>).map((group) => {
      const teams = TEAMS_BY_GROUP[group]
        .map((code) => current.probabilities.find((p) => p.code === code))
        .filter(Boolean) as TeamProbabilities[];

      const activeView = groupViews[group] ?? "standings";

      return (
        <div className="group-card" key={group}>
          <div className="group-card-header">
            <h3>Group {group}</h3>

            <div className="group-view-toggle">
              <button
                type="button"
                className={activeView === "standings" ? "active" : ""}
                onClick={() => setGroupView(group, "standings")}
              >
                Standings
              </button>
              <button
                type="button"
                className={activeView === "predictions" ? "active" : ""}
                onClick={() => setGroupView(group, "predictions")}
              >
                Predictions
              </button>
            </div>
          </div>

          {activeView === "standings" ? (
            <div className="table-wrap compact">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>Pts</th>
                    <th>GF</th>
                    <th>GA</th>
                    <th>GD</th>
                  </tr>
                </thead>
                <tbody>
                  {currentStandings[group].map((row) => (
                    <tr key={row.team}>
                      <td>
                        <button
                          type="button"
                          className="team-link"
                          onClick={() => setSelectedTeam(row.team)}
                        >
                          {TEAM_BY_CODE[row.team].name}
                        </button>
                      </td>
                      <td className="current">{row.points}</td>
                      <td>{row.gf}</td>
                      <td>{row.ga}</td>
                      <td>{row.gd}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-wrap compact">
              <table>
                <thead>
                  <tr>
                    <th>Team</th>
                    <th>1st</th>
                    <th>2nd</th>
                    <th>3rd</th>
                    <th>Adv 3rd</th>
                    <th>Advance</th>
                  </tr>
                </thead>
                <tbody>
                  {teams
                    .sort((a, b) => b.advanceFromGroup - a.advanceFromGroup)
                    .map((row) => (
                      <tr key={row.code}>
                        <td>
                          <button
                            type="button"
                            className="team-link"
                            onClick={() => setSelectedTeam(row.code)}
                          >
                            {row.name}
                          </button>
                        </td>
                        <td>{pct(row.groupWin)}</td>
                        <td>{pct(row.groupSecond)}</td>
                        <td>{pct(row.groupThird)}</td>
                        <td>{pct(row.advanceAsThird)}</td>
                        <td className="current">{pct(row.advanceFromGroup)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    })}
  </div>
</section>

      <div className="grid">
        <section className="panel">
          <h2>Record a result</h2>
          <label>
            Match
            <select value={selectedMatch} onChange={(e) => setSelectedMatch(e.target.value)}>
              {GROUP_MATCHES.map((m) => (
                <option key={m.id} value={m.id}>
                  {TEAM_BY_CODE[m.home].name} vs {TEAM_BY_CODE[m.away].name}
                  {stored.matches[m.id] ? " ✓" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="score-row">
            <label>
              Home
              <input
                type="number"
                min={0}
                value={homeGoals}
                onChange={(e) => setHomeGoals(e.target.value)}
              />
            </label>
            <span>–</span>
            <label>
              Away
              <input
                type="number"
                min={0}
                value={awayGoals}
                onChange={(e) => setAwayGoals(e.target.value)}
              />
            </label>
          </div>
          <div className="actions">
            <button type="button" onClick={saveResult}>
              Save result
            </button>
            <button type="button" className="secondary" onClick={clearResult}>
              Clear match
            </button>
            <button type="button" className="secondary" onClick={resetAll}>
              Reset all
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Next match predictions</h2>
          <p className="hint">Elo win/draw/loss for upcoming unplayed fixtures.</p>
          <ul className="predictions">
            {upcoming.map((p) => (
              <li key={p.id}>
                <span className="match-label">
  {new Date(
  GROUP_MATCHES.find((m) => m.id === p.id)?.date ?? ""
).toLocaleDateString("en-US", {
  month: "short",
  day: "numeric",
})}
{" · "}
{p.label}
</span>
                <span className="probs">
                  H {pct(p.homeWin)} · D {pct(p.draw)} · A {pct(p.awayWin)}
                </span>
              </li>
            ))}
            {upcoming.length === 0 && <li>All group matches recorded.</li>}
          </ul>
        </section>
      </div>

      <footer>
        <p>
          Baseline: {baselineData.label} ({baselineData.generatedAt.slice(0, 10)}) ·{" "}
          {DEFAULT_SETTINGS.simulations.toLocaleString()} simulations per run
        </p>
      </footer>
      {selectedTeamRow && selectedTeam && (
  <div className="drawer-backdrop" onClick={() => setSelectedTeam(null)}>
    <aside className="team-drawer" onClick={(e) => e.stopPropagation()}>
      <div className="drawer-header">
        <div>
          <h2>{selectedTeamRow.name}</h2>
          <p className="hint">
            Group {TEAM_BY_CODE[selectedTeam].group} · Current Elo: {Math.round(elos[selectedTeam])} · Predicted #{selectedTeamRank}
          </p>
        </div>

        <button type="button" className="secondary" onClick={() => setSelectedTeam(null)}>
          Close
        </button>
      </div>

<div className="mini-card">
        <h3>Summary</h3>

  <div className="metric-row">
    <span>Predicted Rank</span>
    <strong>#{selectedTeamRank} of 48</strong>
  </div>

  <div className="metric-row">
    <span>Most Likely Group Finish</span>
    <strong>
      {mostLikelyGroupFinish?.label} ({pct(mostLikelyGroupFinish?.value ?? 0)})
    </strong>
  </div>

  <div className="metric-row">
    <span>Most Likely Tournament Finish</span>
    <strong>
      {mostLikelyTournamentFinish?.label} ({pct(mostLikelyTournamentFinish?.value ?? 0)})
    </strong>
  </div>

  <div className="metric-row">
    <span>Win World Cup</span>
    <strong>{pct(selectedTeamRow.champion)}</strong>
  </div>
</div>

      <div className="mini-card">
        <h3>Before tournament</h3>
        <div className="metric-row">
          <span>Group Win</span>
          <strong>{selectedTeamBaseline ? pct(selectedTeamBaseline.groupWin) : "—"}</strong>
        </div>
        <div className="metric-row">
          <span>Advance</span>
          <strong>{selectedTeamBaseline ? pct(selectedTeamBaseline.advanceFromGroup) : "—"}</strong>
        </div>
        <div className="metric-row">
          <span>Champion</span>
          <strong>{selectedTeamBaseline ? pct(selectedTeamBaseline.champion) : "—"}</strong>
        </div>
      </div>

      <div className="mini-card">
        <h3>Current group outlook</h3>
        <div className="metric-row"><span>Group Win</span><strong>{pct(selectedTeamRow.groupWin)}</strong></div>
        <div className="metric-row"><span>Finish 2nd</span><strong>{pct(selectedTeamRow.groupSecond)}</strong></div>
        <div className="metric-row"><span>Finish 3rd</span><strong>{pct(selectedTeamRow.groupThird)}</strong></div>
        <div className="metric-row"><span>Advance as 3rd</span><strong>{pct(selectedTeamRow.advanceAsThird)}</strong></div>
        <div className="metric-row"><span>Advance</span><strong>{pct(selectedTeamRow.advanceFromGroup)}</strong></div>
      </div>

      <div className="mini-card">
        <h3>Tournament Path</h3>
        <div className="metric-row">
  <span>Reach Round of 32</span>
  <strong>{pct(selectedTeamRow.roundOf32)}</strong>
</div>

<div className="metric-row">
  <span>Reach Round of 16</span>
  <strong>{pct(selectedTeamRow.roundOf16)}</strong>
</div>

<div className="metric-row">
  <span>Reach Quarter-final</span>
  <strong>{pct(selectedTeamRow.quarterFinal)}</strong>
</div>

<div className="metric-row">
  <span>Reach Semi-final</span>
  <strong>{pct(selectedTeamRow.semiFinal)}</strong>
</div>

<div className="metric-row">
  <span>Reach Final</span>
  <strong>{pct(selectedTeamRow.final)}</strong>
</div>

<div className="metric-row">
  <span>Win World Cup</span>
  <strong>{pct(selectedTeamRow.champion)}</strong>
</div>
</div>
      <div className="mini-card">
        <h3>Upcoming matches</h3>
        <ul className="predictions drawer-predictions">
          {selectedTeamMatches.map((m) => (
            <li key={m.id}>
              <span className="match-label">{m.label}</span>
              <span className="probs">
                Win {pct(m.win)} · Draw {pct(m.draw)} · Loss {pct(m.loss)}
              </span>
            </li>
          ))}
          {selectedTeamMatches.length === 0 && <li>No remaining group matches.</li>}
        </ul>
      </div>
    </aside>
  </div>
)}
    </div>
  );
}
