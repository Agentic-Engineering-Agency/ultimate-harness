/**
 * Hand-rolled YAML pretty-printer for parsed JSON objects.
 *
 * We render YAML coming back from the plugin backend already parsed into JSON,
 * so we just need a renderer — not a parser. A bundle-shaped YAML library
 * (js-yaml minified is ~36 KB) would blow our 50 KB budget on its own. This
 * file is ~60 LOC and produces output good enough for read-only viewers.
 *
 * Output uses 2-space indent, sorts keys in the order they arrive (JSON `for-in`
 * preserves insertion order), quotes strings only when they would otherwise
 * be misparsed (containing `: `, `#`, leading/trailing whitespace, or pure
 * numeric/boolean lookalikes).
 */
const NEEDS_QUOTE = /^(true|false|null|yes|no|on|off|~)$/i;

function quoteIfNeeded(s: string): string {
  if (s === "") return '""';
  if (NEEDS_QUOTE.test(s)) return JSON.stringify(s);
  if (/^[-+]?\d+(\.\d+)?$/.test(s)) return JSON.stringify(s);
  if (/[:#]|\s$|^\s|^[!&*?|>%@`]/.test(s)) return JSON.stringify(s);
  return s;
}

function isPlain(v: unknown): boolean {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function renderScalar(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return quoteIfNeeded(v);
  return String(v);
}

export function yamlStringify(value: unknown, indent = 0): string {
  const pad = " ".repeat(indent);
  if (isPlain(value)) return `${pad}${renderScalar(value)}`;
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value.map((item) => {
      if (isPlain(item)) return `${pad}- ${renderScalar(item)}`;
      const nested = yamlStringify(item, indent + 2);
      // Strip leading indent from first line so it sits next to `- `.
      const trimmed = nested.replace(/^ +/, "");
      const tail = nested.split("\n").slice(1).join("\n");
      return tail ? `${pad}- ${trimmed}\n${tail}` : `${pad}- ${trimmed}`;
    }).join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries.map(([key, v]) => {
      if (isPlain(v)) return `${pad}${key}: ${renderScalar(v)}`;
      const nested = yamlStringify(v, indent + 2);
      return `${pad}${key}:\n${nested}`;
    }).join("\n");
  }
  return `${pad}${JSON.stringify(value)}`;
}
