/**
 * UH-66 — workflow profile viewer.
 *
 * Renders the phases of a workflow as a vertical timeline with role + outputs.
 * Empty state when the workflow is unknown.
 */
import { pluginFetch, UI, type WorkflowDetail } from "./sdk";
import { buildHash } from "./router";

export function WorkflowViewer({ name }: { name: string }) {
  const [data, setData] = React.useState<WorkflowDetail | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    pluginFetch<WorkflowDetail>(`/workflows/${encodeURIComponent(name)}`)
      .then((r) => { if (!cancelled) { setData(r); setError(null); } })
      .catch((e: any) => { if (!cancelled) setError(e?.message || String(e)); });
    return () => { cancelled = true; };
  }, [name]);

  if (error) {
    return <div className="uh-empty">Workflow {name} not found: {error}</div>;
  }
  if (!data) return <div className="uh-muted">Loading workflow…</div>;

  return (
    <UI.Card>
      <UI.CardHeader>
        <div className="uh-row-between">
          <UI.CardTitle>{data.name}</UI.CardTitle>
          <UI.Button
            size="sm"
            variant="outline"
            onClick={() => { window.location.hash = buildHash({ view: "workflowEdit", workflowName: name }); }}
          >Edit</UI.Button>
        </div>
        <div className="uh-muted">{data.description}</div>
      </UI.CardHeader>
      <UI.CardContent>
        <div className="uh-stack">
          {data.phases_list.length === 0 ? (
            <div className="uh-empty">No phases declared.</div>
          ) : data.phases_list.map((p, i) => (
            <div key={i} className="uh-phase">
              <div className="uh-phase-name">{i + 1}. {p.name}</div>
              <div className="uh-phase-role">role: {p.agent_role}</div>
              <div>{p.description}</div>
              {p.outputs && p.outputs.length ? (
                <div className="uh-muted">outputs: {p.outputs.join(", ")}</div>
              ) : null}
            </div>
          ))}
        </div>
      </UI.CardContent>
    </UI.Card>
  );
}
