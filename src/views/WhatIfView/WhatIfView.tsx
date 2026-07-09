import { useMemo, useState } from "react";
import { runWhatIf, EMPTY_SCENARIO, type WhatIfScenario, type MatchOverride } from "../../lib/whatIf";
import { WhatIfBracket } from "./WhatIfBracket.tsx";
import type { StoredResults, TeamCode } from "../../lib/types";
import s from "./WhatIfView.module.css";

export function WhatIfView({ stored }: { stored: StoredResults }) {
  const [matchOverrides, setMatchOverrides] = useState<MatchOverride[]>([]);

  // Host-advantage-off and aggressive-confederation-weighting toggles are
  // hidden for now (not removed from the engine) — see EMPTY_SCENARIO/
  // WhatIfScenario in lib/whatIf.ts if they come back later.
  const scenario: WhatIfScenario = useMemo(
    () => ({
      hostAdvantageOff: false,
      aggressiveConfederationWeighting: false,
      matchOverrides,
    }),
    [matchOverrides],
  );

  const isDefault = matchOverrides.length === 0;

  const baseline = useMemo(() => runWhatIf(stored, EMPTY_SCENARIO), [stored]);
  const current = useMemo(() => runWhatIf(stored, scenario), [stored, scenario]);

  const baselineByCode = new Map(baseline.map((r) => [r.code, r.championPct]));
  // Only teams with a live path to the title — a team sitting at a flat 0%
  // is eliminated in this scenario and doesn't belong in a "championship
  // odds" ranking at all.
  const top = current.filter((r) => r.championPct > 0).slice(0, 10);

  function setOverride(matchId: string, winner: TeamCode) {
    setMatchOverrides((prev) => [...prev.filter((o) => o.matchId !== matchId), { matchId, winner }]);
  }

  function clearOverride(matchId: string) {
    setMatchOverrides((prev) => prev.filter((o) => o.matchId !== matchId));
  }

  function resetAll() {
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

      <button type="button" className={s.resetBtn} onClick={resetAll} disabled={isDefault}>
        Reset to model defaults
      </button>

      <div className={s.results}>
        <h2>Championship Odds {!isDefault && <span className={s.liveTag}>Live scenario</span>}</h2>
        <div className={s.list}>
          {top.map((row, i) => {
            const base = baselineByCode.get(row.code) ?? 0;
            const delta = Number((row.championPct - base).toFixed(1));
            return (
              <div key={row.code} className={s.resultRow}>
                <span className={s.rank}>{i + 1}</span>
                <span className={s.teamName}>{row.name}</span>
                <span className={s.valueGroup}>
                  <span className={s.pct}>{row.championPct}%</span>
                  {Math.abs(delta) >= 0.1 && (
                    <span className={delta > 0 ? s.deltaUp : s.deltaDown}>
                      {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}pp
                    </span>
                  )}
                </span>
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