/**
 * Placeholder shell for the `uh` plugin (UH-61).
 *
 * The actual views (overview, drilldown, run modal, viewers, wizard) ship in
 * the subsequent UH-65 / UH-64 / UH-63 / UH-66 / UH-67 commits. This card is
 * the day-1 visible surface so operators can confirm the plugin loaded before
 * any of the real views are wired up.
 */
import { UI } from "./sdk";

export function App() {
  return (
    <UI.Card>
      <UI.CardHeader>
        <UI.CardTitle>Ultimate Harness</UI.CardTitle>
      </UI.CardHeader>
      <UI.CardContent>
        <p style={{ margin: 0 }}>Coming soon — adapter health, missions, runs, and drilldown.</p>
      </UI.CardContent>
    </UI.Card>
  );
}
