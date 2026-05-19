/**
 * Root component for the `uh` Hermes dashboard plugin.
 *
 * As of UH-66 we have overview + drilldown + verification + workflow viewer.
 * The wizard + editor land in UH-67.
 */
import { useHashRoute } from "./router";
import { OverviewTab } from "./OverviewTab";
import { MissionDrilldown } from "./MissionDrilldown";
import { WorkflowViewer } from "./WorkflowViewer";
import { UI } from "./sdk";

export function App() {
  const [route] = useHashRoute();
  switch (route.view) {
    case "overview":
      return <OverviewTab />;
    case "mission":
      return <MissionDrilldown missionId={route.missionId ?? ""} />;
    case "missionRun":
      return <MissionDrilldown missionId={route.missionId ?? ""} pinnedRunId={route.runId} />;
    case "workflow":
      return <WorkflowViewer name={route.workflowName ?? ""} />;
  }
  return (
    <UI.Card>
      <UI.CardHeader>
        <UI.CardTitle>Ultimate Harness</UI.CardTitle>
      </UI.CardHeader>
      <UI.CardContent>This view ships in a later UH-60 slice. Back to <a href="#/">overview</a>.</UI.CardContent>
    </UI.Card>
  );
}
