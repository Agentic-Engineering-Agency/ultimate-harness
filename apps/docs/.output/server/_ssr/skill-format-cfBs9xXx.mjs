import { i as __toESM } from "../_runtime.mjs";
import { t as __exportAll } from "./chunk-noHr4qNm.mjs";
import { o as require_jsx_runtime } from "../_libs/@radix-ui/react-arrow+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/skill-format-cfBs9xXx.js
var import_jsx_runtime = /* @__PURE__ */ __toESM(require_jsx_runtime());
var skill_format_exports = /* @__PURE__ */ __exportAll({
	default: () => MDXContent,
	frontmatter: () => frontmatter,
	structuredData: () => structuredData,
	toc: () => toc
});
var frontmatter = {
	"title": "Skill Format",
	"description": "Skills are reusable procedural capabilities that a runtime adapter loads or that a"
};
var structuredData = {
	"contents": [
		{
			"heading": "purpose",
			"content": "Skills are reusable procedural capabilities that a runtime adapter loads or that a\nhuman can read directly. Ultimate Harness owns the **format** of a skill so that\nadapters, mission packets, and reviewers can rely on a common shape regardless of\nwhich runtime executes the work."
		},
		{
			"heading": "purpose",
			"content": "This document defines the on-disk layout of a single skill, the YAML frontmatter\nthat identifies it, the supporting `references/`, `templates/`, and `scripts/`\nconventions, and the selection model the harness uses to decide which skills are\napplied to a mission."
		},
		{
			"heading": "skill-directory-layout",
			"content": "A skill is a directory that contains, at minimum, a `SKILL.md` file. Optional\nsibling directories carry supporting material:"
		},
		{
			"heading": "skill-directory-layout",
			"content": "Rules:"
		},
		{
			"heading": "skill-directory-layout",
			"content": "`SKILL.md` must be a regular file (no symlinks). The harness refuses to register\na skill whose `SKILL.md` is a symlink or whose containing directory is a symlink."
		},
		{
			"heading": "skill-directory-layout",
			"content": "`references/`, `templates/`, and `scripts/` are reserved names. When present they\nmust be regular directories."
		},
		{
			"heading": "skill-directory-layout",
			"content": "The skill directory must live inside the project root. The harness refuses\nout-of-root paths."
		},
		{
			"heading": "skill-directory-layout",
			"content": "Scripts under `scripts/` should be self-contained and runnable from the skill\ndirectory; they should not assume a checkout layout outside the skill."
		},
		{
			"heading": "skill-directory-layout",
			"content": "Templates under `templates/` should be inert by default; the skill body\ndescribes how to materialize them."
		},
		{
			"heading": "skill-directory-layout",
			"content": "References under `references/` are read-only and link-friendly: prefer relative\nlinks to other repo files over absolute URLs that may rot."
		},
		{
			"heading": "skillmd-frontmatter",
			"content": "`SKILL.md` begins with a YAML frontmatter block delimited by `---`, followed by a\nMarkdown body. The frontmatter is the contract; the body is the human-readable\nprocedure."
		},
		{
			"heading": "field-rules",
			"content": "Field"
		},
		{
			"heading": "field-rules",
			"content": "Type"
		},
		{
			"heading": "field-rules",
			"content": "Required"
		},
		{
			"heading": "field-rules",
			"content": "Notes"
		},
		{
			"heading": "field-rules",
			"content": "`id`"
		},
		{
			"heading": "field-rules",
			"content": "string"
		},
		{
			"heading": "field-rules",
			"content": "yes"
		},
		{
			"heading": "field-rules",
			"content": "Stable slug. Matches `^[a-zA-Z0-9][a-zA-Z0-9._-]*$`. Used as the index key."
		},
		{
			"heading": "field-rules",
			"content": "`name`"
		},
		{
			"heading": "field-rules",
			"content": "string"
		},
		{
			"heading": "field-rules",
			"content": "yes"
		},
		{
			"heading": "field-rules",
			"content": "Human-readable name shown in CLI listings."
		},
		{
			"heading": "field-rules",
			"content": "`description`"
		},
		{
			"heading": "field-rules",
			"content": "string"
		},
		{
			"heading": "field-rules",
			"content": "yes"
		},
		{
			"heading": "field-rules",
			"content": "One-sentence summary of what the skill does and when to use it."
		},
		{
			"heading": "field-rules",
			"content": "`triggers`"
		},
		{
			"heading": "field-rules",
			"content": "string\\[]"
		},
		{
			"heading": "field-rules",
			"content": "no"
		},
		{
			"heading": "field-rules",
			"content": "Verbatim phrases or short patterns that suggest the skill is relevant."
		},
		{
			"heading": "field-rules",
			"content": "`prerequisites`"
		},
		{
			"heading": "field-rules",
			"content": "string\\[]"
		},
		{
			"heading": "field-rules",
			"content": "no"
		},
		{
			"heading": "field-rules",
			"content": "Skill ids or capabilities required before this skill can be applied."
		},
		{
			"heading": "field-rules",
			"content": "`related`"
		},
		{
			"heading": "field-rules",
			"content": "string\\[]"
		},
		{
			"heading": "field-rules",
			"content": "no"
		},
		{
			"heading": "field-rules",
			"content": "Skill ids that pair with this one or are reasonable substitutes."
		},
		{
			"heading": "field-rules",
			"content": "Additional rules:"
		},
		{
			"heading": "field-rules",
			"content": "No unknown frontmatter keys are allowed. The frontmatter schema is strict so that\ndrift or typos surface at `uh skill add` rather than silently disappearing."
		},
		{
			"heading": "field-rules",
			"content": "`id` is the only field used to look up a skill from the index. Two skills with\nthe same `id` may not coexist."
		},
		{
			"heading": "field-rules",
			"content": "`triggers`, `prerequisites`, and `related` are optional arrays of strings.\nEmpty arrays are equivalent to omitting the field; the index normalizes both to\nan empty list."
		},
		{
			"heading": "field-rules",
			"content": "The frontmatter delimiter must be `---` on its own line at the very start of\nthe file; the closing `---` must also be on its own line."
		},
		{
			"heading": "harnessskillsindexyaml",
			"content": "The skills index is the durable list of skills the harness knows about for a\nproject. It uses `schema_version: uh.skills-index.v0` and is created empty by\n`uh init`. Each entry records the indexed projection of the SKILL.md frontmatter\nplus the relative path to the skill directory:"
		},
		{
			"heading": "harnessskillsindexyaml",
			"content": "Notes:"
		},
		{
			"heading": "harnessskillsindexyaml",
			"content": "`path` is relative to the project root and points at the directory containing\n`SKILL.md`. It is not a path to `SKILL.md` itself."
		},
		{
			"heading": "harnessskillsindexyaml",
			"content": "The index is rewritten as a whole on every `uh skill add`. The schema is\nvalidated before and after the write."
		},
		{
			"heading": "harnessskillsindexyaml",
			"content": "Older entries that predate UH-6 (with only `name` and friends) remain valid for\nbackward compatibility; new entries always carry the full UH-6 shape."
		},
		{
			"heading": "lifecycle-commands",
			"content": "`uh skill add `dir\\`\\` registers a skill:"
		},
		{
			"heading": "lifecycle-commands",
			"content": "Validates that the project is initialized."
		},
		{
			"heading": "lifecycle-commands",
			"content": "Resolves `dir` against the project root and refuses out-of-root paths."
		},
		{
			"heading": "lifecycle-commands",
			"content": "Refuses symlinked skill directories, `SKILL.md` files, and index files."
		},
		{
			"heading": "lifecycle-commands",
			"content": "Parses the SKILL.md frontmatter and validates it strictly."
		},
		{
			"heading": "lifecycle-commands",
			"content": "Refuses duplicates by `id`."
		},
		{
			"heading": "lifecycle-commands",
			"content": "Appends the new entry to `.harness/skills/index.yaml` and revalidates."
		},
		{
			"heading": "lifecycle-commands",
			"content": "`uh skill list` reads `.harness/skills/index.yaml` and prints registered skills."
		},
		{
			"heading": "lifecycle-commands",
			"content": "`uh skill check `id\\`\\` re-validates an indexed skill against its on-disk SKILL.md:"
		},
		{
			"heading": "lifecycle-commands",
			"content": "Re-reads the SKILL.md at the indexed `path`."
		},
		{
			"heading": "lifecycle-commands",
			"content": "Re-parses and re-validates the frontmatter."
		},
		{
			"heading": "lifecycle-commands",
			"content": "Compares every recorded field (`name`, `description`, `triggers`,\n`prerequisites`, `related`) against the index entry."
		},
		{
			"heading": "lifecycle-commands",
			"content": "Returns `ok` only when every field matches and the `id` still equals the\nqueried id. Any drift, missing file, or symlinked path produces a structured\nerror rather than a silent pass."
		},
		{
			"heading": "selection-model",
			"content": "The harness does not auto-apply skills at runtime. Selection happens explicitly\nat mission compile time, with three roles:"
		},
		{
			"heading": "selection-model",
			"content": "**Required** skills — listed under `skills.required` in a mission packet. The\nruntime adapter must load and apply them. A mission packet with required\nskills that are not in `.harness/skills/index.yaml` is a mission authoring\nbug; `uh propose` and `uh mission create` surface this so that the runtime\nnever silently drops requirements."
		},
		{
			"heading": "selection-model",
			"content": "**Suggested** skills — listed under `skills.suggested`. The runtime adapter\nshould make them available; whether they are activated is up to the runtime's\nselection policy."
		},
		{
			"heading": "selection-model",
			"content": "**Triggered** skills — the `triggers` field exists so a runtime that supports\nnatural-language activation can offer the skill when the user's request\nmatches a trigger phrase. The harness itself does not perform trigger\nmatching; it only persists the phrases so adapters and humans can use them."
		},
		{
			"heading": "selection-model",
			"content": "Prerequisites (`prerequisites`) and relationships (`related`) are advisory\nmetadata for humans and review-time tooling. The MVP harness does not enforce\nprerequisite ordering at execution time; verification gates and mission packets\nremain the source of truth for what must run before what."
		},
		{
			"heading": "non-goals-mvp",
			"content": "No runtime-specific skill packaging (Codex prompt patches, Claude Code\ntoolsets, etc.). Adapters translate the canonical skill into their native\nshape when they consume a mission packet."
		},
		{
			"heading": "non-goals-mvp",
			"content": "No automated dependency resolution. The harness records `prerequisites` and\n`related` but does not topologically apply them."
		},
		{
			"heading": "non-goals-mvp",
			"content": "No skill versioning beyond `id`. If a skill's contract changes, the change is\nrecorded by editing the SKILL.md and re-running `uh skill check` to confirm\nthe index is back in sync."
		},
		{
			"heading": "non-goals-mvp",
			"content": "No live trigger matching inside the harness CLI; that is a runtime adapter\nconcern."
		}
	],
	"headings": [
		{
			"id": "purpose",
			"content": "Purpose"
		},
		{
			"id": "skill-directory-layout",
			"content": "Skill directory layout"
		},
		{
			"id": "skillmd-frontmatter",
			"content": "`SKILL.md` frontmatter"
		},
		{
			"id": "field-rules",
			"content": "Field rules"
		},
		{
			"id": "harnessskillsindexyaml",
			"content": "`.harness/skills/index.yaml`"
		},
		{
			"id": "lifecycle-commands",
			"content": "Lifecycle commands"
		},
		{
			"id": "selection-model",
			"content": "Selection model"
		},
		{
			"id": "non-goals-mvp",
			"content": "Non-goals (MVP)"
		}
	]
};
var toc = [
	{
		depth: 2,
		url: "#purpose",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Purpose" })
	},
	{
		depth: 2,
		url: "#skill-directory-layout",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Skill directory layout" })
	},
	{
		depth: 2,
		url: "#skillmd-frontmatter",
		title: (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [(0, import_jsx_runtime.jsx)("code", { children: "SKILL.md" }), " frontmatter"] })
	},
	{
		depth: 3,
		url: "#field-rules",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Field rules" })
	},
	{
		depth: 2,
		url: "#harnessskillsindexyaml",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)("code", { children: ".harness/skills/index.yaml" }) })
	},
	{
		depth: 2,
		url: "#lifecycle-commands",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Lifecycle commands" })
	},
	{
		depth: 2,
		url: "#selection-model",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Selection model" })
	},
	{
		depth: 2,
		url: "#non-goals-mvp",
		title: (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: "Non-goals (MVP)" })
	}
];
function _createMdxContent(props) {
	const _components = {
		code: "code",
		h2: "h2",
		h3: "h3",
		li: "li",
		ol: "ol",
		p: "p",
		pre: "pre",
		span: "span",
		strong: "strong",
		table: "table",
		tbody: "tbody",
		td: "td",
		th: "th",
		thead: "thead",
		tr: "tr",
		ul: "ul",
		...props.components
	};
	return (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "purpose",
			children: "Purpose"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Skills are reusable procedural capabilities that a runtime adapter loads or that a\nhuman can read directly. Ultimate Harness owns the ",
			(0, import_jsx_runtime.jsx)(_components.strong, { children: "format" }),
			" of a skill so that\nadapters, mission packets, and reviewers can rely on a common shape regardless of\nwhich runtime executes the work."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"This document defines the on-disk layout of a single skill, the YAML frontmatter\nthat identifies it, the supporting ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "references/" }),
			", ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "templates/" }),
			", and ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "scripts/" }),
			"\nconventions, and the selection model the harness uses to decide which skills are\napplied to a mission."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "skill-directory-layout",
			children: "Skill directory layout"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"A skill is a directory that contains, at minimum, a ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "SKILL.md" }),
			" file. Optional\nsibling directories carry supporting material:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)(_components.pre, {
			className: "shiki shiki-themes github-light github-dark",
			style: {
				"--shiki-light": "#24292e",
				"--shiki-dark": "#e1e4e8",
				"--shiki-light-bg": "#fff",
				"--shiki-dark-bg": "#24292e"
			},
			tabIndex: "0",
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M 6,1 C 4.354992,1 3,2.354992 3,4 v 16 c 0,1.645008 1.354992,3 3,3 h 12 c 1.645008,0 3,-1.354992 3,-3 V 8 7 A 1.0001,1.0001 0 0 0 20.707031,6.2929687 l -5,-5 A 1.0001,1.0001 0 0 0 15,1 h -1 z m 0,2 h 7 v 3 c 0,1.645008 1.354992,3 3,3 h 3 v 11 c 0,0.564129 -0.435871,1 -1,1 H 6 C 5.4358712,21 5,20.564129 5,20 V 4 C 5,3.4358712 5.4358712,3 6,3 Z M 15,3.4140625 18.585937,7 H 16 C 15.435871,7 15,6.5641288 15,6 Z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "`skill-dir`/" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  SKILL.md          # required: frontmatter + body" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  references/       # optional: docs, links, snippets the skill body cites" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  templates/        # optional: parameterized files the skill produces or seeds" })
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, { children: "  scripts/          # optional: executable helpers invoked by the skill body" })
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Rules:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "SKILL.md" }),
				" must be a regular file (no symlinks). The harness refuses to register\na skill whose ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "SKILL.md" }),
				" is a symlink or whose containing directory is a symlink."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "references/" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "templates/" }),
				", and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "scripts/" }),
				" are reserved names. When present they\nmust be regular directories."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "The skill directory must live inside the project root. The harness refuses\nout-of-root paths." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Scripts under ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "scripts/" }),
				" should be self-contained and runnable from the skill\ndirectory; they should not assume a checkout layout outside the skill."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Templates under ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "templates/" }),
				" should be inert by default; the skill body\ndescribes how to materialize them."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"References under ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "references/" }),
				" are read-only and link-friendly: prefer relative\nlinks to other repo files over absolute URLs that may rot."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.h2, {
			id: "skillmd-frontmatter",
			children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "SKILL.md" }), " frontmatter"]
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "SKILL.md" }),
			" begins with a YAML frontmatter block delimited by ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "---" }),
			", followed by a\nMarkdown body. The frontmatter is the contract; the body is the human-readable\nprocedure."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)(_components.pre, {
			className: "shiki shiki-themes github-light github-dark",
			style: {
				"--shiki-light": "#24292e",
				"--shiki-dark": "#e1e4e8",
				"--shiki-light-bg": "#fff",
				"--shiki-dark-bg": "#24292e"
			},
			tabIndex: "0",
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M 6,1 C 4.354992,1 3,2.354992 3,4 v 16 c 0,1.645008 1.354992,3 3,3 h 12 c 1.645008,0 3,-1.354992 3,-3 V 8 7 A 1.0001,1.0001 0 0 0 20.707031,6.2929687 l -5,-5 A 1.0001,1.0001 0 0 0 15,1 h -1 z m 0,2 h 7 v 3 c 0,1.645008 1.354992,3 3,3 h 3 v 11 c 0,0.564129 -0.435871,1 -1,1 H 6 C 5.4358712,21 5,20.564129 5,20 V 4 C 5,3.4358712 5.4358712,3 6,3 Z M 15,3.4140625 18.585937,7 H 16 C 15.435871,7 15,6.5641288 15,6 Z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "---"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "id"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "code-review"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "name"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "Code Review"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "description"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "Review a diff for correctness, regression risk, and style alignment."
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "triggers"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "\"review my code\""
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "\"look at this diff\""
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "prerequisites"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "linting"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "related"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "  - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "test-authoring"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "---"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, { className: "line" }),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, {
					className: "line",
					children: (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#005CC5",
							"--shiki-light-font-weight": "bold",
							"--shiki-dark": "#79B8FF",
							"--shiki-dark-font-weight": "bold"
						},
						children: "# Code Review"
					})
				}),
				"\n",
				(0, import_jsx_runtime.jsx)(_components.span, { className: "line" }),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#E36209",
							"--shiki-dark": "#FFAB70"
						},
						children: "1."
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: " Skim the diff for unrelated changes."
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#E36209",
							"--shiki-dark": "#FFAB70"
						},
						children: "2."
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: " ..."
					})]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h3, {
			id: "field-rules",
			children: "Field rules"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.table, { children: [(0, import_jsx_runtime.jsx)(_components.thead, { children: (0, import_jsx_runtime.jsxs)(_components.tr, { children: [
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Field" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Type" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Required" }),
			(0, import_jsx_runtime.jsx)(_components.th, { children: "Notes" })
		] }) }), (0, import_jsx_runtime.jsxs)(_components.tbody, { children: [
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "id" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "string" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "yes" }),
				(0, import_jsx_runtime.jsxs)(_components.td, { children: [
					"Stable slug. Matches ",
					(0, import_jsx_runtime.jsx)(_components.code, { children: "^[a-zA-Z0-9][a-zA-Z0-9._-]*$" }),
					". Used as the index key."
				] })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "name" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "string" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "yes" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Human-readable name shown in CLI listings." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "description" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "string" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "yes" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "One-sentence summary of what the skill does and when to use it." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "triggers" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "string[]" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "no" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Verbatim phrases or short patterns that suggest the skill is relevant." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "prerequisites" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "string[]" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "no" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Skill ids or capabilities required before this skill can be applied." })
			] }),
			(0, import_jsx_runtime.jsxs)(_components.tr, { children: [
				(0, import_jsx_runtime.jsx)(_components.td, { children: (0, import_jsx_runtime.jsx)(_components.code, { children: "related" }) }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "string[]" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "no" }),
				(0, import_jsx_runtime.jsx)(_components.td, { children: "Skill ids that pair with this one or are reasonable substitutes." })
			] })
		] })] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Additional rules:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"No unknown frontmatter keys are allowed. The frontmatter schema is strict so that\ndrift or typos surface at ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh skill add" }),
				" rather than silently disappearing."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "id" }),
				" is the only field used to look up a skill from the index. Two skills with\nthe same ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "id" }),
				" may not coexist."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "triggers" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "prerequisites" }),
				", and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "related" }),
				" are optional arrays of strings.\nEmpty arrays are equivalent to omitting the field; the index normalizes both to\nan empty list."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"The frontmatter delimiter must be ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "---" }),
				" on its own line at the very start of\nthe file; the closing ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "---" }),
				" must also be on its own line."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "harnessskillsindexyaml",
			children: (0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/skills/index.yaml" })
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"The skills index is the durable list of skills the harness knows about for a\nproject. It uses ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "schema_version: uh.skills-index.v0" }),
			" and is created empty by\n",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh init" }),
			". Each entry records the indexed projection of the SKILL.md frontmatter\nplus the relative path to the skill directory:"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: (0, import_jsx_runtime.jsx)(_components.pre, {
			className: "shiki shiki-themes github-light github-dark",
			style: {
				"--shiki-light": "#24292e",
				"--shiki-dark": "#e1e4e8",
				"--shiki-light-bg": "#fff",
				"--shiki-dark-bg": "#24292e"
			},
			tabIndex: "0",
			icon: "<svg viewBox=\"0 0 24 24\"><path d=\"M 6,1 C 4.354992,1 3,2.354992 3,4 v 16 c 0,1.645008 1.354992,3 3,3 h 12 c 1.645008,0 3,-1.354992 3,-3 V 8 7 A 1.0001,1.0001 0 0 0 20.707031,6.2929687 l -5,-5 A 1.0001,1.0001 0 0 0 15,1 h -1 z m 0,2 h 7 v 3 c 0,1.645008 1.354992,3 3,3 h 3 v 11 c 0,0.564129 -0.435871,1 -1,1 H 6 C 5.4358712,21 5,20.564129 5,20 V 4 C 5,3.4358712 5.4358712,3 6,3 Z M 15,3.4140625 18.585937,7 H 16 C 15.435871,7 15,6.5641288 15,6 Z\" fill=\"currentColor\" /></svg>",
			children: (0, import_jsx_runtime.jsxs)(_components.code, { children: [
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "schema_version"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "uh.skills-index.v0"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "skills"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: "  - "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "id"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "code-review"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "    name"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "Code Review"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "    description"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "Review a diff for correctness, regression risk, and style alignment."
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#22863A",
								"--shiki-dark": "#85E89D"
							},
							children: "    path"
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#24292E",
								"--shiki-dark": "#E1E4E8"
							},
							children: ": "
						}),
						(0, import_jsx_runtime.jsx)(_components.span, {
							style: {
								"--shiki-light": "#032F62",
								"--shiki-dark": "#9ECBFF"
							},
							children: "skills/code-review"
						})
					]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "    triggers"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "      - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "\"review my code\""
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "      - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "\"look at this diff\""
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "    prerequisites"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "      - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "linting"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#22863A",
							"--shiki-dark": "#85E89D"
						},
						children: "    related"
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: ":"
					})]
				}),
				"\n",
				(0, import_jsx_runtime.jsxs)(_components.span, {
					className: "line",
					children: [(0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#24292E",
							"--shiki-dark": "#E1E4E8"
						},
						children: "      - "
					}), (0, import_jsx_runtime.jsx)(_components.span, {
						style: {
							"--shiki-light": "#032F62",
							"--shiki-dark": "#9ECBFF"
						},
						children: "test-authoring"
					})]
				})
			] })
		}) }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "Notes:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.code, { children: "path" }),
				" is relative to the project root and points at the directory containing\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "SKILL.md" }),
				". It is not a path to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "SKILL.md" }),
				" itself."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"The index is rewritten as a whole on every ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh skill add" }),
				". The schema is\nvalidated before and after the write."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Older entries that predate UH-6 (with only ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "name" }),
				" and friends) remain valid for\nbackward compatibility; new entries always carry the full UH-6 shape."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "lifecycle-commands",
			children: "Lifecycle commands"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "uh skill add " }), "dir`` registers a skill:"] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Validates that the project is initialized." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Resolves ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "dir" }),
				" against the project root and refuses out-of-root paths."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Refuses symlinked skill directories, ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "SKILL.md" }),
				" files, and index files."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Parses the SKILL.md frontmatter and validates it strictly." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Refuses duplicates by ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "id" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Appends the new entry to ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/skills/index.yaml" }),
				" and revalidates."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			(0, import_jsx_runtime.jsx)(_components.code, { children: "uh skill list" }),
			" reads ",
			(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/skills/index.yaml" }),
			" and prints registered skills."
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [(0, import_jsx_runtime.jsx)(_components.code, { children: "uh skill check " }), "id`` re-validates an indexed skill against its on-disk SKILL.md:"] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ol, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Re-reads the SKILL.md at the indexed ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "path" }),
				"."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "Re-parses and re-validates the frontmatter." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Compares every recorded field (",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "name" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "description" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "triggers" }),
				",\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "prerequisites" }),
				", ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "related" }),
				") against the index entry."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"Returns ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "ok" }),
				" only when every field matches and the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "id" }),
				" still equals the\nqueried id. Any drift, missing file, or symlinked path produces a structured\nerror rather than a silent pass."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "selection-model",
			children: "Selection model"
		}),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.p, { children: "The harness does not auto-apply skills at runtime. Selection happens explicitly\nat mission compile time, with three roles:" }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Required" }),
				" skills — listed under ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "skills.required" }),
				" in a mission packet. The\nruntime adapter must load and apply them. A mission packet with required\nskills that are not in ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: ".harness/skills/index.yaml" }),
				" is a mission authoring\nbug; ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh propose" }),
				" and ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh mission create" }),
				" surface this so that the runtime\nnever silently drops requirements."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Suggested" }),
				" skills — listed under ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "skills.suggested" }),
				". The runtime adapter\nshould make them available; whether they are activated is up to the runtime's\nselection policy."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				(0, import_jsx_runtime.jsx)(_components.strong, { children: "Triggered" }),
				" skills — the ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "triggers" }),
				" field exists so a runtime that supports\nnatural-language activation can offer the skill when the user's request\nmatches a trigger phrase. The harness itself does not perform trigger\nmatching; it only persists the phrases so adapters and humans can use them."
			] }),
			"\n"
		] }),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.p, { children: [
			"Prerequisites (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "prerequisites" }),
			") and relationships (",
			(0, import_jsx_runtime.jsx)(_components.code, { children: "related" }),
			") are advisory\nmetadata for humans and review-time tooling. The MVP harness does not enforce\nprerequisite ordering at execution time; verification gates and mission packets\nremain the source of truth for what must run before what."
		] }),
		"\n",
		(0, import_jsx_runtime.jsx)(_components.h2, {
			id: "non-goals-mvp",
			children: "Non-goals (MVP)"
		}),
		"\n",
		(0, import_jsx_runtime.jsxs)(_components.ul, { children: [
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "No runtime-specific skill packaging (Codex prompt patches, Claude Code\ntoolsets, etc.). Adapters translate the canonical skill into their native\nshape when they consume a mission packet." }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"No automated dependency resolution. The harness records ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "prerequisites" }),
				" and\n",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "related" }),
				" but does not topologically apply them."
			] }),
			"\n",
			(0, import_jsx_runtime.jsxs)(_components.li, { children: [
				"No skill versioning beyond ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "id" }),
				". If a skill's contract changes, the change is\nrecorded by editing the SKILL.md and re-running ",
				(0, import_jsx_runtime.jsx)(_components.code, { children: "uh skill check" }),
				" to confirm\nthe index is back in sync."
			] }),
			"\n",
			(0, import_jsx_runtime.jsx)(_components.li, { children: "No live trigger matching inside the harness CLI; that is a runtime adapter\nconcern." }),
			"\n"
		] })
	] });
}
function MDXContent(props = {}) {
	const { wrapper: MDXLayout } = props.components || {};
	return MDXLayout ? (0, import_jsx_runtime.jsx)(MDXLayout, {
		...props,
		children: (0, import_jsx_runtime.jsx)(_createMdxContent, { ...props })
	}) : _createMdxContent(props);
}
//#endregion
export { toc as a, structuredData as i, frontmatter as n, skill_format_exports as r, MDXContent as t };
