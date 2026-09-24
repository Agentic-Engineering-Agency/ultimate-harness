import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, rename, readFile, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(process.cwd(), "scripts", "build.mjs");

function mkTempDir() {
  return mkdtemp(join(tmpdir(), "build-script-test-"));
}

test("successful build replaces dist", async () => {
  const tmp = await mkTempDir();
  try {
    await writeFile(join(tmp, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist.next", rootDir: "src", skipLibCheck: true },
      include: ["src"],
    }));
    await mkdir(join(tmp, "src"), { recursive: true });
    await writeFile(join(tmp, "src", "index.ts"), 'export const x = 1;\n');

    execFileSync("node", [SCRIPT], { cwd: tmp, timeout: 30000 });

    const content = await readFile(join(tmp, "dist", "index.js"), "utf8");
    expect(content).toContain("x");
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("build with type error leaves previous dist byte-identical and exits non-zero", async () => {
  const tmp = await mkTempDir();
  try {
    await writeFile(join(tmp, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist.next", rootDir: "src", skipLibCheck: true },
      include: ["src"],
    }));
    await mkdir(join(tmp, "src"), { recursive: true });
    await writeFile(join(tmp, "src", "index.ts"), 'export const x = 1;\n');

    execFileSync("node", [SCRIPT], { cwd: tmp, timeout: 30000 });

    const before = await readFile(join(tmp, "dist", "index.js"));

    await writeFile(join(tmp, "src", "index.ts"), 'export const x: string = 1;\n');
    let exitCode = null;
    try {
      execFileSync("node", [SCRIPT], { cwd: tmp, timeout: 30000 });
    } catch (err: any) {
      exitCode = err.status ?? err.code ?? 1;
    }
    expect(exitCode).not.toBe(0);

    const after = await readFile(join(tmp, "dist", "index.js"));
    expect(Buffer.compare(before, after)).toBe(0);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("leftover staging directories are removed", async () => {
  const tmp = await mkTempDir();
  try {
    await writeFile(join(tmp, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist.next", rootDir: "src", skipLibCheck: true },
      include: ["src"],
    }));
    await mkdir(join(tmp, "src"), { recursive: true });
    await writeFile(join(tmp, "src", "index.ts"), 'export const x = 1;\n');

    execFileSync("node", [SCRIPT], { cwd: tmp, timeout: 30000 });

    // Simulate interrupted build
    await rename(join(tmp, "dist"), join(tmp, "dist.old"));
    await mkdir(join(tmp, "dist.next"), { recursive: true });
    await writeFile(join(tmp, "dist.next", "marker.txt"), "stale\n");

    // Rebuild: should succeed and clean up
    execFileSync("node", [SCRIPT], { cwd: tmp, timeout: 30000 });

    // dist.next and dist.old must be gone
    await expect(stat(join(tmp, "dist.next"))).rejects.toThrow();
    await expect(stat(join(tmp, "dist.old"))).rejects.toThrow();
    await expect(stat(join(tmp, "dist", "index.js"))).resolves.not.toThrow();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("tsc failure with stale dist.next and dist.old keeps dist byte-identical and drops dist.next", async () => {
  const tmp = await mkTempDir();
  try {
    await writeFile(join(tmp, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist.next", rootDir: "src", skipLibCheck: true },
      include: ["src"],
    }));
    await mkdir(join(tmp, "src"), { recursive: true });
    await writeFile(join(tmp, "src", "index.ts"), 'export const x = 1;\n');

    execFileSync("node", [SCRIPT], { cwd: tmp, timeout: 30000 });

    const before = await readFile(join(tmp, "dist", "index.js"));

    // Stale artifacts from an interrupted earlier build.
    await mkdir(join(tmp, "dist.next"), { recursive: true });
    await writeFile(join(tmp, "dist.next", "marker.txt"), "stale\n");
    await mkdir(join(tmp, "dist.old"), { recursive: true });
    await writeFile(join(tmp, "dist.old", "marker.txt"), "stale\n");

    await writeFile(join(tmp, "src", "index.ts"), 'export const x: string = 1;\n');
    let exitCode = null;
    try {
      execFileSync("node", [SCRIPT], { cwd: tmp, timeout: 30000 });
    } catch (err: any) {
      exitCode = err.status ?? err.code ?? 1;
    }
    expect(exitCode).not.toBe(0);

    const after = await readFile(join(tmp, "dist", "index.js"));
    expect(Buffer.compare(before, after)).toBe(0);
    await expect(stat(join(tmp, "dist.next"))).rejects.toThrow();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("tsc failure with dist missing restores dist byte-identical from dist.old", async () => {
  const tmp = await mkTempDir();
  try {
    await writeFile(join(tmp, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist.next", rootDir: "src", skipLibCheck: true },
      include: ["src"],
    }));
    await mkdir(join(tmp, "src"), { recursive: true });
    await writeFile(join(tmp, "src", "index.ts"), 'export const x = 1;\n');

    execFileSync("node", [SCRIPT], { cwd: tmp, timeout: 30000 });

    const before = await readFile(join(tmp, "dist", "index.js"));

    // Simulate an interrupted build that moved dist aside and never swapped in dist.next.
    await rename(join(tmp, "dist"), join(tmp, "dist.old"));
    await expect(stat(join(tmp, "dist"))).rejects.toThrow();

    await writeFile(join(tmp, "src", "index.ts"), 'export const x: string = 1;\n');
    let exitCode = null;
    try {
      execFileSync("node", [SCRIPT], { cwd: tmp, timeout: 30000 });
    } catch (err: any) {
      exitCode = err.status ?? err.code ?? 1;
    }
    expect(exitCode).not.toBe(0);

    const after = await readFile(join(tmp, "dist", "index.js"));
    expect(Buffer.compare(before, after)).toBe(0);
    await expect(stat(join(tmp, "dist.old"))).rejects.toThrow();
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});

test("build succeeds without npx or npm on PATH", async () => {
  const tmp = await mkTempDir();
  const emptyPath = await mkTempDir();
  try {
    await writeFile(join(tmp, "tsconfig.json"), JSON.stringify({
      compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", strict: true, outDir: "dist.next", rootDir: "src", skipLibCheck: true },
      include: ["src"],
    }));
    await mkdir(join(tmp, "src"), { recursive: true });
    await writeFile(join(tmp, "src", "index.ts"), 'export const x = 1;\n');

    execFileSync(process.execPath, [SCRIPT], {
      cwd: tmp,
      env: { ...process.env, PATH: emptyPath },
      timeout: 30000,
    });

    const content = await readFile(join(tmp, "dist", "index.js"), "utf8");
    expect(content).toContain("x");
  } finally {
    await rm(tmp, { recursive: true, force: true });
    await rm(emptyPath, { recursive: true, force: true });
  }
});