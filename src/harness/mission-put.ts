import { createHash } from "node:crypto";
import { access, appendFile, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { validateMission, type MissionDocument } from "../schema/mission.js";
import { checkMissionPackets, type MissionCheckResult } from "./mission-check.js";
import { assertSafeMissionId } from "./mission.js";
import { writeAtomicArtifact } from "./artifact-transaction.js";
import { discoverRuns } from "./live-runs.js";
import { auditLog, missionsDir } from "./paths.js";

/**
 * UH mission put — install a validated mission packet from the coordinator's
 * allowed path.
 *
 * An orchestrator may only run controller commands and may not write under
 * `.harness`, which is protected, so it cannot author a packet in place. `uh
 * mission create`/`new` and `uh propose` write only a subset of the packet
 * fields (no guard, `runtime_config_overrides`, recovery, team or shape). This
 * command closes that gap: it runs the same `checkMissionPackets` validation
 * `uh mission check` runs, then installs the *whole* packet at
 * `.harness/missions/<id>/mission.yaml` atomically.
 *
 * Ordering and safety:
 * - The checks run first. Any failed check refuses with the check output and
 *   writes nothing.
 * - An existing target is refused unless `--replace`, and `--replace` is
 *   refused while the live-run registry `uh ps` reads reports a non-settled run
 *   of that mission.
 * - A team packet installs each referenced worker packet only when it is given
 *   alongside (several files are accepted) or already present; a referenced
 *   worker that is neither fails the team packet's own check, so none is
 *   fabricated.
 * - Installation is atomic and each installed packet appends one `mission.put`
 *   event (id and sha256) to the harness audit log.
 */

export interface PutMissionPacketsOptions {
  root: string;
  /** Mission packet paths; relative paths resolve against `root`. */
  packetPaths: readonly string[];
  /** Overwrite an existing installed packet. Refused while the mission is live. */
  replace?: boolean;
  /** Override the audit timestamp (tests). */
  now?: string;
}

export interface InstalledPacket {
  mission_id: string;
  path: string;
  sha256: string;
}

export type PutMissionPacketsResult =
  | { ok: true; installed: InstalledPacket[]; auditLines: string[] }
  | { ok: false; reason: string; checks?: MissionCheckResult };

interface ParsedPacket {
  id: string;
  sourcePath: string;
  raw: string;
  document: MissionDocument;
  target: string;
}

interface StagedFile {
  path: string;
  /** Previous content, or undefined when the file did not exist. */
  original: string | undefined;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readPacket(sourcePath: string): Promise<ParsedPacket | undefined> {
  try {
    const raw = await readFile(sourcePath, "utf-8");
    const document = validateMission(parseYaml(raw));
    assertSafeMissionId(document.id);
    return { id: document.id, sourcePath, raw, document, target: "" };
  } catch {
    return undefined;
  }
}

/** Materialize a packet so a team packet's check can read it, remembering the prior content. */
async function stage(staged: Map<string, StagedFile>, target: string, content: string): Promise<void> {
  if (staged.has(target)) return;
  let original: string | undefined;
  try {
    original = await readFile(target, "utf-8");
  } catch {
    original = undefined;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeAtomicArtifact(target, content);
  staged.set(target, { path: target, original });
}

/** Undo a staged write: delete a newly created file, restore an overwritten one. */
async function rollback(staged: Map<string, StagedFile>): Promise<void> {
  for (const entry of staged.values()) {
    try {
      if (entry.original === undefined) await rm(entry.path, { force: true });
      else await writeAtomicArtifact(entry.path, entry.original);
    } catch {
      // Best-effort restore; the original error/refusal is what matters.
    }
  }
  staged.clear();
}

/** Non-settled runs of `missionId` from the registry `uh ps` reads. */
async function missionHasLiveRun(root: string, missionId: string): Promise<boolean> {
  const records = await discoverRuns(root, { persist: false });
  return records.some((record) => record.mission_id === missionId || record.team?.mission_id === missionId);
}

export async function putMissionPackets(options: PutMissionPacketsOptions): Promise<PutMissionPacketsResult> {
  const root = path.resolve(options.root);
  const replace = options.replace === true;

  const packets: ParsedPacket[] = [];
  const byId = new Map<string, ParsedPacket>();
  for (const candidate of options.packetPaths) {
    const sourcePath = path.isAbsolute(candidate) ? candidate : path.resolve(root, candidate);
    const packet = await readPacket(sourcePath);
    if (!packet) {
      // Surface the standard check output for an unreadable or invalid packet.
      const checks = await checkMissionPackets({ root, missionPath: sourcePath });
      return { ok: false, reason: `packet is not a valid mission: ${candidate}`, checks };
    }
    if (byId.has(packet.id)) {
      return { ok: false, reason: `two provided packets share the mission id ${packet.id}` };
    }
    packet.target = path.join(missionsDir(root), packet.id, "mission.yaml");
    packets.push(packet);
    byId.set(packet.id, packet);
  }

  // Worker packets a provided team packet references by `mission_id`.
  const referenced = new Set<string>();
  for (const packet of packets) {
    if (packet.document.shape !== "team") continue;
    for (const worker of packet.document.team?.workers ?? []) {
      if (worker.mission_id) referenced.add(worker.mission_id);
    }
  }

  // Capture target existence before staging so a staged worker packet is not
  // mistaken for a pre-existing target.
  const existed = new Map<string, boolean>();
  for (const packet of packets) existed.set(packet.target, await fileExists(packet.target));

  const staged = new Map<string, StagedFile>();
  try {
    // 1. Make provided worker packets visible to their team packet's check
    // without committing them; an abort restores the prior content.
    for (const packet of packets) {
      if (referenced.has(packet.id)) await stage(staged, packet.target, packet.raw);
    }

    // 2. Existing checks first. A team packet validates each referenced worker
    // (schema, adapter overrides, outputs), so a worker given alongside is
    // covered by that check; every other packet is checked on its own.
    for (const packet of packets) {
      if (referenced.has(packet.id) && packet.document.shape !== "team") continue;
      const checks = await checkMissionPackets({ root, missionPath: packet.sourcePath });
      if (!checks.ok) {
        await rollback(staged);
        return { ok: false, reason: `checks failed for mission ${packet.id}`, checks };
      }
    }

    // 3. Refuse before writing: an existing target needs --replace, and
    // --replace is refused while a live run of that mission exists.
    const refusals: string[] = [];
    for (const packet of packets) {
      if (!existed.get(packet.target)) continue;
      if (!replace) {
        refusals.push(`mission ${packet.id} already exists at ${packet.target}; pass --replace to overwrite`);
        continue;
      }
      if (await missionHasLiveRun(root, packet.id)) {
        refusals.push(`mission ${packet.id} has a live run; refusing --replace`);
      }
    }
    if (refusals.length > 0) {
      await rollback(staged);
      return { ok: false, reason: refusals.join("; ") };
    }

    // 4. Install every packet atomically.
    for (const packet of packets) {
      await mkdir(path.dirname(packet.target), { recursive: true });
      await writeAtomicArtifact(packet.target, packet.raw);
    }
    staged.clear();

    // 5. One mission.put audit event per installed packet.
    const timestamp = options.now ?? new Date().toISOString();
    const logPath = auditLog(root);
    await mkdir(path.dirname(logPath), { recursive: true });
    const installed: InstalledPacket[] = [];
    const auditLines: string[] = [];
    for (const packet of packets) {
      const digest = sha256(packet.raw);
      const line = JSON.stringify({
        event: "mission.put",
        timestamp,
        mission_id: packet.id,
        sha256: digest,
      });
      await appendFile(logPath, `${line}\n`, "utf-8");
      installed.push({ mission_id: packet.id, path: packet.target, sha256: digest });
      auditLines.push(line);
    }

    return { ok: true, installed, auditLines };
  } catch (error) {
    await rollback(staged);
    throw error;
  }
}
