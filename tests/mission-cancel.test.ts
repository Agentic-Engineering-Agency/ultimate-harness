import { describe, expect, test, vi, afterEach } from "vitest";
import {
  cancelMissionRunViaPlugin,
  defaultPluginApiBase,
  MissionCancelError,
} from "../src/harness/mission-cancel.js";

describe("mission cancel via plugin API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("defaultPluginApiBase prefers UH_PLUGIN_URL", () => {
    const prev = process.env.UH_PLUGIN_URL;
    process.env.UH_PLUGIN_URL = "http://example.test/api/plugins/uh/";
    expect(defaultPluginApiBase()).toBe("http://example.test/api/plugins/uh");
    if (prev === undefined) delete process.env.UH_PLUGIN_URL;
    else process.env.UH_PLUGIN_URL = prev;
  });

  test("cancelMissionRunViaPlugin posts to /runs/{id}/cancel", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, status: "cancelled" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await cancelMissionRunViaPlugin("http://127.0.0.1:9119/api/plugins/uh", "run-abc");
    expect(result).toEqual({ ok: true, status: "cancelled" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:9119/api/plugins/uh/runs/run-abc/cancel",
      { method: "POST" },
    );
  });

  test("surfaces already_finished as MissionCancelError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(
        JSON.stringify({ error: "run run-x already finished", code: "already_finished" }),
        { status: 409 },
      )),
    );
    await expect(cancelMissionRunViaPlugin("http://localhost/api/plugins/uh", "run-x"))
      .rejects
      .toMatchObject({ code: "already_finished", status: 409 });
    try {
      await cancelMissionRunViaPlugin("http://localhost/api/plugins/uh", "run-x");
    } catch (err) {
      expect(err).toBeInstanceOf(MissionCancelError);
    }
  });
});
