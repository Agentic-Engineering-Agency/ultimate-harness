import { UI } from "./sdk";
import { useObservatoryStore, type ObservatoryView } from "./observatory-store";
import type { DeliveryObservatorySnapshot, ObservatoryFactState, ObservatoryValue, ObservatoryWorkItem } from "./observatory-types";

const DIRECTION_CONTRACT = `<!-- THESIS: One thread moves from work to authority to evidence. OWN-WORLD: Hermes dark forge, orange operations, ice evidence, thin rules, notched panels. STORY: Operate shows work; Review routes attention; Observe verifies outcomes without private data. FIRST VIEWPORT: shared filters, dominant task, retained selection. FORM: Briefing Reel synthesis, structure 5, seed 6390e84c. FINISH: finish review, verdict, DESIGN.md. -->`;

function label(value: ObservatoryValue): string {
  return value.state === "known" ? String(value.value) : "Unknown";
}

function timeLabel(iso: string | null): string {
  if (!iso) return "Time unknown";
  const date = new Date(iso);
  if (Number.isNaN(date.valueOf())) return "Time unknown";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function durationLabel(milliseconds: number | null): string {
  if (milliseconds === null) return "Unknown";
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function StateStamp({ state }: { state: ObservatoryFactState }) {
  return <span className={`uh-do-stamp is-${state.assertion}`}>{state.assertion} · {state.freshness}</span>;
}

function UnknownValue({ value }: { value: ObservatoryValue }) {
  return value.state === "known"
    ? <strong>{String(value.value)}</strong>
    : <span className="uh-do-unknown" title={value.reason_code}>Unknown</span>;
}

function FilterRail({ store }: { store: ReturnType<typeof useObservatoryStore> }) {
  const projects = store.snapshot?.projects ?? [];
  return (
    <section className="uh-do-filters" aria-label="Observatory filters">
      <label>Project
        <select value={store.filters.project} onChange={(event: any) => store.setFilters({ ...store.filters, project: event.target.value })}>
          <option value="all">All projects</option>
          {projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.safe_name}</option>)}
        </select>
      </label>
      <label>Operation
        <select value={store.filters.operation} onChange={(event: any) => store.setFilters({ ...store.filters, operation: event.target.value })}>
          <option value="all">All states</option>
          {(["queued", "active", "blocked", "awaiting_human", "succeeded", "failed", "cancelled", "uncertain", "unknown"] as const)
            .map((state) => <option key={state} value={state}>{state.replace("_", " ")}</option>)}
        </select>
      </label>
      <label>Risk
        <select value={store.filters.risk} onChange={(event: any) => store.setFilters({ ...store.filters, risk: event.target.value })}>
          <option value="all">All risks</option>
          {(["low", "medium", "high", "critical", "unknown"] as const).map((risk) => <option key={risk} value={risk}>{risk}</option>)}
        </select>
      </label>
      <label>Agent
        <select disabled aria-describedby="uh-do-filter-limit"><option>Unavailable</option></select>
      </label>
      <label>Family / model
        <select disabled aria-describedby="uh-do-filter-limit"><option>Unavailable</option></select>
      </label>
      <label>Harness
        <select disabled aria-describedby="uh-do-filter-limit"><option>Ultimate Harness</option></select>
      </label>
      <label>Scope / date
        <select disabled aria-describedby="uh-do-filter-limit"><option>Current snapshot</option></select>
      </label>
      <label>Truth / freshness
        <select disabled aria-describedby="uh-do-filter-limit"><option>Source classified</option></select>
      </label>
      <span id="uh-do-filter-limit" className="uh-do-sr-only">This MVP does not yet expose this filter dimension.</span>
    </section>
  );
}

function SourceStrip({ snapshot, stale }: { snapshot: DeliveryObservatorySnapshot; stale: boolean }) {
  const source = snapshot.sources[0];
  return (
    <div className={`uh-do-source ${stale ? "is-stale" : ""}`}>
      <div>
        <strong>{source?.transport === "snapshot" ? "Timestamped snapshot" : "Local filesystem · live poll"}</strong>
        <span>{source?.health ?? "unavailable"} · {stale ? "stale after refresh failure" : source?.freshness ?? "unknown"}</span>
      </div>
      <div className="uh-do-source-meta">
        <span>Observed {timeLabel(source?.observed_at ?? null)}</span>
        <span>{snapshot.redaction.fields_omitted} private fields omitted</span>
        <span>{source?.coverage ?? "unknown"} coverage</span>
      </div>
    </div>
  );
}

function WorkList({ items, selectedId, onSelect }: { items: ObservatoryWorkItem[]; selectedId: string | null; onSelect: (id: string) => void }) {
  if (items.length === 0) return <div className="uh-do-empty"><strong>No work matches these filters.</strong><span>Clear a filter or wait for the local source to record a mission.</span></div>;
  return (
    <ul className="uh-do-work-list" aria-label="Current work">
      {items.map((item) => (
        <li key={item.work_item_id}>
          <button type="button" aria-pressed={selectedId === item.work_item_id} className={`uh-do-work ${selectedId === item.work_item_id ? "is-selected" : ""}`} onClick={() => onSelect(item.work_item_id)}>
            <span className="uh-do-work-main"><strong>{item.safe_title}</strong><span>{item.phase} · {label(item.adapter)}</span></span>
            <span className={`uh-do-operation is-${item.operation}`}>{item.operation.replace("_", " ")}</span>
            <span className="uh-do-work-time">{durationLabel(item.elapsed_ms)}</span>
            <StateStamp state={item.state} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function SelectedWork({ work }: { work: ObservatoryWorkItem | null }) {
  if (!work) return <aside className="uh-do-context"><h3>Selected work</h3><p>Select a work item to inspect its safe route facts.</p></aside>;
  const facts: Array<[string, ReactNode]> = [
    ["Owner", work.owner_agent_ref ? "Configured agent" : "Unknown"],
    ["Actual model", <UnknownValue value={work.resolved_model} />],
    ["Provider", <UnknownValue value={work.provider} />],
    ["Execution adapter", <UnknownValue value={work.adapter} />],
    ["Tokens", <UnknownValue value={work.tokens} />],
    ["Cost", <UnknownValue value={work.cost} />],
    ["Latency", work.latency_ms.state === "known" ? durationLabel(Number(work.latency_ms.value)) : "Unknown"],
    ["Reasoning effort", <UnknownValue value={work.reasoning_effort} />],
  ];
  return (
    <aside className="uh-do-context" aria-label="Selected work context">
      <h3>{work.safe_title}</h3>
      <p className="uh-do-context-line">{work.phase} · {work.operation.replace("_", " ")}</p>
      <dl className="uh-do-facts">
        {facts.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="uh-do-callout">
        <strong>{work.blocker_refs.length ? "Blocked" : work.attention_refs.length ? "Attention required" : "No observed blocker"}</strong>
        <span>{work.last_evidence_ref ? "Safe evidence metadata is available in Observe." : "No evidence reference has been observed."}</span>
      </div>
    </aside>
  );
}

function OperateView({ store }: { store: ReturnType<typeof useObservatoryStore> }) {
  return (
    <div className="uh-do-layout">
      <section className="uh-do-primary">
        <div className="uh-do-section-head"><div><h2>Work that is moving now</h2><p>Choose one thread; its authority and evidence stay selected across views.</p></div><span>{store.workItems.length} visible</span></div>
        <WorkList items={store.workItems} selectedId={store.selectedWork?.work_item_id ?? null} onSelect={store.setSelectedWorkId} />
        <section className="uh-do-role-line" aria-label="Agent role map">
          <h3>Roles on this delivery</h3>
          {store.snapshot?.agents.length
            ? store.snapshot.agents.map((agent) => <span key={agent.agent_id}>{agent.safe_name} · {agent.roles.join(", ")}</span>)
            : <span>No stable agent identities are observed by this source yet.</span>}
        </section>
      </section>
      <SelectedWork work={store.selectedWork} />
    </div>
  );
}

function ReviewView({ store }: { store: ReturnType<typeof useObservatoryStore> }) {
  const decisions = store.selectedWork
    ? (store.snapshot?.decisions ?? []).filter((decision) => decision.affected_work_item_refs.includes(store.selectedWork!.work_item_id))
    : [];
  return (
    <div className="uh-do-layout">
      <section className="uh-do-primary">
        <div className="uh-do-section-head"><div><h2>Decisions that need a human</h2><p>This queue is read-only. Decide in Telar or the named authority.</p></div><span>{decisions.length} open</span></div>
        <div className="uh-do-readonly"><strong>Authority stays outside the Observatory.</strong><span>No approve, reject, or scope-change action is available here.</span></div>
        {decisions.length === 0 ? <div className="uh-do-empty"><strong>No observed decision is waiting.</strong><span>This does not prove that no decision exists; source coverage is partial.</span></div> : (
          <div className="uh-do-decision-list">
            {decisions.map((decision) => <article key={decision.decision_id} className="uh-do-decision">
              <div><span className="uh-do-operation is-awaiting_human">{decision.kind.replace("_", " ")}</span><StateStamp state={decision.fact} /></div>
              <h3>{decision.safe_question}</h3>
              <p>{decision.risk} risk · opened {timeLabel(decision.opened_at)}</p>
              {decision.authority_href
                ? <a className="uh-do-authority" href={decision.authority_href} target="_blank" rel="noreferrer">Open in {decision.authority_label}</a>
                : <span className="uh-do-authority is-disabled">Authority link unavailable</span>}
            </article>)}
          </div>
        )}
      </section>
      <SelectedWork work={store.selectedWork} />
    </div>
  );
}

function ObserveView({ store }: { store: ReturnType<typeof useObservatoryStore> }) {
  const workId = store.selectedWork?.work_item_id;
  const events = workId ? (store.snapshot?.events ?? []).filter((event) => event.work_item_ref === workId) : [];
  const evidenceIds = new Set(events.flatMap((event) => event.evidence_refs));
  if (store.selectedWork?.last_evidence_ref) evidenceIds.add(store.selectedWork.last_evidence_ref);
  const evidence = (store.snapshot?.evidence ?? []).filter((item) => evidenceIds.has(item.evidence_id));
  return (
    <div className="uh-do-observe">
      <section className="uh-do-primary">
        <div className="uh-do-section-head"><div><h2>Evidence Reel</h2><p>A safe timeline of receipts and outcomes, without artifact bodies or raw logs.</p></div><span>{events.length} events</span></div>
        {events.length === 0 ? <div className="uh-do-empty"><strong>No timeline evidence is observed.</strong><span>Run Control has not produced a safe event for this selection.</span></div> : (
          <ol className="uh-do-reel">
            {events.map((event) => <li key={event.event_id}>
              <span className="uh-do-reel-mark" aria-hidden="true" />
              <div><span>{timeLabel(event.occurred_at)}</span><h3>{event.safe_summary}</h3><StateStamp state={event.state} /></div>
            </li>)}
          </ol>
        )}
      </section>
      <aside className="uh-do-evidence" aria-label="Safe evidence metadata">
        <h3>Receipts</h3>
        {evidence.length === 0 ? <p>No safe evidence metadata is available.</p> : evidence.map((item) => <div key={item.evidence_id} className="uh-do-evidence-row">
          <div><strong>{item.safe_title}</strong><span>{item.kind} · {item.classification}</span></div>
          <span>{item.availability}</span>
        </div>)}
      </aside>
      <section className="uh-do-metrics" aria-label="Outcome metrics">
        <div className="uh-do-section-head"><div><h2>Outcomes and tradeoffs</h2><p>Values remain unknown until a verified, comparable source reports them.</p></div></div>
        <div className="uh-do-metric-grid">
          {(store.snapshot?.metrics ?? []).map((metric) => <div key={metric.metric_id} className={`uh-do-metric is-${metric.family}`}>
            <span>{metric.safe_label}</span><UnknownValue value={metric.value} /><small>{metric.family === "pareto" ? "Compare only within a task shape" : `${metric.coverage} coverage`}</small>
          </div>)}
        </div>
      </section>
    </div>
  );
}

function MeetingView({ store }: { store: ReturnType<typeof useObservatoryStore> }) {
  const blocked = store.workItems.filter((item) => item.operation === "blocked" || item.operation === "failed");
  const counts = [
    ["Blockers", blocked.length, "items are blocked or failed", "No blocker is observed in the current source"],
    ["Decisions", store.snapshot?.decisions.length ?? 0, "decisions need review in their authority", "No pending decision is observed; coverage remains partial"],
    ["Evidence", store.snapshot?.evidence.length ?? 0, "safe receipts are available", "No safe evidence metadata is available"],
  ];
  return <div className="uh-do-meeting">
    <section><h2>Progress</h2><p>{store.workItems.length ? `${store.workItems.length} work items are visible in this snapshot.` : "No current work is observed."}</p><WorkList items={store.workItems.slice(0, 4)} selectedId={store.selectedWork?.work_item_id ?? null} onSelect={store.setSelectedWorkId} /></section>
    {counts.map(([title, count, present, empty]) => <section key={String(title)}><h2>{title}</h2><p>{Number(count) ? `${count} ${present}.` : `${empty}.`}</p></section>)}
  </div>;
}

export function DeliveryObservatory() {
  const store = useObservatoryStore();
  const views: Array<{ id: ObservatoryView; label: string; note: string }> = [
    { id: "operate", label: "Operate", note: "work" },
    { id: "review", label: "Review", note: "decisions" },
    { id: "observe", label: "Observe", note: "evidence" },
  ];
  const moveTab = (event: any, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % views.length
      : event.key === "ArrowLeft" ? (index + views.length - 1) % views.length : -1;
    if (next < 0) return;
    event.preventDefault();
    event.currentTarget.parentElement?.children[next]?.focus();
    store.setView(views[next].id);
  };
  return (
    <main className="uh-do-root">
      <span className="uh-do-direction" aria-hidden="true" dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
      <header className="uh-do-header">
        <div><h1>Delivery Observatory</h1><p>Current work, authority, and evidence from one safe local contract.</p></div>
        <div className="uh-do-header-actions">
          <UI.Button variant="outline" size="sm" disabled={store.refreshing} onClick={store.refresh}>{store.refreshing ? "Refreshing…" : "Refresh"}</UI.Button>
          <UI.Button variant={store.meeting ? "default" : "outline"} size="sm" aria-pressed={store.meeting} onClick={() => store.setMeeting(!store.meeting)}>{store.meeting ? "Exit meeting" : "Meeting mode"}</UI.Button>
        </div>
      </header>
      {store.snapshot ? <SourceStrip snapshot={store.snapshot} stale={Boolean(store.error)} /> : null}
      {store.error ? <div className="uh-do-error" role="alert"><strong>Refresh failed.</strong><span>{store.snapshot ? "Showing the last good snapshot as stale." : "Start the local UH source, then refresh."}</span></div> : null}
      {store.loading && !store.snapshot ? <div className="uh-do-loading" role="status"><span />Reading the safe local projection…</div> : null}
      {!store.loading && !store.snapshot ? <div className="uh-do-empty"><strong>Delivery data is unavailable.</strong><span>No fixture has been substituted. Start the authorized local source and refresh.</span></div> : null}
      {store.snapshot ? <>
        <FilterRail store={store} />
        {!store.meeting ? <nav className="uh-do-tabs" role="tablist" aria-label="Observatory views">
          {views.map((view, index) => <button key={view.id} id={`uh-do-tab-${view.id}`} type="button" role="tab" aria-controls={`uh-do-panel-${view.id}`} aria-selected={store.view === view.id} tabIndex={store.view === view.id ? 0 : -1} onKeyDown={(event) => moveTab(event, index)} onClick={() => store.setView(view.id)}>
            <strong>{view.label}</strong><span>{view.note}</span>
          </button>)}
        </nav> : null}
        <div aria-live="polite" className="uh-do-sr-only">{store.error ? "Last snapshot is stale." : `Showing ${store.view}.`}</div>
        {store.meeting ? <MeetingView store={store} /> : <div id={`uh-do-panel-${store.view}`} role="tabpanel" aria-labelledby={`uh-do-tab-${store.view}`} tabIndex={0}>
          {store.view === "operate" ? <OperateView store={store} /> : store.view === "review" ? <ReviewView store={store} /> : <ObserveView store={store} />}
        </div>}
      </> : null}
    </main>
  );
}
