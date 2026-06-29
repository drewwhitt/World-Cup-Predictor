import type { ReactNode } from "react";
import type { Edition, TabId } from "../../data/worldCup";
import { BreakingTicker } from "./BreakingTicker";
import { Masthead } from "./Masthead";
import { PrimaryNav } from "./PrimaryNav";
import { SportSelector } from "./SportSelector";
import s from "./AppShell.module.css";

type Props = {
  activeTab: TabId;
  edition: Edition;
  breakingText?: string;
  children: ReactNode;
};

export function AppShell({ activeTab, edition, breakingText, children }: Props) {
  return (
    <div className={s.page}>
      {edition === "wire" && <BreakingTicker text={breakingText} />}
      <header className={s.container}>
        <Masthead />
        <PrimaryNav activeTab={activeTab} />
        <SportSelector />
      </header>
      <main className={s.container}>{children}</main>
      <footer className={s.footer}>
        <div className={s.footerWordmark}>VERIDEX</div>
        <div className={s.footerMeta}>
          Predictive Sports Intelligence · © 2026 · Forecasts are probabilistic, not guarantees
        </div>
      </footer>
    </div>
  );
}
