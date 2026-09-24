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