import type { ReactNode } from "react";
import type { Edition, TabId } from "../../data/worldCup";
import { BreakingTicker } from "./BreakingTicker";
import { Masthead } from "./Masthead";
import { MegaNav } from "./MegaNav";
import s from "./AppShell.module.css";

type Props = {
  activeTab: TabId;
  edition: Edition;
  breakingText: string;
  onNavigate?: (tab: TabId) => void;
  children: ReactNode;
};

export function AppShell({ activeTab, edition, breakingText, onNavigate, children }: Props) {
  return (
    <div className={s.page}>
      {edition === "wire" && <BreakingTicker text={breakingText} />}
      <header className={s.container}>
        <Masthead />
        <MegaNav activeTab={activeTab} onNavigate={onNavigate} />
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