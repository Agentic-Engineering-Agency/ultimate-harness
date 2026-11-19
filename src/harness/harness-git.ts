/**
 * Git settings shared by the harness's own git calls.
 *
 * The harness commits, merges and cherry-picks in repositories whose
 * configuration a worker can reach. Its calls therefore never run a
 * repository-configured hook or file-system monitor, and the team runner
 * compares the program-naming configuration before and after its workers run.
 */

/** `-c` options that keep a harness git call from running configured hooks or a file-system monitor. */
export function hooklessGitConfig(platform: NodeJS.Platform = process.platform): string[] {
  return ["-c", `core.hooksPath=${platform === "win32" ? "NUL" : "/dev/null"}`, "-c", "core.fsmonitor=false"];
}

/** Repository configuration keys that name a program git may run, or another file of configuration. */
export const EXECUTABLE_CONFIG_KEY = /^(?:core\.(?:hookspath|fsmonitor|sshcommand|pager|editor|askpass|gitproxy)|include\.|includeif\.|filter\.|alias\.|diff\.external$|diff\..+\.(?:textconv|command)$|merge\..+\.driver$|sequence\.editor$|gpg\.|credential\.|uploadpack\.|receive\.|extensions\.worktreeconfig$)/i;

/**
 * The `key=value` entries of `git config --local --list -z` output whose key
 * matches {@link EXECUTABLE_CONFIG_KEY}, in file order.
 */
export function executableConfigEntries(listing: string): string[] {
  return listing
    .split("\0")
    .filter(Boolean)
    .map((entry) => {
      const newline = entry.indexOf("\n");
      return newline < 0 ? `${entry}=` : `${entry.slice(0, newline)}=${entry.slice(newline + 1)}`;
    })
    .filter((entry) => EXECUTABLE_CONFIG_KEY.test(entry.slice(0, entry.indexOf("="))));
}

/** The keys whose entries differ between two {@link executableConfigEntries} lists. */
export function changedConfigKeys(before: readonly string[], after: readonly string[]): string[] {
  const valuesOf = (entries: readonly string[]): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const entry of entries) {
      const key = entry.slice(0, entry.indexOf("="));
      map.set(key, [...(map.get(key) ?? []), entry.slice(key.length + 1)]);
    }
    return map;
  };
  const left = valuesOf(before);
  const right = valuesOf(after);
  return [...new Set([...left.keys(), ...right.keys()])]
    .filter((key) => JSON.stringify(left.get(key) ?? []) !== JSON.stringify(right.get(key) ?? []))
    .sort();
}
