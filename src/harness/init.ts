import path from "node:path";

export type InitResult = {
  created: string[];
  existed: string[];
};

export async function initializeHarness(
  root: string,
  force = false,
): Promise<InitResult> {
  const { mkdir, writeFile, stat } = await import("node:fs/promises");
  const { parse, stringify } = await import("yaml");

  const projectPath = path.join(root, ".harness", "project.yaml");

  // Check if already initialized
  try {
    await stat(projectPath);
    if (!force) {
      return {
        created: [],
        existed: [projectPath],
      };
    }
  } catch {
    // File doesn't exist, proceed
  }

  const created: string[] = [];

  // Create directory structure
  const dirs = [
    ".harness",
    ".harness/adapters",
    ".harness/workflows",
    ".harness/skills",
    ".harness/specs/active",
    ".harness/specs/archive",
    ".harness/missions",
    ".harness/sandboxes",
    ".harness/audit",
  ];

  for (const d of dirs) {
    const fullPath = path.join(root, d);
    await mkdir(fullPath, { recursive: true });
    created.push(fullPath);
  }

  // Create project.yaml
  const projectContent = {
    schema_version: "uh.project.v0",
    id: path.basename(root),
    name: path.basename(root),
    root_path: ".",
    created_at: new Date().toISOString(),
    issue_sources: [],
    default_workflow_profiles: [
      "research-docs",
      "spec-first-feature",
      "bugfix-contained",
      "adapter-design",
      "skill-authoring",
    ],
    artifact_schema_version: "uh.project.v0",
  };

  await writeFile(
    projectPath,
    stringify(projectContent),
    "utf-8",
  );
  created.push(projectPath);

  // Create skills index
  const skillsIndexPath = path.join(root, ".harness", "skills", "index.yaml");
  await writeFile(skillsIndexPath, stringify({ skills: [] }), "utf-8");
  created.push(skillsIndexPath);

  // Create sandboxes index
  const sandboxesIndexPath = path.join(
    root,
    ".harness",
    "sandboxes",
    "index.yaml",
  );
  await writeFile(
    sandboxesIndexPath,
    stringify({ sandboxes: [] }),
    "utf-8",
  );
  created.push(sandboxesIndexPath);

  // Create audit log
  const auditPath = path.join(root, ".harness", "audit", "events.ndjson");
  await writeFile(auditPath, "", "utf-8");
  created.push(auditPath);

  // Create default workflow profiles
  const workflows = getDefaultWorkflows();
  for (const [name, content] of Object.entries(workflows)) {
    const wfPath = path.join(root, ".harness", "workflows", `${name}.yaml`);
    await writeFile(wfPath, stringify(content), "utf-8");
    created.push(wfPath);
  }

  // Log the init event
  const auditEntry = JSON.stringify({
    event: "project.init",
    timestamp: new Date().toISOString(),
    root,
    force,
  });
  await writeFile(auditPath, `${auditEntry}\n`, "utf-8");

  return { created, existed: [] };
}

function getDefaultWorkflows(): Record<string, unknown> {
  return {
    "research-docs": {
      schema_version: "uh.workflow.v0",
      id: "research-docs",
      name: "Research & Documentation",
      description: "Research a topic and produce documented findings.",
      phases: [
        { name: "research", agent_role: "researcher", description: "Research and gather information" },
        { name: "draft", agent_role: "writer", description: "Draft documentation" },
        { name: "review", agent_role: "reviewer", description: "Review for accuracy and completeness" },
      ],
    },
    "spec-first-feature": {
      schema_version: "uh.workflow.v0",
      id: "spec-first-feature",
      name: "Spec-First Feature Development",
      description: "Define spec before implementation.",
      phases: [
        { name: "spec", agent_role: "architect", description: "Write technical specification" },
        { name: "implement", agent_role: "developer", description: "Implement according to spec" },
        { name: "verify", agent_role: "reviewer", description: "Verify implementation against spec" },
      ],
    },
    "bugfix-contained": {
      schema_version: "uh.workflow.v0",
      id: "bugfix-contained",
      name: "Contained Bug Fix",
      description: "Investigate, fix, and verify a bug.",
      phases: [
        { name: "reproduce", agent_role: "researcher", description: "Reproduce and understand the bug" },
        { name: "fix", agent_role: "developer", description: "Implement the fix" },
        { name: "verify", agent_role: "reviewer", description: "Verify fix and regression testing" },
      ],
    },
    "adapter-design": {
      schema_version: "uh.workflow.v0",
      id: "adapter-design",
      name: "Runtime Adapter Design",
      description: "Design and implement a runtime adapter.",
      phases: [
        { name: "research", agent_role: "researcher", description: "Study runtime capabilities" },
        { name: "design", agent_role: "architect", description: "Design adapter contract" },
        { name: "implement", agent_role: "developer", description: "Implement adapter" },
        { name: "test", agent_role: "reviewer", description: "Test with sample missions" },
      ],
    },
    "skill-authoring": {
      schema_version: "uh.workflow.v0",
      id: "skill-authoring",
      name: "Skill Authoring",
      description: "Create or update a skill with SKILL.md and supporting files.",
      phases: [
        { name: "draft", agent_role: "writer", description: "Draft SKILL.md content" },
        { name: "structure", agent_role: "architect", description: "Create references/templates/scripts" },
        { name: "review", agent_role: "reviewer", description: "Review for clarity and completeness" },
      ],
    },
  };
}
