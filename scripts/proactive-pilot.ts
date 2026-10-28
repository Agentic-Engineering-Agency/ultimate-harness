#!/usr/bin/env bun
import { runProactivePilotDemo } from '../src/harness/proactive-pilot/demo.js';

if (process.argv.length > 2) {
  console.error('Usage: bun scripts/proactive-pilot.ts\nFixture-only: no activation, configuration changes or live effects.');
  process.exitCode = 2;
} else {
  try {
    console.log(JSON.stringify(runProactivePilotDemo(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Pilot fixture failed');
    process.exitCode = 1;
  }
}
