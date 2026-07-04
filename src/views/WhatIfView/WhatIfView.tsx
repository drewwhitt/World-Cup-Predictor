import { useMemo, useState } from "react";
import { runWhatIf, EMPTY_SCENARIO, type WhatIfScenario, type MatchOverride } from "../../lib/whatIf";
import { WhatIfBracket } from "./WhatIfBracket.tsx";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./WhatIfView.module.css";

export function WhatIfView({ stored }: { stored: StoredResults }) {
  const [hostAdvantageOff, setHostAdvantageOff] = useState(false);
  const [aggressiveWeighting, setAggressiveWeighting] = useState(false);
  const [matchOverrides, setMatchOverrides] = useState<MatchOverride[]>([]);

  const scenario: WhatIfScenario = useMemo(
    () => ({
      hostAdvantageOff,
      aggressiveConfederationWeighting: aggressiveWeighting,
      matchOverrides,
    }),
    [hostAdvantageOff, aggressiveWeighting, matchOverrides],
  );

  const isDefault = !hostAdvantageOff && !aggressiveWeighting && matchOverrides.length === 0;

  const baseline = useMemo(() => runWhatIf(stored, EMPTY_SCENARIO), [stored]);
  const current = useMemo(() => runWhatIf(stored, scenario), [stored, scenario]);

  const baselineByCode = new Map(baseline.map((r) => [r.code, r.championPct]));
  const top = current.slice(0, 10);

  function setOverride(matchId: string, winner: TeamCode) {
    setMatchOverrides((prev) => [...prev.filter((o) => o.matchId !== matchId), { matchId, winner }]);
  }

  function clearOverride(matchId: string) {
    setMatchOverrides((prev) => prev.filter((o) => o.matchId !== matchId));
  }

  function resetAll() {
    setHostAdvantageOff(false);
    setAggressiveWeighting(false);
    setMatchOverrides([]);
  }

  return (
    <div className={s.page}>
      <div className={s.header}>
        <div className={s.eyebrow}>Veridex Model · Interactive</div>
        <h1>What If?</h1>
        <p className={s.dek}>
          Pick different winners anywhere in the bracket and watch the championship odds recompute
          live — using the exact same simulation engine as the real forecasts, not a simplified
          stand-in.
        </p>
      </div>

      <div className={s.toggles}>
        <label className={s.toggleCard}>
          <div className={s.toggleRow}>
            <input
              type="checkbox"
              checked={hostAdvantageOff}
              onChange={(e) => setHostAdvantageOff(e.target.checked)}
            />
            <span className={s.toggleTitle}>Turn off host-nation advantage</span>
          </div>
          <p className={s.toggleExplain}>
            The model gives USA, Mexico, and Canada a ratings boost for playing on home soil, the
            same way host nations have historically overperformed their pre-tournament rating.
            Switching this off tests how much of their projected odds come from that boost alone.
          </p>
        </label>

        <label className={s.toggleCard}>
          <div className={s.toggleRow}>
            <input
              type="checkbox"
              checked={aggressiveWeighting}
              onChange={(e) => setAggressiveWeighting(e.target.checked)}
            />
            <span className={s.toggleTitle}>Use aggressive confederation weighting</span>
          </div>
          <p className={s.toggleExplain}>
            The live model uses conservative, cautious penalties for how much weaker some
            confederations' qualifiers have historically been (e.g. CONCACAF, AFC). Backtesting
            found a more aggressive penalty actually fits history better, but it's not live because
            it can look harsh on specific teams. This shows what the odds would look like under that
            more aggressive read.
          </p>
        </label>
      </div>

      <button type="button" className={s.resetBtn} onClick={resetAll} disabled={isDefault}>
        Reset to model defaults
      </button>

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

      <section className={s.bracketSection}>
        <h2>Pick the Bracket</h2>
        <WhatIfBracket
          stored={stored}
          overrides={matchOverrides}
          onSetOverride={setOverride}
          onClearOverride={clearOverride}
        />
      </section>
    </div>
  );
}