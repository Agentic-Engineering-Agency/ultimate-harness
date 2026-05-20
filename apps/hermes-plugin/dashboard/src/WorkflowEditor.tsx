/**
 * UH-67 — workflow editor.
 *
 * Loads the workflow's raw YAML into a textarea, lets the operator hand-edit,
 * and PUTs back. Server-side errors render inline.
 */
import { pluginFetch, UI, type WorkflowDetail } from "./sdk";
import { buildHash } from "./router";

export function WorkflowEditor({ name }: { name: string }) {
  const [raw, setRaw] = React.useState<string>("");
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    pluginFetch<WorkflowDetail>(`/workflows/${encodeURIComponent(name)}`)
      .then((d) => { if (!cancelled) { setRaw(d.raw); setLoaded(true); setError(null); } })
      .catch((e: any) => { if (!cancelled) { setError(e?.message || String(e)); setLoaded(true); } });
    return () => { cancelled = true; };
  }, [name]);

  const save = React.useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await pluginFetch(`/workflows/${encodeURIComponent(name)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      window.location.hash = buildHash({ view: "workflow", workflowName: name });
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally { setSubmitting(false); }
  }, [name, raw]);

  if (!loaded) return <div className="uh-muted">Loading workflow…</div>;

  return (
    <div className="uh-stack">
      <div className="uh-row-between">
        <UI.Button variant="ghost" size="sm" onClick={() => { window.location.hash = buildHash({ view: "workflow", workflowName: name }); }}>← Back</UI.Button>
        <strong>Edit workflow: {name}</strong>
        <UI.Button onClick={save} disabled={submitting}>{submitting ? "Saving…" : "Save"}</UI.Button>
      </div>
      {error ? <div className="uh-error">{error}</div> : null}
      <textarea className="uh-textarea" style={{ minHeight: 360 }} value={raw} onChange={(e: any) => setRaw(e.target.value)} />
    </div>
  );
}
