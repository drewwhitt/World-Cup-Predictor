import { AppShell } from "./components/shell/AppShell";
import type { Edition, TabId } from "./data/worldCup";
import { HomeView } from "./views/HomeView/HomeView";

const activeTab: TabId = "home";
const edition: Edition = "wire";

export default function App() {
  return (
    <AppShell activeTab={activeTab} edition={edition}>
      <HomeView />
    </AppShell>
  );
}
