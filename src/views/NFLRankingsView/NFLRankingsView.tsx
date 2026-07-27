import { useMemo } from "react";
import { buildNflTeams } from "../../data/nfl/nflLive";
import s from "./NFLRankingsView.module.css";

export function NFLRankingsView() {
  const teams = useMemo(() => buildNflTeams(), []);
  const afc = teams.filter((t) => t.conference === "AFC");
  const nfc = teams.filter((t) => t.conference === "NFC");

  return (
    <>
      <section className={s.header}>
        <h1>Power Rankings</h1>
        <p>Preseason Elo, reverted toward the league mean after a full real 1999–2025 backtest. Updates once real 2026 results start coming in.</p>
      </section>

      <div className={s.conferences}>
        {[{ label: "AFC", list: afc }, { label: "NFC", list: nfc }].map((conf) => (
          <section className={s.conference} key={conf.label}>
            <h2>{conf.label}</h2>
            <ol className={s.list}>
              {conf.list.map((t, i) => (
                <li key={t.code}>
                  <span className={s.rank}>{i + 1}</span>
                  <span className={s.team}>{t.city} {t.name}</span>
                  <span className={s.division}>{conf.label} {t.division}</span>
                  <span className={s.rating}>{t.rating}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}