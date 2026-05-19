/**
 * Placeholder for the UH-64 run modal.
 *
 * UH-65's overview tab references this so its "Run" button can open *something*
 * before UH-64 lands. The real modal — runtime_config_overrides editor +
 * live SSE event tail + Stop button — replaces this file in the UH-64 commit.
 */
import { UI, type MissionSummary } from "./sdk";

export function RunModal({ mission, onClose }: { mission: MissionSummary; onClose: () => void; initialRunId?: string }) {
  return (
    <div className="uh-modal-backdrop" onClick={onClose}>
      <div className="uh-modal" onClick={(e: any) => e.stopPropagation()}>
        <strong>Run {mission.id}</strong>
        <div className="uh-muted">Mission run trigger ships in UH-64. Use <code>uh mission run {mission.id}</code> from the CLI for now.</div>
        <div className="uh-row" style={{ justifyContent: "flex-end" }}>
          <UI.Button onClick={onClose}>Close</UI.Button>
        </div>
      </div>
    </div>
  );
}
