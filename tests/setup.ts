// Global test setup — keep the suite hermetic.
//
// Force the Honcho memory extension off by default so adapter tests
// (oh-my-pi, and future codex/hermes wiring) never make live network calls.
// A developer shell often has HONCHO_API_KEY exported, which would otherwise
// flip the extension on (see src/extensions/honcho-memory/config.ts: enabled
// defaults to Boolean(apiKey) unless HONCHO_ENABLED is set). That made the
// oh-my-pi suite hit the real Honcho API — ~10s flakes plus an unintended
// side effect. Tests that exercise Honcho itself set their own env per-test
// (tests/extension-honcho-memory.test.ts) and restore it afterwards.
process.env.HONCHO_ENABLED = "false";
