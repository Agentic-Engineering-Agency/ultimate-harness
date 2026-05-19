/**
 * Root component for the `uh` Hermes dashboard plugin.
 *
 * The router and the panel components are built up across the UH-65/64/63/66/67
 * slices. As of UH-65 we only have the overview panel; anything else falls
 * through to a stub card so the operator sees an honest "not built yet"
 * message instead of a blank screen.
 */
import { useHashRoute } from "./router";
import { OverviewTab } from "./OverviewTab";
import { UI } from "./sdk";

export function App() {
  const [route] = useHashRoute();
  if (route.view === "overview") return <OverviewTab />;
  return (
    <UI.Card>
      <UI.CardHeader>
        <UI.CardTitle>Ultimate Harness</UI.CardTitle>
      </UI.CardHeader>
      <UI.CardContent>This view ships in a later UH-60 slice. Back to <a href="#/">overview</a>.</UI.CardContent>
    </UI.Card>
  );
}
