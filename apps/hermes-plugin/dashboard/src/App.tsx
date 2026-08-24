/**
 * Root component for the `uh` Hermes dashboard plugin.
 *
 * Dispatches the hash-based router to the right sub-view. Each view is a
 * thin shell over a panel component — the panels (overview, drilldown,
 * workflow, wizard, ...) each own their own loading/empty/error state.
 */
import { useHashRoute } from "./router";
import { DeliveryObservatory } from "./DeliveryObservatory";
import { MissionDrilldown } from "./MissionDrilldown";
import { WorkflowViewer } from "./WorkflowViewer";
import { MissionWizard } from "./MissionWizard";
import { WorkflowEditor } from "./WorkflowEditor";
import { UI } from "./sdk";

export function App() {
  const [route] = useHashRoute();
  switch (route.view) {
    case "overview":
      return <DeliveryObservatory />;
    case "mission":
      return <MissionDrilldown missionId={route.missionId ?? ""} />;
    case "missionRun":
      return <MissionDrilldown missionId={route.missionId ?? ""} pinnedRunId={route.runId} />;
    case "missionCompare":
      // Legacy compare rendered raw result, diff, and event bodies. Preserve
      // old deep links without exposing that duplicate/unsafe surface.
      return <MissionDrilldown missionId={route.missionId ?? ""} pinnedRunId={route.runB} />;
    case "workflow":
      return <WorkflowViewer name={route.workflowName ?? ""} />;
    case "workflowEdit":
      return <WorkflowEditor name={route.workflowName ?? ""} />;
    case "missionNew":
      return <MissionWizard />;
  }
  return (
    <UI.Card>
      <UI.CardHeader>
        <UI.CardTitle>Ultimate Harness</UI.CardTitle>
      </UI.CardHeader>
      <UI.CardContent>Unknown route.</UI.CardContent>
    </UI.Card>
  );
}
