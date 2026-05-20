/**
 * UH-67 — new-mission wizard.
 *
 * Form with live YAML preview on the right. POST to `/missions` on submit.
 * Server-side validation errors arrive as `{error, code, fields: {field: msg}}`
 * — we render per-field messages inline.
 */
import { pluginFetch, PluginFetchError, UI } from "./sdk";
import { yamlStringify } from "./yaml-pretty";
import { buildHash } from "./router";

interface WizardState {
  id: string;
  name: string;
  workflow_profile: string;
  objective: string;
  acceptance: string;  // newline-separated
}

const EMPTY: WizardState = {
  id: "",
  name: "",
  workflow_profile: "research-docs",
  objective: "",
  acceptance: "",
};

function toMissionDoc(state: WizardState): Record<string, unknown> {
  const acs = state.acceptance.split("\n").map((s) => s.trim()).filter(Boolean);
  return {
    schema_version: "uh.mission.v0",
    id: state.id,
    name: state.name,
    workflow_profile: state.workflow_profile,
    objective: state.objective,
    acceptance_criteria: acs.map((description, i) => ({
      id: `ac-${i + 1}`,
      description,
      severity: "warn",
    })),
  };
}

export function MissionWizard() {
  const [state, setState] = React.useState<WizardState>(EMPTY);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const set = (patch: Partial<WizardState>) => setState((s) => ({ ...s, ...patch }));
  const doc = React.useMemo(() => toMissionDoc(state), [state]);
  const preview = React.useMemo(() => yamlStringify(doc), [doc]);

  const submit = React.useCallback(async () => {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      await pluginFetch(`/missions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      });
      window.location.hash = buildHash({ view: "mission", missionId: state.id });
    } catch (e: unknown) {
      // Backend errors come back as PluginFetchError with the typed payload
      // `{error, code, fields?}` already parsed off the SDK message envelope.
      const fields = e instanceof PluginFetchError ? e.payload?.fields : undefined;
      if (fields && typeof fields === "object") {
        setFieldErrors(fields);
      }
      const message =
        (e instanceof PluginFetchError && e.payload?.error)
        || (e instanceof Error ? e.message : null)
        || String(e);
      setError(message);
    } finally { setSubmitting(false); }
  }, [doc, state.id]);

  return (
    <div className="uh-stack">
      <div className="uh-row-between">
        <UI.Button variant="ghost" size="sm" onClick={() => { window.location.hash = buildHash({ view: "overview" }); }}>← Back</UI.Button>
        <strong>New mission</strong>
        <span />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <UI.Card>
          <UI.CardHeader><UI.CardTitle>Mission fields</UI.CardTitle></UI.CardHeader>
          <UI.CardContent>
            <div className="uh-stack">
              <UI.Label>id</UI.Label>
              <UI.Input value={state.id} onChange={(e: any) => set({ id: e.target.value })} placeholder="slug-id" />
              {fieldErrors.id ? <div className="uh-error">{fieldErrors.id}</div> : null}

              <UI.Label>name</UI.Label>
              <UI.Input value={state.name} onChange={(e: any) => set({ name: e.target.value })} />
              {fieldErrors.name ? <div className="uh-error">{fieldErrors.name}</div> : null}

              <UI.Label>workflow_profile</UI.Label>
              <UI.Input value={state.workflow_profile} onChange={(e: any) => set({ workflow_profile: e.target.value })} />
              {fieldErrors.workflow_profile ? <div className="uh-error">{fieldErrors.workflow_profile}</div> : null}

              <UI.Label>objective</UI.Label>
              <textarea className="uh-textarea" value={state.objective} onChange={(e: any) => set({ objective: e.target.value })} />

              <UI.Label>acceptance criteria (one per line)</UI.Label>
              <textarea className="uh-textarea" value={state.acceptance} onChange={(e: any) => set({ acceptance: e.target.value })} />

              {error ? <div className="uh-error">{error}</div> : null}
              <div className="uh-row" style={{ justifyContent: "flex-end" }}>
                <UI.Button onClick={submit} disabled={submitting || !state.id}>{submitting ? "Saving…" : "Create mission"}</UI.Button>
              </div>
            </div>
          </UI.CardContent>
        </UI.Card>
        <UI.Card>
          <UI.CardHeader><UI.CardTitle>YAML preview</UI.CardTitle></UI.CardHeader>
          <UI.CardContent>
            <pre className="uh-mono" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{preview}</pre>
          </UI.CardContent>
        </UI.Card>
      </div>
    </div>
  );
}
