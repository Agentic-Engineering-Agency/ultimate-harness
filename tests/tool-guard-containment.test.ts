import { describe, expect, test } from "vitest";
import { decideToolCall } from "../src/harness/tool-guard.js";
import { resolveToolGuardPolicy } from "../src/schema/runtime-control.js";

const root = "C:\\worker";
const BS = "\\";
const schtasksShim = `& "C:${BS}Windows${BS}System32${BS}schtasks.exe" /create /tn Evil /tr cmd.exe`;

function classOf(command: string, policy = resolveToolGuardPolicy({}), options: { allowControllerCommands?: boolean } = {}) {
  return decideToolCall(policy, "bash", { command }, root, options).deny?.class;
}

describe("containment-escape denial: workers never leave the supervised process tree", () => {
  test.each([
    ["wmic process call create", `wmic process call create "cmd.exe /c evil"`],
    ["wmic.exe", `wmic.exe process call create "cmd.exe /c evil"`],
    ["wmic with a global switch first", `wmic /node:host process call create "cmd.exe /c evil"`],
    ["uppercase wmic", `WMIC PROCESS CALL CREATE "cmd.exe /c evil"`],
    ["wmic in a command substitution", `echo $(wmic process call create "cmd.exe /c evil")`],
    ["wmic in a nested powershell body", `powershell -Command "wmic process call create cmd.exe"`],
    ["wmic through a launcher", `sudo wmic process call create "cmd.exe /c evil"`],
    ["invoke-cimmethod creating a process", `Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "cmd.exe /c evil" }`],
    ["invoke-wmimethod creating a process", `Invoke-WmiMethod -Class Win32_Process -Name Create -ArgumentList "cmd.exe /c evil"`],
    ["the wmiclass cast create form", `([wmiclass]"Win32_Process").Create("cmd.exe /c evil")`],
    ["schtasks create", `schtasks /create /tn Evil /tr "cmd.exe /c evil"`],
    ["schtasks.exe run", `schtasks.exe /run /tn Evil`],
    ["schtasks after a chain", `cd src && schtasks /run /tn Evil`],
    ["powershell call operator with quoted path", schtasksShim],
    ["register-scheduledtask", `Register-ScheduledTask -TaskName Evil -Action (New-ScheduledTaskAction -Execute cmd.exe)`],
    ["start-scheduledtask", `Start-ScheduledTask -TaskName Evil`],
    ["sc create", `sc create EvilSvc binPath= "C:\\evil\\cmd.exe"`],
    ["sc.exe start", `sc.exe start EvilSvc`],
    ["new-service", `New-Service -Name EvilSvc -BinaryPathName "cmd.exe /c evil"`],
    ["start-service", `Start-Service EvilSvc`],
    ["setsid", `setsid sleep 1000`],
    ["systemd-run", `systemd-run --user sleep 1000`],
    ["nested bash body", `bash -c "systemd-run --user sleep 1000"`],
    ["disown of a background job", `sleep 1000 & disown`],
    ["at", `at 23:00 cmd.exe /c evil`],
    ["batch", `echo work | batch`],
    ["crontab edit", `crontab -e`],
    ["crontab install", `crontab my-cron.txt`],
    ["nohup with a background operator", `nohup cmd.exe /c evil &`],
    ["nohup backgrounded after a chain", `cd src; nohup ./long-job &`],
  ])("denies %s", (_name, command) => {
    expect(classOf(command)).toBe("containment_escape");
  });

  test.each([
    ["get-ciminstance reading the process class", `Get-CimInstance Win32_Process`],
    ["invoke-cimmethod with a different method", `Invoke-CimMethod -ClassName Win32_Process -MethodName GetOwner`],
    ["invoke-cimmethod with a different class", `Invoke-CimMethod -ClassName Win32_Service -MethodName Create`],
    ["schtasks query", `schtasks /query /fo LIST`],
    ["sc query", `sc query EvilSvc`],
    ["crontab -l", `crontab -l`],
    ["crontab -l through a pipe", `crontab -l | grep build`],
    ["get-service", `Get-Service EvilSvc`],
    ["nohup without a background operator", `nohup sleep 1000`],
    ["nohup before a sequential chain", `nohup sleep 1000 && echo done`],
    ["a background operator that does not background nohup", `echo hi & nohup sleep 1000`],
    ["scheduler name as a grep pattern", `grep -r setsid src`],
    ["scheduler name inside a quoted search", `rg "wmic process" docs`],
    ["tool name as a file stem", `cat docs/schtasks.md`],
    ["subcommand name as a search pattern", `grep -rn "sc create" src`],
    ["name in a path argument", `ls docs/systemd-run.md`],
    ["wmiclass cast quoted for reading", `grep "\\[wmiclass\\]" src`],
    ["at as a bare word argument", `grep -w at notes.md`],
  ])("allows %s", (_name, command) => {
    expect(classOf(command)).toBeUndefined();
  });

  test("needs_network lifts network-client denial but never the containment denial", () => {
    const policy = resolveToolGuardPolicy({}, true);
    expect(policy.deny_network_clients).toBe(false);
    expect(classOf("curl https://example.invalid", policy)).toBeUndefined();
    expect(classOf("schtasks /create /tn Evil /tr cmd.exe", policy)).toBe("containment_escape");
    expect(classOf("wmic process call create cmd.exe", policy)).toBe("containment_escape");
  });

  test("an empty agent_clients list lifts agent denial but never the containment denial", () => {
    const policy = resolveToolGuardPolicy({ agent_clients: [] });
    expect(classOf("omp -p hi", policy)).toBeUndefined();
    expect(classOf("wmic process call create cmd.exe", policy)).toBe("containment_escape");
  });

  test("allow_native_subagents lifts only the native tool denial, never the containment denial", () => {
    const policy = resolveToolGuardPolicy({ allow_native_subagents: true });
    expect(decideToolCall(policy, "task", { tasks: [] }, root).deny).toBeUndefined();
    expect(classOf("setsid sleep 1000", policy)).toBe("containment_escape");
  });

  test("the containment denial applies to the orchestrator role too", () => {
    const policy = resolveToolGuardPolicy({});
    const orchestrator = { allowControllerCommands: true };
    expect(classOf("uh mission run-team x", policy, orchestrator)).toBeUndefined();
    expect(classOf("schtasks /create /tn Evil /tr cmd.exe", policy, orchestrator)).toBe("containment_escape");
    expect(classOf("nohup ./long-job &", policy, orchestrator)).toBe("containment_escape");
  });

  test("the denial reason names the supervised process tree and ends with the common suffix", () => {
    const denial = decideToolCall(resolveToolGuardPolicy({}), "bash", { command: "schtasks /create /tn Evil /tr cmd.exe" }, root).deny;
    expect(denial?.class).toBe("containment_escape");
    expect(denial?.reason).toMatch(/^CONTRACT: no launches outside the supervised process tree\./);
    expect(denial?.reason).toMatch(/Do not retry this by another route; record it in your final message and continue with the rest of the task\.$/);
  });

  test("powershell tool calls are judged the same way as bash", () => {
    expect(decideToolCall(resolveToolGuardPolicy({}), "powershell", { command: "Register-ScheduledTask -TaskName Evil" }, root).deny?.class).toBe("containment_escape");
  });
});
