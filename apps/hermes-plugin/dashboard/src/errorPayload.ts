/**
 * Pull a JSON error envelope out of the SDK's stringified error message.
 *
 * The host's ``fetchJSON`` only surfaces ``e.message`` as a string; on a
 * 4xx/5xx it tends to look like ``"HTTP 400: {error,code,fields}"``. We
 * scan forward from each ``{`` and try ``JSON.parse`` on the tail — the
 * first candidate that parses as an object wins.
 *
 * The previous implementation used ``/\{[^{}]*\}\s*$/`` which rejected any
 * envelope containing a nested object (e.g. ``fields: { id: "required" }``).
 * That was the entire point of the structured error contract, so the
 * regex was dropped (PR #89 finding #5).
 *
 * Kept in its own file (rather than inline in ``sdk.ts``) so unit tests can
 * import it without dragging in the ``window.__HERMES_PLUGIN_SDK__`` host
 * binding sdk.ts reads at module load.
 */
export function extractTrailingJsonPayload(text: string): unknown | undefined {
  if (!text) return undefined;
  const trimmed = text.trimEnd();
  for (let i = trimmed.indexOf("{"); i !== -1; i = trimmed.indexOf("{", i + 1)) {
    const candidate = trimmed.slice(i);
    if (!candidate.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed !== null && typeof parsed === "object") return parsed;
    } catch {
      // Try the next ``{`` position. Worst case is O(n) parse attempts on
      // a short error string; acceptable for the cold error path.
    }
  }
  return undefined;
}
