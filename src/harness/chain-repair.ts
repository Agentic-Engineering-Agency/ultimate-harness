/** Placeholder until the repair lands; see tests/hash-chain-repair.test.ts. */
export async function repairChainFile(_file: string, _options: { now?: () => Date; allowLegacyPrefix?: boolean }): Promise<{ repaired: false; reason?: string; break?: { line: number; reason: string } } | { repaired: true }> {
  return { repaired: false, reason: "not implemented" };
}
