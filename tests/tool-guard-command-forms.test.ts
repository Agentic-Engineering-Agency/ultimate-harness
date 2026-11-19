import { describe, expect, test } from "vitest";
import { decideToolCall } from "../src/harness/tool-guard.js";
import { resolveToolGuardPolicy } from "../src/schema/runtime-control.js";

const root = "/work/worker";
const policy = { ...resolveToolGuardPolicy({ write_roots: ["out"], agent_clients: ["omp", "cmdc"] }), protected_paths: [".harness", ".commandcode", ".omp", ".pi", ".git"] };
const shell = (command: string, guard = policy) => decideToolCall(guard, "bash", { command }, root).deny?.class;

describe("git commands are judged per command, with only reading forms allowed", () => {
  test.each([
    "git status && git push --force origin HEAD:main",
    "git log; git commit -am x",
    "git update-ref refs/heads/main 0123456789abcdef",
    "git config core.hooksPath .hooks",
    "git config --add include.path ../x",
    "git branch new-branch",
    "git branch -f main HEAD~1",
    "git tag v9",
    "git worktree add ../elsewhere",
    "git cherry-pick abc123",
    "git revert abc123",
    "git am change.patch",
    "git apply change.patch",
    "git rm src/x.ts",
    "git mv a b",
    "git fetch origin",
    "git pull",
    "git stash",
    "git reflog expire --all",
    "git symbolic-ref HEAD refs/heads/other",
    "/usr/bin/git push",
    "env GIT_DIR=.git git push",
    "sudo -u someone git commit -m x",
    "timeout 5 git commit -m x",
    "bash -c \"git push\"",
    "sh -ec 'git push'",
    "echo $(git push)",
    "eval git push",
    "git -c core.pager=x log",
    "git --config-env=core.pager=X log",
    "GIT_EXTERNAL_DIFF=x git diff",
    "git diff --output=out/x.diff",
    "git grep -O x",
    "git frobnicate",
  ])("%s is a git mutation", (command) => {
    expect(shell(command)).toBe("git_mutation");
  });

  test.each([
    "git status",
    "git log --oneline -5",
    "git diff HEAD~1 -- src",
    "git show HEAD:README.md",
    "git rev-parse HEAD",
    "git -C sub status",
    "git branch",
    "git branch -a",
    "git branch --show-current",
    "git branch --list 'fix/*'",
    "git tag -l",
    "git stash list",
    "git worktree list",
    "git remote -v",
    "git config --get user.name",
    "git config user.name",
    "git log --grep=commit",
    "echo git push",
  ])("%s is allowed", (command) => {
    expect(shell(command)).toBeUndefined();
  });

  test("a remote git command is a network client when git mutations are allowed", () => {
    const networked = { ...policy, deny_git_mutations: false };
    expect(shell("git push origin main", networked)).toBe("network_client");
    expect(shell("git status && git fetch", networked)).toBe("network_client");
    expect(shell("git status", networked)).toBeUndefined();
  });
});

describe("process ends and package installs", () => {
  test.each(["pkill node", "killall node", "kill -KILL 1234", "kill -s KILL 1234", "kill -SIGKILL 1234", "kill -9 1234"])("%s is a kill", (command) => {
    expect(shell(command)).toBe("kill_or_format");
  });

  test.each(["bun add left-pad", "bun install", "cargo install ripgrep", "go install example.com/x@latest", "gem install rake", "brew install jq", "npx -y cowsay hi", "npx --yes cowsay hi"])("%s is a package install", (command) => {
    expect(shell(command)).toBe("package_install");
  });

  test("an agent client started through npx keeps its own class", () => {
    expect(shell("npx -y omp -p hi")).toBe("agent_client");
  });
});

describe("delete, copy and in-place write forms", () => {
  test.each([
    ["/bin/rm -rf ..", "delete_outside"],
    ["env rm -rf ../x", "delete_outside"],
    ["command rm ../x", "delete_outside"],
    ["sudo -u someone rm -rf ../x", "delete_outside"],
    ["timeout 5 rm -rf ../x", "delete_outside"],
    ["unlink ../x", "delete_outside"],
    ["find .. -name x -delete", "delete_outside"],
    ["find .. -name x -exec rm {} \\;", "delete_outside"],
    ["ls | xargs rm", "delete_outside"],
    ["echo $(rm -rf ../x)", "delete_outside"],
    ["/bin/cp x ../y", "write_outside"],
    ["sed -i s/a/b/ src/x.ts", "write_outside"],
    ["perl -pi -e s/a/b/ src/x.ts", "write_outside"],
    ["dd if=/dev/zero of=src/x.ts", "write_outside"],
    ["truncate -s 0 src/x.ts", "write_outside"],
    ["touch src/x.ts", "write_outside"],
    ["ln -sf /etc/passwd out/link", "write_outside"],
    ["install out/a src/x.ts", "write_outside"],
    ["ls | xargs cp -t out", "write_outside"],
    ["find . -name '*.ts' -exec sed -i s/a/b/ {} +", "write_outside"],
  ])("%s is denied as %s", (command, expected) => {
    expect(shell(command)).toBe(expected);
  });

  test.each([
    "rm -rf out/tmp",
    "/bin/rm out/x",
    "find out -name '*.tmp' -delete",
    "sed -i s/a/b/ out/x.md",
    "sed -n 1,5p src/x.ts",
    "perl -ne 'print' src/x.ts",
    "touch out/x",
    "cp src/x.ts out/x.ts",
    "dd if=src/x of=out/x",
  ])("%s stays allowed", (command) => {
    expect(shell(command)).toBeUndefined();
  });

  test("inline interpreter code that names a harness asset is a tamper stop", () => {
    expect(shell("node -e \"require('fs').appendFileSync('.harness/hive/facts.ndjson', 'x')\"")).toBe("guard_tamper");
    expect(shell("python3 -c \"open('.git/config','a').write('x')\"")).toBe("guard_tamper");
    expect(shell("node -e \"console.log(1)\"")).toBeUndefined();
  });
});
