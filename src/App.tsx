import { useCallback, useMemo, useState } from "react";
import baselineData from "./data/baseline.json";
import seedResults from "./data/results.json";
import { DEFAULT_SETTINGS, GROUP_MATCHES, KNOCKOUT_MATCHES } from "./data";
import { TEAM_BY_CODE } from "./lib/teams";
import {
  applyStoredResults,
  computeElosFromResults,
  predictUpcoming,
  runSimulation,
} from "./lib/simulate";
import type { StoredResults, TeamProbabilities } from "./lib/types";

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

  const matches = useMemo(() => applyStoredResults(GROUP_MATCHES, stored), [stored]);

  const current = useMemo(
    () => runSimulation(matches, KNOCKOUT_MATCHES, DEFAULT_SETTINGS),
    [matches],
  );

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
              {current.probabilities.slice(0, 20).map((row) => {
                const base = baselineMap.get(row.code);
                return (
                  <tr key={row.code}>
                    <td>{row.name}</td>
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
                <span className="match-label">{p.label}</span>
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
    </div>
  );
}
