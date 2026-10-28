import { describe, expect, test } from "vitest";
import { applyAcpEnvPolicy, expandEnvReferences, mcpServersForSessionNew } from "../src/adapters/acp.js";
import { AcpRuntimeConfigSchema } from "../src/schema/acp.js";

/**
 * #262: `mcp_servers` headers and env, and `env.set`, took literal values, so a token had to be written into
 * `.harness/adapters/acp.yaml`. A value may now reference the environment with `${NAME}`; the adapter file holds the
 * name, never the secret. An unset name is an error that names it, not an empty string.
 */
describe("ACP environment references", () => {
  test("a ${NAME} in a value is replaced from the environment", () => {
    expect(expandEnvReferences("Bearer ${ACP_TOKEN}", { ACP_TOKEN: "s3cret" })).toBe("Bearer s3cret");
    expect(expandEnvReferences("${A}-${B}", { A: "1", B: "2" })).toBe("1-2");
    expect(expandEnvReferences("no references", {})).toBe("no references");
  });

  test("an unset name is refused, naming the variable and no value", () => {
    expect(() => expandEnvReferences("Bearer ${ACP_TOKEN}", {})).toThrow(/ACP_TOKEN/);
  });

  test("env.set values and MCP server headers and env are expanded", () => {
    const env = applyAcpEnvPolicy({ ACP_TOKEN: "s3cret", PATH: "/bin" }, { set: { AUTH: "Bearer ${ACP_TOKEN}" }, drop: [] });
    expect(env.AUTH).toBe("Bearer s3cret");
    const servers = AcpRuntimeConfigSchema.parse({
      mcp_servers: [
        { type: "http", name: "remote", url: "https://example.test/mcp", headers: { Authorization: "Bearer ${ACP_TOKEN}" } },
        { name: "files", command: "node", env: { TOKEN: "${ACP_TOKEN}", PLAIN: "x" } },
      ],
    }).mcp_servers;
    const wire = mcpServersForSessionNew(servers, { ACP_TOKEN: "s3cret" });
    expect(wire[0]).toMatchObject({ headers: [{ name: "Authorization", value: "Bearer s3cret" }] });
    expect(wire[1]).toMatchObject({ env: [{ name: "TOKEN", value: "s3cret" }, { name: "PLAIN", value: "x" }] });
  });
});
