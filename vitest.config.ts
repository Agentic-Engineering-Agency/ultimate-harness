import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
    setupFiles: ["tests/setup.ts"],
    // Several suites spawn real subprocesses (git worktrees, `tsx src/cli.ts`,
    // adapter binaries). The 5s default trips under parallel contention even
    // though the work is correct, so give a generous ceiling — these are
    // functional tests, not latency benchmarks (timing-specific assertions are
    // gated behind UH_PERF where they exist).
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
