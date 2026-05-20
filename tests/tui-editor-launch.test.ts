import { describe, test, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { openInEditor, resolveEditor, type EditorSpawner } from "../src/tui/editor.js";

function makeRenderer() {
  return { suspend: vi.fn(), resume: vi.fn() };
}

function fakeChild(): EventEmitter & { close: (code: number | null, signal: NodeJS.Signals | null) => void } {
  const emitter = new EventEmitter() as EventEmitter & {
    close: (code: number | null, signal: NodeJS.Signals | null) => void;
  };
  emitter.close = (code, signal) => emitter.emit("close", code, signal);
  return emitter;
}

describe("tui/editor resolveEditor", () => {
  test("prefers VISUAL over EDITOR over vi", () => {
    expect(resolveEditor({ VISUAL: "nano", EDITOR: "vim" })).toBe("nano");
    expect(resolveEditor({ EDITOR: "vim" })).toBe("vim");
    expect(resolveEditor({})).toBe("vi");
    expect(resolveEditor({ EDITOR: "   " })).toBe("vi");
  });
});

describe("tui/editor openInEditor", () => {
  test("suspends the renderer, spawns $EDITOR on the file, resumes, and reloads", async () => {
    const renderer = makeRenderer();
    const child = fakeChild();
    const order: string[] = [];
    renderer.suspend.mockImplementation(() => order.push("suspend"));
    renderer.resume.mockImplementation(() => order.push("resume"));

    const spawner = vi.fn<EditorSpawner>((cmd, args, _opts) => {
      order.push(`spawn:${cmd}:${args.join(",")}`);
      // Resolve after a tick so the await actually waits.
      setImmediate(() => child.close(0, null));
      return child as any;
    });
    const reload = vi.fn(async () => {
      order.push("reload");
    });

    const result = await openInEditor({
      filePath: "/tmp/mission.yaml",
      renderer,
      reload,
      spawner,
      env: { EDITOR: "nvim" },
    });

    expect(result).toEqual({ editor: "nvim", code: 0, signal: null });
    expect(spawner).toHaveBeenCalledTimes(1);
    expect(spawner.mock.calls[0][0]).toBe("nvim");
    expect(spawner.mock.calls[0][1]).toEqual(["/tmp/mission.yaml"]);
    expect(spawner.mock.calls[0][2]).toMatchObject({ stdio: "inherit" });
    expect(order).toEqual(["suspend", "spawn:nvim:/tmp/mission.yaml", "resume", "reload"]);
  });

  test("falls back to `vi` when no editor env var is set", async () => {
    const renderer = makeRenderer();
    const child = fakeChild();
    const spawner = vi.fn<EditorSpawner>(() => {
      setImmediate(() => child.close(0, null));
      return child as any;
    });

    const result = await openInEditor({
      filePath: "/tmp/m.yaml",
      renderer,
      spawner,
      env: {},
    });

    expect(result.editor).toBe("vi");
    expect(spawner.mock.calls[0][0]).toBe("vi");
  });

  test("propagates spawn errors, still resumes the renderer, and skips reload", async () => {
    const renderer = makeRenderer();
    const child = fakeChild();
    const spawner = vi.fn<EditorSpawner>(() => {
      setImmediate(() => child.emit("error", new Error("ENOENT")));
      return child as any;
    });
    const reload = vi.fn();

    await expect(
      openInEditor({
        filePath: "/tmp/m.yaml",
        renderer,
        reload,
        spawner,
        env: { EDITOR: "doesnotexist" },
      }),
    ).rejects.toThrow(/ENOENT/);

    expect(renderer.suspend).toHaveBeenCalledTimes(1);
    expect(renderer.resume).toHaveBeenCalledTimes(1);
    // reload should NOT run on a spawn failure — operator never edited.
    expect(reload).not.toHaveBeenCalled();
  });

  test("non-zero editor exit still resumes and reloads (the file may still have changed)", async () => {
    const renderer = makeRenderer();
    const child = fakeChild();
    const spawner = vi.fn<EditorSpawner>(() => {
      setImmediate(() => child.close(130, null));
      return child as any;
    });
    const reload = vi.fn();

    const result = await openInEditor({
      filePath: "/tmp/m.yaml",
      renderer,
      reload,
      spawner,
      env: { EDITOR: "vim" },
    });

    expect(result.code).toBe(130);
    expect(renderer.resume).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
