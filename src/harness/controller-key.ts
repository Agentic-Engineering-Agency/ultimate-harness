import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson } from "./hash-chain.js";
import { userDataDir } from "./notifications.js";

/**
 * The controller's key for authenticating the entries it appends to the hive.
 *
 * The key lives in the user's data directory, outside every repository, and is
 * created on first use. An entry's `mac` is an HMAC-SHA256 of its body, leaving
 * out the chain fields, so re-linking a chain keeps every entry's `mac` valid.
 */

const KEY_BYTES = 32;

/** `<user data>/controller.key`. */
export function controllerKeyPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(userDataDir(env), "controller.key");
}

function readKey(file: string): Buffer {
  const key = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
  if (key.length !== KEY_BYTES) throw new Error(`Controller key ${file} is not a ${KEY_BYTES}-byte hex key`);
  return key;
}

function controllerKey(env: NodeJS.ProcessEnv): Buffer {
  const file = controllerKeyPath(env);
  try {
    return readKey(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(file, `${randomBytes(KEY_BYTES).toString("hex")}\n`, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return readKey(file);
}

/** The `mac` of an entry: HMAC-SHA256 of its canonical body without `prev_hash`, `hash` and `mac`. */
export function entryMac(entry: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): string {
  const { prev_hash: _previous, hash: _hash, mac: _mac, ...body } = entry;
  return createHmac("sha256", controllerKey(env)).update(canonicalJson(body)).digest("hex");
}

/** Whether an entry carries a `mac` this controller's key produced. Never throws. */
export function entryMacMatches(entry: Record<string, unknown>, env: NodeJS.ProcessEnv = process.env): boolean {
  if (typeof entry.mac !== "string" || !/^[a-f0-9]{64}$/.test(entry.mac)) return false;
  try {
    return timingSafeEqual(Buffer.from(entry.mac, "hex"), Buffer.from(entryMac(entry, env), "hex"));
  } catch {
    return false;
  }
}
