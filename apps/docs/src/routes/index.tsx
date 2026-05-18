import { createFileRoute, Link } from '@tanstack/react-router';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

export const Route = createFileRoute('/')({
  component: Home,
  head: () => ({
    meta: [
      { title: 'Ultimate Harness — Portable discipline for agent-driven engineering' },
      {
        name: 'description',
        content:
          'Runtime-agnostic development harness for planning, launching, observing, verifying, and promoting agentic software work across Hermes, Codex, Hermes-Proxy, and Oh-My-Pi.',
      },
    ],
  }),
});

const ADAPTERS = [
  { id: 'hermes', status: 'active', desc: 'Direct Hermes server runtime, pinned to ≥ 0.14.0.' },
  { id: 'codex', status: 'active', desc: 'OpenAI Codex CLI transport with sandbox routing parity.' },
  { id: 'hermes-proxy', status: 'active', desc: 'ToS-positioned subscription gateway (nous / openai / anthropic providers).' },
  { id: 'oh-my-pi', status: 'experimental', desc: 'Anthropic via Oh-My-Pi for ANTHROPIC_API_KEY routing.' },
] as const;

const FEATURES = [
  {
    title: 'Mission packets',
    desc: 'Portable, versioned work requests with workflow profile and runtime config. One spec, every runtime.',
    href: '/docs/$',
    params: { _splat: 'architecture/mission-packet-schema' },
  },
  {
    title: 'SDD + TDD + cross-runtime QA',
    desc: 'Three composable discipline layers: structured acceptance_criteria, test-first diff gate, and `uh mission run-all` fan-out comparison.',
    href: '/docs/$',
    params: { _splat: 'architecture/sdd-tdd-qa' },
  },
  {
    title: 'Sandbox isolation',
    desc: 'git-worktree sandboxes by default; mission-bound, dirty-aware discard, ready for AgentFS swap-in.',
    href: '/docs/$',
    params: { _splat: 'architecture/sandboxing' },
  },
  {
    title: 'Live Mission Control TUI',
    desc: 'Three-pane dashboard, mission drilldown with Code/Diff viewers, R-runs with live events.ndjson tail.',
    href: '/docs/$',
    params: { _splat: 'runbooks/using-the-tui' },
  },
  {
    title: 'Runtime adapter contract',
    desc: 'Every adapter implements the same shape: dryRun, run, events emission, runtime-result schema.',
    href: '/docs/$',
    params: { _splat: 'architecture/runtime-adapter-contract' },
  },
  {
    title: 'Verify and promote',
    desc: 'Sandbox work becomes canonical work only after verification gates pass. Audit trail is built in.',
    href: '/docs/$',
    params: { _splat: 'architecture/verification-and-promotion' },
  },
  {
    title: 'Audit-by-default',
    desc: 'Append-only events.ndjson per mission; runtime-session.yaml summary; diff.patch captured per run.',
    href: '/docs/$',
    params: { _splat: 'verification/audit-trail' },
  },
];

const PIPELINE = [
  { step: '1', title: 'research', desc: 'Inputs → narrative → adopt / reject / defer.' },
  { step: '2', title: 'spec', desc: 'Mission packet drafted; acceptance criteria locked.' },
  { step: '3', title: 'plan', desc: 'Workflow profile + runtime config + dispatch.' },
  { step: '4', title: 'sandbox', desc: 'git-worktree spun up; mission bound.' },
  { step: '5', title: 'run', desc: 'Adapter executes; events.ndjson tails live.' },
  { step: '6', title: 'verify', desc: 'Checks gate promotion; review notes attached.' },
  { step: '7', title: 'promote', desc: 'Sandbox → canonical; audit trail sealed.' },
];

export default function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="relative isolate">
        <div className="uh-hero-backdrop" aria-hidden />

        <section className="mx-auto max-w-5xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24 text-center">
          <p className="uh-mono mb-4 text-xs uppercase tracking-[0.2em] text-fd-muted-foreground">
            v0.x · MIT · Bun + Node + TypeScript
          </p>
          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
            One harness. Every coding agent.
            <br />
            <span className="uh-gradient">Portable discipline.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-fd-muted-foreground max-w-2xl mx-auto">
            Ultimate Harness plans, launches, observes, verifies, and promotes
            agentic software-development work across Hermes, Codex, Hermes
            Proxy, and Oh-My-Pi — without losing your specs, sandbox
            boundaries, or audit trail.
          </p>

          <div className="mt-10 flex flex-wrap gap-3 justify-center">
            <Link
              to="/docs/$"
              params={{ _splat: '' }}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 font-medium bg-fd-primary text-fd-primary-foreground"
            >
              Read the docs →
            </Link>
            <Link
              to="/docs/$"
              params={{ _splat: 'runbooks/using-the-tui' }}
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 font-medium border border-fd-border"
            >
              Try the TUI
            </Link>
            <a
              href="https://github.com/Agentic-Engineering-Agency/ultimate-harness"
              className="inline-flex items-center gap-2 rounded-full px-5 py-3 font-medium border border-fd-border"
            >
              GitHub
            </a>
          </div>

          <div className="mt-12 rounded-2xl border border-fd-border overflow-hidden text-left mx-auto max-w-3xl bg-fd-card">
            <div className="px-5 py-3 text-xs uh-mono text-fd-muted-foreground border-b border-fd-border flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[#ff5f56]" />
              <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
              <span className="size-2.5 rounded-full bg-[#27c93f]" />
              <span className="ml-3">~/agent-work · zsh</span>
            </div>
            <pre className="uh-mono text-sm leading-6 px-5 py-4 overflow-x-auto">
              <code>{`# install
$ bun add -g @agentic-engineering/ultimate-harness

# initialize a project
$ uh init

# add adapters (hermes, codex, hermes-proxy, oh-my-pi)
$ uh adapter add codex

# propose, run, verify
$ uh propose my-mission --workflow research-docs --goal "Refactor X"
$ uh mission run my-mission --runtime codex
$ uh verify my-mission

# or just open Mission Control
$ uh tui
`}</code>
            </pre>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6">Adapters</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ADAPTERS.map((a) => (
              <div key={a.id} className="uh-card">
                <div className="flex items-center justify-between mb-2">
                  <span className="uh-mono font-semibold">{a.id}</span>
                  <span
                    className={
                      'uh-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ' +
                      (a.status === 'active' ? 'uh-pill-active' : 'uh-pill-muted')
                    }
                  >
                    {a.status}
                  </span>
                </div>
                <p className="text-sm text-fd-muted-foreground">{a.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">Pipeline</h2>
          <p className="text-fd-muted-foreground mb-6 max-w-2xl">
            Every mission moves through the same seven phases. Each phase is
            inspectable, replayable, and gated.
          </p>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {PIPELINE.map((p) => (
              <li key={p.step} className="uh-card">
                <div className="uh-mono text-xs text-fd-muted-foreground mb-1">{p.step}</div>
                <div className="font-semibold">{p.title}</div>
                <p className="text-xs text-fd-muted-foreground mt-1">{p.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-6">
            What's in the box
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Link key={f.title} to={f.href} params={f.params} className="uh-card group">
                <h3 className="font-semibold mb-1">{f.title}</h3>
                <p className="text-sm text-fd-muted-foreground">{f.desc}</p>
                <p className="mt-3 text-xs uh-mono uppercase tracking-wider text-fd-muted-foreground group-hover:text-fd-primary">
                  Read more →
                </p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
          <div className="rounded-3xl border border-fd-border p-8 sm:p-12 relative overflow-hidden">
            <div className="uh-glow absolute inset-0 opacity-50" aria-hidden />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                Built for agent-driven engineering.
              </h2>
              <p className="mt-4 text-fd-muted-foreground max-w-2xl">
                A project should be able to use multiple coding-agent runtimes
                without losing its specifications, skills, workflow state,
                audit trail, sandbox boundaries, or human approval
                checkpoints. UH gives you the spec format, the dispatch
                table, the sandbox backend, the verification gate, and the
                live UI — all in one binary.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to="/docs/$"
                  params={{ _splat: 'product/prd' }}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium bg-fd-primary text-fd-primary-foreground"
                >
                  Product brief
                </Link>
                <Link
                  to="/docs/$"
                  params={{ _splat: 'architecture/overview' }}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 font-medium border border-fd-border"
                >
                  Architecture
                </Link>
              </div>
            </div>
          </div>
        </section>

        <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-fd-muted-foreground flex flex-wrap items-center justify-between gap-4">
          <span>© {new Date().getFullYear()} Agentic Engineering Agency</span>
          <span className="uh-mono">uh.agenticengineering.lat</span>
        </footer>
      </main>
    </HomeLayout>
  );
}
