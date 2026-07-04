import { useMemo, useState } from "react";
import { TEAMS, TEAM_BY_CODE } from "../../lib/teams";
import {
  runWhatIf,
  getOverridableMatches,
  getBoostableTeams,
  EMPTY_SCENARIO,
  type WhatIfScenario,
  type MatchOverride,
} from "../../lib/whatIf";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./WhatIfView.module.css";

type EloBoost = { code: TeamCode; delta: number };

const KNOCKOUT_ROUNDS = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];

export function WhatIfView({ stored }: { stored: StoredResults }) {
  const boostableTeams = useMemo(() => {
    const codes = getBoostableTeams(stored);
    return TEAMS.filter((t) => codes.includes(t.code)).sort((a, b) => a.name.localeCompare(b.name));
  }, [stored]);

  const [hostAdvantageOff, setHostAdvantageOff] = useState(false);
  const [aggressiveWeighting, setAggressiveWeighting] = useState(false);
  const [eloBoosts, setEloBoosts] = useState<EloBoost[]>([]);
  const [matchOverrides, setMatchOverrides] = useState<MatchOverride[]>([]);

  const [boostTeam, setBoostTeam] = useState<TeamCode>(boostableTeams[0]?.code ?? TEAMS[0].code);
  const [boostAmount, setBoostAmount] = useState(0);
  const [overrideRound, setOverrideRound] = useState(KNOCKOUT_ROUNDS[0]);

  const overridableMatches = useMemo(() => getOverridableMatches(stored), [stored]);
  const matchesInRound = overridableMatches.filter((m) => m.round === overrideRound);
  const [overrideMatchId, setOverrideMatchId] = useState<string>("");

  const scenario: WhatIfScenario = useMemo(
    () => ({
      hostAdvantageOff,
      aggressiveConfederationWeighting: aggressiveWeighting,
      eloAdjustments: Object.fromEntries(eloBoosts.map((b) => [b.code, b.delta])),
      matchOverrides,
    }),
    [hostAdvantageOff, aggressiveWeighting, eloBoosts, matchOverrides],
  );

  const isDefault =
    !hostAdvantageOff && !aggressiveWeighting && eloBoosts.length === 0 && matchOverrides.length === 0;

  const baseline = useMemo(() => runWhatIf(stored, EMPTY_SCENARIO), [stored]);
  const current = useMemo(() => runWhatIf(stored, scenario), [stored, scenario]);

  const baselineByCode = new Map(baseline.map((r) => [r.code, r.championPct]));
  const top = current.slice(0, 10);

  function addBoost() {
    if (boostAmount === 0) return;
    setEloBoosts((prev) => [...prev.filter((b) => b.code !== boostTeam), { code: boostTeam, delta: boostAmount }]);
    setBoostAmount(0);
  }

  function removeBoost(code: TeamCode) {
    setEloBoosts((prev) => prev.filter((b) => b.code !== code));
  }

  function addOverride(winner: TeamCode) {
    if (!overrideMatchId) return;
    setMatchOverrides((prev) => [...prev.filter((o) => o.matchId !== overrideMatchId), { matchId: overrideMatchId, winner }]);
  }

  function removeOverride(matchId: string) {
    setMatchOverrides((prev) => prev.filter((o) => o.matchId !== matchId));
  }

  function resetAll() {
    setHostAdvantageOff(false);
    setAggressiveWeighting(false);
    setEloBoosts([]);
    setMatchOverrides([]);
  }

  const selectedMatch = overridableMatches.find((m) => m.id === overrideMatchId);

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · Interactive</div>
        <h1>What If?</h1>
        <p className={s.dek}>
          Adjust the model's assumptions or force a different result somewhere in the bracket, and watch
          the championship odds recompute live — using the exact same simulation engine as the real
          forecasts, not a simplified stand-in.
        </p>
      </div>

      <div className={s.layout}>
        <div className={s.controls}>
          <section className={s.panel}>
            <h2>Scenario Toggles</h2>
            <label className={s.toggleRow}>
              <input
                type="checkbox"
                checked={hostAdvantageOff}
                onChange={(e) => setHostAdvantageOff(e.target.checked)}
              />
              Turn off host-nation advantage
            </label>
            <label className={s.toggleRow}>
              <input
                type="checkbox"
                checked={aggressiveWeighting}
                onChange={(e) => setAggressiveWeighting(e.target.checked)}
              />
              Use aggressive confederation weighting
            </label>
          </section>

          <section className={s.panel}>
            <h2>Boost a Team</h2>
            <p className={s.pending}>
              Only teams still alive in the knockout stage — the bracket reflects the real,
              already-determined draw.
            </p>
            <div className={s.row}>
              <select value={boostTeam} onChange={(e) => setBoostTeam(e.target.value as TeamCode)}>
                {boostableTeams.map((t) => (
                  <option key={t.code} value={t.code}>{t.name}</option>
                ))}
              </select>
            </div>
            <div className={s.sliderRow}>
              <input
                type="range"
                min={-150}
                max={150}
                step={5}
                value={boostAmount}
                onChange={(e) => setBoostAmount(Number(e.target.value))}
              />
              <span className={s.sliderValue}>{boostAmount > 0 ? "+" : ""}{boostAmount} Elo</span>
            </div>
            <button type="button" onClick={addBoost} disabled={boostAmount === 0}>Apply boost</button>

            {eloBoosts.length > 0 && (
              <ul className={s.chipList}>
                {eloBoosts.map((b) => (
                  <li key={b.code} className={s.chip}>
                    {TEAM_BY_CODE[b.code]?.name} {b.delta > 0 ? "+" : ""}{b.delta}
                    <button type="button" onClick={() => removeBoost(b.code)}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={s.panel}>
            <h2>Force a Match Result</h2>
            <div className={s.row}>
              <select
                value={overrideRound}
                onChange={(e) => { setOverrideRound(e.target.value); setOverrideMatchId(""); }}
              >
                {KNOCKOUT_ROUNDS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className={s.row}>
              <select value={overrideMatchId} onChange={(e) => setOverrideMatchId(e.target.value)}>
                <option value="">Select a match...</option>
                {matchesInRound.map((m) => (
                  <option key={m.id} value={m.id}>
                    {TEAM_BY_CODE[m.home]?.name} vs {TEAM_BY_CODE[m.away]?.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedMatch && (
              <div className={s.row}>
                <button type="button" onClick={() => addOverride(selectedMatch.home)}>
                  {TEAM_BY_CODE[selectedMatch.home]?.name} wins
                </button>
                <button type="button" onClick={() => addOverride(selectedMatch.away)}>
                  {TEAM_BY_CODE[selectedMatch.away]?.name} wins
                </button>
              </div>
            )}
            {matchesInRound.length === 0 && (
              <p className={s.pending}>No matches in this round have both participants determined yet.</p>
            )}

            {matchOverrides.length > 0 && (
              <ul className={s.chipList}>
                {matchOverrides.map((o) => (
                  <li key={o.matchId} className={s.chip}>
                    {TEAM_BY_CODE[o.winner]?.name} wins {o.matchId}
                    <button type="button" onClick={() => removeOverride(o.matchId)}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button type="button" className={s.resetBtn} onClick={resetAll} disabled={isDefault}>
            Reset to model defaults
          </button>
        </div>

        <div className={s.results}>
          <h2>Championship Odds{!isDefault && <span className={s.liveTag}>Live scenario</span>}</h2>
          <div className={s.list}>
            {top.map((row, i) => {
              const base = baselineByCode.get(row.code) ?? 0;
              const delta = Number((row.championPct - base).toFixed(1));
              return (
                <div key={row.code} className={s.resultRow}>
                  <span className={s.rank}>{i + 1}</span>
                  <span className={s.teamName}>{row.name}</span>
                  <span className={s.pct}>{row.championPct}%</span>
                  {Math.abs(delta) >= 0.1 && (
                    <span className={delta > 0 ? s.deltaUp : s.deltaDown}>
                      {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}pp
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}