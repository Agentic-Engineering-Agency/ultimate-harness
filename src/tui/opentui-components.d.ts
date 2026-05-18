import type { DiffRenderable, LineNumberRenderable } from "@opentui/core";

declare module "@opentui/solid/src/types/elements.js" {
  interface OpenTUIComponents {
    diff: typeof DiffRenderable;
    line_number: typeof LineNumberRenderable;
  }
}
